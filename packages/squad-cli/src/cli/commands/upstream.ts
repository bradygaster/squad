/**
 * squad upstream — CLI commands for managing upstream Squad sources.
 *
 * Commands:
 *   squad upstream add <source> [--name <name>] [--ref <branch>]
 *   squad upstream remove <name>
 *   squad upstream list
 *   squad upstream sync [name]
 *   squad upstream watch [--interval N] [--auto-pr]
 *   squad upstream propose <name> [--skills] [--decisions] [--governance] [--all]
 *
 * @module cli/commands/upstream
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
  if (!fs.existsSync(upstreamFile)) return { upstreams: [] };
  try {
    return JSON.parse(fs.readFileSync(upstreamFile, 'utf8')) as UpstreamConfig;
  } catch {
    return { upstreams: [] };
  }
}

function writeUpstreams(upstreamFile: string, data: UpstreamConfig): void {
  fs.mkdirSync(path.dirname(upstreamFile), { recursive: true });
  fs.writeFileSync(upstreamFile, JSON.stringify(data, null, 2) + '\n');
}

function detectSourceType(source: string): 'local' | 'git' | 'export' {
  if (source.endsWith('.json') && fs.existsSync(path.resolve(source))) return 'export';
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('file://') || source.endsWith('.git')) return 'git';
  if (fs.existsSync(path.resolve(source))) return 'local';
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
  if (fs.existsSync(gitignorePath)) content = fs.readFileSync(gitignorePath, 'utf8');
  if (!content.includes(entry)) {
    const nl = content && !content.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, content + nl + entry + '\n');
  }
}

export async function upstreamCommand(args: string[]): Promise<void> {
  const action = args[0];
  if (!action || !['add', 'remove', 'list', 'sync', 'watch', 'propose'].includes(action)) {
    fatal('Usage: squad upstream add|remove|list|sync|watch|propose');
    return;
  }

  const squadDirInfo = detectSquadDir(process.cwd());
  if (!fs.existsSync(squadDirInfo.path)) {
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
      fs.mkdirSync(reposDir, { recursive: true });
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
    if (fs.existsSync(repoDir2)) {
      fs.rmSync(repoDir2, { recursive: true, force: true });
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
        if (!fs.existsSync(resolvedPath)) {
          warn(`${upstream.name}: source not found: ${upstream.source}`);
          continue;
        }
        upstream.last_synced = new Date().toISOString();
        synced++;
        success(`${upstream.name} (${upstream.type} — read live): validated`);
      } else if (upstream.type === 'git') {
        const reposDir = path.join(squadDir, '_upstream_repos');
        const cloneDir = path.join(reposDir, upstream.name);
        fs.mkdirSync(reposDir, { recursive: true });
        ensureGitignoreEntry(repoDir, '.squad/_upstream_repos/');

        try {
          if (fs.existsSync(path.join(cloneDir, '.git'))) {
            execFileSync('git', ['-C', cloneDir, 'pull', '--ff-only'], { stdio: 'pipe', timeout: 60000 });
          } else {
            if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true });
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

  if (action === 'watch') {
    const {
      createWatchState,
      runWatchCycle,
      parseSyncConfig,
    } = await import('@bradygaster/squad-sdk/upstream' as string);

    const syncConfig = parseSyncConfig(squadDir);

    // Parse CLI flags
    const intervalIdx = args.indexOf('--interval');
    const interval = (intervalIdx !== -1 && args[intervalIdx + 1])
      ? parseInt(args[intervalIdx + 1]!, 10)
      : syncConfig.interval;

    if (isNaN(interval) || interval < 10) {
      fatal('--interval must be a number >= 10 (seconds)');
      return;
    }

    const autoPr = args.includes('--auto-pr') || syncConfig.autoPr;

    const data = readUpstreams(upstreamFile);
    if (data.upstreams.length === 0) {
      fatal('No upstreams configured. Run "squad upstream add <source>" first.');
      return;
    }

    info(`\n🔄 Watching ${data.upstreams.length} upstream(s) every ${interval}s${autoPr ? ' (auto-PR enabled)' : ''}...\n`);

    const state = createWatchState();

    // Initial snapshot (first cycle always reports no changes)
    runWatchCycle(squadDir, state);
    info('📸 Initial snapshot captured. Watching for changes...\n');

    const runCycle = (round: number) => {
      const result = runWatchCycle(squadDir, state);
      if (result.hasAnyChanges) {
        info(`\n🔔 Changes detected (round ${round}):`);
        for (const d of result.detections) {
          if (d.hasChanges) {
            success(`  ${d.name}: ${d.changedFiles.length} file(s) changed`);
            for (const f of d.changedFiles.slice(0, 10)) {
              info(`    • ${f}`);
            }
            if (d.changedFiles.length > 10) {
              info(`    ... and ${d.changedFiles.length - 10} more`);
            }
          }
        }
        if (autoPr) {
          info('  📝 Auto-PR: would create PR (requires gh CLI integration)');
        }
      } else {
        info(`⏳ Round ${round}: no changes detected`);
      }
    };

    // Run first check immediately after snapshot
    let round = 1;
    const timer = setInterval(() => {
      runCycle(round++);
    }, interval * 1000);

    // Handle graceful shutdown
    const cleanup = () => {
      clearInterval(timer);
      info('\n👋 Watch stopped.');
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep alive — the interval will run until interrupted
    await new Promise<void>(() => {
      // Intentionally never resolves — watch runs until SIGINT/SIGTERM
    });
  }

  if (action === 'propose') {
    const {
      packageProposal,
      parseProposeConfig,
    } = await import('@bradygaster/squad-sdk/upstream' as string);

    const targetName = args[1];
    if (!targetName) {
      fatal('Usage: squad upstream propose <upstream-name> [--skills] [--decisions] [--governance] [--all]');
      return;
    }

    const data = readUpstreams(upstreamFile);
    if (!data.upstreams.some(u => u.name === targetName)) {
      fatal(`Upstream "${targetName}" not found. Run "squad upstream list" to see configured upstreams.`);
      return;
    }

    // Parse scope flags
    const useAll = args.includes('--all');
    const scope = {
      skills: useAll || args.includes('--skills'),
      decisions: useAll || args.includes('--decisions'),
      governance: useAll || args.includes('--governance'),
    };

    // If no flags specified, default to what the config allows
    if (!scope.skills && !scope.decisions && !scope.governance) {
      const proposeConfig = parseProposeConfig(squadDir);
      scope.skills = proposeConfig.scope.skills;
      scope.decisions = proposeConfig.scope.decisions;
      scope.governance = proposeConfig.scope.governance;
    }

    info(`\n📦 Packaging proposal for upstream "${targetName}"...\n`);

    const proposal = packageProposal(squadDir, targetName, scope);
    if (!proposal) {
      warn('No files to propose. Check your .squad/ directory and scope flags.');
      return;
    }

    success(`Proposal packaged: ${proposal.summary}`);
    info(`  Branch: ${proposal.branchName}`);
    info(`  Files (${proposal.files.length}):`);
    for (const f of proposal.files) {
      info(`    • ${f.path}`);
    }
    info('\n💡 To submit: use "gh pr create" on the upstream repo with these changes.');
    info('   (Automated PR creation requires gh CLI authentication to the parent repo)\n');
  }
}
