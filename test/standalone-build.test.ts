/**
 * Structural tests for scripts/build-standalone.mjs and scripts/install.sh.
 *
 * These are deliberately source-level rather than end-to-end: producing a real
 * bundle downloads a Node runtime and runs a full npm install, which is far
 * too slow and network-dependent for the unit suite. The behaviors asserted
 * here are the ones that have actually broken (or would break silently).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'build-standalone.mjs');
const INSTALL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'install.sh');

const build = readFileSync(BUILD_SCRIPT, 'utf-8');
const install = readFileSync(INSTALL_SCRIPT, 'utf-8');

describe('build-standalone.mjs — runtime extraction', () => {
  it('extracts only the node binary, not the whole archive', () => {
    // Regression: extracting the full POSIX tarball fails on a Windows host
    // because node's archives contain symlinks (bin/npm, bin/npx,
    // bin/corepack) that Windows cannot create — which broke cross-building
    // a linux bundle from Windows with "Can't create ... Invalid argument".
    expect(build).toContain('${base}/bin/node');
    expect(build).toContain('${base}/node.exe');

    // The bare full-archive extraction must not come back.
    expect(build).not.toMatch(/run\('tar', \['-xf', archivePath, '-C', stagingDir\]/);
  });

  it('uses unzip for zip archives on non-Windows hosts', () => {
    // GNU tar (Linux) cannot read zip archives while bsdtar (Windows, macOS)
    // can. The release workflow builds every target on ubuntu-latest, so
    // without this every win32 bundle would fail to unpack its runtime.
    expect(build).toMatch(/ext === 'zip' && process\.platform !== 'win32'/);
    expect(build).toMatch(/run\('unzip'/);
  });

  it('surfaces the underlying tar error instead of a bare exit code', () => {
    expect(build).toMatch(/Failed to extract .* from/);
  });

  it('marks the vendored posix node binary executable', () => {
    expect(build).toMatch(/chmodSync\(path\.join\(runtimeDir, 'bin', 'node'\), 0o755\)/);
  });

  it('quotes the command when shelling out on Windows', () => {
    // process.execPath is under "C:\Program Files\" on most Windows hosts, and
    // execFileSync with shell:true splits an unquoted path on the space.
    expect(build).toMatch(/useShell && \/\\s\/\.test\(cmd\)/);
  });
});

describe('build-standalone.mjs — Windows squad.exe', () => {
  it('builds a real executable via Node SEA', () => {
    // winget's portable installer only symlinks .exe targets, so a bundle
    // whose entry point is squad.cmd cannot be packaged for winget at all.
    expect(build).toContain('buildWindowsExe');
    expect(build).toContain('--experimental-sea-config');
    expect(build).toContain('NODE_SEA_BLOB');
  });

  it('generates the blob with a Node matching the vendored runtime', () => {
    // The SEA blob format is tied to the Node version that produced it.
    // Injecting a mismatched blob yields an exe that dies at startup with an
    // access violation, which is not obvious from the build output.
    expect(build).toContain('resolveBlobBuilder');
    expect(build).toMatch(/process\.versions\.node === version/);
  });

  it('keeps the blob architecture-independent', () => {
    // V8 code cache is arch-specific; leaving it off lets an x64 runner build
    // the win32-arm64 bundle.
    expect(build).toContain('useCodeCache: false');
  });

  it('drops the vendored runtime once squad.exe exists', () => {
    // squad.exe *is* the runtime; keeping node.exe too would double the size.
    expect(build).toMatch(/rmSync\(path\.join\(bundleDir, 'runtime'\)/);
  });

  it('resolves the bundle through a symlink in the SEA launcher', () => {
    // winget installs portables by symlinking the exe into a links directory,
    // so process.execPath may not be inside the bundle.
    expect(build).toContain('realpathSync');
    expect(build).toContain('resolveRoot');
  });

  it('sets SQUAD_STANDALONE_HOME from the SEA launcher too', () => {
    expect(build).toMatch(/process\.env\.SQUAD_STANDALONE_HOME = root/);
  });
});

describe('build-standalone.mjs — launchers', () => {
  it('exports SQUAD_STANDALONE_HOME from every launcher', () => {
    // Without this the CLI cannot tell it is running from a bundle, and
    // squad init falls back to writing an npx-based squad_state MCP spec
    // that a firewalled machine cannot launch (#1593).
    const posix = build.includes("'SQUAD_STANDALONE_HOME=\"$root\"'")
      && build.includes("'export SQUAD_STANDALONE_HOME'");
    expect(posix).toBe(true);
    expect(build).toContain('set "SQUAD_STANDALONE_HOME=%~dp0"');
    expect(build).toContain('$env:SQUAD_STANDALONE_HOME = $root');
  });

  it('resolves symlinks in the posix launcher so PATH installs work', () => {
    // install.sh symlinks <prefix>/bin/squad -> <prefix>/lib/squad/squad, so
    // the launcher must resolve $0 before locating the runtime and app.
    expect(build).toContain('while [ -L "$target" ]; do');
    expect(build).toContain('readlink "$target"');
  });

  it('omits optional dependencies by default', () => {
    // The transitive Copilot CLI platform binary is ~318 MB; including it
    // takes a bundle from ~114 MB to ~546 MB for no benefit, since Squad
    // requires the copilot CLI on PATH anyway.
    expect(build).toContain("'--omit=dev', '--omit=optional'");
    expect(build).toContain('--include-optional');
  });
});

describe('install.sh', () => {
  it('verifies the release checksum before installing', () => {
    expect(install).toContain('SHA256SUMS.txt');
    expect(install).toMatch(/Checksum mismatch/);
  });

  it('supports VERSION, PREFIX and REPO overrides', () => {
    // REPO is what lets an air-gapped org point at an internal mirror.
    expect(install).toMatch(/REPO="\$\{REPO:-bradygaster\/squad\}"/);
    expect(install).toMatch(/VERSION="\$\{VERSION:-latest\}"/);
    expect(install).toMatch(/PREFIX="\/usr\/local"/);
  });

  it('maps uname output to the published asset names', () => {
    for (const target of ['linux', 'darwin', 'x64', 'arm64']) {
      expect(install).toContain(target);
    }
    expect(install).toContain('squad-${target}.tar.gz');
  });

  it('never fetches from the npm registry', () => {
    // The entire point: installing must touch github.com only. Check the
    // executable lines rather than the raw file, since the header comment
    // legitimately mentions the registry when explaining what this avoids.
    const code = install
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(code).not.toContain('registry.npmjs.org');
    expect(code).not.toMatch(/\bnpm install\b/);
    expect(code).not.toMatch(/\bnpx\b/);
  });

  it('points users at Copilot CLI when it is missing', () => {
    // Squad drives the copilot CLI and deliberately does not vendor it.
    expect(install).toContain('gh.io/copilot-install');
  });
});
