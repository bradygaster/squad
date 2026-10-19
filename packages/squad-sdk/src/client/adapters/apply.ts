/**
 * Applies client projections to disk without clobbering user-owned settings.
 *
 * @module client/adapters/apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { SQUAD_STATE_KEY, getHostProjection } from './adapters.js';
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
  if (start !== -1 && (end === -1 || end < start)) {
    throw new Error('Unclosed Squad managed block marker in file; refusing to overwrite user content after marker');
  }
  if (start !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + endMarker.length);
  }
  const sep = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${block}\n`;
}

const SECTION_RE = /^\s*(\[\[?)\s*([^\]\r\n]+?)\s*(\]\]?)\s*(?:#.*)?$/;

/** A TOML section boundary: `[table]` or `[[array_table]]` (quotes/whitespace tolerant). */
function sectionHeader(line: string): { key: string; array: boolean } | undefined {
  const m = SECTION_RE.exec(line);
  if (!m || m[1]!.length !== m[3]!.length) return undefined;
  const key = m[2]!.split('.').map((s) => s.trim().replace(/^["']|["']$/g, '')).join('.');
  return { key, array: m[1]!.length === 2 };
}

/** Normalized dotted key of a `[table]` header line, or undefined (including for `[[array]]` headers). */
function tableHeaderKey(line: string): string | undefined {
  const h = sectionHeader(line);
  return h && !h.array ? h.key : undefined;
}

/** Unquoted key of a `key = value` line (bare, "basic" or 'literal'), or undefined. */
function assignmentKey(line: string): string | undefined {
  const m = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*=/.exec(line);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** Index of the last line of the assignment starting at `i` (handles multiline arrays and inline tables). */
function assignmentEnd(lines: string[], i: number): number {
  const first = lines[i]!;
  const eq = first.indexOf('=');
  if (eq === -1) return i;
  let depth = 0;
  let inStr: string | null = null;
  for (let n = i; n < lines.length; n++) {
    const text = n === i ? first.slice(eq + 1) : lines[n]!;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k]!;
      if (inStr) {
        if (ch === '\\' && inStr === '"') k++;
        else if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'") inStr = ch;
      else if (ch === '#') break;
      else if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
    }
    if (depth <= 0) return n;
  }
  return lines.length - 1;
}

/** Split a TOML dotted key string (`a.b."c.d"`) on unquoted dots into normalized segment names. */
function splitTomlDottedKey(rawKey: string): string[] | undefined {
  const parts: string[] = [];
  let cur = '';
  let inStr: string | null = null;
  for (let i = 0; i < rawKey.length; i++) {
    const ch = rawKey[i]!;
    if (inStr) {
      if (ch === '\\' && inStr === '"' && i + 1 < rawKey.length) {
        cur += ch + rawKey[++i]!;
      } else if (ch === inStr) {
        inStr = null;
        cur += ch;
      } else {
        cur += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
      cur += ch;
    } else if (ch === '.') {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (inStr !== null) return undefined;
  parts.push(cur.trim());
  const normalized: string[] = [];
  for (const p of parts) {
    if (!p) return undefined;
    const m = /^(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))$/.exec(p);
    if (!m) return undefined;
    normalized.push((m[1] ?? m[2] ?? m[3])!);
  }
  return normalized.length > 0 ? normalized : undefined;
}

/** Parse a single or dotted TOML assignment starting at line `i`. */
function parseDottedAssignment(
  lines: string[],
  i: number,
  nl: string,
): { keys: string[]; rhs: string; endLine: number } | undefined {
  const line = lines[i]!;
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) return undefined;
  let inStr: string | null = null;
  let eqIdx = -1;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k]!;
    if (inStr) {
      if (ch === '\\' && inStr === '"') k++;
      else if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '#') {
      break;
    } else if (ch === '=') {
      eqIdx = k;
      break;
    }
  }
  if (eqIdx === -1) return undefined;
  const keys = splitTomlDottedKey(line.slice(0, eqIdx));
  if (!keys) return undefined;
  const endLine = assignmentEnd(lines, i);
  const rhsLines = [line.slice(eqIdx + 1), ...lines.slice(i + 1, endLine + 1)];
  return { keys, rhs: rhsLines.join(nl).trim(), endLine };
}

/** Extract top-level `key = value` pairs from a TOML inline table `{ ... }`. */
function parseInlineTableEntries(rhs: string): Array<{ key: string; value: string }> | undefined {
  let clean = rhs.trim();
  // Strip trailing top-level comment after closing brace
  let inStr: string | null = null;
  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inStr) {
      if (ch === '\\' && inStr === '"') i++;
      else if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
    } else if (ch === '#' && depth === 0) {
      clean = clean.slice(0, i).trim();
      break;
    }
  }
  if (!clean.startsWith('{') || !clean.endsWith('}')) return undefined;
  const inner = clean.slice(1, -1);
  const items: string[] = [];
  let cur = '';
  inStr = null;
  depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (inStr) {
      if (ch === '\\' && inStr === '"' && i + 1 < inner.length) {
        cur += ch + inner[++i]!;
      } else if (ch === inStr) {
        inStr = null;
        cur += ch;
      } else {
        cur += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
      cur += ch;
    } else if (ch === '{' || ch === '[') {
      depth++;
      cur += ch;
    } else if (ch === '}' || ch === ']') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      items.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) items.push(cur.trim());
  const out: Array<{ key: string; value: string }> = [];
  for (const item of items) {
    if (!item) continue;
    let itemInStr: string | null = null;
    let eq = -1;
    for (let k = 0; k < item.length; k++) {
      const ch = item[k]!;
      if (itemInStr) {
        if (ch === '\\' && itemInStr === '"') k++;
        else if (ch === itemInStr) itemInStr = null;
      } else if (ch === '"' || ch === "'") {
        itemInStr = ch;
      } else if (ch === '=') {
        eq = k;
        break;
      }
    }
    if (eq === -1) continue;
    const keys = splitTomlDottedKey(item.slice(0, eq));
    const val = item.slice(eq + 1).trim();
    if (keys && val) {
      out.push({ key: keys.join('.'), value: val });
    }
  }
  return out;
}

/**
 * Strip top-level or parent-table dotted assignments (`mcp_servers.squad_state = ...`,
 * `mcp_servers.squad_state.<key> = ...`) and inline table assignments (`squad_state = { ... }`
 * inside `[mcp_servers]`) that conflict with `[table]`, returning any extracted key/value pairs.
 */
function stripConflictingDottedAndInline(
  lines: string[],
  table: string,
  nl: string,
): { lines: string[]; extracted: Array<{ key: string; value: string }>; changed: boolean } {
  const want = table.split('.').join('.');
  const wantParts = want.split('.');
  const extracted: Array<{ key: string; value: string }> = [];
  let changed = false;

  interface Block {
    headerLine?: string;
    section?: { key: string; array: boolean };
    body: string[];
    removedConflict: boolean;
  }

  const blocks: Block[] = [{ body: [], removedConflict: false }];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const sec = sectionHeader(line);
    if (sec !== undefined) {
      blocks.push({ headerLine: line, section: sec, body: [], removedConflict: false });
      continue;
    }
    const curBlock = blocks[blocks.length - 1]!;
    const curSec = curBlock.section;
    const inTargetTable =
      curSec !== undefined && !curSec.array && (curSec.key === want || curSec.key.startsWith(`${want}.`));
    if (!inTargetTable && !curSec?.array) {
      const assign = parseDottedAssignment(lines, i, nl);
      if (assign) {
        const fullKeys = curSec ? [...curSec.key.split('.'), ...assign.keys] : assign.keys;
        const fullKey = fullKeys.join('.');
        if (fullKey === want) {
          const inlineEntries = parseInlineTableEntries(assign.rhs);
          if (inlineEntries) extracted.push(...inlineEntries);
          curBlock.removedConflict = true;
          changed = true;
          i = assign.endLine;
          continue;
        }
        if (fullKey.startsWith(`${want}.`)) {
          const relKey = fullKeys.slice(wantParts.length).join('.');
          extracted.push({ key: relKey, value: assign.rhs });
          curBlock.removedConflict = true;
          changed = true;
          i = assign.endLine;
          continue;
        }
      }
    }
    curBlock.body.push(line);
  }

  if (!changed) return { lines, extracted, changed: false };

  const out: string[] = [];
  for (const b of blocks) {
    if (b.headerLine !== undefined) {
      const hasRemainingContent = b.body.some((l) => l.trim() !== '');
      if (b.removedConflict && !hasRemainingContent) {
        // Parent table (e.g. `[mcp_servers]`) only held the conflicting inline/dotted squad_state entry
        continue;
      }
      out.push(b.headerLine);
    }
    out.push(...b.body);
  }
  return { lines: out, extracted, changed: true };
}

/** [start, end) of the table with key `table` (start at its header), or undefined. */
function findTable(lines: string[], table: string, from = 0): [number, number] | undefined {
  const want = table.split('.').join('.');
  for (let i = from; i < lines.length; i++) {
    if (tableHeaderKey(lines[i]!) !== want) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (sectionHeader(lines[j]!) !== undefined) { end = j; break; }
      if (assignmentKey(lines[j]!) !== undefined) j = assignmentEnd(lines, j);
    }
    return [i, end];
  }
  return undefined;
}

/**
 * Upsert `[table]` in TOML text, setting only the given managed keys (values are
 * already TOML literals). Other keys, sub-tables and tables are left untouched.
 * Multiline values (e.g. `args = [` arrays) are replaced as a whole.
 * Conflicting dotted/inline definitions of `table` are converted into `[table]`
 * while preserving non-managed keys.
 */
export function upsertTomlTable(
  existing: string,
  table: string,
  managed: Record<string, string>,
  defaults: Record<string, string> = {},
): string {
  const nl = existing.includes('\r\n') ? '\r\n' : '\n';
  const rawLines = existing === '' ? [] : existing.split(/\r?\n/);
  const { lines, extracted } = stripConflictingDottedAndInline(rawLines, table, nl);
  const preservedFromInline: Record<string, string> = {};
  for (const { key, value } of extracted) {
    if (!(key in managed)) {
      preservedFromInline[key] = value;
    }
  }
  const header = `[${table}]`;
  const span = findTable(lines, table);
  if (!span) {
    const merged: Record<string, string> = { ...preservedFromInline, ...managed };
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in merged)) merged[k] = v;
    }
    const body = Object.entries(merged).map(([k, v]) => `${k} = ${v}`);
    const cleanedExisting = lines.join(nl).replace(/(\r?\n)*$/, '');
    const prefix = cleanedExisting === '' ? '' : cleanedExisting + nl + nl;
    return `${prefix}${[header, ...body].join(nl)}${nl}`;
  }
  const [start, end] = span;
  const present = new Set<string>();
  const rewritten: string[] = [];
  const remaining = { ...managed };
  const defaultsLeft = { ...defaults };
  for (let i = start + 1; i < end; i++) {
    const line = lines[i]!;
    const k = assignmentKey(line);
    if (k === undefined) { rewritten.push(line); continue; }
    const last = assignmentEnd(lines, i);
    present.add(k);
    if (k in remaining) {
      rewritten.push(`${k} = ${remaining[k]!}`);
      delete remaining[k];
    } else {
      for (let n = i; n <= last; n++) rewritten.push(lines[n]!);
    }
    i = last;
  }
  for (const [k, v] of Object.entries(preservedFromInline)) {
    if (!present.has(k) && !(k in remaining)) {
      present.add(k);
      rewritten.push(`${k} = ${v}`);
    }
  }
  for (const k of Object.keys(defaultsLeft)) if (present.has(k)) delete defaultsLeft[k];
  let insertAt = rewritten.length;
  while (insertAt > 0 && rewritten[insertAt - 1]!.trim() === '') insertAt--;
  rewritten.splice(insertAt, 0, ...Object.entries({ ...remaining, ...defaultsLeft }).map(([k, v]) => `${k} = ${v}`));
  return [...lines.slice(0, start + 1), ...rewritten, ...lines.slice(end)].join(nl);
}

/** Collect projection files for the given clients, in order. */
export function projectClients(clients: readonly ClientId[], ctx: ClientContext): ProjectionFile[] {
  return clients.flatMap((c) => getHostProjection(c).project(ctx));
}

/**
 * Resolve `rel` under `root` and refuse anything that could escape it: absolute or
 * `..` paths, and symlink/junction components on the way (including `root` itself
 * and its ancestors down to `rel`).
 */
export function resolveInsideRoot(root: string, rel: string): string {
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing path outside the workspace: ${rel}`);
  }
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, rel);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error(`Refusing path outside the workspace: ${rel}`);
  }
  const parsedRoot = path.parse(abs).root;
  let cur = parsedRoot;
  for (const part of abs.slice(parsedRoot.length).split(path.sep).filter(Boolean)) {
    cur = path.join(cur, part);
    // Skip macOS top-level OS symlinks (/var -> /private/var, /tmp -> /private/tmp, /etc -> /private/etc)
    if (cur === '/var' || cur === '/tmp' || cur === '/etc') continue;
    let st: fs.Stats;
    try {
      st = fs.lstatSync(cur);
    } catch {
      break;
    }
    if (st.isSymbolicLink()) {
      const label = cur.startsWith(rootAbs + path.sep) ? path.relative(rootAbs, cur) : path.basename(cur);
      throw new Error(`Refusing symlinked path component: ${label}`);
    }
  }
  return abs;
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
    try {
      const abs = resolveInsideRoot(root, rel);
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
export function removeBlock(existing: string, id?: string): string {
  const { begin, end: endMarker } = markers(id);
  const start = existing.indexOf(begin);
  const end = existing.indexOf(endMarker);
  if (start !== -1 && (end === -1 || end < start)) {
    throw new Error('Unclosed Squad managed block marker in file; refusing to overwrite user content after marker');
  }
  if (start === -1) return existing;
  const before = existing.slice(0, start).replace(/\n{2,}$/, '\n');
  const after = existing.slice(end + endMarker.length).replace(/^\n/, '');
  return before + after;
}

/** Remove a whole `[table]`, its `[table.*]` sub-tables, and any inline/dotted definitions; other tables are untouched. */
export function removeTomlTable(existing: string, table: string): string {
  const nl = existing.includes('\r\n') ? '\r\n' : '\n';
  const stripped = stripConflictingDottedAndInline(existing.split(/\r?\n/), table, nl);
  let lines = stripped.lines;
  const isOurs = (line: string) => {
    const h = sectionHeader(line);
    return h !== undefined && (h.key === table || h.key.startsWith(`${table}.`)) && (!h.array || h.key !== table);
  };
  let changed = stripped.changed;
  for (;;) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) if (isOurs(lines[i]!)) { start = i; break; }
    if (start === -1) break;
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (sectionHeader(lines[j]!) !== undefined) { end = j; break; }
      if (assignmentKey(lines[j]!) !== undefined) j = assignmentEnd(lines, j);
    }
    const before = lines.slice(0, start);
    while (before.length > 0 && before[before.length - 1]!.trim() === '') before.pop();
    const after = lines.slice(end);
    lines = [...before, ...(before.length > 0 && after.length > 0 ? [''] : []), ...after];
    changed = true;
  }
  if (!changed) return existing;
  const joined = lines.join(nl);
  return joined.trim() === '' ? '' : joined.replace(/(\r?\n)*$/, nl);
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
    try {
      const abs = resolveInsideRoot(root, f.path);
      if (!fs.existsSync(abs)) {
        results.push({ path: f.path, action: 'unchanged' });
        continue;
      }
      if (f.kind === 'managed') {
        fs.rmSync(abs);
        results.push({ path: f.path, action: 'removed' });
      } else if (f.kind === 'json') {
        const current = parseJsonObject(abs, fs.readFileSync(abs, 'utf8'));
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
        const next = f.kind === 'text' ? removeTomlTable(text, `mcp_servers.${SQUAD_STATE_KEY}`) : removeBlock(text, f.id);
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

/**
 * Roll back the given clients' projections (inverse of {@link installClients}).
 * Pass the clients that stay installed as `keep`: shared JSON configs (e.g. the
 * `.mcp.json` Copilot and Claude both use) keep their `squad_state` entry while
 * any kept client still projects the same file.
 */
export function uninstallClients(clients: readonly ClientId[], ctx: ClientContext, keep: readonly ClientId[] = []): ApplyResult[] {
  const keepPaths = new Set(
    projectClients(keep.filter((c) => !clients.includes(c)), ctx).filter((f) => f.kind === 'json').map((f) => f.path),
  );
  return removeProjection(ctx.root, projectClients(clients, ctx).filter((f) => !(f.kind === 'json' && keepPaths.has(f.path))));
}