#!/usr/bin/env node
/**
 * Pack evidence for a Squad release.
 *
 * Packs @bradygaster/squad-sdk and @bradygaster/squad-cli from the current tree into an
 * evidence directory and records, per package:
 *   - the tarball file name, byte size, sha256 and the npm `integrity` (sha512) / `shasum`
 *   - the `npm pack --dry-run --json` file list
 *   - the package.json inside the tarball (version, name, CLI->SDK dependency)
 *   - export-target validation: every `exports`/`bin`/`main`/`types` target is a file in the tarball
 *   - a privacy scan of the extracted tarball contents (user profile paths, private feed URLs,
 *     email addresses / UPNs, retired product concepts) with a narrow, reviewed allowlist
 *
 * Fails (exit 1) when a tarball version differs from --expect-version, when the CLI tarball does
 * not pin/float the SDK as expected, when an export target is missing, or when the privacy scan
 * has unallowlisted hits. Requires a prior `npm run build`.
 *
 *   node scripts/release/pack-evidence.mjs --out evidence [--expect-version 2.0.0-preview.1]
 *        [--expect-sdk-dep '>=2.0.0-preview.1' | --expect-sdk-dep-exact]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export const PACKAGES = Object.freeze({ '@bradygaster/squad-sdk': 'packages/squad-sdk', '@bradygaster/squad-cli': 'packages/squad-cli' });

/**
 * Denied content patterns. Each hit must be allowlisted explicitly or the scan fails.
 * The retired-concept patterns are assembled from fragments so this file does not itself
 * contain the retired names (test/retired-symbols.test.ts scans every tracked file).
 */
const frag = (...parts) => new RegExp(parts.join(''), 'i');
export const PRIVACY_DENY = Object.freeze([
  { id: 'windows-user-path', re: /[A-Za-z]:\\+Users\\+[^\\\s"'`]+/ },
  { id: 'posix-home-path', re: /(?:^|[^\w./-])\/home\/[A-Za-z0-9._-]+(?:\/|\b)/ },
  { id: 'macos-user-path', re: /(?:^|[^\w./-])\/Users\/[A-Za-z0-9._-]+(?:\/|\b)/ },
  { id: 'private-feed-url', re: /pkgs\.visualstudio\.com|pkgs\.dev\.azure\.com|packagefeedproxy|ms-feed-\d+|vsblob\.vsassets\.io/i },
  { id: 'email-upn', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { id: 'retired-profile-squad', re: frag('person', 'al[- ]squads?\\b') },
  { id: 'retired-ghost-feature', re: frag('gho', 'st[- ]?proto', 'col') },
  { id: 'retired-consult-feature', re: frag('\\bcons', 'ult[- ]mode\\b|\\bsquad cons', 'ult\\b') },
]);

/**
 * The single historical BREAKING sentence that the CLI changelog is allowed to carry. Read from
 * the shipped CHANGELOG (the line marked **BREAKING:**) so the sentence is not duplicated here;
 * test/retired-symbols.test.ts keeps it to exactly one line.
 */
function breakingLineFrom(extractRoot) {
  const changelog = path.join(extractRoot, 'package', 'CHANGELOG.md');
  if (!existsSync(changelog)) return null;
  const line = readFileSync(changelog, 'utf8').split(/\r?\n/).find((l) => l.includes('**BREAKING:**'));
  return line ? line.slice(line.indexOf('**BREAKING:**') + '**BREAKING:**'.length).trim() : null;
}

/** Placeholder account names that documentation may use inside example paths. */
const PLACEHOLDER_USERS = /^(?:user|username|johndoe|example|you|<[^>]+>|\$\{?[A-Z_]+\}?|%[A-Z_]+%)$/i;
const TECHNICAL_EMAIL_LIKE_VALUES = new Set(['git@github.com', 'org@dev.azure.com', 'git@ssh.dev.azure.com']);
function placeholderPath(match) {
  const user = match.replace(/^[^\\/]*[\\/]+(?:Users|home)[\\/]+/i, '').replace(/[\\/].*$/, '');
  return PLACEHOLDER_USERS.test(user);
}

function placeholderEmail(match) {
  const normalized = match.toLowerCase();
  const at = normalized.lastIndexOf('@');
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return /(?:^|\.)example\.(?:com|org|net)$/.test(domain)
    || normalized === 'noreply@github.com'
    || domain === 'users.noreply.github.com'
    || normalized === 'user@odata.bind'
    || (domain === 'github.com' && (local === 'token' || /^ghp_x+$/.test(local)))
    || TECHNICAL_EMAIL_LIKE_VALUES.has(normalized);
}

/**
 * Reviewed allowlist. Narrow by design: exact file + exact predicate + reason. Anything else that
 * matches a deny pattern fails the scan.
 */
export const PRIVACY_ALLOW = Object.freeze([
  { file: 'package/CHANGELOG.md', reason: 'the single historical BREAKING sentence (test/retired-symbols.test.ts keeps it to exactly one line)', test: (line, _match, ctx) => ctx.breakingLine !== null && line.includes(ctx.breakingLine) && line.includes('**BREAKING:**') },
  { file: /^package\/(?:dist\/storage\/storage-error\.(?:js|d\.ts)|templates\/skills\/e2e-template-testing\/SKILL\.md)$/, reason: 'documentation example paths with placeholder account names (user, username, johndoe)', test: (_line, match) => placeholderPath(match) },
  { file: /^package\//, reason: 'narrow placeholder or protocol identity (example domains, noreply@github.com, and SSH/URL user components)', test: (_line, match) => placeholderEmail(match) },
  { file: 'package/package.json', reason: 'reviewed package metadata author/bugs email field', test: (line) => /"(?:author|bugs|email)"\s*:/.test(line) },
]);

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.txt', '.yml', '.yaml', '.toml', '.mdc', '.html', '.css', '.sh', '.ps1', '.cmd', '']);

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function scanExtracted(extractRoot) {
  const hits = [];
  const allowlisted = [];
  const ctx = { breakingLine: breakingLineFrom(extractRoot) };
  let breakingLines = 0;
  for (const abs of walk(extractRoot)) {
    const rel = path.relative(extractRoot, abs).replace(/\\/g, '/');
    if (!TEXT_EXT.has(path.extname(rel).toLowerCase())) continue;
    const buf = readFileSync(abs);
    if (buf.includes(0)) continue;
    const lines = buf.toString('utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (rel === 'package/CHANGELOG.md' && line.includes('**BREAKING:**')) breakingLines += 1;
      for (const { id, re } of PRIVACY_DENY) {
        const m = re.exec(line);
        if (!m) continue;
        const allow = PRIVACY_ALLOW.find((a) => (a.file instanceof RegExp ? a.file.test(rel) : a.file === rel) && a.test(line, m[0], ctx));
        const rec = { file: rel, line: i + 1, pattern: id, match: m[0].slice(0, 120) };
        if (allow) allowlisted.push({ ...rec, reason: allow.reason });
        else hits.push(rec);
      }
    });
  }
  // The CHANGELOG exemption is for exactly one historical line; more than one is a leak.
  if (breakingLines > 1) hits.push({ file: 'package/CHANGELOG.md', line: 0, pattern: 'breaking-line-count', match: `${breakingLines} **BREAKING:** lines; exactly one is allowlisted` });
  return { hits, allowlisted };
}

function exportTargets(pkg) {
  const targets = new Set();
  const add = (v) => { if (typeof v === 'string') targets.add(v); else if (v && typeof v === 'object') Object.values(v).forEach(add); };
  add(pkg.exports);
  if (pkg.main) targets.add(pkg.main);
  if (pkg.types) targets.add(pkg.types);
  if (pkg.bin) add(pkg.bin);
  return [...targets].map((t) => t.replace(/^\.\//, ''));
}

export function packEvidence({ root = ROOT, outDir, expectVersion, expectSdkDep, expectSdkDepExact = false, pinSdkDepExact = false } = {}) {
  mkdirSync(outDir, { recursive: true });
  const result = { generatedAt: new Date().toISOString(), node: process.version, npm: execFileSync(npm, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(), packages: {}, problems: [] };
  for (const [name, dir] of Object.entries(PACKAGES)) {
    const pkgDir = path.join(root, dir);
    if (!existsSync(path.join(pkgDir, 'dist'))) { result.problems.push(`${name}: dist/ missing; run npm run build first`); continue; }
    const manifestPath = path.join(pkgDir, 'package.json');
    const originalManifest = readFileSync(manifestPath, 'utf8');
    if (pinSdkDepExact && name === '@bradygaster/squad-cli') {
      const manifest = JSON.parse(originalManifest);
      manifest.dependencies['@bradygaster/squad-sdk'] = manifest.version;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }
    let dry; let packed;
    try {
      dry = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: pkgDir, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }))[0];
      packed = JSON.parse(execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', outDir], { cwd: pkgDir, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }))[0];
    } finally {
      if (pinSdkDepExact && name === '@bradygaster/squad-cli') writeFileSync(manifestPath, originalManifest);
    }
    const tarball = path.join(outDir, packed.filename);
    const bytes = readFileSync(tarball);
    const files = dry.files.map((f) => f.path).sort();

    const extract = mkdtempSync(path.join(tmpdir(), 'squad-pack-evidence-'));
    let manifest; let scan; let missingTargets = [];
    try {
      execFileSync('tar', ['-xzf', tarball, '-C', extract], { stdio: 'ignore' });
      manifest = JSON.parse(readFileSync(path.join(extract, 'package', 'package.json'), 'utf8'));
      scan = scanExtracted(extract);
      const fileSet = new Set(files);
      missingTargets = exportTargets(manifest).filter((t) => !t.includes('*') && !fileSet.has(t));
    } finally {
      rmSync(extract, { recursive: true, force: true });
    }

    const sdkDep = manifest.dependencies?.['@bradygaster/squad-sdk'] ?? null;
    const entry = {
      name, dir, filename: packed.filename, bytes: bytes.length, sha256: sha256(bytes), integrity: packed.integrity, shasum: packed.shasum,
      fileCount: files.length, unpackedSize: packed.unpackedSize, files,
      manifest: { name: manifest.name, version: manifest.version, sdkDependency: sdkDep, exportsCount: Object.keys(manifest.exports ?? {}).length, bin: manifest.bin ?? null },
      exportTargets: { checked: exportTargets(manifest).length, missing: missingTargets },
      privacy: { hits: scan.hits, allowlisted: scan.allowlisted, denyPatterns: PRIVACY_DENY.map((d) => d.id) },
    };
    if (dry.integrity !== packed.integrity) result.problems.push(`${name}: dry-run integrity ${dry.integrity} != packed ${packed.integrity}`);
    if (expectVersion && manifest.version !== expectVersion) result.problems.push(`${name}: tarball package.json version ${manifest.version} != ${expectVersion}`);
    if (manifest.name !== name) result.problems.push(`${name}: tarball package.json name is ${manifest.name}`);
    if (manifest.private) result.problems.push(`${name}: tarball package.json is private`);
    if (name === '@bradygaster/squad-cli') {
      if (expectSdkDepExact && sdkDep !== manifest.version) result.problems.push(`${name}: SDK dependency ${sdkDep} is not the exact pin ${manifest.version}`);
      else if (expectSdkDep && sdkDep !== expectSdkDep) result.problems.push(`${name}: SDK dependency ${sdkDep} != ${expectSdkDep}`);
    }
    if (missingTargets.length) result.problems.push(`${name}: export targets missing from tarball: ${missingTargets.join(', ')}`);
    if (scan.hits.length) result.problems.push(`${name}: privacy scan hits: ${scan.hits.map((h) => `${h.file}:${h.line} [${h.pattern}] ${h.match}`).join('; ')}`);
    result.packages[name] = entry;
    writeFileSync(path.join(outDir, `${packed.filename}.sha256`), `${entry.sha256}  ${packed.filename}\n`);
  }
  result.ok = result.problems.length === 0;
  writeFileSync(path.join(outDir, 'pack-evidence.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  const outDir = path.resolve(arg('--out') ?? 'evidence');
  const res = packEvidence({
    outDir,
    expectVersion: arg('--expect-version'),
    expectSdkDep: arg('--expect-sdk-dep'),
    expectSdkDepExact: process.argv.includes('--expect-sdk-dep-exact'),
    pinSdkDepExact: process.argv.includes('--pin-sdk-dep-exact'),
  });
  for (const [name, p] of Object.entries(res.packages)) {
    console.log(`${name}@${p.manifest.version}: ${p.filename} ${p.bytes} bytes sha256=${p.sha256} ${p.integrity} files=${p.fileCount} exports-ok=${p.exportTargets.missing.length === 0} privacy-hits=${p.privacy.hits.length} allowlisted=${p.privacy.allowlisted.length}`);
  }
  for (const problem of res.problems) console.error(`::error::${problem}`);
  console.log(`${res.ok ? '✅' : '❌'} pack evidence written to ${outDir}`);
  process.exit(res.ok ? 0 : 1);
}
