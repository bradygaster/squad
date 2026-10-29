/**
 * Work-claim counters for `squad watch` (ADR-002): the counter shape and
 * operator-facing formatting shared by the round board and `--health`.
 * Pure — no SDK runtime imports, so `squad watch --health` stays light.
 */

import type { FinishOutcome } from '@bradygaster/squad-sdk/ralph/claims';

export interface ClaimCounters {
  /** Claims this executor won. */
  acquired: number;
  /** Claims held by another executor (skipped). */
  contended: number;
  /** Claims the provider could not decide (skipped, fail closed). */
  unavailable: number;
  /** Claims another executor took over while held (renew or release fenced). */
  fenced: number;
  /** Claims that could not be renewed before expiry (agent killed). */
  lost: number;
  /** Claims released, by finish outcome. */
  released: Record<FinishOutcome, number>;
  /** Implausible claim records taken over as expired. */
  implausibleTakeover: number;
}

export type ClaimCounterName = Exclude<keyof ClaimCounters, 'released'>;

export function emptyClaimCounters(): ClaimCounters {
  return {
    acquired: 0,
    contended: 0,
    unavailable: 0,
    fenced: 0,
    lost: 0,
    released: { completed: 0, cancelled: 0, abandoned: 0 },
    implausibleTakeover: 0,
  };
}

export function cloneClaimCounters(c: ClaimCounters): ClaimCounters {
  return { ...c, released: { ...c.released } };
}

/** Flat `name: count` view, e.g. for verbose tables (`releasedCompleted`, …). */
export function flattenClaimCounters(c: ClaimCounters): Record<string, number> {
  return {
    acquired: c.acquired,
    contended: c.contended,
    unavailable: c.unavailable,
    fenced: c.fenced,
    lost: c.lost,
    releasedCompleted: c.released.completed,
    releasedCancelled: c.released.cancelled,
    releasedAbandoned: c.released.abandoned,
    implausibleTakeover: c.implausibleTakeover,
  };
}

function releasedTotal(c: ClaimCounters): number {
  return c.released.completed + c.released.cancelled + c.released.abandoned;
}

/** True when any counter is non-zero. */
export function hasClaimActivity(c: ClaimCounters): boolean {
  return c.acquired + c.contended + c.unavailable + c.fenced + c.lost + c.implausibleTakeover + releasedTotal(c) > 0;
}

/** Counter phrases, zero counts omitted except `won`. */
export function claimCounterParts(c: ClaimCounters): string[] {
  const parts = [`won ${c.acquired}`];
  if (c.contended) parts.push(`contended ${c.contended}`);
  if (c.unavailable) parts.push(`unavailable ${c.unavailable}`);
  if (c.fenced) parts.push(`fenced ${c.fenced}`);
  if (c.lost) parts.push(`lost ${c.lost}`);
  const released = releasedTotal(c);
  if (released) {
    const by = (['completed', 'cancelled', 'abandoned'] as const)
      .filter(o => c.released[o] > 0)
      .map(o => `${o} ${c.released[o]}`)
      .join(', ');
    parts.push(`released ${released} (${by})`);
  }
  if (c.implausibleTakeover) parts.push(`implausible ${c.implausibleTakeover}`);
  return parts;
}

/** Join `parts` after `head`, wrapping onto `indent`-prefixed lines within `width`. */
export function wrapClaimParts(head: string, parts: string[], indent: string, width = 80): string[] {
  const lines: string[] = [];
  let line = head;
  let first = true;
  for (const part of parts) {
    const sep = first ? '' : ' · ';
    if (!first && (line + sep + part).length > width) {
      lines.push(line);
      line = indent + part;
    } else {
      line += sep + part;
    }
    first = false;
  }
  lines.push(line);
  return lines;
}

/** Round board lines, e.g. `  🔒 Claims (git-ref): won 2 · contended 1`. */
export function formatClaimRoundLines(provider: string, c: ClaimCounters, width = 80): string[] {
  return wrapClaimParts(`  🔒 Claims (${provider}): `, claimCounterParts(c), '     ', width);
}
