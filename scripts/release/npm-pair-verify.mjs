#!/usr/bin/env node
/**
 * Verify the Squad npm package PAIR on the public registry with bounded backoff.
 *
 * For @bradygaster/squad-sdk and @bradygaster/squad-cli at --version:
 *   - `npm view <pkg>@<version> version dist.integrity dist.shasum` must return the version and
 *     the integrity recorded for the locally packed tarball (--local-packs from the publish job),
 *   - `npm view <pkg> dist-tags.<tag>` must equal the version,
 *   - with --install-check: `npm install -g --prefix <tmp> @bradygaster/squad-cli@<tag>` from an
 *     isolated HOME must install CLI and SDK at exactly <version> and `--version` must print it.
 *
 * Registry reads that never converge within --max-wait-seconds are reported as UNKNOWN, not as
 * absence: the caller must re-run and reconcile, never assume the package is missing.
 *
 * With --classify the result carries `outcome`: COMPLETE | PARTIAL_PUBLISH | UNKNOWN.
 * Exit 0 only for COMPLETE.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REGISTRY = process.env.PUBLIC_REGISTRY ?? 'https://registry.npmjs.org/';
const PACKAGES = ['@bradygaster/squad-sdk', '@bradygaster/squad-cli'];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function arg(k, dflt) { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : dflt; }
const version = arg('--version');
const tag = arg('--tag');
const localPacks = arg('--local-packs') ? JSON.parse(readFileSync(arg('--local-packs'), 'utf8')) : {};
const outFile = arg('--out');
const maxWait = Number(arg('--max-wait-seconds', '600'));
const installCheck = process.argv.includes('--install-check');
const classify = process.argv.includes('--classify');
if (!version || !tag) { console.error('usage: npm-pair-verify.mjs --version V --tag T [--local-packs f] [--out f] [--install-check] [--max-wait-seconds N] [--classify]'); process.exit(2); }

function view(spec, field) {
  const r = spawnSync(npm, ['view', spec, field, `--registry=${REGISTRY}`, '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    const diagnostic = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
    return { ok: false, value: null, error: diagnostic.slice(-1200) || `exit ${r.status}` };
  }
  try { const v = JSON.parse(r.stdout || 'null'); return { ok: true, value: typeof v === 'object' && v !== null && !Array.isArray(v) ? (v[field] ?? v) : v, error: null }; } catch { return { ok: true, value: (r.stdout || '').trim(), error: null }; }
}

function readPackage(name) {
  const v = view(`${name}@${version}`, 'version');
  if (!v.ok) return { name, state: /\bE404\b|404 Not Found/i.test(v.error ?? '') ? 'missing' : 'unknown', error: v.error };
  if (v.value !== version) return { name, state: 'unknown', error: `registry returned version ${JSON.stringify(v.value)} for ${name}@${version}` };
  const integrity = view(`${name}@${version}`, 'dist.integrity');
  const shasum = view(`${name}@${version}`, 'dist.shasum');
  const tagged = view(name, `dist-tags.${tag}`);
  if (!integrity.ok || !shasum.ok || !tagged.ok) {
    return {
      name, state: 'unknown',
      error: [integrity.error, shasum.error, tagged.error].filter(Boolean).join('; '),
    };
  }
  const local = localPacks[name];
  return {
    name, state: 'present', version: v.value, integrity: integrity.value, shasum: shasum.value,
    localIntegrity: local?.integrity ?? null, integrityMatches: local ? integrity.value === local.integrity : null,
    tag, tagged: tagged.value, tagMatches: tagged.value === version,
  };
}

function installCheckRun() {
  const root = mkdtempSync(path.join(tmpdir(), 'squad-pair-install-'));
  const prefix = path.join(root, 'prefix'); const home = path.join(root, 'home'); const rc = path.join(root, 'empty.npmrc');
  writeFileSync(rc, '');
  const env = { ...process.env, HOME: home, USERPROFILE: home, NPM_CONFIG_USERCONFIG: rc, NPM_CONFIG_CACHE: path.join(root, 'cache'), NODE_AUTH_TOKEN: '' };
  try {
    const r = spawnSync(npm, ['install', '-g', '--prefix', prefix, '--no-audit', '--no-fund', '--ignore-scripts', `--registry=${REGISTRY}`, `@bradygaster/squad-cli@${tag}`], { env, encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || '').slice(-800) };
    const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
    const cliPkg = JSON.parse(readFileSync(path.join(modules, '@bradygaster', 'squad-cli', 'package.json'), 'utf8'));
    const sdkPath = [path.join(modules, '@bradygaster', 'squad-sdk', 'package.json'), path.join(modules, '@bradygaster', 'squad-cli', 'node_modules', '@bradygaster', 'squad-sdk', 'package.json')].find(existsSync);
    const sdkPkg = sdkPath ? JSON.parse(readFileSync(sdkPath, 'utf8')) : null;
    const ver = spawnSync(process.execPath, [path.join(modules, '@bradygaster', 'squad-cli', 'dist', 'cli-entry.js'), '--version'], { env, encoding: 'utf8' });
    const ok = cliPkg.version === version && sdkPkg?.version === version && cliPkg.dependencies?.['@bradygaster/squad-sdk'] === version && (ver.stdout || '').includes(version);
    return { ok, cliVersion: cliPkg.version, sdkVersion: sdkPkg?.version ?? null, cliSdkDependency: cliPkg.dependencies?.['@bradygaster/squad-sdk'] ?? null, versionOutput: (ver.stdout || ver.stderr || '').trim().slice(0, 200) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 800) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const started = Date.now();
let attempt = 0; let packages; let delay = 10;
for (;;) {
  attempt += 1;
  packages = PACKAGES.map(readPackage);
  const settled = packages.every((p) => p.state === 'present' && p.integrityMatches !== false && p.tagMatches);
  const elapsed = (Date.now() - started) / 1000;
  console.log(`attempt ${attempt} (${Math.round(elapsed)}s): ${packages.map((p) => `${p.name.split('/')[1]}=${p.state}${p.state === 'present' ? `/${p.integrityMatches === false ? 'INTEGRITY-MISMATCH' : 'integrity-ok'}/${tag}=${p.tagged ?? '<unset>'}` : ''}`).join(' ')}`);
  if (settled) break;
  if (packages.some((p) => p.integrityMatches === false)) break; // never converges; fail fast
  if (elapsed + delay > maxWait) break;
  execFileSync(process.execPath, ['-e', `setTimeout(() => {}, ${delay * 1000})`]);
  delay = Math.min(delay * 2, 60);
}

const present = packages.filter((p) => p.state === 'present').length;
const unknown = packages.filter((p) => p.state === 'unknown').length;
const integrityBad = packages.some((p) => p.integrityMatches === false);
const allTagged = packages.every((p) => p.tagMatches);
let outcome;
if (present === PACKAGES.length && !integrityBad && allTagged) outcome = 'COMPLETE';
else if (unknown > 0 || (present === PACKAGES.length && !allTagged)) outcome = 'UNKNOWN';
else if (present > 0 && present < PACKAGES.length) outcome = 'PARTIAL_PUBLISH';
else if (integrityBad) outcome = 'INTEGRITY_MISMATCH';
else outcome = present === 0 ? 'NOT_PUBLISHED' : 'UNKNOWN';

let install = null;
if (installCheck && outcome === 'COMPLETE') {
  install = installCheckRun();
  if (!install.ok) outcome = 'UNKNOWN';
  console.log(`isolated-prefix install from @${tag}: ${install.ok ? 'ok' : 'FAILED'} ${JSON.stringify(install)}`);
}

const result = { version, tag, registry: REGISTRY, attempts: attempt, elapsedSeconds: Math.round((Date.now() - started) / 1000), maxWaitSeconds: maxWait, packages, installCheck: install, outcome, checkedAt: new Date().toISOString(),
  note: outcome === 'UNKNOWN' ? 'Registry reads did not confirm within the wait budget. This is an UNKNOWN outcome, not evidence of absence: re-run the publish workflow with the same inputs; it reconciles idempotently.' : outcome === 'PARTIAL_PUBLISH' ? 'Exactly one package of the pair is present at this version. Re-run the publish workflow with the same inputs to publish only the missing package.' : null };
if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
console.log(`${outcome === 'COMPLETE' ? '✅' : '❌'} pair verification on '${tag}': ${outcome}`);
if (classify) console.log(`outcome=${outcome}`);
process.exit(outcome === 'COMPLETE' ? 0 : 1);
