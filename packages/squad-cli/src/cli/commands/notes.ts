/**
 * squad notes — manage squad git-notes state (Round 5, P0.3 A3).
 *
 * Subcommand:
 *   promote [--ref <ref>] [--all] [--dry-run]
 *
 * Production caller for {@link TwoLayerBackend.promoteNotes}. Walks notes on
 * each `refs/notes/squad/*` ref, moves notes flagged `promote_to_permanent`
 * into the orphan layer under `promoted/<ref>/<sha>.json`, copies notes
 * flagged `archive_on_close` under `archive/<ref>/<sha>.json`, and leaves
 * un-flagged notes in place.
 *
 * Round 4 audit found `promoteNotes` had zero production callers — the SDK
 * API was wired but never invoked. This command, plus the Ralph heartbeat
 * `notes-promote` capability, are those production callers.
 *
 * @module cli/commands/notes
 */

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { resolveStateBackend, TwoLayerBackend, type PromoteNotesResult } from '@bradygaster/squad-sdk';
import { resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';
import { BOLD, RESET, DIM, GREEN, YELLOW, RED } from '../core/output.js';
import { fatal } from '../core/errors.js';

/** Parsed args for `squad notes promote`. */
interface PromoteArgs {
  ref?: string;
  all: boolean;
  dryRun: boolean;
}

function parsePromoteArgs(args: string[]): PromoteArgs {
  const out: PromoteArgs = { all: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--ref') {
      out.ref = args[++i];
    } else if (a === '--all') {
      out.all = true;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      printPromoteHelp();
      process.exit(0);
    }
  }
  return out;
}

function printPromoteHelp(): void {
  console.log(`\n${BOLD}squad notes promote${RESET} — promote/archive flagged git-notes to permanent storage\n`);
  console.log(`Usage: squad notes promote [options]\n`);
  console.log(`Options:`);
  console.log(`  --ref <ref>    Restrict to a single notes ref (e.g. squad/picard)`);
  console.log(`  --all          Promote across all refs/notes/squad/* (default)`);
  console.log(`  --dry-run      Report what would be promoted without writing`);
  console.log(`  --help, -h     Show this help\n`);
  console.log(`Requires stateBackend: 'two-layer' in .squad/config.json.`);
  console.log(`Idempotent — promoted notes are removed from source, archived notes stay in place.\n`);
}

/**
 * Enumerate squad notes refs (`refs/notes/squad/*`) present in the repo.
 * Returns short names (e.g. `squad/picard`, not `refs/notes/squad/picard`).
 */
function listSquadNotesRefs(repoRoot: string): string[] {
  try {
    const out = execFileSync(
      'git',
      ['for-each-ref', '--format=%(refname)', 'refs/notes/squad/'],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((full) => full.replace(/^refs\/notes\//, ''))
      .filter((r) => /^squad\/[A-Za-z0-9_\-./]+$/.test(r));
  } catch {
    return [];
  }
}

/**
 * Best-effort dry-run preview: list notes on a ref with their flag classification.
 * Reuses the same parsing logic as TwoLayerBackend.promoteNotes but without writing.
 */
function dryRunRef(repoRoot: string, ref: string): PromoteNotesResult {
  const result: PromoteNotesResult = { promoted: [], archived: [], skipped: 0 };
  let listing: string;
  try {
    listing = execFileSync(
      'git',
      ['notes', `--ref=${ref}`, 'list'],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch {
    return result;
  }

  let reachable: Set<string>;
  try {
    const raw = execFileSync('git', ['rev-list', 'HEAD'], {
      cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    reachable = new Set(raw.split('\n').map((s) => s.trim()).filter(Boolean));
  } catch {
    return result;
  }

  for (const line of listing.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const commitSha = parts[1]!;
    if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(commitSha)) continue;
    if (!reachable.has(commitSha)) continue;

    let raw: string;
    try {
      raw = execFileSync(
        'git', ['notes', `--ref=${ref}`, 'show', commitSha],
        { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch { continue; }

    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { result.skipped++; continue; }
    const flags = payload as { promote_to_permanent?: unknown; archive_on_close?: unknown };
    const refSeg = ref.split('/').filter(Boolean).join('/');
    if (flags?.promote_to_permanent === true) {
      result.promoted.push(`promoted/${refSeg}/${commitSha}.json`);
    }
    if (flags?.archive_on_close === true) {
      result.archived.push(`archive/${refSeg}/${commitSha}.json`);
    }
    if (flags?.promote_to_permanent !== true && flags?.archive_on_close !== true) {
      result.skipped++;
    }
  }
  return result;
}

/**
 * Run `squad notes promote`. Returns process exit code.
 */
export async function runNotesPromote(cwd: string, args: string[]): Promise<number> {
  const opts = parsePromoteArgs(args);

  const paths = resolveSquadPaths(cwd);
  if (!paths) {
    fatal('No squad found. Run "squad init" first.');
  }

  const squadDir = paths.projectDir;
  const repoRoot = path.resolve(squadDir, '..');

  const backend = resolveStateBackend(squadDir, repoRoot);
  if (!(backend instanceof TwoLayerBackend)) {
    console.log(`${YELLOW}⚠ stateBackend is '${backend.name}', not 'two-layer'. Nothing to promote.${RESET}`);
    console.log(`${DIM}  Run 'squad upgrade --state-backend two-layer' to enable note promotion.${RESET}`);
    return 0;
  }

  // Decide which refs to process.
  let refs: string[];
  if (opts.ref) {
    refs = [opts.ref];
  } else {
    refs = listSquadNotesRefs(repoRoot);
    if (refs.length === 0) {
      console.log(`${DIM}No squad notes refs found (refs/notes/squad/*). Nothing to do.${RESET}`);
      return 0;
    }
  }

  const header = opts.dryRun ? `notes promote ${DIM}(dry-run)${RESET}` : 'notes promote';
  console.log(`\n${BOLD}${header}${RESET}\n`);

  const rows: Array<{ ref: string; promoted: number; archived: number; skipped: number; error?: string }> = [];
  let anyError = false;

  for (const ref of refs) {
    try {
      const res = opts.dryRun ? dryRunRef(repoRoot, ref) : backend.promoteNotes(ref);
      rows.push({ ref, promoted: res.promoted.length, archived: res.archived.length, skipped: res.skipped });
    } catch (err: unknown) {
      anyError = true;
      const msg = err instanceof Error ? err.message : String(err);
      rows.push({ ref, promoted: 0, archived: 0, skipped: 0, error: msg });
    }
  }

  const nameW = Math.max(...rows.map((r) => r.ref.length), 'Ref'.length, 5);
  console.log(
    `  ${'Ref'.padEnd(nameW)}  ${'Promoted'.padStart(8)}  ${'Archived'.padStart(8)}  ${'Skipped'.padStart(7)}`,
  );
  console.log(
    `  ${'─'.repeat(nameW)}  ${'─'.repeat(8)}  ${'─'.repeat(8)}  ${'─'.repeat(7)}`,
  );
  let totalP = 0, totalA = 0, totalS = 0;
  for (const r of rows) {
    if (r.error) {
      console.log(`  ${r.ref.padEnd(nameW)}  ${RED}error${RESET}: ${r.error}`);
      continue;
    }
    totalP += r.promoted;
    totalA += r.archived;
    totalS += r.skipped;
    console.log(
      `  ${r.ref.padEnd(nameW)}  ${String(r.promoted).padStart(8)}  ${String(r.archived).padStart(8)}  ${String(r.skipped).padStart(7)}`,
    );
  }
  console.log(
    `  ${'─'.repeat(nameW)}  ${'─'.repeat(8)}  ${'─'.repeat(8)}  ${'─'.repeat(7)}`,
  );
  console.log(
    `  ${'TOTAL'.padEnd(nameW)}  ${String(totalP).padStart(8)}  ${String(totalA).padStart(8)}  ${String(totalS).padStart(7)}\n`,
  );

  if (anyError) {
    console.log(`${RED}✗${RESET} Completed with errors (see above).`);
    return 1;
  }
  console.log(`${GREEN}✓${RESET} ${opts.dryRun ? 'Dry-run complete' : 'Promotion complete'}.\n`);
  return 0;
}

/**
 * Top-level `squad notes` dispatcher.
 */
export async function runNotes(cwd: string, args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    console.log(`\n${BOLD}squad notes${RESET} — manage squad git-notes state\n`);
    console.log(`Subcommands:`);
    console.log(`  promote      Promote/archive flagged notes to permanent orphan storage`);
    console.log(`\nRun 'squad notes <subcommand> --help' for details.\n`);
    return;
  }
  if (sub === 'promote') {
    const code = await runNotesPromote(cwd, args.slice(1));
    if (code !== 0) process.exit(code);
    return;
  }
  fatal(`Unknown 'squad notes' subcommand: ${sub}`);
}
