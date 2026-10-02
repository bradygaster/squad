/**
 * Generate Homebrew and winget packaging manifests for a Squad release.
 *
 * (No shebang: this module is imported by test/packaging-manifests.test.ts, and
 * a shebang breaks vitest's module transform on Windows. Matches the shape of
 * scripts/pr-readiness.mjs, the repo's other importable script. Run it with
 * `node scripts/generate-packaging.mjs`.)
 *
 * Both ecosystems embed the release version and a SHA-256 per artifact, so the
 * manifests cannot be hand-maintained without going stale on every release.
 * This renders them from the release's own `SHA256SUMS.txt`.
 *
 * Usage:
 *   node scripts/generate-packaging.mjs --version v0.11.0
 *   node scripts/generate-packaging.mjs --version v0.11.0 --checksums ./SHA256SUMS.txt
 *   node scripts/generate-packaging.mjs --version v0.11.0 --out-dir packaging/
 *
 * With no --checksums the file is fetched from the GitHub release.
 *
 * Output:
 *   <out>/homebrew/squad.rb
 *   <out>/winget/<Publisher>.<Package>.yaml               (version manifest)
 *   <out>/winget/<Publisher>.<Package>.installer.yaml
 *   <out>/winget/<Publisher>.<Package>.locale.en-US.yaml
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_REPO = 'bradygaster/squad';
const PACKAGE_IDENTIFIER = 'bradygaster.Squad';
const HOMEPAGE = 'https://github.com/bradygaster/squad';

/** Manifest schema version. Matches what winget-pkgs currently accepts. */
const WINGET_SCHEMA = '1.12.0';

/**
 * winget's portable installer only creates symlinks to `.exe` targets — `.cmd`
 * and `.bat` are explicitly unsupported — so the Windows bundle must ship a
 * real executable and the manifest must point at it.
 */
const WINDOWS_ENTRY = 'squad.exe';

function parseArgs(argv) {
  const args = {
    version: null,
    checksums: null,
    repo: DEFAULT_REPO,
    outDir: path.join(REPO_ROOT, 'dist-packaging'),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case '--version': args.version = next(); break;
      case '--checksums': args.checksums = path.resolve(next()); break;
      case '--repo': args.repo = next(); break;
      case '--out-dir': args.outDir = path.resolve(next()); break;
      case '--help': case '-h': printUsage(); process.exit(0); break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.version) throw new Error('--version is required (e.g. --version v0.11.0)');
  if (!/^v?\d+\.\d+\.\d+[A-Za-z0-9.-]*$/.test(args.version)) {
    throw new Error(`--version must look like v0.11.0, got "${args.version}"`);
  }
  return args;
}

function printUsage() {
  console.log(`Generate Homebrew and winget manifests for a Squad release.

Options:
  --version <tag>       Release tag, e.g. v0.11.0 (required)
  --checksums <file>    SHA256SUMS.txt to read. Fetched from the release if omitted.
  --repo <owner/repo>   Source repository (default: ${DEFAULT_REPO})
  --out-dir <dir>       Output directory (default: dist-packaging/)
  -h, --help            Show this message`);
}

/** Strip a leading "v" — winget and Homebrew both want a bare semver. */
function bareVersion(tag) {
  return tag.replace(/^v/, '');
}

export function releaseChannel(tag) {
  const version = bareVersion(tag);
  if (/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    return 'stable';
  }
  if (/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-preview\.(0|[1-9]\d*)$/.test(version)) {
    return 'preview';
  }
  if (/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-insider\.(0|[1-9]\d*)$/.test(version)) {
    return 'insider';
  }
  throw new Error(
    `Unsupported release version "${version}". Expected X.Y.Z, X.Y.Z-preview.N, or X.Y.Z-insider.N.`,
  );
}

export function homebrewToken(version) {
  const channel = releaseChannel(version);
  return channel === 'stable' ? 'squad' : `squad-${channel}`;
}

export function wingetPackageIdentifier(version) {
  const channel = releaseChannel(version);
  if (channel === 'stable') return PACKAGE_IDENTIFIER;
  return `${PACKAGE_IDENTIFIER}.${channel[0].toUpperCase()}${channel.slice(1)}`;
}

/**
 * Parse a `sha256  filename` listing into { asset: sha } .
 * Accepts both the GNU (`hash  name`) and BSD (`SHA256 (name) = hash`) shapes.
 */
export function parseChecksums(text) {
  const map = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bsd = trimmed.match(/^SHA256\s*\((.+)\)\s*=\s*([a-fA-F0-9]{64})$/);
    if (bsd) {
      map[path.basename(bsd[1])] = bsd[2].toLowerCase();
      continue;
    }
    const gnu = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (gnu) map[path.basename(gnu[2])] = gnu[1].toLowerCase();
  }
  return map;
}

function loadChecksums(args) {
  if (args.checksums) return parseChecksums(readFileSync(args.checksums, 'utf-8'));
  const url = `https://github.com/${args.repo}/releases/download/${args.version}/SHA256SUMS.txt`;
  const text = execFileSync('curl', ['-fsSL', url], { encoding: 'utf-8' });
  return parseChecksums(text);
}

function requireAsset(checksums, asset) {
  const sha = checksums[asset];
  if (!sha) {
    throw new Error(
      `No checksum for "${asset}". Present: ${Object.keys(checksums).join(', ') || '(none)'}`,
    );
  }
  return sha;
}

function assetUrl(repo, tag, asset) {
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

/**
 * Homebrew cask.
 *
 * A cask rather than a formula: the bundle ships prebuilt binaries with a
 * vendored runtime, so there is nothing to build from source. `binary` works on
 * both macOS and Linux, and the launcher is a shell script — which Homebrew is
 * happy to symlink (unlike winget, which requires a real executable).
 */
export function renderHomebrewCask({ version, repo, checksums }) {
  const v = bareVersion(version);
  const channel = releaseChannel(version);
  const token = homebrewToken(version);
  const armAsset = 'squad-darwin-arm64.tar.gz';
  const intelAsset = 'squad-darwin-x64.tar.gz';
  const armSha = requireAsset(checksums, armAsset);
  const intelSha = requireAsset(checksums, intelAsset);
  const livecheck = channel === 'stable'
    ? `
  livecheck do
    url :url
    strategy :github_latest
  end
`
    : '';
  const channelLabel = channel === 'stable' ? '' : ` (${channel} channel)`;
  const conflicts = ['squad', 'squad-preview', 'squad-insider']
    .filter((candidate) => candidate !== token)
    .map((candidate) => `    "${candidate}"`)
    .join(',\n');

  return `cask "${token}" do
  arch arm: "arm64", intel: "x64"

  version "${v}"
  sha256 arm:   "${armSha}",
         intel: "${intelSha}"

  url "https://github.com/${repo}/releases/download/v#{version}/squad-darwin-#{arch}.tar.gz",
      verified: "github.com/${repo}/"
  name "Squad"
  desc "Programmable multi-agent runtime for GitHub Copilot${channelLabel}"
  homepage "${HOMEPAGE}"
${livecheck}
  conflicts_with cask: [
${conflicts},
  ]

  depends_on macos: ">= :big_sur"

  binary "squad-darwin-#{arch}/squad"

  caveats do
    <<~EOS
      Squad drives the GitHub Copilot CLI, which is not bundled. Install it with:
        brew install --cask copilot-cli
    EOS
  end

  zap trash: [
    "~/.squad",
    "~/Library/Caches/squad",
  ]
end
`;
}

export function renderWingetVersion({ version }) {
  const identifier = wingetPackageIdentifier(version);
  return `# yaml-language-server: $schema=https://aka.ms/winget-manifest.version.${WINGET_SCHEMA}.schema.json

PackageIdentifier: ${identifier}
PackageVersion: ${bareVersion(version)}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${WINGET_SCHEMA}
`;
}

/**
 * winget installer manifest.
 *
 * Modeled on GitHub.Copilot, which ships the same shape: a zip containing a
 * portable executable. `NestedInstallerFiles.RelativeFilePath` is relative to
 * the archive root, and our archives keep the bundle in a `squad-<target>/`
 * directory, so the path includes that prefix.
 */
export function renderWingetInstaller({ version, repo, checksums, releaseDate }) {
  const v = bareVersion(version);
  const identifier = wingetPackageIdentifier(version);
  const targets = [
    { arch: 'x64', asset: 'squad-win32-x64.zip', dir: 'squad-win32-x64' },
    { arch: 'arm64', asset: 'squad-win32-arm64.zip', dir: 'squad-win32-arm64' },
  ];

  const installers = targets.map(({ arch, asset, dir }) => {
    const sha = requireAsset(checksums, asset).toUpperCase();
    return [
      `- Architecture: ${arch}`,
      `  InstallerUrl: ${assetUrl(repo, version, asset)}`,
      `  InstallerSha256: ${sha}`,
      '  NestedInstallerFiles:',
      `  - RelativeFilePath: ${dir}\\${WINDOWS_ENTRY}`,
      '    PortableCommandAlias: squad',
    ].join('\n');
  }).join('\n');

  return `# yaml-language-server: $schema=https://aka.ms/winget-manifest.installer.${WINGET_SCHEMA}.schema.json

PackageIdentifier: ${identifier}
PackageVersion: ${v}
MinimumOSVersion: 10.0.17763.0
InstallerType: zip
NestedInstallerType: portable
Commands:
- squad
${releaseDate ? `ReleaseDate: ${releaseDate}\n` : ''}Installers:
${installers}
ManifestType: installer
ManifestVersion: ${WINGET_SCHEMA}
`;
}

export function renderWingetLocale({ version, repo }) {
  const channel = releaseChannel(version);
  const identifier = wingetPackageIdentifier(version);
  const channelLabel = channel === 'stable' ? '' : ` ${channel[0].toUpperCase()}${channel.slice(1)}`;
  return `# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.${WINGET_SCHEMA}.schema.json

PackageIdentifier: ${identifier}
PackageVersion: ${bareVersion(version)}
PackageLocale: en-US
Publisher: Brady Gaster
PublisherUrl: https://github.com/bradygaster
PublisherSupportUrl: https://github.com/${repo}/issues
PackageName: Squad${channelLabel}
PackageUrl: ${HOMEPAGE}
License: MIT
LicenseUrl: https://github.com/${repo}/blob/HEAD/LICENSE
ShortDescription: Programmable multi-agent runtime for GitHub Copilot
Description: Squad turns GitHub Copilot into a coordinated team of specialist agents. It routes work to the right agent, enforces reviewer gates, and keeps durable team state in your repository.
Moniker: squad
Tags:
- agents
- ai
- cli
- copilot
- multi-agent
ReleaseNotesUrl: https://github.com/${repo}/releases/tag/${version}
Documentations:
- DocumentLabel: Documentation
  DocumentUrl: https://bradygaster.github.io/squad/
ManifestType: defaultLocale
ManifestVersion: ${WINGET_SCHEMA}
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const checksums = loadChecksums(args);
  const releaseDate = new Date().toISOString().slice(0, 10);

  const brewDir = path.join(args.outDir, 'homebrew');
  const wingetDir = path.join(args.outDir, 'winget');
  mkdirSync(brewDir, { recursive: true });
  mkdirSync(wingetDir, { recursive: true });

  const written = [];
  const emit = (file, content) => {
    writeFileSync(file, content);
    written.push(path.relative(process.cwd(), file));
  };

  const brewToken = homebrewToken(args.version);
  const wingetIdentifier = wingetPackageIdentifier(args.version);
  emit(path.join(brewDir, `${brewToken}.rb`), renderHomebrewCask({ ...args, checksums }));
  emit(path.join(wingetDir, `${wingetIdentifier}.yaml`), renderWingetVersion(args));
  emit(
    path.join(wingetDir, `${wingetIdentifier}.installer.yaml`),
    renderWingetInstaller({ ...args, checksums, releaseDate }),
  );
  emit(
    path.join(wingetDir, `${wingetIdentifier}.locale.en-US.yaml`),
    renderWingetLocale(args),
  );

  console.log(`\nGenerated packaging manifests for ${args.version}:\n`);
  for (const file of written) console.log(`  ${file}`);
  console.log(`
Next steps:
  Homebrew — copy ${brewToken}.rb into the tap repo (Casks/${brewToken}.rb).
  winget   — copy the winget/ directory into
             winget-pkgs/manifests/b/${wingetIdentifier.replaceAll('.', '/')}/${bareVersion(args.version)}/
             then validate with: winget validate --manifest <dir>
`);
}

// Only run when invoked directly, so the renderers stay unit-testable.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
