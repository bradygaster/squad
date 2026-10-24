#!/usr/bin/env node
/**
 * Fail-closed lockfile registry check.
 *
 * Every tracked package-lock.json must resolve exclusively to https://registry.npmjs.org/
 * with sha512 integrity. Private or proxy hosts (Azure Artifacts feeds, packagefeedproxy,
 * ms-feed-*) are denied explicitly, and so is any other host: a lockfile that works only
 * behind a corporate feed is a release blocker because `npm ci` on a clean machine fails.
 *
 *   node scripts/release/check-lockfile-registry.mjs            # exit 1 on any violation
 *   node scripts/release/check-lockfile-registry.mjs --json     # machine-readable report on stdout
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ALLOWED_HOST = 'registry.npmjs.org';
/** Explicit denylist, checked by substring so new feed numbers or subdomains cannot slip through. */
export const DENIED_HOST_PATTERNS = [
  /pkgs\.visualstudio\.com/i,
  /pkgs\.dev\.azure\.com/i,
  /packagefeedproxy/i,
  /ms-feed-\d+/i,
  /vsblob\.vsassets\.io/i,
];

export function trackedLockfiles(root = ROOT) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'package-lock.json', '**/package-lock.json'], { encoding: 'utf8' });
  return [...new Set(out.split('\0').filter(Boolean))].filter((p) => !p.includes('node_modules/'));
}

function lineOf(text, needle) {
  const idx = text.indexOf(needle);
  return idx < 0 ? null : text.slice(0, idx).split('\n').length;
}

/** @returns {{ files: string[], entries: number, violations: Array<{file:string,line:number|null,key:string,version:string,resolved:string,reason:string}> }} */
export function checkLockfiles(root = ROOT, files = trackedLockfiles(root)) {
  const violations = [];
  let entries = 0;
  for (const rel of files) {
    const text = readFileSync(path.join(root, rel), 'utf8');
    const lock = JSON.parse(text);
    for (const [key, entry] of Object.entries(lock.packages ?? {})) {
      const resolved = entry.resolved;
      if (!resolved || !/^https?:/i.test(resolved)) continue; // workspace links (file:) are not registry fetches
      entries += 1;
      const line = lineOf(text, `"resolved": "${resolved}"`);
      const denied = DENIED_HOST_PATTERNS.find((re) => re.test(resolved));
      let host = null;
      try { host = new URL(resolved).host; } catch { /* reported below */ }
      if (denied) violations.push({ file: rel, line, key, version: entry.version, resolved, reason: `denied private/proxy host (${denied.source})` });
      else if (host !== ALLOWED_HOST) violations.push({ file: rel, line, key, version: entry.version, resolved, reason: `host ${host ?? '<unparseable>'} is not ${ALLOWED_HOST}` });
      if (!/^sha512-[A-Za-z0-9+/=]+$/.test(entry.integrity ?? '')) {
        violations.push({ file: rel, line, key, version: entry.version, resolved, reason: `integrity '${entry.integrity ?? '<missing>'}' is not sha512` });
      }
    }
  }
  return { files, entries, violations };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkLockfiles();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ allowedHost: ALLOWED_HOST, deniedPatterns: DENIED_HOST_PATTERNS.map((r) => r.source), ...result, ok: result.violations.length === 0 }, null, 2));
  } else {
    for (const v of result.violations) console.error(`::error file=${v.file},line=${v.line ?? 1}::${v.key}@${v.version}: ${v.reason} (${v.resolved})`);
    console.log(`${result.violations.length === 0 ? '✅' : '❌'} ${result.files.length} lockfile(s), ${result.entries} registry entries, ${result.violations.length} violation(s)`);
  }
  if (result.files.length === 0) { console.error('::error::no tracked package-lock.json found'); process.exit(1); }
  process.exit(result.violations.length === 0 ? 0 : 1);
}
