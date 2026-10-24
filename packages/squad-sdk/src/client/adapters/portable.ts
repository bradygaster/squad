/**
 * Portable `clients[]` hygiene: persisted config may only carry canonical
 * client slugs, never credentials, provider thread ids, machine paths,
 * leases or checkpoints.
 *
 * @module client/adapters/portable
 */

import { CLIENT_IDS, type ClientId } from './types.js';

export type RejectReason = 'non-string' | 'sensitive' | 'unknown';
export interface RejectedClientValue {
  value: unknown;
  reason: RejectReason;
}

const SENSITIVE =
  /(token|secret|password|passwd|apikey|api[-_]key|bearer|credential|authorization|thread|lease|checkpoint|session[-_]?id|^(?:gh[pousr]_|github_pat_|glpat-|sk-|sk_(?:live|test)_|xox[baprs]-|akia[0-9a-z]|eyj[a-z0-9_-]+\.)|[a-z]:[\\/]|^[\\/~]|[\\/]|@|:\/\/|=)/i;

/**
 * Normalize an arbitrary persisted `clients` value to canonical, de-duplicated
 * ids in canonical order. Everything else is dropped and reported.
 */
export function normalizeClientIds(input: unknown): { clients: ClientId[]; rejected: RejectedClientValue[] } {
  const rejected: RejectedClientValue[] = [];
  const seen = new Set<ClientId>();
  for (const v of Array.isArray(input) ? input : []) {
    if (typeof v !== 'string') {
      rejected.push({ value: typeof v === 'object' ? '[object]' : v, reason: 'non-string' });
      continue;
    }
    const trimmed = v.trim();
    const slug = trimmed.toLowerCase();
    if ((CLIENT_IDS as readonly string[]).includes(slug)) {
      seen.add(slug as ClientId);
    } else {
      const isSensitive = SENSITIVE.test(trimmed);
      rejected.push({ value: isSensitive ? '[redacted]' : trimmed, reason: isSensitive ? 'sensitive' : 'unknown' });
    }
  }
  return { clients: CLIENT_IDS.filter((c) => seen.has(c)), rejected };
}

/**
 * Extract portable, non-sensitive string IDs that are simply unknown to this CLI
 * version (e.g. written by a newer Squad CLI), so config updates preserve them.
 */
export function extractUnknownPortableClientIds(rejected: readonly RejectedClientValue[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rejected) {
    if (r.reason !== 'unknown' || typeof r.value !== 'string') continue;
    const trimmed = r.value.trim();
    const slug = trimmed.toLowerCase();
    if (!slug || SENSITIVE.test(trimmed) || !/^[a-z0-9][a-z0-9._-]*$/i.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/** Throws (without echoing the offending values) unless every entry is a canonical slug. */
export function assertPortableClients(input: unknown): ClientId[] {
  if (!Array.isArray(input)) throw new Error('clients must be an array of client ids');
  const { clients, rejected } = normalizeClientIds(input);
  if (rejected.length > 0 || clients.length !== input.length) {
    throw new Error(
      `clients must contain only canonical ids (${CLIENT_IDS.join(', ')}) without duplicates; rejected ${rejected.length} non-portable value(s)`,
    );
  }
  return clients;
}
