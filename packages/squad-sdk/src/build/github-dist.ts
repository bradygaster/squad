/**
 * M4-3: Distribution configuration
 * Supports npm distribution (npm install -g @bradygaster/squad-cli).
 */

export interface GitHubDistConfig {
  owner: string;
  repo: string;
  binaryName: string;
  installCommandTemplate: string;
}

const DEFAULT_CONFIG: GitHubDistConfig = {
  owner: 'bradygaster',
  repo: 'squad',
  binaryName: 'squad',
  installCommandTemplate: 'squad',
};

/**
 * Generate a shell script that downloads and installs from GitHub releases.
 */
export function generateInstallScript(config?: Partial<GitHubDistConfig>): string {
  const c = resolveConfig(config);
  return `#!/usr/bin/env bash
set -euo pipefail

OWNER="${c.owner}"
REPO="${c.repo}"
BINARY="${c.binaryName}"

# Detect latest version from GitHub API
VERSION=\${1:-$(curl -sL "https://api.github.com/repos/\${OWNER}/\${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\\1/')}

echo "Installing \${BINARY} v\${VERSION}..."

DOWNLOAD_URL="https://github.com/\${OWNER}/\${REPO}/releases/download/v\${VERSION}/\${BINARY}-\${VERSION}.tar.gz"
INSTALL_DIR="\${HOME}/.local/bin"

mkdir -p "\${INSTALL_DIR}"
curl -sL "\${DOWNLOAD_URL}" | tar xz -C "\${INSTALL_DIR}"
chmod +x "\${INSTALL_DIR}/\${BINARY}"

echo "\${BINARY} v\${VERSION} installed to \${INSTALL_DIR}/\${BINARY}"
echo "Make sure \${INSTALL_DIR} is in your PATH."
`;
}

export interface ReleaseValidationResult {
  valid: boolean;
  errors: string[];
  version: string;
  expectedAssets: string[];
}

/**
 * Validate that a GitHub release has the expected assets.
 */
export function validateGitHubRelease(config: GitHubDistConfig, version: string): ReleaseValidationResult {
  const errors: string[] = [];
  const expectedAssets = [
    `${config.binaryName}-${version}.tar.gz`,
    `${config.binaryName}-${version}.zip`,
  ];

  if (!version || typeof version !== 'string') {
    errors.push('Version is required');
  } else if (!/^\d+\.\d+\.\d+/.test(version)) {
    errors.push(`Invalid semver version: ${version}`);
  }

  if (!config.owner) {
    errors.push('Missing owner in config');
  }

  if (!config.repo) {
    errors.push('Missing repo in config');
  }

  if (!config.binaryName) {
    errors.push('Missing binaryName in config');
  }

  return { valid: errors.length === 0, errors, version: version || '', expectedAssets };
}

/**
 * Get the install command string.
 */
export function getInstallCommand(config?: Partial<GitHubDistConfig>): string {
  const c = resolveConfig(config);
  return c.installCommandTemplate
    .replace('{{owner}}', c.owner)
    .replace('{{repo}}', c.repo);
}

/**
 * Generate the bin script that runs when the CLI is invoked.
 */
export function generateNpxEntryPoint(): string {
  return `#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    const { main: run } = await import(join(__dirname, 'index.js'));
    if (typeof run === 'function') {
      await run();
    }
  } catch (err) {
    console.error('squad: failed to start —', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
`;
}

/**
 * Get the default GitHub distribution config.
 */
export function getDefaultDistConfig(): GitHubDistConfig {
  return { ...DEFAULT_CONFIG };
}

function resolveConfig(config?: Partial<GitHubDistConfig>): GitHubDistConfig {
  if (!config) return { ...DEFAULT_CONFIG };
  return {
    owner: config.owner ?? DEFAULT_CONFIG.owner,
    repo: config.repo ?? DEFAULT_CONFIG.repo,
    binaryName: config.binaryName ?? DEFAULT_CONFIG.binaryName,
    installCommandTemplate: config.installCommandTemplate ?? DEFAULT_CONFIG.installCommandTemplate,
  };
}
