/**
 * Applies client projections to disk without clobbering user-owned settings.
 *
 * @module clients/apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { getClientAdapter } from './adapters.js';
import type { ApplyResult, ClientContext, ClientId, ProjectionFile } from './types.js';

export const BLOCK_BEGIN = '<!-- squad:begin (managed by Squad; do not edit between markers) -->';
export const BLOCK_END = '<!-- squad:end -->';

/** Replace (or append) the Squad-managed block, leaving all other text untouched. */
export function upsertBlock(existing: string, content: string): string {
  const block = `${BLOCK_BEGIN}\n${content.trim()}\n${BLOCK_END}`;
  const start = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
  }
  const sep = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${block}\n`;
}

/** Collect projection files for the given clients, in order. */
export function projectClients(clients: readonly ClientId[], ctx: ClientContext): ProjectionFile[] {
  return clients.flatMap((c) => getClientAdapter(c).project(ctx));
}

function readJsonObject(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Refusing to overwrite malformed ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Refusing to overwrite ${file}: root must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function writeIfChanged(file: string, next: string): ApplyResult['action'] {
  const existed = fs.existsSync(file);
  if (existed && fs.readFileSync(file, 'utf8') === next) return 'unchanged';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next, 'utf8');
  return existed ? 'updated' : 'created';
}

/**
 * Write projection files under `root`. Failures (e.g. a malformed user JSON
 * file) are reported per-file and never abort the remaining files.
 */
export function applyProjection(root: string, files: readonly ProjectionFile[]): ApplyResult[] {
  const results: ApplyResult[] = [];
  const jsonByPath = new Map<string, Array<Extract<ProjectionFile, { kind: 'json' }>>>();
  const blockByPath = new Map<string, string[]>();
  const order: Array<{ kind: 'file'; file: ProjectionFile } | { kind: 'json' | 'block'; path: string }> = [];

  for (const f of files) {
    if (f.kind === 'managed') {
      order.push({ kind: 'file', file: f });
    } else if (f.kind === 'json') {
      if (!jsonByPath.has(f.path)) order.push({ kind: 'json', path: f.path });
      jsonByPath.set(f.path, [...(jsonByPath.get(f.path) ?? []), f]);
    } else {
      if (!blockByPath.has(f.path)) order.push({ kind: 'block', path: f.path });
      blockByPath.set(f.path, [...(blockByPath.get(f.path) ?? []), f.content]);
    }
  }

  for (const item of order) {
    const rel = item.kind === 'file' ? (item.file as { path: string }).path : item.path;
    const abs = path.join(root, rel);
    try {
      let action: ApplyResult['action'];
      if (item.kind === 'file') {
        action = writeIfChanged(abs, (item.file as { content: string }).content);
      } else if (item.kind === 'json') {
        let obj = readJsonObject(abs);
        for (const f of jsonByPath.get(item.path)!) obj = f.update(obj);
        action = writeIfChanged(abs, JSON.stringify(obj, null, 2) + '\n');
      } else {
        let text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
        for (const c of blockByPath.get(item.path)!) text = upsertBlock(text, c);
        action = writeIfChanged(abs, text);
      }
      results.push({ path: rel, action });
    } catch (err) {
      results.push({ path: rel, action: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** Project and apply the given clients in one step. */
export function installClients(clients: readonly ClientId[], ctx: ClientContext): ApplyResult[] {
  return applyProjection(ctx.root, projectClients(clients, ctx));
}
