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
import { isSafeUpstreamName } from '@bradygaster/squad-sdk/upstream';

const storage = new FSStorageProvider();
import { success, warn, info } from '../core/output.js';
import { fatal, fatalNoSquad } from '../core/errors.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';

/** Validate a git ref (branch/tag) — reject shell metacharacters. */
function isValidGitRef(ref: string): boolean {
  return /^[a-zA-Z0-9._\-/]+$/.test(ref);
}

/** Validate an upstream name — alphanumeric, hyphens, underscores, dots. */
function isValidUpstreamName(name: string): boolean {
  return isSafeUpstreamName(name);
}

/**
 * Git sources are passed to a `git` subprocess, so they are restricted to an allow-list
 * of transports. Anything that could be parsed as an option (leading dash), a remote
 * helper (`ext::`, `fd::`), `file://`, plain `http://` or an unknown scheme is rejected.
 * Returns null when safe, otherwise the reason.
 */
export function unsafeGitSourceReason(source: string): string | null {
  const s = source.trim();
  if (s.length === 0) return 'empty source';
  if (s.startsWith('-')) return 'starts with "-" and could be parsed as a git option';
  if (/^[a-z][a-z0-9+.-]*::/i.test(s)) return 'uses a git remote helper (ext::, fd::, …), which is not allowed';
  if (/[\s\0\r\n\t]/.test(s)) return 'contains whitespace or control characters';
  // Embedded credentials (https://user:token@host/…, ssh://user:pw@host/…) are never accepted:
  // they would be persisted in upstream.json and passed on the git command line.
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/@\s]*:[^/@\s]*@/i.test(s)) return 'embeds credentials in the URL (user:secret@host); use a credential helper or SSH key instead';
  // Host: letters/digits/dots/dashes, must not start with a dash or dot, optional :port.
  // User: letters/digits/._-, must not start with a dash. Path: must not start with a dash.
  const HOST = '[A-Za-z0-9][A-Za-z0-9.-]*(?::\\d{1,5})?';
  const USER = '[A-Za-z0-9._][A-Za-z0-9._-]*';
  const PATH_NO_DASH = '(?!-)[^\\s]+';
  if (new RegExp(`^https://(?:${USER}@)?${HOST}/${PATH_NO_DASH}$`).test(s)) return null;
  if (new RegExp(`^ssh://(?:${USER}@)?${HOST}/${PATH_NO_DASH}$`).test(s)) return null;
  if (new RegExp(`^${USER}@[A-Za-z0-9][A-Za-z0-9.-]*:(?![/-])[^:\\s]+$`).test(s)) return null; // git@host:owner/repo
  if (/^(https|ssh):\/\//i.test(s) || /^[^@\s]+@[^:\s]+:/.test(s)) {
    return 'has a user, host or path component that is empty, starts with "-" or contains characters outside [A-Za-z0-9._-] (option-injection guard)';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return `uses an unsupported transport (${s.split('://')[0]}://); allowed: https://, ssh://, git@host:path`;
  return 'is not an https://, ssh:// or git@host:path URL (local directories are added as "local" upstreams)';
}

/**
 * Environment for every git subprocess run by `squad upstream`: remote helpers and the
 * file protocol are disabled regardless of the user's global git config.
 */
export function gitSyncEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const params = [
    "'protocol.allow=never'",
    "'protocol.https.allow=always'",
    "'protocol.ssh.allow=always'",
    "'protocol.ext.allow=never'",
    "'protocol.file.allow=never'",
    "'core.sshCommand=ssh'",
    // Never materialize symlinks from an upstream repository: a committed link could point
    // the resolver's snapshot root at another path on this machine.
    "'core.symlinks=false'",
  ];
  const existing = base['GIT_CONFIG_PARAMETERS'];
  return {
    ...base,
    GIT_CONFIG_PARAMETERS: existing ? `${existing} ${params.join(' ')}` : params.join(' '),
    GIT_TERMINAL_PROMPT: '0',
  };
}

/** Display form of a source for messages: user:secret@ becomes ***@ so secrets never reach stdout/stderr. */
export function redactGitSource(source: string): string {
  return source.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1***@');
}

function assertSafeGitSource(source: string): void {
  const reason = unsafeGitSourceReason(source);
  if (reason) {
    fatal(`Refusing git upstream source "${redactGitSource(source)}": ${reason}.`);
  }
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
  if (source.startsWith('-')) {
    fatal(`Refusing upstream source "${source}": starts with "-" and could be parsed as an option.`);
  }
  if (source.endsWith('.json') && storage.existsSync(path.resolve(source))) return 'export';
  if (/^[a-z][a-z0-9+.-]*:(\/\/|:)/i.test(source) || /^[a-z0-9._-]+@[a-z0-9.-]+:/i.test(source) || source.endsWith('.git')) return 'git';
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
    fatalNoSquad();
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
    if (type === 'git') assertSafeGitSource(source);
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

    // Transactional: a git upstream is registered only once its clone exists. A failed clone
    // leaves upstream.json untouched (no "registered but broken" state); a failed explicit
    // `squad upstream sync` of an already-registered entry is the allowed, different case.
    if (type === 'git') {
      const reposDir = path.join(squadDir, '_upstream_repos');
      const cloneDir = path.join(reposDir, name);
      // The destination must be a fresh directory inside _upstream_repos that this invocation
      // owns: never clone into (or later delete) something that already exists.
      const rel = path.relative(reposDir, cloneDir);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
        fatal(`Invalid upstream name "${name}": it must be a single path segment.`);
        return;
      }
      if (storage.existsSync(cloneDir)) {
        fatal(`Refusing to clone into existing ${path.join('.squad', '_upstream_repos', name)}; remove it first or pick another --name.`);
        return;
      }
      storage.mkdirSync(reposDir, { recursive: true });
      ensureGitignoreEntry(repoDir, '.squad/_upstream_repos/');
      const ref = entry.ref || 'main';
      try {
        execFileSync('git', ['clone', '--depth', '1', '--branch', ref, '--single-branch', '--', source, cloneDir], { stdio: 'pipe', timeout: 60000, env: gitSyncEnv() });
      } catch (err) {
        // Only the directory git may have created for THIS clone is cleaned up (it did not exist above).
        if (storage.existsSync(cloneDir)) { try { storage.deleteDirSync(cloneDir); } catch { /* best effort */ } }
        fatal(`Clone failed; upstream "${name}" was not added (upstream.json unchanged). Fix the source or network and re-run "squad upstream add". git: ${(err as Error).message.split('\n')[0]}`);
        return;
      }
      entry.last_synced = new Date().toISOString();
      success(`Cloned upstream repo to .squad/_upstream_repos/${name}`);
    }

    data.upstreams.push(entry);
    writeUpstreams(upstreamFile, data);

    success(`Added upstream: ${name} (${type}: ${entry.source})`);
    if (type === 'local') {
      info('Sessions read this path from disk at startup (no sync needed); "squad upstream sync" just re-validates it.');
    } else if (type === 'git') {
      info('Sessions never fetch: they read .squad/_upstream_repos/' + name + '. Run "squad upstream sync" to refresh it.');
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
        const unsafe = unsafeGitSourceReason(upstream.source);
        if (unsafe) {
          warn(`${upstream.name}: refusing to sync git source "${redactGitSource(upstream.source)}": ${unsafe}. Remove it with "squad upstream remove ${upstream.name}".`);
          continue;
        }
        const refToSync = upstream.ref || 'main';
        if (!isValidGitRef(refToSync)) {
          warn(`${upstream.name}: refusing to sync: invalid git ref "${refToSync}".`);
          continue;
        }
        const reposDir = path.join(squadDir, '_upstream_repos');
        const cloneDir = path.join(reposDir, upstream.name);
        storage.mkdirSync(reposDir, { recursive: true });
        ensureGitignoreEntry(repoDir, '.squad/_upstream_repos/');

        try {
          if (storage.existsSync(path.join(cloneDir, '.git'))) {
            execFileSync('git', ['-C', cloneDir, 'pull', '--ff-only', '--', 'origin', refToSync], { stdio: 'pipe', timeout: 60000, env: gitSyncEnv() });
          } else {
            if (storage.existsSync(cloneDir)) storage.deleteDirSync(cloneDir);
            execFileSync('git', ['clone', '--depth', '1', '--branch', refToSync, '--single-branch', '--', upstream.source, cloneDir], { stdio: 'pipe', timeout: 60000, env: gitSyncEnv() });
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
