/**
 * Notes-promote capability — Ralph heartbeat integration for {@link
 * TwoLayerBackend.promoteNotes} (Round 5, P0.3 A3 production caller, path B).
 *
 * Runs in the `housekeeping` phase. When the active state backend is
 * `two-layer`, enumerates `refs/notes/squad/*` and promotes flagged notes
 * idempotently every N rounds.
 *
 * Idempotency: `promote_to_permanent` notes are removed from source after
 * write; subsequent runs find nothing to promote and return zero-cost.
 * Cheap enough to run every cycle, but throttled to `everyNRounds` to keep
 * heartbeat reports readable.
 */
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider, resolveStateBackend, TwoLayerBackend } from '@bradygaster/squad-sdk';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

const storage = new FSStorageProvider();

/** Default: run promotion every Nth round to keep heartbeat output tidy. */
const DEFAULT_EVERY_N_ROUNDS = 5;

interface NotesPromoteConfig {
  /** Run promotion every N rounds (default: 5). */
  everyNRounds?: number;
}

function parseConfig(raw: Record<string, unknown>): NotesPromoteConfig {
  return {
    everyNRounds:
      typeof raw.everyNRounds === 'number' && Number.isFinite(raw.everyNRounds) && raw.everyNRounds > 0
        ? raw.everyNRounds
        : DEFAULT_EVERY_N_ROUNDS,
  };
}

/** List `refs/notes/squad/*` short names present in the repo. */
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

export class NotesPromoteCapability implements WatchCapability {
  readonly name = 'notes-promote';
  readonly description =
    'Promote/archive flagged git-notes to permanent storage (two-layer backend only)';
  readonly configShape = 'object' as const;
  readonly requires: string[] = ['git'];
  readonly phase = 'housekeeping' as const;

  async preflight(context: WatchContext): Promise<PreflightResult> {
    const squadDir = path.join(context.teamRoot, '.squad');
    if (!storage.existsSync(squadDir)) {
      return { ok: false, reason: '.squad/ directory not found' };
    }
    // Cheap check: only relevant when stateBackend is two-layer.
    const repoRoot = context.teamRoot;
    try {
      const backend = resolveStateBackend(squadDir, repoRoot);
      if (!(backend instanceof TwoLayerBackend)) {
        return { ok: false, reason: `stateBackend is '${backend.name}', not 'two-layer'` };
      }
    } catch (err) {
      return { ok: false, reason: `resolveStateBackend failed: ${err instanceof Error ? err.message : err}` };
    }
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const config = parseConfig(context.config);
    const everyN = config.everyNRounds ?? DEFAULT_EVERY_N_ROUNDS;

    if (context.round > 1 && context.round % everyN !== 0) {
      return { success: true, summary: `notes-promote: skipped (runs every ${everyN} rounds)` };
    }

    const squadDir = path.join(context.teamRoot, '.squad');
    const repoRoot = context.teamRoot;

    let backend: TwoLayerBackend;
    try {
      const resolved = resolveStateBackend(squadDir, repoRoot);
      if (!(resolved instanceof TwoLayerBackend)) {
        return { success: true, summary: `notes-promote: skipped (backend=${resolved.name})` };
      }
      backend = resolved;
    } catch (err) {
      return {
        success: false,
        summary: `notes-promote: resolveStateBackend failed — ${err instanceof Error ? err.message : err}`,
      };
    }

    const refs = listSquadNotesRefs(repoRoot);
    if (refs.length === 0) {
      return { success: true, summary: 'notes-promote: no squad notes refs' };
    }

    let promoted = 0;
    let archived = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const ref of refs) {
      try {
        const res = backend.promoteNotes(ref);
        promoted += res.promoted.length;
        archived += res.archived.length;
        skipped += res.skipped;
      } catch (err) {
        errors.push(`${ref}: ${err instanceof Error ? err.message : err}`);
      }
    }

    const parts: string[] = [];
    parts.push(`refs=${refs.length}`);
    if (promoted) parts.push(`promoted=${promoted}`);
    if (archived) parts.push(`archived=${archived}`);
    if (skipped) parts.push(`skipped=${skipped}`);
    if (errors.length) parts.push(`errors=${errors.length}`);

    return {
      success: errors.length === 0,
      summary: `notes-promote: ${parts.join(' ')}`,
      data: { promoted, archived, skipped, errorCount: errors.length, errors: errors.slice(0, 5) },
    };
  }
}
