/**
 * Plugin commands — install extensions + marketplace management
 */

import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { TIMEOUTS, FSStorageProvider } from '@bradygaster/squad-sdk';
import { success, warn, info, dim, bold, DIM, BOLD, RESET } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { ghAvailable, ghAuthenticated } from '../core/gh-cli.js';

const execFileAsync = promisify(execFile);

// --- Types ---

export interface Marketplace {
  name: string;
  source: string;
  added_at: string;
}

export interface MarketplacesRegistry {
  marketplaces: Marketplace[];
}

/** Extension directories we look for in the cloned repo. */
const EXTENSION_DIRS = ['skills', 'ceremonies', 'directives'] as const;

export interface InstalledFile {
  source: string;
  dest: string;
}

export interface InstalledPlugin {
  name: string;
  repo: string;
  installed_at: string;
  files: InstalledFile[];
}

export interface InstalledRegistry {
  plugins: InstalledPlugin[];
}

// --- Helpers ---

/**
 * Parse a repo reference like "github/owner/repo" or "owner/repo"
 * into { owner, repo } for git clone URL construction.
 */
export function parseRepoRef(ref: string): { owner: string; repo: string } {
  const parts = ref.split('/').filter(Boolean);

  // "github/owner/repo" → strip "github" prefix
  if (parts.length === 3 && parts[0]!.toLowerCase() === 'github') {
    return { owner: parts[1]!, repo: parts[2]! };
  }

  // "owner/repo"
  if (parts.length === 2) {
    return { owner: parts[0]!, repo: parts[1]! };
  }

  fatal(`Invalid repo reference: "${ref}". Expected "owner/repo" or "github/owner/repo".`);
}

/**
 * Collect all .md files from a directory (non-recursive).
 * Returns an empty array if the directory doesn't exist.
 */
export function collectMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md'));
}

// --- Install subcommand ---

export async function runPluginInstall(dest: string, repoRef: string): Promise<void> {
  const squadDirInfo = detectSquadDir(dest);

  // Verify .squad directory actually exists on disk
  if (!existsSync(squadDirInfo.path)) {
    fatal(`.squad/ directory not found in ${dest}. Run "squad init" first.`);
  }

  const { owner, repo } = parseRepoRef(repoRef);
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  const cloneDir = join(dest, `.squad-plugin-clone-${repo}-${Date.now()}`);

  info(`${DIM}Cloning ${owner}/${repo}…${RESET}`);

  try {
    await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, cloneDir], {
      timeout: TIMEOUTS.PLUGIN_FETCH_MS,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fatal(`Failed to clone ${owner}/${repo} — ${message}`);
  }

  try {
    // Detect extension structure and copy files
    const installedFiles: InstalledFile[] = [];
    let anyFound = false;

    for (const dirName of EXTENSION_DIRS) {
      const srcDir = join(cloneDir, dirName);
      const mdFiles = collectMdFiles(srcDir);
      if (mdFiles.length === 0) continue;
      anyFound = true;

      const destDir = join(squadDirInfo.path, dirName);
      mkdirSync(destDir, { recursive: true });

      for (const file of mdFiles) {
        const srcPath = join(srcDir, file);
        const destPath = join(destDir, file);
        copyFileSync(srcPath, destPath);
        installedFiles.push({
          source: `${dirName}/${file}`,
          dest: destPath,
        });
        info(`  📄 ${dirName}/${file} → .squad/${dirName}/${file}`);
      }
    }

    if (!anyFound) {
      warn(`No skills/, ceremonies/, or directives/ directories found in ${owner}/${repo}. Nothing installed.`);
      return;
    }

    // Track in installed.json
    const storage = new FSStorageProvider();
    const pluginsDir = join(squadDirInfo.path, 'plugins');
    const installedFile = join(pluginsDir, 'installed.json');

    let registry: InstalledRegistry = { plugins: [] };
    const existing = await storage.read(installedFile);
    if (existing) {
      try {
        registry = JSON.parse(existing);
      } catch {
        // corrupted file — start fresh
      }
    }

    // Remove previous entry for same repo (upgrade scenario)
    const canonicalRepo = `${owner}/${repo}`;
    registry.plugins = registry.plugins.filter(p => p.repo !== canonicalRepo);

    registry.plugins.push({
      name: repo,
      repo: canonicalRepo,
      installed_at: new Date().toISOString(),
      files: installedFiles,
    });

    await storage.mkdir(pluginsDir, { recursive: true });
    await storage.write(installedFile, JSON.stringify(registry, null, 2) + '\n');

    success(`Installed ${BOLD}${repo}${RESET} — ${installedFiles.length} file(s) copied`);
  } finally {
    // Cleanup temp clone directory
    try {
      rmSync(cloneDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

// --- Main command handler ---

export async function runPlugin(dest: string, args: string[]): Promise<void> {
  const subCmd = args[0];
  const action = args[1];

  // --- Install subcommand ---
  if (subCmd === 'install') {
    const repoRef = args[1];
    if (!repoRef) {
      fatal('Usage: squad plugin install <owner/repo>');
    }
    await runPluginInstall(dest, repoRef);
    return;
  }

  if (subCmd !== 'marketplace' || !action) {
    fatal('Usage: squad plugin install <repo> | squad plugin marketplace add|remove|list|browse');
  }

  const squadDirInfo = detectSquadDir(dest);
  const storage = new FSStorageProvider();
  const pluginsDir = join(squadDirInfo.path, 'plugins');
  const marketplacesFile = join(pluginsDir, 'marketplaces.json');

  async function readMarketplaces(): Promise<MarketplacesRegistry> {
    if (!storage.existsSync(marketplacesFile)) {
      return { marketplaces: [] };
    }
    try {
      const content = await storage.read(marketplacesFile);
      if (!content) return { marketplaces: [] };
      return JSON.parse(content);
    } catch {
      return { marketplaces: [] };
    }
  }

  async function writeMarketplaces(data: MarketplacesRegistry): Promise<void> {
    await storage.mkdir(pluginsDir, { recursive: true });
    await storage.write(marketplacesFile, JSON.stringify(data, null, 2) + '\n');
  }

  // --- Add marketplace ---
  if (action === 'add') {
    const source = args[2];
    if (!source || !source.includes('/')) {
      fatal('Usage: squad plugin marketplace add <owner/repo>');
    }

    const data = await readMarketplaces();
    const name = source.split('/').pop()!;

    if (data.marketplaces.some(m => m.source === source)) {
      info(`${DIM}${source} is already registered${RESET}`);
      return;
    }

    data.marketplaces.push({
      name,
      source,
      added_at: new Date().toISOString()
    });

    await writeMarketplaces(data);
    success(`Registered marketplace: ${BOLD}${name}${RESET} (${source})`);
    return;
  }

  // --- Remove marketplace ---
  if (action === 'remove') {
    const name = args[2];
    if (!name) {
      fatal('Usage: squad plugin marketplace remove <name>');
    }

    const data = await readMarketplaces();
    const before = data.marketplaces.length;
    data.marketplaces = data.marketplaces.filter(m => m.name !== name);

    if (data.marketplaces.length === before) {
      fatal(`Marketplace "${name}" not found`);
    }

    await writeMarketplaces(data);
    success(`Removed marketplace: ${BOLD}${name}${RESET}`);
    return;
  }

  // --- List marketplaces ---
  if (action === 'list') {
    const data = await readMarketplaces();

    if (data.marketplaces.length === 0) {
      info(`${DIM}No marketplaces registered${RESET}`);
      console.log(`\nAdd one with: ${BOLD}squad plugin marketplace add <owner/repo>${RESET}`);
      return;
    }

    console.log(`\n${BOLD}Registered marketplaces:${RESET}\n`);
    for (const m of data.marketplaces) {
      const date = m.added_at ? ` ${DIM}(added ${m.added_at.split('T')[0]})${RESET}` : '';
      console.log(`  ${BOLD}${m.name}${RESET}  →  ${m.source}${date}`);
    }
    console.log();
    return;
  }

  // --- Browse marketplace ---
  if (action === 'browse') {
    const name = args[2];
    if (!name) {
      fatal('Usage: squad plugin marketplace browse <name>');
    }

    const data = await readMarketplaces();
    const marketplace = data.marketplaces.find(m => m.name === name);

    if (!marketplace) {
      fatal(`Marketplace "${name}" not found. Run "squad plugin marketplace list" to see registered marketplaces.`);
    }

    // Check gh CLI availability
    if (!(await ghAvailable())) {
      fatal('GitHub CLI (gh) is required but not found. Install from https://cli.github.com/');
    }

    if (!(await ghAuthenticated())) {
      fatal('GitHub CLI is not authenticated. Run "gh auth login" first.');
    }

    // Browse the marketplace repo for plugins using gh CLI
    let entries: string[];
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/${marketplace.source}/contents`, '--jq', '[.[] | select(.type == "dir") | .name]'],
        { timeout: TIMEOUTS.PLUGIN_FETCH_MS }
      );
      entries = JSON.parse(stdout.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fatal(`Could not browse ${marketplace.source} — ${message}`);
    }

    if (!entries || entries.length === 0) {
      info(`${DIM}No plugins found in ${marketplace.source}${RESET}`);
      return;
    }

    console.log(`\n${BOLD}Plugins in ${marketplace.name}${RESET} (${marketplace.source}):\n`);
    for (const entry of entries) {
      console.log(`  📦 ${entry}`);
    }
    console.log(`\n${DIM}${entries.length} plugin(s) available${RESET}\n`);
    return;
  }

  fatal(`Unknown action: ${action}. Usage: squad plugin marketplace add|remove|list|browse`);
}
