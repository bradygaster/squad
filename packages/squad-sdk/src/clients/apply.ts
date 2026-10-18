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

function markers(id?: string): { begin: string; end: string } {
  return id
    ? { begin: `<!-- squad:begin:${id} (managed by Squad; do not edit between markers) -->`, end: `<!-- squad:end:${id} -->` }
    : { begin: BLOCK_BEGIN, end: BLOCK_END };
}

/**
 * Replace (or append) the Squad-managed block, leaving all other text untouched.
 * Distinct `id`s keep independent blocks in one shared file (e.g. AGENTS.md).
 */
export function upsertBlock(existing: string, content: string, id?: string): string {
  const { begin, end: endMarker } = markers(id);
  const block = `${begin}\n${content.trim()}\n${endMarker}`;
  const start = existing.indexOf(begin);
  const end = existing.indexOf(endMarker);
  if (start !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + endMarker.length);
  }
  const sep = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${block}\n`;
}

/**
 * Upsert `[table]` in TOML text, setting only the given managed keys (values are
 * already TOML literals). Other keys, sub-tables and tables are left untouched.
 */
export function upsertTomlTable(
  existing: string,
  table: string,
  managed: Record<string, string>,
  defaults: Record<string, string> = {},
): string {
  const nl = existing.includes('\r\n') ? '\r\n' : '\n';
  const lines = existing === '' ? [] : existing.split(/\r?\n/);
  const header = `[${table}]`;
  const start = lines.findIndex((l) => l.trim() === header);
  if (start === -1) {
    const body = Object.entries({ ...managed, ...defaults }).map(([k, v]) => `${k} = ${v}`);
    const prefix = existing === '' ? '' : existing.replace(/(\r?\n)*$/, '') + nl + nl;
    return `${prefix}${[header, ...body].join(nl)}${nl}`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i]!)) { end = i; break; }
  }
  const section = lines.slice(start + 1, end);
  const present = new Set(section.map((l) => /^\s*([A-Za-z0-9_-]+)\s*=/.exec(l)?.[1]).filter(Boolean));
  const remaining = { ...managed };
  for (const [k, v] of Object.entries(defaults)) if (!present.has(k)) remaining[k] = v;
  const rewritten = section.map((l) => {
    const m = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(l);
    if (m && m[1]! in remaining) {
      const k = m[1]!;
      const v = remaining[k]!;
      delete remaining[k];
      return `${k} = ${v}`;
    }
    return l;
  });
  let insertAt = rewritten.length;
  while (insertAt > 0 && rewritten[insertAt - 1]!.trim() === '') insertAt--;
  rewritten.splice(insertAt, 0, ...Object.entries(remaining).map(([k, v]) => `${k} = ${v}`));
  return [...lines.slice(0, start + 1), ...rewritten, ...lines.slice(end)].join(nl);
}
/** Collect projection files for the given clients, in order. */
export function projectClients(clients: readonly ClientId[], ctx: ClientContext): ProjectionFile[] {
  return clients.flatMap((c) => getClientAdapter(c).project(ctx));
}

function parseJsonObject(file: string, raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw.trim() === '') return {};
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
  const order: string[] = [];
  const transforms = new Map<string, Array<(existing: string | undefined, abs: string) => string>>();
  const add = (rel: string, fn: (existing: string | undefined, abs: string) => string) => {
    if (!transforms.has(rel)) {
      order.push(rel);
      transforms.set(rel, []);
    }
    transforms.get(rel)!.push(fn);
  };

  for (const f of files) {
    if (f.kind === 'managed') add(f.path, () => f.content);
    else if (f.kind === 'block') add(f.path, (t) => upsertBlock(t ?? '', f.content, f.id));
    else if (f.kind === 'text') add(f.path, (t) => f.update(t ?? ''));
    else {
      add(f.path, (t, abs) => {
        const obj = parseJsonObject(abs, t);
        return JSON.stringify(f.update(obj), null, 2) + '\n';
      });
    }
  }

  for (const rel of order) {
    const abs = path.join(root, rel);
    try {
      let text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : undefined;
      for (const fn of transforms.get(rel)!) text = fn(text, abs);
      results.push({ path: rel, action: writeIfChanged(abs, text ?? '') });
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