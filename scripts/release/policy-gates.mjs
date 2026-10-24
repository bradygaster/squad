#!/usr/bin/env node
/**
 * Release policy gates (fail closed, no bypass).
 *
 * The same checks Squad CI's "Policy Gates" job runs on pull requests, in a form the release
 * path can execute at the exact release SHA with no skip labels and no `SQUAD_*_CHECK`
 * repository-variable escape hatches:
 *
 *   workspace-integrity   root/SDK/CLI versions identical; lockfile workspace entries match;
 *                         no stale registry-resolved @bradygaster/squad-* entries; CLI->SDK
 *                         dependency floor is '>=<version>' for prereleases and has no
 *                         prerelease suffix for stable versions (package.json AND lockfile)
 *   prerelease-guard      every workspace version is X.Y.Z, X.Y.Z-preview.N or X.Y.Z-insider.N
 *   publish-policy        every `npm ... publish` is workspace-scoped or one of the two exact
 *                         verified tarball paths used by squad-npm-publish.yml
 *   publish-allowlist     the publishable workspaces are exactly @bradygaster/squad-sdk and
 *                         @bradygaster/squad-cli; the root stays private
 *   changelog-heading     CHANGELOG.md has `## [<version>]`; whatsnew has `## v<version>`
 *   changeset-drain       (release mode) no pending .changeset fragments remain
 *
 *   node scripts/release/policy-gates.mjs                 # PR/CI mode
 *   node scripts/release/policy-gates.mjs --mode=release  # also requires changesets drained
 *   node scripts/release/policy-gates.mjs --json
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PUBLISH_ALLOWLIST = Object.freeze(['@bradygaster/squad-sdk', '@bradygaster/squad-cli']);
export const PUBLISH_ALLOWLIST_DIRS = Object.freeze({ '@bradygaster/squad-sdk': 'packages/squad-sdk', '@bradygaster/squad-cli': 'packages/squad-cli' });
export const SANCTIONED_VERSION = /^\d+\.\d+\.\d+(-(preview|insider)(\.\d+)?)?$/;

// Mirrors test/publish-policy.test.ts and the awk program in squad-ci.yml.
const NPM_PUBLISH_COMMAND = /(?:^|&&|\|\||;)\s*(?:(?:if|then)\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*npm\s+[^#;&|]*\bpublish\b[^#;&|]*/;
const WORKSPACE_FLAG = /(?:^|\s)(?:-w|--workspace)(?:=|\s|$)/;
const VERIFIED_TARBALL = /npm\s+publish\s+"\$PACKS_DIR\/bradygaster-squad-(?:sdk|cli)-\$\{VERSION\}\.tgz"(?:\s|$)/;

const readJson = (root, rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

export function publishPolicyViolations(root = ROOT) {
  const dir = path.join(root, '.github', 'workflows');
  const out = [];
  for (const name of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const lines = readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const command = raw.trimStart().replace(/^-\s*/, '').replace(/^run:\s*/, '');
      if (command.startsWith('#')) return;
      const m = command.match(NPM_PUBLISH_COMMAND)?.[0];
      if (m !== undefined && !WORKSPACE_FLAG.test(m) && !VERIFIED_TARBALL.test(m)) out.push({ file: `.github/workflows/${name}`, line: i + 1, text: raw.trim() });
    });
  }
  return out;
}

/** @returns {{ version: string, gates: Array<{ id: string, ok: boolean, detail: string }> }} */
export function runPolicyGates({ root = ROOT, mode = 'ci' } = {}) {
  const gates = [];
  const gate = (id, ok, detail) => gates.push({ id, ok, detail });

  const rootPkg = readJson(root, 'package.json');
  const sdk = readJson(root, 'packages/squad-sdk/package.json');
  const cli = readJson(root, 'packages/squad-cli/package.json');
  const lock = readJson(root, 'package-lock.json');
  const version = rootPkg.version;

  // workspace-integrity
  {
    const problems = [];
    for (const [key, val] of Object.entries(lock.packages ?? {})) {
      if (key.includes('node_modules/@bradygaster/squad-') && val.resolved && /^https?:/.test(val.resolved)) problems.push(`stale registry entry ${key} -> ${val.resolved}`);
    }
    const expectedVersions = [
      ['package.json', rootPkg.version], ['packages/squad-sdk/package.json', sdk.version], ['packages/squad-cli/package.json', cli.version],
      ['package-lock.json .version', lock.version], ['package-lock.json packages[""]', lock.packages?.['']?.version],
      ['package-lock.json packages/squad-sdk', lock.packages?.['packages/squad-sdk']?.version], ['package-lock.json packages/squad-cli', lock.packages?.['packages/squad-cli']?.version],
    ];
    for (const [where, v] of expectedVersions) if (v !== version) problems.push(`${where} is '${v}', root is '${version}'`);
    const dep = cli.dependencies?.['@bradygaster/squad-sdk'];
    const lockDep = lock.packages?.['packages/squad-cli']?.dependencies?.['@bradygaster/squad-sdk'];
    if (version.includes('-')) {
      const expected = `>=${version}`;
      if (dep !== expected) problems.push(`CLI package.json SDK dependency is '${dep}', expected '${expected}'`);
      if (lockDep !== expected) problems.push(`lockfile CLI SDK dependency is '${lockDep}', expected '${expected}'`);
    } else {
      if (dep?.includes('-')) problems.push(`stable CLI SDK dependency '${dep}' retains a prerelease floor`);
      if (lockDep?.includes('-')) problems.push(`stable lockfile CLI SDK dependency '${lockDep}' retains a prerelease floor`);
    }
    gate('workspace-integrity', problems.length === 0, problems.length ? problems.join('; ') : `root, SDK, CLI and all lockfile workspace entries read ${version}; CLI->SDK ${dep}`);
  }

  // prerelease-guard
  {
    const bad = [];
    for (const dir of readdirSync(path.join(root, 'packages'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const p = path.join(root, 'packages', dir.name, 'package.json');
      if (!existsSync(p)) continue;
      const pkg = JSON.parse(readFileSync(p, 'utf8'));
      if (pkg.version && !SANCTIONED_VERSION.test(pkg.version)) bad.push(`${pkg.name}@${pkg.version}`);
    }
    gate('prerelease-guard', bad.length === 0, bad.length ? `unsanctioned prerelease versions: ${bad.join(', ')}` : `all workspace versions match ${SANCTIONED_VERSION}`);
  }

  // publish-policy
  {
    const v = publishPolicyViolations(root);
    gate('publish-policy', v.length === 0, v.length ? v.map((x) => `${x.file}:${x.line} ${x.text}`).join('; ') : 'every npm publish is workspace-scoped or one of the two exact verified tarball paths');
  }

  // publish-allowlist
  {
    const problems = [];
    if (rootPkg.private !== true) problems.push('root package.json must stay private');
    const publishable = [];
    for (const dir of readdirSync(path.join(root, 'packages'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const p = path.join(root, 'packages', dir.name, 'package.json');
      if (!existsSync(p)) continue;
      const pkg = JSON.parse(readFileSync(p, 'utf8'));
      if (pkg.private !== true) publishable.push({ name: pkg.name, dir: `packages/${dir.name}` });
    }
    for (const x of publishable) {
      if (!PUBLISH_ALLOWLIST.includes(x.name)) problems.push(`unexpected publishable workspace ${x.name} (${x.dir})`);
      else if (PUBLISH_ALLOWLIST_DIRS[x.name] !== x.dir) problems.push(`${x.name} lives in ${x.dir}, expected ${PUBLISH_ALLOWLIST_DIRS[x.name]}`);
    }
    for (const name of PUBLISH_ALLOWLIST) if (!publishable.some((x) => x.name === name)) problems.push(`allowlisted package ${name} is missing or private`);
    gate('publish-allowlist', problems.length === 0, problems.length ? problems.join('; ') : `publishable workspaces are exactly ${PUBLISH_ALLOWLIST.join(', ')}; root is private`);
  }

  // changelog-heading
  {
    const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const whatsnew = readFileSync(path.join(root, 'docs/src/content/docs/whatsnew.md'), 'utf8');
    const problems = [];
    if (!changelog.includes(`## [${version}]`)) problems.push(`CHANGELOG.md lacks '## [${version}]'`);
    if (!whatsnew.includes(`## v${version}`)) problems.push(`whatsnew.md lacks '## v${version}'`);
    gate('changelog-heading', problems.length === 0, problems.length ? problems.join('; ') : `CHANGELOG.md has '## [${version}]' and whatsnew has '## v${version}'`);
  }

  // changeset-drain (release mode only)
  if (mode === 'release') {
    const pending = readdirSync(path.join(root, '.changeset')).filter((f) => f.endsWith('.md') && f !== 'README.md');
    gate('changeset-drain', pending.length === 0, pending.length ? `pending changesets: ${pending.join(', ')}` : 'no pending changeset fragments');
  }

  return { version, mode, gates };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = (process.argv.find((a) => a.startsWith('--mode=')) ?? '--mode=ci').slice('--mode='.length);
  const result = runPolicyGates({ mode });
  const failed = result.gates.filter((g) => !g.ok);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...result, ok: failed.length === 0 }, null, 2));
  else {
    for (const g of result.gates) console.log(`${g.ok ? '✅' : '❌'} ${g.id}: ${g.detail}`);
    for (const g of failed) console.error(`::error::policy gate '${g.id}' failed: ${g.detail}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}
