/**
 * squad upstream — CLI commands for managing upstream Squad sources.
 *
 * Commands:
 *   squad upstream add <source> [--name <name>] [--ref <branch>]
 *   squad upstream remove <name>
 *   squad upstream list
 *   squad upstream sync [name]
 *
 * @module cli/commands/upstream
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
import { success, warn, info } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';

/** Validate a git ref (branch/tag) — reject shell metacharacters. */
function isValidGitRef(ref: string): boolean {
  return /^[a-zA-Z0-9._\-/]+$/.test(ref);
}

/** Validate an upstream name — alphanumeric, hyphens, underscores, dots. */
function isValidUpstreamName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name);
}
import type { UpstreamConfig, UpstreamSource } from '@bradygaster/squad-sdk';

function readUpstreams(upstreamFile: string): UpstreamConfig {
  if (!storage.existsSync(upstreamFile)) return { upstreams: [] };
  try {
    const raw = storage.readSync(upstreamFile);
    if (!raw) return { upstreams: [] };
    return JSON.parse(raw) as UpstreamConfig;
  } catch {
    return { upstreams: [] };
  }
}

function writeUpstreams(upstreamFile: string, data: UpstreamConfig): void {
  storage.mkdirSync(path.dirname(upstreamFile), { recursive: true });
  storage.writeSync(upstreamFile, JSON.stringify(data, null, 2) + '\n');
}

function detectSourceType(source: string): 'local' | 'git' | 'export' {
  if (source.endsWith('.json') && storage.existsSync(path.resolve(source))) return 'export';
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('file://') || source.endsWith('.git')) return 'git';
  if (storage.existsSync(path.resolve(source))) return 'local';
  if (source.includes('/') && !source.includes('\\')) return 'git';
  throw new Error(`Cannot determine source type for "${source}". Provide a git URL, local path, or export JSON file.`);
}

function deriveName(source: string, type: string): string {
  if (type === 'export') return path.basename(source, '.json').replace('squad-export', 'upstream');
  if (type === 'git') {
    const cleaned = source.replace(/\.git$/, '');
    const parts = cleaned.split('/');
    return parts[parts.length - 1] || 'upstream';
  }
  return path.basename(path.resolve(source)) || 'upstream';
}

function ensureGitignoreEntry(repoDir: string, entry: string): void {
  const gitignorePath = path.join(repoDir, '.gitignore');
  let content = '';
  if (storage.existsSync(gitignorePath)) content = storage.readSync(gitignorePath) ?? '';
  if (!content.includes(entry)) {
    const nl = content && !content.endsWith('\n') ? '\n' : '';
    storage.writeSync(gitignorePath, content + nl + entry + '\n');
  }
}

export async function upstreamCommand(args: string[]): Promise<void> {
  const action = args[0];
  if (!action || !['add', 'remove', 'list', 'sync'].includes(action)) {
    fatal('Usage: squad upstream add|remove|list|sync');
    return;
  }

  const squadDirInfo = detectSquadDir(process.cwd());
  if (!storage.existsSync(squadDirInfo.path)) {
    fatal('No squad found — run init first.');
    return;
  }

  const squadDir = squadDirInfo.path;
  const repoDir = path.dirname(squadDir);
  const upstreamFile = path.join(squadDir, 'upstream.json');

  if (action === 'add') {
    const source = args[1];
    if (!source) {
      fatal('Usage: squad upstream add <source> [--name <name>] [--ref <branch>]');
      return;
    }

    const type = detectSourceType(source);
    const nameIdx = args.indexOf('--name');
    const name = (nameIdx !== -1 && args[nameIdx + 1]) ? args[nameIdx + 1]! : deriveName(source, type);
    if (!isValidUpstreamName(name)) {
      fatal(`Invalid upstream name "${name}". Use only alphanumeric characters, hyphens, underscores, and dots.`);
    }

    const data = readUpstreams(upstreamFile);
    if (data.upstreams.some(u => u.name === name)) {
      fatal(`Upstream "${name}" already exists. Use a different --name or remove it first.`);
      return;
    }

    const entry: UpstreamSource = {
      name,
      type,
      source: type === 'local' || type === 'export' ? path.resolve(source) : source,
      added_at: new Date().toISOString(),
      last_synced: null,
    };
    if (type === 'git') {
      const refIdx = args.indexOf('--ref');
      const ref = (refIdx !== -1 && args[refIdx + 1]) ? args[refIdx + 1]! : 'main';
      if (!isValidGitRef(ref)) {
        fatal(`Invalid git ref "${ref}". Use only alphanumeric characters, hyphens, underscores, dots, and slashes.`);
      }
      entry.ref = ref;
    }

    data.upstreams.push(entry);
    writeUpstreams(upstreamFile, data);

    // Auto-clone for git sources
    if (type === 'git') {
      const reposDir = path.join(squadDir, '_upstream_repos');
      const cloneDir = path.join(reposDir, name);
      storage.mkdirSync(reposDir, { recursive: true });
      ensureGitignoreEntry(repoDir, '.squad/_upstream_repos/');

      try {
        const ref = entry.ref || 'main';
        execFileSync('git', ['clone', '--depth', '1', '--branch', ref, '--single-branch', source, cloneDir], { stdio: 'pipe', timeout: 60000 });
        entry.last_synced = new Date().toISOString();
        writeUpstreams(upstreamFile, data);
        success(`Cloned upstream repo to .squad/_upstream_repos/${name}`);
      } catch (err) {
        warn(`Clone failed — run "squad upstream sync" to retry: ${(err as Error).message}`);
      }
    }

    success(`Added upstream: ${name} (${type}: ${entry.source})`);
    if (type === 'local') {
      info('The coordinator reads from this path live at session start — no sync needed.');
    }
  }

  if (action === 'remove') {
    const name = args[1];
    if (!name) { fatal('Usage: squad upstream remove <name>'); return; }

    const data = readUpstreams(upstreamFile);
    const before = data.upstreams.length;
    data.upstreams = data.upstreams.filter(u => u.name !== name);
    if (data.upstreams.length === before) {
      fatal(`Upstream "${name}" not found.`);
      return;
    }
    writeUpstreams(upstreamFile, data);

    // Clean up cached clone
    const repoDir2 = path.join(squadDir, '_upstream_repos', name);
    if (storage.existsSync(repoDir2)) {
      storage.deleteDirSync(repoDir2);
      success(`Removed cached clone for ${name}`);
    }

    success(`Removed upstream: ${name}`);
  }

  if (action === 'list') {
    const data = readUpstreams(upstreamFile);
    if (data.upstreams.length === 0) {
      info('No upstreams configured');
      info('\nAdd one with: squad upstream add <source>');
      return;
    }
    info('\nConfigured upstreams:\n');
    for (const u of data.upstreams) {
      const synced = u.last_synced ? `synced ${u.last_synced.split('T')[0]}` : 'never synced';
      const ref = u.ref ? ` (ref: ${u.ref})` : '';
      info(`  ${u.name}  →  ${u.type}: ${u.source}${ref}  (${synced})`);
    }
    info('');
  }

  if (action === 'sync') {
    const data = readUpstreams(upstreamFile);
    if (data.upstreams.length === 0) {
      fatal('No upstreams configured. Run "squad upstream add <source>" first.');
      return;
    }

    const specificName = args[1];
    const toSync = specificName ? data.upstreams.filter(u => u.name === specificName) : data.upstreams;
    if (specificName && toSync.length === 0) {
      fatal(`Upstream "${specificName}" not found.`);
      return;
    }

    info(`\nSyncing ${toSync.length} upstream(s)...\n`);
    let synced = 0;

    for (const upstream of toSync) {
      if (upstream.type === 'local' || upstream.type === 'export') {
        // Validate source exists
        const resolvedPath = path.resolve(upstream.source);
        if (!storage.existsSync(resolvedPath)) {
          warn(`${upstream.name}: source not found: ${upstream.source}`);
          continue;
        }
        upstream.last_synced = new Date().toISOString();
        synced++;
        success(`${upstream.name} (${upstream.type} — read live): validated`);
      } else if (upstream.type === 'git') {
        const reposDir = path.join(squadDir, '_upstream_repos');
        const cloneDir = path.join(reposDir, upstream.name);
        storage.mkdirSync(reposDir, { recursive: true });
        ensureGitignoreEntry(repoDir, '.squad/_upstream_repos/');

        try {
          if (storage.existsSync(path.join(cloneDir, '.git'))) {
            execFileSync('git', ['-C', cloneDir, 'pull', '--ff-only'], { stdio: 'pipe', timeout: 60000 });
          } else {
            if (storage.existsSync(cloneDir)) storage.deleteDirSync(cloneDir);
            const ref = upstream.ref || 'main';
            execFileSync('git', ['clone', '--depth', '1', '--branch', ref, '--single-branch', upstream.source, cloneDir], { stdio: 'pipe', timeout: 60000 });
          }
          upstream.last_synced = new Date().toISOString();
          synced++;
          success(`${upstream.name} (git — synced)`);
        } catch (err) {
          warn(`${upstream.name}: git sync failed: ${(err as Error).message}`);
        }
      }
    }

    writeUpstreams(upstreamFile, data);
    info(`\n${synced}/${toSync.length} upstream(s) synced.\n`);
  }
}
