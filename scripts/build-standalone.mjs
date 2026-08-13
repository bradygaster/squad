#!/usr/bin/env node
/**
 * Build a self-contained, npm-free Squad bundle for a single platform/arch.
 *
 * Produces a directory tree that runs `squad` with no Node.js and no npm
 * present on the target machine:
 *
 *   squad-<platform>-<arch>/
 *     squad | squad.cmd      launcher
 *     runtime/               vendored Node.js runtime
 *     app/node_modules/...   squad-cli + squad-sdk + prod deps
 *
 * Why a directory tree rather than a single compiled executable:
 * squad-cli and squad-sdk locate `templates/`, `presets/builtin/` and
 * `package.json` by walking up from `import.meta.url` at runtime
 * (see getTemplatesDir, getPackageVersion, getBuiltinPresetsDir). Preserving
 * the real on-disk layout keeps every one of those lookups working, so this
 * ships with zero source changes. It is also the same shape GitHub's own
 * Copilot CLI publishes.
 *
 * Usage:
 *   node scripts/build-standalone.mjs                        # host platform
 *   node scripts/build-standalone.mjs --platform linux --arch x64
 *   node scripts/build-standalone.mjs --node-version 22.20.0
 *   node scripts/build-standalone.mjs --skip-runtime          # app tree only
 *   node scripts/build-standalone.mjs --include-optional      # fat bundle
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  renameSync, rmSync, writeFileSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Node.js runtime vendored into the bundle. Must satisfy squad's engines field (>=22.5.0). */
const DEFAULT_NODE_VERSION = '22.20.0';

/** Platform/arch pairs we publish, matching the GitHub Copilot CLI release matrix. */
const SUPPORTED = [
  'linux-x64', 'linux-arm64',
  'darwin-x64', 'darwin-arm64',
  'win32-x64', 'win32-arm64',
];

function parseArgs(argv) {
  const args = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: DEFAULT_NODE_VERSION,
    outDir: path.join(REPO_ROOT, 'dist-standalone'),
    skipRuntime: false,
    includeOptional: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case '--platform': args.platform = next(); break;
      case '--arch': args.arch = next(); break;
      case '--node-version': args.nodeVersion = next().replace(/^v/, ''); break;
      case '--out-dir': args.outDir = path.resolve(next()); break;
      case '--skip-runtime': args.skipRuntime = true; break;
      case '--include-optional': args.includeOptional = true; break;
      case '--help': case '-h': printUsage(); process.exit(0); break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const target = `${args.platform}-${args.arch}`;
  if (!SUPPORTED.includes(target)) {
    throw new Error(`Unsupported target "${target}". Supported: ${SUPPORTED.join(', ')}`);
  }
  return args;
}

function printUsage() {
  console.log(`Build a self-contained Squad bundle.

Options:
  --platform <p>       linux | darwin | win32   (default: host)
  --arch <a>           x64 | arm64              (default: host)
  --node-version <v>   Node runtime to vendor   (default: ${DEFAULT_NODE_VERSION})
  --out-dir <dir>      Output directory         (default: dist-standalone/)
  --skip-runtime       Build the app tree without vendoring a Node runtime
  --include-optional   Keep optional dependencies (see note below)
  -h, --help           Show this message

Optional dependencies are omitted by default. That drops the vendored Copilot
CLI platform binary (~318 MB) pulled in transitively by @github/copilot-sdk,
along with node-pty prebuilds, the OpenTelemetry SDK and sql.js. Squad already
requires the \`copilot\` CLI on PATH, and Copilot CLI ships its own npm-free
installers, so shipping a second copy inside this bundle is redundant.

Targets: ${SUPPORTED.join(', ')}`);
}

function run(cmd, cmdArgs, cwd) {
  // shell:true is needed on Windows so npm/npx (.cmd shims) resolve, but the
  // shell then splits an unquoted command path on spaces — which breaks
  // anything under "C:\Program Files\".
  const useShell = process.platform === 'win32';
  const command = useShell && /\s/.test(cmd) ? `"${cmd}"` : cmd;
  return execFileSync(command, cmdArgs, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    shell: useShell,
  });
}

function step(message) {
  console.log(`\x1b[36m→\x1b[0m ${message}`);
}

/**
 * Pack the two workspace packages into tarballs so the bundle installs exactly
 * what would be published, rather than whatever happens to be in node_modules.
 */
function packWorkspaces(stagingDir) {
  const tarballs = {};
  for (const pkg of ['squad-sdk', 'squad-cli']) {
    const pkgDir = path.join(REPO_ROOT, 'packages', pkg);
    // --ignore-scripts: prepublishOnly would re-run the full build for each pack.
    const output = run('npm', ['pack', '--pack-destination', stagingDir, '--ignore-scripts', '--silent'], pkgDir);
    const name = output.trim().split('\n').filter(Boolean).pop();
    if (!name) throw new Error(`npm pack produced no tarball for ${pkg}`);
    tarballs[pkg] = path.join(stagingDir, name);
    if (!existsSync(tarballs[pkg])) throw new Error(`Expected tarball missing: ${tarballs[pkg]}`);
  }
  return tarballs;
}

/**
 * Install the packed tarballs into the bundle's app/ directory.
 *
 * --omit=dev keeps the tree to runtime dependencies.
 * --omit=optional (default) drops the transitively-vendored Copilot CLI
 * platform binary, node-pty prebuilds, the OpenTelemetry SDK and sql.js.
 * --ignore-scripts skips squad-cli's postinstall patches. Those patch
 * vscode-jsonrpc for strict-ESM resolution, but cli-entry.js already applies
 * the same fix at runtime via a Module._resolveFilename hook, so the bundle
 * does not depend on the install-time patch having run.
 */
function installApp(appDir, tarballs, version, includeOptional) {
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    path.join(appDir, 'package.json'),
    `${JSON.stringify({
      name: 'squad-standalone',
      version,
      private: true,
      type: 'module',
      dependencies: {
        '@bradygaster/squad-cli': `file:${path.basename(tarballs['squad-cli'])}`,
        '@bradygaster/squad-sdk': `file:${path.basename(tarballs['squad-sdk'])}`,
      },
    }, null, 2)}\n`,
  );
  for (const tarball of Object.values(tarballs)) {
    cpSync(tarball, path.join(appDir, path.basename(tarball)));
  }
  const omitFlags = includeOptional ? ['--omit=dev'] : ['--omit=dev', '--omit=optional'];
  run('npm', ['install', ...omitFlags, '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], appDir);
  // The tarballs are only install inputs — no need to ship them.
  for (const tarball of Object.values(tarballs)) {
    rmSync(path.join(appDir, path.basename(tarball)), { force: true });
  }
}

function nodeArtifactName(platform, arch, version) {
  const slug = platform === 'win32' ? `win-${arch}` : `${platform}-${arch}`;
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  return { base: `node-v${version}-${slug}`, file: `node-v${version}-${slug}.${ext}`, ext };
}

/** Download the official Node.js build for the target and vendor just the runtime. */
function vendorRuntime(bundleDir, platform, arch, version, stagingDir) {
  const { base, file, ext } = nodeArtifactName(platform, arch, version);
  const url = `https://nodejs.org/dist/v${version}/${file}`;
  const archivePath = path.join(stagingDir, file);

  step(`Downloading Node ${version} for ${platform}-${arch}`);
  run('curl', ['-fsSL', '-o', archivePath, url], stagingDir);

  step('Extracting runtime');
  const member = platform === 'win32'
    // Windows archives keep node.exe at the archive root.
    ? `${base}/node.exe`
    : `${base}/bin/node`;
  extractArchiveMember(archivePath, member, ext, stagingDir);

  const extracted = path.join(stagingDir, base);
  if (!existsSync(extracted)) {
    throw new Error(`Expected extracted runtime at ${extracted}`);
  }

  const runtimeDir = path.join(bundleDir, 'runtime');
  mkdirSync(runtimeDir, { recursive: true });

  if (platform === 'win32') {
    const exeSrc = path.join(extracted, 'node.exe');
    if (!existsSync(exeSrc)) throw new Error('node.exe not found in downloaded runtime');
    cpSync(exeSrc, path.join(runtimeDir, 'node.exe'));
  } else {
    const binSrc = path.join(extracted, 'bin', 'node');
    if (!existsSync(binSrc)) throw new Error('node binary not found in downloaded runtime');
    mkdirSync(path.join(runtimeDir, 'bin'), { recursive: true });
    cpSync(binSrc, path.join(runtimeDir, 'bin', 'node'));
    // cpSync does not preserve the executable bit on every host filesystem.
    chmodSync(path.join(runtimeDir, 'bin', 'node'), 0o755);
  }

  rmSync(archivePath, { force: true });
  rmSync(extracted, { recursive: true, force: true });
  return ext;
}

const CLI_ENTRY = 'app/node_modules/@bradygaster/squad-cli/dist/cli-entry.js';

/**
 * Script embedded into the Windows `squad.exe` single executable.
 *
 * It runs inside a SEA, so `require()` resolves builtins only — external code
 * has to be loaded with a dynamic import of a file URL. Because a SEA has no
 * script argument, `process.argv` is already `[exe, exe, ...userArgs]`, which
 * has the same shape as `[node, script, ...userArgs]`. The CLI therefore sees
 * exactly the arguments it expects with no rewriting.
 */
const SEA_LAUNCHER = `const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ENTRY = ${JSON.stringify(CLI_ENTRY)};

// winget installs portables by symlinking the exe into a links directory, and
// process.execPath may report that link rather than the bundle. Try the exe's
// own directory first, then its resolved real path.
function resolveRoot() {
  const candidates = [process.execPath];
  try {
    const real = fs.realpathSync(process.execPath);
    if (real !== process.execPath) candidates.push(real);
  } catch {}
  for (const candidate of candidates) {
    const root = path.dirname(candidate);
    if (fs.existsSync(path.join(root, ENTRY))) return root;
  }
  return null;
}

const root = resolveRoot();
if (!root) {
  console.error('Squad: could not locate the bundle from ' + process.execPath + '.');
  console.error('The squad.exe launcher must stay alongside its app/ directory.');
  process.exit(1);
}

process.env.SQUAD_STANDALONE_HOME = root;
import(pathToFileURL(path.join(root, ENTRY)).href).catch((error) => {
  console.error('Squad: failed to start.', error && error.message ? error.message : error);
  process.exit(1);
});
`;

/**
 * Extract a single member from a downloaded Node archive.
 *
 * bsdtar (Windows, macOS) reads zip archives; GNU tar (Linux) does not, so a
 * Linux runner cross-building a Windows bundle has to use unzip. Extracting one
 * member also avoids the POSIX archives' symlinks (bin/npm, bin/npx,
 * bin/corepack), which cannot be created on a Windows host.
 */
function extractArchiveMember(archivePath, member, ext, stagingDir) {
  try {
    if (ext === 'zip' && process.platform !== 'win32') {
      run('unzip', ['-o', '-q', archivePath, member, '-d', stagingDir], stagingDir);
    } else {
      run('tar', ['-xf', archivePath, '-C', stagingDir, member], stagingDir);
    }
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message || String(error);
    throw new Error(`Failed to extract ${member} from ${path.basename(archivePath)}: ${detail}`);
  }
}

/**
 * Obtain a Node binary that can generate a SEA blob for `version`.
 *
 * The blob format is tied to the Node version that produced it — injecting a
 * blob built by a different version into the vendored runtime produces an exe
 * that crashes on startup with an access violation. When the host already runs
 * the right version we use it directly; otherwise we download that version for
 * the *host* platform purely to generate the blob. (The host cannot execute the
 * target's binary when cross-building, which is the normal case in CI.)
 */
function resolveBlobBuilder(version, stagingDir) {
  if (process.versions.node === version) return process.execPath;

  const hostPlatform = process.platform;
  const { base, file, ext } = nodeArtifactName(hostPlatform, process.arch, version);
  const archivePath = path.join(stagingDir, `host-${file}`);

  step(`Fetching Node ${version} for the host to generate the SEA blob`);
  run('curl', ['-fsSL', '-o', archivePath, `https://nodejs.org/dist/v${version}/${file}`], stagingDir);

  const member = hostPlatform === 'win32' ? `${base}/node.exe` : `${base}/bin/node`;
  extractArchiveMember(archivePath, member, ext, stagingDir);

  const builder = path.join(stagingDir, base, ...(hostPlatform === 'win32' ? ['node.exe'] : ['bin', 'node']));
  if (!existsSync(builder)) throw new Error(`Host Node ${version} not found at ${builder}`);
  if (hostPlatform !== 'win32') chmodSync(builder, 0o755);
  rmSync(archivePath, { force: true });
  return builder;
}

/**
 * Build a real `squad.exe` for Windows bundles using Node's single executable
 * application support.
 *
 * This exists because winget's portable installer only accepts `.exe` targets —
 * `.cmd` and `.bat` are explicitly unsupported, so a manifest pointing at
 * `squad.cmd` would install something unusable. The SEA is produced from the
 * *vendored* runtime for the target architecture, so `squad.exe` replaces
 * `runtime/node.exe` entirely rather than adding to the bundle's size.
 */
function buildWindowsExe(bundleDir, stagingDir, nodeVersion) {
  const runtimeExe = path.join(bundleDir, 'runtime', 'node.exe');
  if (!existsSync(runtimeExe)) {
    throw new Error(`Cannot build squad.exe — vendored runtime missing at ${runtimeExe}`);
  }

  const launcherPath = path.join(stagingDir, 'sea-launcher.js');
  const configPath = path.join(stagingDir, 'sea-config.json');
  const blobPath = path.join(stagingDir, 'sea-prep.blob');

  writeFileSync(launcherPath, SEA_LAUNCHER);
  writeFileSync(
    configPath,
    `${JSON.stringify({
      main: launcherPath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      // V8 code cache is architecture-specific; leaving it off keeps the blob
      // portable so win32-arm64 bundles can be built on an x64 runner.
      useCodeCache: false,
      useSnapshot: false,
    }, null, 2)}\n`,
  );

  const builder = resolveBlobBuilder(nodeVersion, stagingDir);
  run(builder, ['--experimental-sea-config', configPath], stagingDir);
  if (!existsSync(blobPath)) throw new Error('SEA blob was not produced');

  const exePath = path.join(bundleDir, 'squad.exe');
  cpSync(runtimeExe, exePath);
  run('npx', ['--yes', 'postject', exePath, 'NODE_SEA_BLOB', blobPath,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], stagingDir);

  // squad.exe *is* the runtime now — keeping node.exe would double the size.
  rmSync(path.join(bundleDir, 'runtime'), { recursive: true, force: true });
  return exePath;
}

function writeLaunchers(bundleDir, platform, skipRuntime) {
  if (platform === 'win32') {
    // With a real squad.exe present the runtime lives inside it; the .cmd and
    // .ps1 shims stay for people who unpack the archive and run it in place.
    const hasExe = !skipRuntime;
    const nodeCmd = hasExe ? '"%~dp0squad.exe"' : 'node';
    const entryArg = hasExe ? '' : ` "%~dp0${CLI_ENTRY.replace(/\//g, '\\')}"`;
    writeFileSync(
      path.join(bundleDir, 'squad.cmd'),
      [
        '@echo off',
        'setlocal',
        // Lets the CLI detect it is running from a bundle so it writes an
        // npx-free squad_state MCP spec (see mcp-spec.ts tier 0).
        'set "SQUAD_STANDALONE_HOME=%~dp0"',
        `${nodeCmd}${entryArg} %*`,
        'exit /b %ERRORLEVEL%',
        '',
      ].join('\r\n'),
    );
    // PowerShell shim so `squad` resolves for users whose PATHEXT excludes .CMD.
    writeFileSync(
      path.join(bundleDir, 'squad.ps1'),
      hasExe
        ? [
            '$ErrorActionPreference = "Stop"',
            '$root = Split-Path -Parent $MyInvocation.MyCommand.Path',
            '$env:SQUAD_STANDALONE_HOME = $root',
            '& (Join-Path $root "squad.exe") @args',
            'exit $LASTEXITCODE',
            '',
          ].join('\r\n')
        : [
            '$ErrorActionPreference = "Stop"',
            '$root = Split-Path -Parent $MyInvocation.MyCommand.Path',
            '$env:SQUAD_STANDALONE_HOME = $root',
            '$node = "node"',
            `& $node (Join-Path $root "${CLI_ENTRY.replace(/\//g, '\\')}") @args`,
            'exit $LASTEXITCODE',
            '',
          ].join('\r\n'),
    );
    return;
  }

  const launcher = path.join(bundleDir, 'squad');
  writeFileSync(
    launcher,
    [
      '#!/bin/sh',
      '# Squad standalone launcher — resolves symlinks so the bundle works via PATH.',
      'set -e',
      'target="$0"',
      'while [ -L "$target" ]; do',
      '  link=$(readlink "$target")',
      '  case "$link" in',
      '    /*) target="$link" ;;',
      '    *) target="$(dirname "$target")/$link" ;;',
      '  esac',
      'done',
      'root="$(cd "$(dirname "$target")" && pwd)"',
      '# Lets the CLI detect it is running from a bundle so it writes an',
      '# npx-free squad_state MCP spec (see mcp-spec.ts tier 0).',
      'SQUAD_STANDALONE_HOME="$root"',
      'export SQUAD_STANDALONE_HOME',
      skipRuntime ? 'node_bin="node"' : 'node_bin="$root/runtime/bin/node"',
      `exec "$node_bin" "$root/${CLI_ENTRY}" "$@"`,
      '',
    ].join('\n'),
  );
  chmodSync(launcher, 0o755);
}

function directorySize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += directorySize(full);
    else if (entry.isFile()) total += readFileSync(full).byteLength;
  }
  return total;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = `${args.platform}-${args.arch}`;
  const version = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'packages', 'squad-cli', 'package.json'), 'utf-8'),
  ).version;

  const bundleName = `squad-${target}`;
  const bundleDir = path.join(args.outDir, bundleName);
  const stagingDir = mkdtempSync(path.join(tmpdir(), 'squad-standalone-'));

  console.log(`\nBuilding Squad ${version} standalone bundle for ${target}\n`);

  try {
    rmSync(bundleDir, { recursive: true, force: true });
    mkdirSync(bundleDir, { recursive: true });

    step('Packing workspace packages');
    const tarballs = packWorkspaces(stagingDir);

    step(`Installing runtime dependencies into app/${args.includeOptional ? ' (including optional)' : ''}`);
    installApp(path.join(bundleDir, 'app'), tarballs, version, args.includeOptional);

    if (args.skipRuntime) {
      step('Skipping Node runtime (--skip-runtime): bundle will use system node');
    } else {
      vendorRuntime(bundleDir, args.platform, args.arch, args.nodeVersion, stagingDir);
      if (args.platform === 'win32') {
        // Must run before writeLaunchers so the shims know squad.exe exists.
        step('Building squad.exe (single executable)');
        buildWindowsExe(bundleDir, stagingDir, args.nodeVersion);
      }
    }

    step('Writing launcher');
    writeLaunchers(bundleDir, args.platform, args.skipRuntime);

    writeFileSync(
      path.join(bundleDir, 'BUNDLE-INFO.json'),
      `${JSON.stringify({
        squadVersion: version,
        target,
        nodeVersion: args.skipRuntime ? null : args.nodeVersion,
        optionalDependencies: args.includeOptional ? 'included' : 'omitted',
        builtAt: new Date().toISOString(),
      }, null, 2)}\n`,
    );

    const mb = (directorySize(bundleDir) / 1024 / 1024).toFixed(1);
    console.log(`\n\x1b[32m✓\x1b[0m ${bundleName} (${mb} MB)`);
    console.log(`  ${bundleDir}\n`);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

main();
