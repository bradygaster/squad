/**
 * Applies client projections to disk without clobbering user-owned settings.
 *
 * @module clients/apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { SQUAD_STATE_KEY, getClientAdapter } from './adapters.js';
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

/** Remove the Squad-managed block; collapses the separator that `upsertBlock` added. */
export function removeBlock(existing: string): string {
  const start = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  if (start === -1 || end < start) return existing;
  const before = existing.slice(0, start).replace(/\n{2,}$/, '\n');
  const after = existing.slice(end + BLOCK_END.length).replace(/^\n/, '');
  return before + after;
}

const MCP_CONTAINERS = ['mcpServers', 'mcp', 'servers'];

const OPENCODE_SCHEMA = 'https://opencode.ai/config.json';

function removeServerEntry(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  const touched = MCP_CONTAINERS.some(k => {
    const c = out[k];
    return !!c && typeof c === 'object' && !Array.isArray(c) && SQUAD_STATE_KEY in c;
  });
  // the OpenCode projection adds its $schema; drop it together with the Squad entry
  if (touched && out['$schema'] === OPENCODE_SCHEMA) delete out['$schema'];
  for (const key of MCP_CONTAINERS) {
    const container = out[key];
    if (container && typeof container === 'object' && !Array.isArray(container) && SQUAD_STATE_KEY in container) {
      const { [SQUAD_STATE_KEY]: _removed, ...rest } = container as Record<string, unknown>;
      if (Object.keys(rest).length === 0) delete out[key];
      else out[key] = rest;
    }
  }
  return out;
}

function pruneEmptyDirs(root: string, rel: string): void {
  let dir = path.dirname(path.join(root, rel));
  const stop = path.resolve(root);
  while (path.resolve(dir).startsWith(stop + path.sep)) {
    try {
      if (fs.readdirSync(dir).length > 0) return;
      fs.rmdirSync(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

/**
 * Roll back a projection: deletes Squad-owned files, removes only the
 * `squad_state` MCP entry from shared JSON configs (user servers and settings
 * stay), and strips the marker block from user text files. `.squad/` state is
 * never touched. Files left empty by the removal are deleted.
 */
export function removeProjection(root: string, files: readonly ProjectionFile[]): ApplyResult[] {
  const results: ApplyResult[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    const abs = path.join(root, f.path);
    try {
      if (!fs.existsSync(abs)) {
        results.push({ path: f.path, action: 'unchanged' });
        continue;
      }
      if (f.kind === 'managed') {
        fs.rmSync(abs);
        results.push({ path: f.path, action: 'removed' });
      } else if (f.kind === 'json') {
        const current = readJsonObject(abs);
        const next = removeServerEntry(current);
        if (JSON.stringify(next) === JSON.stringify(current)) {
          results.push({ path: f.path, action: 'unchanged' });
          continue;
        }
        if (Object.keys(next).length === 0) fs.rmSync(abs);
        else fs.writeFileSync(abs, JSON.stringify(next, null, 2) + '\n', 'utf8');
        results.push({ path: f.path, action: Object.keys(next).length === 0 ? 'removed' : 'updated' });
      } else {
        const text = fs.readFileSync(abs, 'utf8');
        const next = removeBlock(text);
        if (next === text) {
          results.push({ path: f.path, action: 'unchanged' });
          continue;
        }
        if (next.trim() === '') fs.rmSync(abs);
        else fs.writeFileSync(abs, next, 'utf8');
        results.push({ path: f.path, action: next.trim() === '' ? 'removed' : 'updated' });
      }
      pruneEmptyDirs(root, f.path);
    } catch (err) {
      results.push({ path: f.path, action: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** Roll back the given clients' projections (inverse of {@link installClients}). */
export function uninstallClients(clients: readonly ClientId[], ctx: ClientContext): ApplyResult[] {
  return removeProjection(ctx.root, projectClients(clients, ctx));
}