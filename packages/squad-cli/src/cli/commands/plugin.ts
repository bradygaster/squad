/**
 * Plugin marketplace commands — add/remove/list/browse
 * Port from beta index.js lines 716-833
 */

import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

// --- Main command handler ---

export async function runPlugin(dest: string, args: string[]): Promise<void> {
  const subCmd = args[0];
  const action = args[1];

  if (subCmd !== 'marketplace' || !action) {
    fatal('Usage: squad plugin marketplace add|remove|list|browse');
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
