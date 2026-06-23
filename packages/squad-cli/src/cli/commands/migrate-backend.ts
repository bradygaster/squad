/**
 * Backend migration — upgrades state backend across allowed transitions.
 *
 * Supported migrations:
 * - local → orphan
 * - local → two-layer
 * - worktree → orphan
 * - worktree → two-layer
 * - orphan ↔ two-layer (both write to the squad-state orphan branch via different layers)
 *
 * In addition to flipping the `stateBackend` key in `.squad/config.json`, this
 * function MIGRATES pre-existing working-tree state (`decisions.md`,
 * `agents/<name>/history.md`) onto the squad-state orphan branch when moving
 * from a working-tree backend to an orphan-storage backend, so post-upgrade
 * agents can read pre-upgrade content (UPGRADE-NO-MIGRATION fix).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { installGitHooks } from './install-hooks.js';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { addSquadStateGitignoreBlock, removeSquadStateGitignoreBlock } from '@bradygaster/squad-sdk';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const VALID_TARGETS = ['local', 'worktree', 'orphan', 'two-layer'];
const ORPHAN_BACKENDS = new Set(['orphan', 'two-layer']);
const WORKTREE_BACKENDS = new Set(['local', 'worktree']);

/** Paths inside .squad/ that should be carried over to the orphan branch on migration. */
const MIGRATABLE_PATHS = [
  'decisions.md',
];

/** Best-effort: ensure the squad-state orphan branch exists. Returns true on success. */
export function ensureOrphanBranch(dest: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'refs/heads/squad-state'], {
      cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    try {
      const readmeContent = '# Squad State\n\nThis orphan branch stores mutable squad state.\nIt is managed automatically and should not be edited by hand.\n';
      const blobHash = execFileSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: dest, encoding: 'utf-8', input: readmeContent, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const treeInput = `100644 blob ${blobHash}\tREADME.md\n`;
      const treeHash = execFileSync('git', ['mktree'], {
        cwd: dest, encoding: 'utf-8', input: treeInput, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const commitHash = execFileSync('git', ['commit-tree', treeHash, '-m', 'init: squad-state orphan branch'], {
        cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      execFileSync('git', ['update-ref', 'refs/heads/squad-state', commitHash], {
        cwd: dest, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch (err) {
      console.log(`${YELLOW}⚠ Could not create squad-state branch: ${err instanceof Error ? err.message : err}${RESET}`);
      return false;
    }
  }
}

/**
 * Collect existing working-tree state files that should be migrated to the orphan branch.
 * Returns array of {path, content} pairs (paths are relative to .squad/).
 */
function collectWorktreeState(dest: string): Array<{ relPath: string; content: string }> {
  const squadDir = path.join(dest, '.squad');
  const collected: Array<{ relPath: string; content: string }> = [];

  for (const p of MIGRATABLE_PATHS) {
    const full = path.join(squadDir, p);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      collected.push({ relPath: p, content: fs.readFileSync(full, 'utf-8') });
    }
  }

  // agents/<name>/history.md
  const agentsDir = path.join(squadDir, 'agents');
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    for (const agentName of fs.readdirSync(agentsDir)) {
      const histPath = path.join(agentsDir, agentName, 'history.md');
      if (fs.existsSync(histPath) && fs.statSync(histPath).isFile()) {
        collected.push({
          relPath: path.posix.join('agents', agentName, 'history.md'),
          content: fs.readFileSync(histPath, 'utf-8'),
        });
      }
    }
  }

  return collected;
}

/**
 * Write a set of files onto the squad-state orphan branch via git plumbing.
 * Preserves any files already on the branch (merges trees by path).
 * Returns the number of files written, or -1 on failure.
 */
function writeFilesToOrphanBranch(dest: string, files: Array<{ relPath: string; content: string }>): number {
  if (files.length === 0) return 0;
  try {
    // Load the current squad-state tree into the index using a temporary index file
    const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const indexFile = path.resolve(dest, gitDir, 'squad-migrate-index');
    if (fs.existsSync(indexFile)) fs.unlinkSync(indexFile);

    const env = { ...process.env, GIT_INDEX_FILE: indexFile };

    // Seed index with existing squad-state tree
    execFileSync('git', ['read-tree', 'refs/heads/squad-state'], {
      cwd: dest, env, stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Add each migrated file
    for (const f of files) {
      const blobHash = execFileSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: dest, env, encoding: 'utf-8', input: f.content, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blobHash},${f.relPath}`], {
        cwd: dest, env, stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    const treeHash = execFileSync('git', ['write-tree'], {
      cwd: dest, env, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const parentSha = execFileSync('git', ['rev-parse', 'refs/heads/squad-state'], {
      cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const commitHash = execFileSync(
      'git',
      ['commit-tree', treeHash, '-p', parentSha, '-m', `migrate: import working-tree state on backend upgrade (${files.length} file(s))`],
      { cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    execFileSync('git', ['update-ref', 'refs/heads/squad-state', commitHash, parentSha], {
      cwd: dest, stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Cleanup the temporary index
    if (fs.existsSync(indexFile)) fs.unlinkSync(indexFile);

    return files.length;
  } catch (err) {
    console.log(`${YELLOW}⚠ Could not migrate state onto squad-state branch: ${err instanceof Error ? err.message : err}${RESET}`);
    return -1;
  }
}

/**
 * Migrate the state backend for an existing squad project.
 *
 * Fixes:
 *   - UPGRADE-FLAG-IGNORED: writes the new `stateBackend` value into config.json
 *     via JSON-aware merge (never textual append → avoids Bug E duplicates).
 *   - UPGRADE-NO-MIGRATION: when moving from a working-tree backend to an
 *     orphan-storage backend, carries existing decisions.md and agent histories
 *     onto the squad-state orphan branch so post-upgrade agents see prior state.
 *   - WI-1: re-installs the full hook set (including new pre-commit/post-commit).
 */
export async function migrateStateBackend(dest: string, target: string): Promise<void> {
  if (!VALID_TARGETS.includes(target)) {
    console.log(`${YELLOW}⚠ Invalid backend target '${target}'. Supported: ${VALID_TARGETS.join(', ')}${RESET}`);
    return;
  }

  const configPath = path.join(dest, '.squad', 'config.json');
  let config: Record<string, unknown> = {};

  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* start fresh */ }

  const current = (config['stateBackend'] as string) || 'local';

  if (current === target) {
    console.log(`${YELLOW}⚠ Backend is already '${target}'. Ensuring hooks + config are consistent.${RESET}`);
    if (ORPHAN_BACKENDS.has(target)) {
      ensureOrphanBranch(dest);
      installGitHooks(dest, { force: false });
    }
    return;
  }

  console.log(`\n${BOLD}Migrating state backend: ${current} → ${target}${RESET}\n`);

  // Step 1: Ensure orphan branch exists when the target needs it
  if (ORPHAN_BACKENDS.has(target)) {
    if (!ensureOrphanBranch(dest)) return;
    console.log(`  ${GREEN}✓${RESET} squad-state branch ready`);
  }

  // Step 2 (UPGRADE-NO-MIGRATION): move working-tree state onto the orphan branch
  // when transitioning from a worktree backend to an orphan-storage backend.
  if (WORKTREE_BACKENDS.has(current) && ORPHAN_BACKENDS.has(target)) {
    const files = collectWorktreeState(dest);
    if (files.length > 0) {
      const wrote = writeFilesToOrphanBranch(dest, files);
      if (wrote > 0) {
        console.log(`  ${GREEN}✓${RESET} migrated ${wrote} state file(s) onto squad-state branch:`);
        for (const f of files) {
          console.log(`      ${DIM}.squad/${f.relPath}${RESET}`);
        }

        // F1 fix (Round 5, P1.1): the working-tree copies are now stale — the
        // orphan branch is the source of truth for an orphan/two-layer backend.
        // Remove them so `git status` is clean and post-upgrade agents can't
        // accidentally read stale content. Mirrors liftInitMutableStateOntoOrphan
        // behavior. Only files we just successfully migrated are removed; we
        // never touch config.json, charter.md, team.md, casting/, templates/, etc.
        const squadDir = path.join(dest, '.squad');
        const removed: string[] = [];
        const removeFailed: string[] = [];
        for (const f of files) {
          const full = path.join(squadDir, f.relPath);
          try {
            if (fs.existsSync(full)) fs.unlinkSync(full);
            removed.push(f.relPath);
          } catch {
            removeFailed.push(f.relPath);
          }
        }
        // Clean up now-empty agent directories (e.g. .squad/agents/data/) so
        // they don't leak as zero-content folders post-upgrade.
        const agentsDir = path.join(squadDir, 'agents');
        if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
          for (const agentName of fs.readdirSync(agentsDir)) {
            const agentDir = path.join(agentsDir, agentName);
            try {
              if (
                fs.statSync(agentDir).isDirectory() &&
                fs.readdirSync(agentDir).length === 0
              ) {
                fs.rmdirSync(agentDir);
              }
            } catch { /* best-effort */ }
          }
        }

        if (removed.length > 0) {
          console.log(`  ${GREEN}✓${RESET} removed ${removed.length} stale working-tree file(s) (now sourced from squad-state):`);
          for (const r of removed) {
            console.log(`      ${DIM}.squad/${r}${RESET}`);
          }
        }
        if (removeFailed.length > 0) {
          console.log(`  ${YELLOW}⚠${RESET} could not remove: ${removeFailed.join(', ')} (will appear in git status)`);
        }
      } else if (wrote === 0) {
        console.log(`  ${DIM}no working-tree state files to migrate${RESET}`);
      }
      // If wrote === -1 we already printed a warning; continue so config still updates.
    } else {
      console.log(`  ${DIM}no migratable state in working tree${RESET}`);
    }
  }

  // Step 3 (UPGRADE-FLAG-IGNORED + Bug E): JSON-merge the new value.
  // Reading + re-stringifying guarantees one canonical `stateBackend` key.
  config['stateBackend'] = target;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ${GREEN}✓${RESET} config.json updated: stateBackend = ${target}`);

  // Step 4 (WI-1): re-install hooks (force so new pre-commit/post-commit land)
  if (ORPHAN_BACKENDS.has(target)) {
    installGitHooks(dest, { force: true });
  }

  // Step 5: Manage .gitignore marker block for squad-state files.
  // When migrating TO an orphan/two-layer backend: add the marker block so
  // git add . / IDE "stage all" cannot accidentally stage state files.
  // When migrating TO a local/worktree backend: remove the block so those
  // files are committable again.
  const gitignorePath = path.join(dest, '.gitignore');
  const storage = new FSStorageProvider();
  if (ORPHAN_BACKENDS.has(target) && !ORPHAN_BACKENDS.has(current)) {
    // Transitioning FROM a worktree backend TO orphan/two-layer — add block
    const added = addSquadStateGitignoreBlock(gitignorePath, storage);
    if (added) {
      console.log(`  ${GREEN}✓${RESET} added 2 entries to .gitignore (.squad/decisions.md, .squad/agents/*/history.md) — these now live on squad-state branch`);
    }
  } else if (WORKTREE_BACKENDS.has(target) && ORPHAN_BACKENDS.has(current)) {
    // Transitioning FROM orphan/two-layer BACK TO a local backend — remove block
    const removed = removeSquadStateGitignoreBlock(gitignorePath, storage);
    if (removed) {
      console.log(`  ${GREEN}✓${RESET} removed 2 entries from .gitignore — .squad/decisions.md and agent histories are now committable again`);
    }
  }

  console.log(`\n${GREEN}${BOLD}✓ Migration complete.${RESET} Backend is now '${target}'.\n`);
}

/**
 * INSIDER3-INIT-LEAK fix: when `squad init --state-backend orphan|two-layer`
 * runs, the SDK still hand-writes mutable state files (decisions.md and each
 * agent's history.md) into the working tree because it has no knowledge of the
 * future backend choice. This helper, invoked by the CLI immediately after the
 * orphan branch is created, lifts those mutable files onto the squad-state
 * orphan branch and removes them from the working tree so post-init agents
 * read state exclusively through the runtime bridge.
 *
 * Source-of-truth hierarchy preserved: static files (team.md, charters,
 * ceremonies.md, casting/*, templates/*) are NEVER touched — only mutable
 * state (decisions.md, agents/<n>/history.md) migrates.
 *
 * Returns the relative paths of files that were migrated + removed.
 */
export function liftInitMutableStateOntoOrphan(dest: string): string[] {
  const files = collectWorktreeState(dest);
  if (files.length === 0) return [];
  const wrote = writeFilesToOrphanBranch(dest, files);
  if (wrote <= 0) return [];
  const removed: string[] = [];
  const squadDir = path.join(dest, '.squad');
  for (const f of files) {
    const full = path.join(squadDir, f.relPath);
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
      removed.push(f.relPath);
    } catch {
      // Leave file behind rather than aborting; the runtime bridge already has authoritative copy.
    }
  }
  return removed;
}
