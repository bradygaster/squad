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

const linesMarker = (id: string) => `# squad:${id}`;

/**
 * Append any missing `lines` under a `# squad:<id>` comment so {@link removeLines}
 * can later take back exactly what Squad added. Lines the user already has are
 * left alone (and stay on uninstall).
 */
export function upsertLines(existing: string, lines: readonly string[], id: string): string {
  const have = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = lines.filter((l) => !have.has(l.trim()));
  if (missing.length === 0) return existing;
  const marker = linesMarker(id);
  const rows = existing === '' ? [] : existing.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  const at = rows.findIndex((l) => l.trim() === marker);
  if (at === -1) rows.push(marker, ...missing);
  else rows.splice(at + 1, 0, ...missing);
  return rows.join('\n') + '\n';
}

/** Remove the `# squad:<id>` comment and the listed lines directly under it; nothing else. */
export function removeLines(existing: string, lines: readonly string[], id: string): string {
  const marker = linesMarker(id);
  const rows = existing.split('\n');
  const at = rows.findIndex((l) => l.trim() === marker);
  if (at === -1) return existing;
  const ours = new Set(lines.map((l) => l.trim()));
  let end = at + 1;
  while (end < rows.length && ours.has(rows[end]!.trim())) end++;
  rows.splice(at, end - at);
  return rows.join('\n');
}

const SECTION_RE = /^\s*(\[\[?)\s*([^\]\r\n]+?)\s*(\]\]?)\s*(?:#.*)?$/;

function segmentsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, idx) => s === b[idx]);
}

function segmentsStartWith(segments: readonly string[], prefix: readonly string[]): boolean {
  return segments.length >= prefix.length && prefix.every((s, idx) => segments[idx] === s);
}

function isStrictSubpath(segments: readonly string[], prefix: readonly string[]): boolean {
  return segments.length > prefix.length && prefix.every((s, idx) => segments[idx] === s);
}

function formatTomlKeySegment(seg: string): string {
  return /^[A-Za-z0-9_-]+$/.test(seg) ? seg : JSON.stringify(seg);
}

function formatTomlKeyPath(segments: readonly string[]): string {
  return segments.map(formatTomlKeySegment).join('.');
}

/** A TOML section boundary: `[table]` or `[[array_table]]` (quotes/whitespace tolerant, preserving quoted dots). */
function sectionHeader(line: string): { keys: string[]; array: boolean } | undefined {
  const m = SECTION_RE.exec(line);
  if (!m || m[1]!.length !== m[3]!.length) return undefined;
  const keys = splitTomlDottedKey(m[2]!);
  if (!keys) return undefined;
  return { keys, array: m[1]!.length === 2 };
}

/** Normalized key segments of a `[table]` header line, or undefined (including for `[[array]]` headers). */
function tableHeaderKeys(line: string): string[] | undefined {
  const h = sectionHeader(line);
  return h && !h.array ? h.keys : undefined;
}

/** Unquoted key of a single-segment `key = value` line (bare, "basic" or 'literal'), or undefined. */
function assignmentKey(line: string): string | undefined {
  const m = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*=/.exec(line);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** Index of the unquoted `=` in an assignment line, or -1 if the line is a comment, header, or non-assignment. */
function findAssignmentEquals(line: string): number {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) return -1;
  let inStr: string | null = null;
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
      return k;
    }
  }
  return -1;
}

/**
 * Index of the last line of the assignment starting at `i`
 * (handles multiline strings `"""`/`'''`, multiline arrays `[...]`, and inline tables `{...}`).
 */
function assignmentEnd(lines: string[], i: number): number {
  const first = lines[i]!;
  const eq = findAssignmentEquals(first);
  if (eq === -1) return i;
  let depth = 0;
  let inStr: '"""' | "'''" | '"' | "'" | null = null;
  for (let n = i; n < lines.length; n++) {
    const text = n === i ? first.slice(eq + 1) : lines[n]!;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k]!;
      if (inStr === '"""') {
        if (ch === '\\') {
          k++;
        } else if (text.startsWith('"""', k)) {
          k += 2;
          while (k + 1 < text.length && text[k + 1] === '"') k++;
          inStr = null;
        }
      } else if (inStr === "'''") {
        if (text.startsWith("'''", k)) {
          k += 2;
          while (k + 1 < text.length && text[k + 1] === "'") k++;
          inStr = null;
        }
      } else if (inStr === '"') {
        if (ch === '\\') k++;
        else if (ch === '"') inStr = null;
      } else if (inStr === "'") {
        if (ch === "'") inStr = null;
      } else {
        if (text.startsWith('"""', k)) {
          inStr = '"""';
          k += 2;
        } else if (text.startsWith("'''", k)) {
          inStr = "'''";
          k += 2;
        } else if (ch === '"') {
          inStr = '"';
        } else if (ch === "'") {
          inStr = "'";
        } else if (ch === '#') {
          break;
        } else if (ch === '[' || ch === '{') {
          depth++;
        } else if (ch === ']' || ch === '}') {
          depth--;
        }
      }
    }
    if (inStr === null && depth <= 0) return n;
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
  const eqIdx = findAssignmentEquals(line);
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
      out.push({ key: formatTomlKeyPath(keys), value: val });
    }
  }
  return out;
}

/**
 * Strip top-level or parent-table dotted assignments (`mcp_servers.squad_state = ...`,
 * `mcp_servers.squad_state.<key> = ...`) and inline table assignments (`squad_state = { ... }`
 * inside `[mcp_servers]`) that conflict with `[table]`, returning any extracted key/value pairs.
 * When `strictAncestorCheck` is true, throws if an ancestor of `table` is defined as an inline
 * table or scalar (e.g. `mcp_servers = { other = ... }`) since TOML forbids extending inline tables.
 */
function stripConflictingDottedAndInline(
  lines: string[],
  wantParts: readonly string[],
  nl: string,
  strictAncestorCheck = false,
): { lines: string[]; extracted: Array<{ key: string; value: string }>; changed: boolean } {
  const extracted: Array<{ key: string; value: string }> = [];
  let changed = false;

  interface Block {
    headerLine?: string;
    section?: { keys: string[]; array: boolean };
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
    const assign = parseDottedAssignment(lines, i, nl);
    if (assign) {
      const inTargetTable =
        curSec !== undefined && !curSec.array && segmentsStartWith(curSec.keys, wantParts);
      if (!inTargetTable && !curSec?.array) {
        const fullKeys = curSec ? [...curSec.keys, ...assign.keys] : assign.keys;
        if (fullKeys.length < wantParts.length && segmentsStartWith(wantParts, fullKeys)) {
          if (strictAncestorCheck) {
            throw new Error(
              `Refusing to extend inline or scalar "${formatTomlKeyPath(fullKeys)}" with [${formatTomlKeyPath(wantParts)}]; expected [${formatTomlKeyPath(fullKeys)}] to be a standard TOML table`,
            );
          }
        } else if (segmentsEqual(fullKeys, wantParts)) {
          const inlineEntries = parseInlineTableEntries(assign.rhs);
          if (!inlineEntries && strictAncestorCheck) {
            throw new Error(`Refusing to overwrite non-table "${formatTomlKeyPath(wantParts)}"`);
          }
          if (inlineEntries) extracted.push(...inlineEntries);
          curBlock.removedConflict = true;
          changed = true;
          i = assign.endLine;
          continue;
        } else if (isStrictSubpath(fullKeys, wantParts)) {
          const relKey = formatTomlKeyPath(fullKeys.slice(wantParts.length));
          extracted.push({ key: relKey, value: assign.rhs });
          curBlock.removedConflict = true;
          changed = true;
          i = assign.endLine;
          continue;
        }
      }
      for (let n = i; n <= assign.endLine; n++) curBlock.body.push(lines[n]!);
      i = assign.endLine;
      continue;
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

/** [start, end) of the table with key segments `wantParts` (start at its header), or undefined. */
function findTable(lines: string[], wantParts: readonly string[], from = 0): [number, number] | undefined {
  for (let i = from; i < lines.length; i++) {
    const hdr = tableHeaderKeys(lines[i]!);
    if (hdr !== undefined) {
      if (!segmentsEqual(hdr, wantParts)) continue;
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (sectionHeader(lines[j]!) !== undefined) { end = j; break; }
        if (findAssignmentEquals(lines[j]!) !== -1) j = assignmentEnd(lines, j);
      }
      return [i, end];
    }
    if (sectionHeader(lines[i]!) === undefined && findAssignmentEquals(lines[i]!) !== -1) {
      i = assignmentEnd(lines, i);
    }
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
  const wantParts = splitTomlDottedKey(table) ?? table.split('.');
  const rawLines = existing === '' ? [] : existing.split(/\r?\n/);
  const { lines, extracted } = stripConflictingDottedAndInline(rawLines, wantParts, nl, true);
  const preservedFromInline: Record<string, string> = {};
  for (const { key, value } of extracted) {
    if (!(key in managed)) {
      preservedFromInline[key] = value;
    }
  }
  const header = `[${table}]`;
  const span = findTable(lines, wantParts);
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
    if (k === undefined) {
      if (findAssignmentEquals(line) !== -1) {
        const last = assignmentEnd(lines, i);
        for (let n = i; n <= last; n++) rewritten.push(lines[n]!);
        i = last;
      } else {
        rewritten.push(line);
      }
      continue;
    }
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

/** Canonical absolute root: symlinked/junctioned ancestors (OneDrive, `~/code -> /Volumes/...`) are allowed. */
function realRoot(root: string): string {
  const abs = path.resolve(root);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

function isInside(abs: string, root: string): boolean {
  return abs === root || abs.startsWith(root + path.sep);
}

/**
 * Resolve `rel` under `root` and refuse anything that could escape it: absolute or
 * `..` paths, and symlink/junction components below the (real) root. The target
 * itself may be a symlink as long as it resolves inside the root (e.g.
 * `AGENTS.md -> CLAUDE.md`); the resolved path is returned so writes replace
 * the file content, not the link.
 */
export function resolveInsideRoot(root: string, rel: string): string {
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing path outside the workspace: ${rel}`);
  }
  const rootAbs = realRoot(root);
  const abs = path.resolve(rootAbs, rel);
  if (!isInside(abs, rootAbs)) {
    throw new Error(`Refusing path outside the workspace: ${rel}`);
  }
  const parts = path.relative(rootAbs, abs).split(path.sep).filter(Boolean);
  let cur = rootAbs;
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i]!);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(cur);
    } catch {
      break;
    }
    if (!st.isSymbolicLink()) continue;
    if (i === parts.length - 1) {
      let real: string | undefined;
      try {
        real = fs.realpathSync(cur);
      } catch {
        real = undefined;
      }
      if (real !== undefined && isInside(real, rootAbs) && fs.statSync(real).isFile()) return real;
    }
    throw new Error(`Refusing symlinked path component: ${path.relative(rootAbs, cur)}`);
  }
  return abs;
}

/** Dominant line ending of an existing file; LF for new or single-line files. */
export function detectEol(text: string | undefined): '\n' | '\r\n' {
  if (!text) return '\n';
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = text.match(/\n/g)?.length ?? 0;
  return crlf > lf - crlf ? '\r\n' : '\n';
}

const toLf = (text: string) => text.replace(/\r\n/g, '\n');
const withEol = (text: string, eol: string) => (eol === '\n' ? text : text.replace(/\n/g, eol));

/** Indentation (tab or N spaces) and trailing-newline convention of a JSON document. */
function detectJsonFormat(raw: string | undefined): { indent: string | number; trailingNewline: boolean } {
  if (raw === undefined || raw.trim() === '') return { indent: 2, trailingNewline: true };
  const m = /^([ \t]+)\S/m.exec(raw);
  const indent = m ? (m[1]!.includes('\t') ? '\t' : m[1]!.length) : 2;
  return { indent, trailingNewline: raw.endsWith('\n') };
}

/** True when the text has line (`//`) or block comments outside string literals. */
export function hasJsonComments(raw: string | undefined): boolean {
  if (!raw) return false;
  let inStr = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '/' && (raw[i + 1] === '/' || raw[i + 1] === '*')) {
      return true;
    }
  }
  return false;
}

function assertMergeableJson(file: string, raw: string | undefined): void {
  if (file.toLowerCase().endsWith('.jsonc') && hasJsonComments(raw)) {
    throw new Error(
      `Cannot merge ${file}: Squad can't merge JSONC files that contain comments; add the "${SQUAD_STATE_KEY}" MCP server manually or convert the file to plain JSON`,
    );
  }
}

function stringifyJson(obj: Record<string, unknown>, raw: string | undefined): string {
  const fmt = detectJsonFormat(raw);
  return JSON.stringify(obj, null, fmt.indent) + (fmt.trailingNewline ? '\n' : '');
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
  atomicWrite(file, next);
  return existed ? 'updated' : 'created';
}

/** Write via a sibling temp file + rename so a crash never leaves a half-written shared config. */
function atomicWrite(file: string, content: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Write projection files under `root`. Failures (e.g. a malformed user JSON
 * file) are reported per-file and never abort the remaining files. Content is
 * emitted with the existing file's dominant line ending (LF for new files).
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
    else if (f.kind === 'lines') add(f.path, (t) => upsertLines(t ?? '', f.lines, f.id));
    else if (f.kind === 'text') add(f.path, (t) => f.update(t ?? ''));
    else {
      add(f.path, (t, abs) => {
        assertMergeableJson(abs, t);
        return stringifyJson(f.update(parseJsonObject(abs, t)), t);
      });
    }
  }

  for (const rel of order) {
    try {
      const abs = resolveInsideRoot(root, rel);
      const original = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : undefined;
      const eol = detectEol(original);
      let text = original === undefined ? undefined : toLf(original);
      for (const fn of transforms.get(rel)!) text = fn(text, abs);
      results.push({ path: rel, action: writeIfChanged(abs, withEol(toLf(text ?? ''), eol)) });
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
  const wantParts = splitTomlDottedKey(table) ?? table.split('.');
  const stripped = stripConflictingDottedAndInline(existing.split(/\r?\n/), wantParts, nl, false);
  let lines = stripped.lines;
  const isOurs = (line: string) => {
    const h = sectionHeader(line);
    return (
      h !== undefined &&
      segmentsStartWith(h.keys, wantParts) &&
      (!h.array || !segmentsEqual(h.keys, wantParts))
    );
  };
  let changed = stripped.changed;
  for (;;) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (isOurs(lines[i]!)) { start = i; break; }
      if (sectionHeader(lines[i]!) === undefined && findAssignmentEquals(lines[i]!) !== -1) {
        i = assignmentEnd(lines, i);
      }
    }
    if (start === -1) break;
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (sectionHeader(lines[j]!) !== undefined) { end = j; break; }
      if (findAssignmentEquals(lines[j]!) !== -1) j = assignmentEnd(lines, j);
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
        const raw = fs.readFileSync(abs, 'utf8');
        assertMergeableJson(abs, raw);
        const current = parseJsonObject(abs, raw);
        const next = removeServerEntry(current);
        if (JSON.stringify(next) === JSON.stringify(current)) {
          results.push({ path: f.path, action: 'unchanged' });
          continue;
        }
        if (Object.keys(next).length === 0) fs.rmSync(abs);
        else atomicWrite(abs, withEol(stringifyJson(next, toLf(raw)), detectEol(raw)));
        results.push({ path: f.path, action: Object.keys(next).length === 0 ? 'removed' : 'updated' });
      } else {
        const raw = fs.readFileSync(abs, 'utf8');
        const text = toLf(raw);
        const next =
          f.kind === 'text' ? removeTomlTable(text, `mcp_servers.${SQUAD_STATE_KEY}`)
          : f.kind === 'lines' ? removeLines(text, f.lines, f.id)
          : removeBlock(text, f.id);
        if (next === text) {
          results.push({ path: f.path, action: 'unchanged' });
          continue;
        }
        if (next.trim() === '') fs.rmSync(abs);
        else atomicWrite(abs, withEol(next, detectEol(raw)));
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