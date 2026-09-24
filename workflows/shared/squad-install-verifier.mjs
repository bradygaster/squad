#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const PACKAGE_NAME = 'bradygaster/squad';
export const CONTRACT_SOURCE = 'workflows/squad-workflows.manifest.json';
export const CONTRACT_DESTINATION = '.github/aw/squad-workflows.manifest.json';
export const MIN_GH_AW_VERSION = 'v0.89.21';

export const WORKFLOW_NAMES = Object.freeze([
  'squad',
  'squad-implement-worker',
  'squad-review',
  'squad-deps-worker',
  'squad-retro',
  'squad-improvement-worker',
  'squad-bootstrap',
]);

const SHARED_FILES = Object.freeze([
  ['workflows/shared/squad-install-verifier.mjs', '.github/workflows/shared/squad-install-verifier.mjs', '.github/workflows/shared/squad-install-verifier.mjs'],
  ['workflows/shared/squad-cast-validator.mjs', '.github/workflows/shared/squad-cast-validator.mjs', '.github/workflows/shared/squad-cast-validator.mjs'],
  ['workflows/shared/squad-bootstrap-validator.mjs', '.github/workflows/shared/squad-bootstrap-validator.mjs', '.github/workflows/shared/squad-bootstrap-validator.mjs'],
  ['workflows/shared/squad-improvement-gate.mjs', '.github/workflows/shared/squad-improvement-gate.mjs', '.github/workflows/shared/squad-improvement-gate.mjs'],
  ['workflows/shared/squad-retro-evidence.mjs', '.github/workflows/shared/squad-retro-evidence.mjs', '.github/workflows/shared/squad-retro-evidence.mjs'],
  ['workflows/shared/squad-retro-provenance.mjs', '.github/workflows/shared/squad-retro-provenance.mjs', '.github/workflows/shared/squad-retro-provenance.mjs'],
  ['workflows/shared/squad-implementation-provenance.mjs', '.github/workflows/shared/squad-implementation-provenance.mjs', '.github/workflows/shared/squad-implementation-provenance.mjs'],
  ['workflows/shared/squad.md', '.github/aw/squad/runtime/shared/squad.md', '.github/workflows/shared/squad.md'],
  ['workflows/shared/squad-planning-ontology.md', '.github/aw/squad/runtime/shared/squad-planning-ontology.md', '.github/workflows/shared/squad-planning-ontology.md'],
  ['workflows/shared/squad-planning-policy.md', '.github/aw/squad/runtime/shared/squad-planning-policy.md', '.github/workflows/shared/squad-planning-policy.md'],
  ['workflows/shared/implementation-provenance-v1.schema.json', '.github/aw/squad/runtime/shared/implementation-provenance-v1.schema.json', '.github/workflows/shared/implementation-provenance-v1.schema.json'],
  ['workflows/shared/builtins/scribe-charter.md', '.github/aw/squad/runtime/shared/builtins/scribe-charter.md', '.github/workflows/shared/builtins/scribe-charter.md'],
  ['workflows/shared/builtins/ralph-charter.md', '.github/aw/squad/runtime/shared/builtins/ralph-charter.md', '.github/workflows/shared/builtins/ralph-charter.md'],
  ['workflows/shared/builtins/rai-charter.md', '.github/aw/squad/runtime/shared/builtins/rai-charter.md', '.github/workflows/shared/builtins/rai-charter.md'],
  ['workflows/shared/builtins/fact-checker-charter.md', '.github/aw/squad/runtime/shared/builtins/fact-checker-charter.md', '.github/workflows/shared/builtins/fact-checker-charter.md'],
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sourceEntry(root, source, destination, ownership) {
  const path = resolve(root, source);
  if (!existsSync(path)) {
    throw new Error(`Package source is missing: ${source}`);
  }
  return {
    source,
    destination,
    ownership,
    sha256: fileSha256(path),
  };
}

function splitWorkflow(content, path) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return { frontmatter: '', body: content };
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error(`Workflow source has unterminated frontmatter: ${path}`);
  return {
    frontmatter: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
  };
}

function deepMerge(base, overlay) {
  if (
    base && overlay &&
    typeof base === 'object' && !Array.isArray(base) &&
    typeof overlay === 'object' && !Array.isArray(overlay)
  ) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      merged[key] = key in merged ? deepMerge(merged[key], value) : value;
    }
    return merged;
  }
  return overlay;
}

function renderPackageWorkflow(root, name) {
  const require = createRequire(import.meta.url);
  const { parse, stringify } = require('yaml');
  const sourcePath = `workflows/${name}.md`;
  const source = splitWorkflow(readFileSync(resolve(root, sourcePath), 'utf8'), sourcePath);
  const parsed = parse(source.frontmatter);
  const imports = Array.isArray(parsed.imports) ? parsed.imports : [];
  delete parsed.imports;
  let merged = {};
  const importedBodies = [];
  for (const importPath of imports) {
    const imported = splitWorkflow(
      readFileSync(resolve(root, 'workflows', importPath), 'utf8'),
      `workflows/${importPath}`,
    );
    if (imported.frontmatter) merged = deepMerge(merged, parse(imported.frontmatter));
    if (imported.body.trim()) {
      importedBodies.push(
        `<!-- squad-package-import: ${importPath} -->\n${imported.body.trimEnd()}`,
      );
    }
  }
  merged = deepMerge(merged, parsed);
  const frontmatter = stringify(merged, { lineWidth: 0 }).trimEnd();
  return [
    '---',
    frontmatter,
    '---',
    '',
    '<!-- Generated by the Squad integrity tool. Edit workflows/*.md and run npm run gh-aw:integrity:write. -->',
    ...importedBodies,
    source.body.trimStart(),
  ].join('\n');
}

function packageWorkflowSource(root, name) {
  const source = splitWorkflow(
    readFileSync(resolve(root, `workflows/${name}.md`), 'utf8'),
    `workflows/${name}.md`,
  );
  const require = createRequire(import.meta.url);
  const { parse } = require('yaml');
  return Array.isArray(parse(source.frontmatter).imports)
    ? `workflows/package/${name}.md`
    : `workflows/${name}.md`;
}

export function buildContract(root) {
  return {
    schema_version: 1,
    package: PACKAGE_NAME,
    manifest: 'aw.yml',
    minimum_gh_aw_version: MIN_GH_AW_VERSION,
    revision_policy: {
      kind: 'immutable-git-commit',
      pattern: '^[0-9a-f]{40}$',
      requirement: 'Install and update the complete package from one resolved 40-character commit SHA.',
    },
    workflows: WORKFLOW_NAMES.map((name) => {
      const source = packageWorkflowSource(root, name);
      const content = source.startsWith('workflows/package/')
        ? renderPackageWorkflow(root, name)
        : readFileSync(resolve(root, source));
      return {
        name,
        source,
        destination: `.github/workflows/${name}.md`,
        lock: `.github/workflows/${name}.lock.yml`,
        source_sha256: sha256(content),
      };
    }),
    shared_runtime: SHARED_FILES.map(([source, packageDestination, destination]) => {
      const entry = sourceEntry(root, source, packageDestination, 'manifest');
      return {
        path: source.replace(/^workflows\//, ''),
        source: entry.source,
        package_destination: entry.destination,
        destination,
        ownership: 'manifest',
        sha256: entry.sha256,
      };
    }),
    skills: [],
    bootstrap: {
      trigger_probe: 'shared/squad-install-verifier.mjs',
    },
  };
}

export function renderManifest(root = process.cwd()) {
  const includes = WORKFLOW_NAMES
    .map((name) => `  - source: ${packageWorkflowSource(root, name)}\n    destination: .github/workflows/${name}.md`)
    .join('\n');
  const resources = SHARED_FILES
    .map(([source, packageDestination]) => `  - source: ${source}\n    destination: ${packageDestination}`)
    .concat([
      `  - source: ${CONTRACT_SOURCE}\n    destination: ${CONTRACT_DESTINATION}`,
    ])
    .join('\n');
  return `manifest-version: "1"
min-version: ${MIN_GH_AW_VERSION}
name: Squad Agentic Workflows
emoji: "🤖"
description: Complete, integrity-checked Squad workflow bundle for issue-driven planning and implementation.
license: MIT
includes:
${includes}
resources:
${resources}
`;
}

function generatedFiles(root) {
  return new Map([
    ...WORKFLOW_NAMES
      .filter((name) => packageWorkflowSource(root, name).startsWith('workflows/package/'))
      .map((name) => [
        resolve(root, `workflows/package/${name}.md`),
        renderPackageWorkflow(root, name),
      ]),
    [resolve(root, 'aw.yml'), renderManifest(root)],
    [resolve(root, CONTRACT_SOURCE), stableJson(buildContract(root))],
  ]);
}

function expectedEmbeddedDigests(root) {
  return {
    cast: fileSha256(resolve(root, 'workflows/shared/squad-cast-validator.mjs')),
    bootstrap: fileSha256(resolve(root, 'workflows/shared/squad-bootstrap-validator.mjs')),
  };
}

function updateEmbeddedDigests(root) {
  const digests = expectedEmbeddedDigests(root);
  const dispatcherPath = resolve(root, 'workflows/squad.md');
  const dispatcher = readFileSync(dispatcherPath, 'utf8').replace(
    /(# BEGIN GENERATED RESOURCE DIGEST\n\s*validator_expected_sha256=")[0-9a-f]{64}("\n\s*# END GENERATED RESOURCE DIGEST)/,
    `$1${digests.cast}$2`,
  );
  writeFileSync(dispatcherPath, dispatcher);

  const bootstrapPath = resolve(root, 'workflows/squad-bootstrap.md');
  const bootstrap = readFileSync(bootstrapPath, 'utf8')
    .replace(
      /(check_hash "\$cast_validator" ")[0-9a-f]{64}(")/,
      `$1${digests.cast}$2`,
    )
    .replace(
      /(check_hash "\$bootstrap_validator" ")[0-9a-f]{64}(")/,
      `$1${digests.bootstrap}$2`,
    );
  writeFileSync(bootstrapPath, bootstrap);
}

function checkEmbeddedDigests(root) {
  const failures = [];
  const digests = expectedEmbeddedDigests(root);
  const dispatcher = readFileSync(resolve(root, 'workflows/squad.md'), 'utf8');
  if (!dispatcher.includes(`validator_expected_sha256="${digests.cast}"`)) {
    failures.push('Generated Cast validator digest is stale in workflows/squad.md.');
  }
  const bootstrap = readFileSync(resolve(root, 'workflows/squad-bootstrap.md'), 'utf8');
  if (!bootstrap.includes(`check_hash "$cast_validator" "${digests.cast}"`)) {
    failures.push('Generated Cast validator digest is stale in workflows/squad-bootstrap.md.');
  }
  if (!bootstrap.includes(`check_hash "$bootstrap_validator" "${digests.bootstrap}"`)) {
    failures.push('Generated bootstrap validator digest is stale in workflows/squad-bootstrap.md.');
  }
  return failures;
}

export function writeSource(root) {
  updateEmbeddedDigests(root);
  for (const [path, content] of generatedFiles(root)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

export function checkSource(root) {
  const failures = checkEmbeddedDigests(root);
  for (const [path, expected] of generatedFiles(root)) {
    if (!existsSync(path)) {
      failures.push(`Generated package file is missing: ${relative(root, path)}`);
      continue;
    }
    const actual = readFileSync(path, 'utf8');
    if (actual !== expected) {
      failures.push(
        `Generated package file is stale: ${relative(root, path)} (run: npm run gh-aw:integrity:write)`,
      );
    }
  }
  return failures;
}

function validateContractShape(contract) {
  const failures = [];
  if (contract?.schema_version !== 1) failures.push('Integrity contract schema_version must be 1.');
  if (contract?.package !== PACKAGE_NAME) failures.push(`Integrity contract package must be ${PACKAGE_NAME}.`);
  const names = Array.isArray(contract?.workflows)
    ? contract.workflows.map((entry) => entry.name)
    : [];
  if (JSON.stringify(names) !== JSON.stringify(WORKFLOW_NAMES)) {
    failures.push(`Integrity contract must register exactly these workflows in order: ${WORKFLOW_NAMES.join(', ')}.`);
  }
  return failures;
}

function findOwnershipRecord(root) {
  const packageDir = resolve(root, '.github/aw/packages');
  if (!existsSync(packageDir)) return { failure: 'Package ownership metadata is missing under .github/aw/packages/.' };
  const matches = [];
  for (const name of readdirSync(packageDir)) {
    if (!name.endsWith('.json')) continue;
    const path = join(packageDir, name);
    try {
      const record = JSON.parse(readFileSync(path, 'utf8'));
      if (record.package === PACKAGE_NAME) matches.push({ path, record });
    } catch {
      // Invalid unrelated records are outside this package contract.
    }
  }
  if (matches.length !== 1) {
    return {
      failure: `Expected exactly one ${PACKAGE_NAME} ownership record; found ${matches.length}.`,
    };
  }
  return matches[0];
}

function verifyOwnership(root, contract, expectedRevision) {
  const result = findOwnershipRecord(root);
  if (result.failure) return { failures: [result.failure], revision: expectedRevision || '' };
  const { record } = result;
  const failures = [];
  const revision = record.resolvedCommit || '';
  if (!SHA_PATTERN.test(revision)) {
    failures.push(`Package ownership resolvedCommit must be one immutable 40-character SHA; got "${revision || '<empty>'}".`);
  }
  if (expectedRevision && revision !== expectedRevision) {
    failures.push(`Package revision mismatch: expected ${expectedRevision}, ownership records ${revision || '<empty>'}.`);
  }
  if (record.source !== `${PACKAGE_NAME}@${revision}`) {
    failures.push(`Package ownership source must be ${PACKAGE_NAME}@${revision || '<40-character-sha>'}.`);
  }

  const ownershipEntries = new Map(
    Array.isArray(record.files) ? record.files.map((entry) => [entry.destination, entry]) : [],
  );
  const contractDigest = fileSha256(resolve(root, CONTRACT_DESTINATION));
  for (const expected of [
    ...contract.workflows,
    ...contract.shared_runtime.map((entry) => ({
      source: entry.source,
      destination: entry.package_destination,
    })),
    ...contract.skills,
    {
      source: CONTRACT_SOURCE,
      destination: CONTRACT_DESTINATION,
      sha256: contractDigest,
    },
  ]) {
    const owned = ownershipEntries.get(expected.destination);
    if (!owned) {
      failures.push(`Package ownership is missing ${expected.destination}.`);
      continue;
    }
    if (owned.source !== expected.source) {
      failures.push(`Package ownership source mismatch for ${expected.destination}: expected ${expected.source}, got ${owned.source}.`);
    }
    const path = resolve(root, expected.destination);
    if (!existsSync(path)) {
      failures.push(`Package-owned file is missing: ${expected.destination}.`);
      continue;
    }
    const actual = fileSha256(path);
    if (owned.sha256 !== actual) {
      failures.push(`Package ownership digest is stale for ${expected.destination}: recorded ${owned.sha256}, actual ${actual}.`);
    }
  }
  return { failures, revision };
}

function verifyInstalledBytes(root, contract) {
  const failures = [];
  for (const entry of [...contract.workflows, ...contract.skills]) {
    const path = resolve(root, entry.destination);
    if (!existsSync(path)) {
      failures.push(`Required installed file is missing: ${entry.destination}.`);
      continue;
    }
    const expected = entry.source_sha256 || entry.sha256;
    const actual = fileSha256(path);
    if (actual !== expected) {
      failures.push(`Installed digest mismatch for ${entry.destination}: expected ${expected}, got ${actual}.`);
    }
  }
  for (const entry of contract.shared_runtime) {
    for (const destination of new Set([entry.package_destination, entry.destination])) {
      const path = resolve(root, destination);
      if (!existsSync(path)) {
        failures.push(`Required installed file is missing: ${destination}.`);
        continue;
      }
      const actual = fileSha256(path);
      if (actual !== entry.sha256) {
        failures.push(`Installed digest mismatch for ${destination}: expected ${entry.sha256}, got ${actual}.`);
      }
    }
  }
  for (const name of WORKFLOW_NAMES) {
    const lock = `.github/workflows/${name}.lock.yml`;
    if (!existsSync(resolve(root, lock))) failures.push(`Required generated lock is missing: ${lock}.`);
  }
  return failures;
}

function strictCompileMatches(root) {
  const failures = [];
  const scratch = mkdtempSync(join(tmpdir(), 'squad-gh-aw-verify-'));
  try {
    cpSync(resolve(root, '.github'), resolve(scratch, '.github'), { recursive: true });
    spawnSync('git', ['init', '--quiet'], { cwd: scratch, encoding: 'utf8' });
    spawnSync(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/example/squad-consumer.git'],
      { cwd: scratch, encoding: 'utf8' },
    );
    const before = new Map();
    for (const name of WORKFLOW_NAMES) {
      const lock = resolve(scratch, `.github/workflows/${name}.lock.yml`);
      if (existsSync(lock)) before.set(name, readFileSync(lock));
    }
    const ghAwBin = process.env.SQUAD_GH_AW_BIN;
    const compile = spawnSync(
      ghAwBin || 'gh',
      ghAwBin
        ? ['compile', '--strict', '--no-check-update']
        : ['aw', 'compile', '--strict', '--no-check-update'],
      { cwd: scratch, encoding: 'utf8' },
    );
    if (compile.status !== 0) {
      failures.push(`Strict compilation failed:\n${compile.stdout}${compile.stderr}`.trim());
      return failures;
    }
    for (const name of WORKFLOW_NAMES) {
      const lock = resolve(scratch, `.github/workflows/${name}.lock.yml`);
      if (!existsSync(lock)) {
        failures.push(`Strict compilation did not emit .github/workflows/${name}.lock.yml.`);
        continue;
      }
      if (!before.has(name) || !before.get(name).equals(readFileSync(lock))) {
        failures.push(`Generated lock is stale for ${name}; rerun gh aw compile --strict and review the diff.`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return failures;
}

function recoveryMessage(revision) {
  const ref = SHA_PATTERN.test(revision) ? revision : '<40-character-squad-commit-sha>';
  return [
    'Safe recovery:',
    `  gh aw add ${PACKAGE_NAME}@${ref} --force`,
    '  gh aw compile --strict',
    '  node .github/workflows/shared/squad-install-verifier.mjs --verify-install --strict-compile',
  ].join('\n');
}

export function verifyInstall(root, { expectedRevision = '', strictCompile = false } = {}) {
  const failures = [];
  const contractPath = resolve(root, CONTRACT_DESTINATION);
  if (!existsSync(contractPath)) {
    return {
      failures: [`Integrity contract is missing: ${CONTRACT_DESTINATION}.`],
      revision: expectedRevision,
    };
  }
  let contract;
  try {
    contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  } catch (error) {
    return {
      failures: [`Integrity contract is invalid JSON: ${error.message}`],
      revision: expectedRevision,
    };
  }
  failures.push(...validateContractShape(contract));
  failures.push(...verifyInstalledBytes(root, contract));
  const ownership = verifyOwnership(root, contract, expectedRevision);
  failures.push(...ownership.failures);
  if (strictCompile && failures.length === 0) failures.push(...strictCompileMatches(root));
  return { failures, revision: ownership.revision || expectedRevision };
}

export function verifyResource(root, destination) {
  const contract = JSON.parse(readFileSync(resolve(root, CONTRACT_DESTINATION), 'utf8'));
  const entry = [...contract.shared_runtime, ...contract.workflows, ...contract.skills]
    .find((candidate) => candidate.destination === destination);
  if (!entry) throw new Error(`Resource is not registered in the Squad integrity contract: ${destination}`);
  const path = resolve(root, destination);
  if (!existsSync(path)) throw new Error(`Registered Squad resource is missing: ${destination}`);
  const actual = fileSha256(path);
  const expected = entry.source_sha256 || entry.sha256;
  if (actual !== expected) {
    throw new Error(`Squad resource digest mismatch for ${destination}: expected ${expected}, got ${actual}`);
  }
  return actual;
}

export function materializeRuntime(root) {
  const contract = JSON.parse(readFileSync(resolve(root, CONTRACT_DESTINATION), 'utf8'));
  const failures = validateContractShape(contract);
  if (failures.length > 0) throw new Error(failures.join('\n'));
  for (const entry of contract.shared_runtime) {
    const source = resolve(root, entry.package_destination);
    const destination = resolve(root, entry.destination);
    if (!existsSync(source)) {
      throw new Error(`Package-owned runtime source is missing: ${entry.package_destination}`);
    }
    const actual = fileSha256(source);
    if (actual !== entry.sha256) {
      throw new Error(`Package-owned runtime digest mismatch for ${entry.package_destination}`);
    }
    if (source === destination) continue;
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(source));
  }
}

export function writeLocalTestOwnership(root, revision) {
  if (!SHA_PATTERN.test(revision)) throw new Error('Local test revision must be a 40-character SHA.');
  const contract = JSON.parse(readFileSync(resolve(root, CONTRACT_DESTINATION), 'utf8'));
  const entries = [
    ...contract.workflows.map((entry) => ({ source: entry.source, destination: entry.destination })),
    ...contract.shared_runtime.map((entry) => ({
      source: entry.source,
      destination: entry.package_destination,
    })),
    ...contract.skills.map((entry) => ({ source: entry.source, destination: entry.destination })),
    { source: CONTRACT_SOURCE, destination: CONTRACT_DESTINATION },
  ].map((entry) => ({
    ...entry,
    sha256: fileSha256(resolve(root, entry.destination)),
  }));
  const path = resolve(root, '.github/aw/packages/bradygaster-squad-local-test.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableJson({
    schemaVersion: 1,
    package: PACKAGE_NAME,
    source: `${PACKAGE_NAME}@${revision}`,
    resolvedCommit: revision,
    installer: 'gh-aw local package contract test',
    files: entries,
  }));
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : '';
}

export function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const root = resolve(optionValue(argv, '--root') || cwd);
  if (argv.includes('--write-source')) {
    writeSource(root);
    console.log(`Updated aw.yml, ${CONTRACT_SOURCE}, and standalone package workflows from committed bytes.`);
    return 0;
  }
  if (argv.includes('--check-source')) {
    const failures = checkSource(root);
    if (failures.length > 0) {
      console.error(failures.join('\n'));
      return 1;
    }
    console.log('Squad gh-aw package manifest and digests are current.');
    return 0;
  }
  if (argv.includes('--materialize-runtime')) {
    try {
      materializeRuntime(root);
      console.log('Materialized verified Squad runtime resources.');
      return 0;
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }
  if (argv.includes('--write-local-test-ownership')) {
    try {
      writeLocalTestOwnership(root, optionValue(argv, '--source-revision'));
      console.log('Wrote local-package ownership metadata for contract testing.');
      return 0;
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }
  if (argv.includes('--verify-resource')) {
    const destination = optionValue(argv, '--verify-resource');
    if (!destination) {
      console.error('--verify-resource requires a repository-relative destination.');
      return 2;
    }
    try {
      console.log(verifyResource(root, destination));
      return 0;
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }
  if (argv.includes('--verify-install')) {
    const expectedRevision = optionValue(argv, '--source-revision');
    if (expectedRevision && !SHA_PATTERN.test(expectedRevision)) {
      console.error('--source-revision must be a lowercase 40-character commit SHA.');
      return 2;
    }
    const result = verifyInstall(root, {
      expectedRevision,
      strictCompile: argv.includes('--strict-compile'),
    });
    if (result.failures.length > 0) {
      console.error('Squad gh-aw installation is incomplete, stale, or incoherent:');
      for (const failure of result.failures) console.error(`- ${failure}`);
      console.error(recoveryMessage(result.revision));
      return 1;
    }
    console.log(`Squad gh-aw installation verified at ${result.revision}.`);
    return 0;
  }
  console.error(
    'Usage: squad-install-verifier.mjs --check-source|--write-source|--materialize-runtime|--verify-install|--verify-resource <path>',
  );
  return 2;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = run();
