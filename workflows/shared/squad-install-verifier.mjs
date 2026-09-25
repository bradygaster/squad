#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const PACKAGE_NAME = 'bradygaster/squad/workflows';
export const PACKAGE_MANIFEST = 'workflows/aw.yml';
export const CONTRACT_SOURCE = 'workflows/squad-workflows.manifest.json';
export const CONTRACT_DESTINATION = '.github/aw/squad-workflows.manifest.json';
export const MIN_GH_AW_VERSION = 'v0.89.21';
export const OWNERSHIP_ENTRY_COUNT = 23;
export const OWNERSHIP_DESTINATION =
  '.github/aw/packages/bradygaster-squad-workflows-3632054824e8.json';
export const TRIGGER_PROBE = 'shared/squad-bootstrap-trigger-probe.json';
export const TRIGGER_PROBE_DESTINATION =
  '.github/workflows/shared/squad-bootstrap-trigger-probe.json';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export const WORKFLOW_TUPLES = deepFreeze([
  ['squad', 'workflows/package/squad.md', '.github/workflows/squad.md', '.github/workflows/squad.lock.yml'],
  ['squad-implement-worker', 'workflows/package/squad-implement-worker.md', '.github/workflows/squad-implement-worker.md', '.github/workflows/squad-implement-worker.lock.yml'],
  ['squad-review', 'workflows/package/squad-review.md', '.github/workflows/squad-review.md', '.github/workflows/squad-review.lock.yml'],
  ['squad-deps-worker', 'workflows/package/squad-deps-worker.md', '.github/workflows/squad-deps-worker.md', '.github/workflows/squad-deps-worker.lock.yml'],
  ['squad-retro', 'workflows/package/squad-retro.md', '.github/workflows/squad-retro.md', '.github/workflows/squad-retro.lock.yml'],
  ['squad-improvement-worker', 'workflows/package/squad-improvement-worker.md', '.github/workflows/squad-improvement-worker.md', '.github/workflows/squad-improvement-worker.lock.yml'],
  ['squad-bootstrap', 'workflows/package/squad-bootstrap.md', '.github/workflows/squad-bootstrap.md', '.github/workflows/squad-bootstrap.lock.yml'],
]);

export const RUNTIME_TUPLES = deepFreeze([
  ['shared/squad-install-verifier.mjs', 'workflows/shared/squad-install-verifier.mjs', '.github/workflows/shared/squad-install-verifier.mjs', '.github/workflows/shared/squad-install-verifier.mjs', 'manifest'],
  ['shared/squad-cast-validator.mjs', 'workflows/shared/squad-cast-validator.mjs', '.github/workflows/shared/squad-cast-validator.mjs', '.github/workflows/shared/squad-cast-validator.mjs', 'manifest'],
  ['shared/squad-bootstrap-validator.mjs', 'workflows/shared/squad-bootstrap-validator.mjs', '.github/workflows/shared/squad-bootstrap-validator.mjs', '.github/workflows/shared/squad-bootstrap-validator.mjs', 'manifest'],
  ['shared/squad-improvement-gate.mjs', 'workflows/shared/squad-improvement-gate.mjs', '.github/workflows/shared/squad-improvement-gate.mjs', '.github/workflows/shared/squad-improvement-gate.mjs', 'manifest'],
  ['shared/squad-retro-evidence.mjs', 'workflows/shared/squad-retro-evidence.mjs', '.github/workflows/shared/squad-retro-evidence.mjs', '.github/workflows/shared/squad-retro-evidence.mjs', 'manifest'],
  ['shared/squad-retro-provenance.mjs', 'workflows/shared/squad-retro-provenance.mjs', '.github/workflows/shared/squad-retro-provenance.mjs', '.github/workflows/shared/squad-retro-provenance.mjs', 'manifest'],
  ['shared/squad-implementation-provenance.mjs', 'workflows/shared/squad-implementation-provenance.mjs', '.github/workflows/shared/squad-implementation-provenance.mjs', '.github/workflows/shared/squad-implementation-provenance.mjs', 'manifest'],
  ['shared/squad.md', 'workflows/shared/squad.md', '.github/aw/squad/runtime/shared/squad.md', '.github/workflows/shared/squad.md', 'manifest'],
  ['shared/squad-planning-ontology.md', 'workflows/shared/squad-planning-ontology.md', '.github/aw/squad/runtime/shared/squad-planning-ontology.md', '.github/workflows/shared/squad-planning-ontology.md', 'manifest'],
  ['shared/squad-planning-policy.md', 'workflows/shared/squad-planning-policy.md', '.github/aw/squad/runtime/shared/squad-planning-policy.md', '.github/workflows/shared/squad-planning-policy.md', 'manifest'],
  ['shared/implementation-provenance-v1.schema.json', 'workflows/shared/implementation-provenance-v1.schema.json', '.github/aw/squad/runtime/shared/implementation-provenance-v1.schema.json', '.github/workflows/shared/implementation-provenance-v1.schema.json', 'manifest'],
  ['shared/builtins/scribe-charter.md', 'workflows/shared/builtins/scribe-charter.md', '.github/aw/squad/runtime/shared/builtins/scribe-charter.md', '.github/workflows/shared/builtins/scribe-charter.md', 'manifest'],
  ['shared/builtins/ralph-charter.md', 'workflows/shared/builtins/ralph-charter.md', '.github/aw/squad/runtime/shared/builtins/ralph-charter.md', '.github/workflows/shared/builtins/ralph-charter.md', 'manifest'],
  ['shared/builtins/rai-charter.md', 'workflows/shared/builtins/rai-charter.md', '.github/aw/squad/runtime/shared/builtins/rai-charter.md', '.github/workflows/shared/builtins/rai-charter.md', 'manifest'],
  ['shared/builtins/fact-checker-charter.md', 'workflows/shared/builtins/fact-checker-charter.md', '.github/aw/squad/runtime/shared/builtins/fact-checker-charter.md', '.github/workflows/shared/builtins/fact-checker-charter.md', 'manifest'],
]);

export const SKILL_TUPLES = deepFreeze([
  ['gh-aw-enlistment', 'workflows/skills/gh-aw-enlistment/SKILL.md', '.github/skills/gh-aw-enlistment/SKILL.md'],
]);

export const WORKFLOW_NAMES = Object.freeze(WORKFLOW_TUPLES.map(([name]) => name));

const TOP_LEVEL_KEYS = deepFreeze([
  'schema_version',
  'package',
  'manifest',
  'minimum_gh_aw_version',
  'revision_policy',
  'workflows',
  'shared_runtime',
  'skills',
  'bootstrap',
]);
const REVISION_POLICY = deepFreeze({
  kind: 'immutable-git-commit',
  pattern: '^[0-9a-f]{40}$',
  requirement: 'Install and update the complete package from one resolved 40-character commit SHA.',
});

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function validatePathSyntax(value, expected, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty path.`);
  }
  if (value !== value.normalize('NFC')) throw new Error(`${label} must use NFC normalization.`);
  if (value.includes('\0') || value.includes('\\')) throw new Error(`${label} contains an unsafe character.`);
  if (isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.startsWith('//')) {
    throw new Error(`${label} must be a POSIX repository-relative path.`);
  }
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..') || value.endsWith('/')) {
    throw new Error(`${label} contains an unsafe path segment.`);
  }
  if (parts.join('/') !== value) throw new Error(`${label} is not normalized.`);
  if (expected !== undefined && value !== expected) {
    throw new Error(`${label} must be exactly ${expected}.`);
  }
}

function assertKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields must be exactly ${expected.join(', ')} in order.`);
  }
}

function assertArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain exactly ${length} entries.`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}

export function validateContract(contract) {
  assertKeys(contract, TOP_LEVEL_KEYS, 'Integrity contract');
  if (contract.schema_version !== 1) throw new Error('Integrity contract schema_version must be 1.');
  if (contract.package !== PACKAGE_NAME) throw new Error(`Integrity contract package must be ${PACKAGE_NAME}.`);
  if (contract.manifest !== PACKAGE_MANIFEST) throw new Error(`Integrity contract manifest must be ${PACKAGE_MANIFEST}.`);
  if (contract.minimum_gh_aw_version !== MIN_GH_AW_VERSION) {
    throw new Error(`Integrity contract minimum_gh_aw_version must be ${MIN_GH_AW_VERSION}.`);
  }
  if (JSON.stringify(contract.revision_policy) !== JSON.stringify(REVISION_POLICY)) {
    throw new Error('Integrity contract revision_policy does not match the trusted policy.');
  }

  assertArray(contract.workflows, WORKFLOW_TUPLES.length, 'Integrity contract workflows');
  contract.workflows.forEach((entry, index) => {
    assertKeys(entry, ['name', 'source', 'destination', 'lock', 'source_sha256'], `Workflow entry ${index}`);
    const [name, source, destination, lock] = WORKFLOW_TUPLES[index];
    if (entry.name !== name) throw new Error(`Workflow entry ${index} name must be ${name}.`);
    validatePathSyntax(entry.source, source, `Workflow ${name} source`);
    validatePathSyntax(entry.destination, destination, `Workflow ${name} destination`);
    validatePathSyntax(entry.lock, lock, `Workflow ${name} lock`);
    assertDigest(entry.source_sha256, `Workflow ${name} source_sha256`);
  });

  assertArray(contract.shared_runtime, RUNTIME_TUPLES.length, 'Integrity contract shared_runtime');
  contract.shared_runtime.forEach((entry, index) => {
    assertKeys(
      entry,
      ['path', 'source', 'package_destination', 'destination', 'ownership', 'sha256'],
      `Runtime entry ${index}`,
    );
    const [path, source, packageDestination, destination, ownership] = RUNTIME_TUPLES[index];
    validatePathSyntax(entry.path, path, `Runtime ${index} path`);
    validatePathSyntax(entry.source, source, `Runtime ${index} source`);
    validatePathSyntax(entry.package_destination, packageDestination, `Runtime ${index} package_destination`);
    validatePathSyntax(entry.destination, destination, `Runtime ${index} destination`);
    if (entry.ownership !== ownership) {
      throw new Error(`Runtime ${index} ownership must be ${ownership}.`);
    }
    assertDigest(entry.sha256, `Runtime ${index} sha256`);
  });

  assertArray(contract.skills, SKILL_TUPLES.length, 'Integrity contract skills');
  contract.skills.forEach((entry, index) => {
    assertKeys(entry, ['name', 'source', 'destination', 'sha256'], `Skill entry ${index}`);
    const [name, source, destination] = SKILL_TUPLES[index];
    if (entry.name !== name) throw new Error(`Skill entry ${index} name must be ${name}.`);
    validatePathSyntax(entry.source, source, `Skill ${name} source`);
    validatePathSyntax(entry.destination, destination, `Skill ${name} destination`);
    assertDigest(entry.sha256, `Skill ${name} sha256`);
  });

  assertKeys(contract.bootstrap, ['trigger_probe'], 'Integrity contract bootstrap');
  validatePathSyntax(contract.bootstrap.trigger_probe, TRIGGER_PROBE, 'bootstrap.trigger_probe');

  const destinations = [
    ...contract.workflows.flatMap((entry) => [entry.destination, entry.lock]),
    ...contract.shared_runtime.flatMap((entry) => [entry.package_destination, entry.destination]),
    ...contract.skills.map((entry) => entry.destination),
    CONTRACT_DESTINATION,
  ];
  if (new Set(destinations).size !== destinations.length - 7) {
    throw new Error('Integrity contract contains a duplicated or aliased destination.');
  }
  return contract;
}

function safePath(root, relativePath) {
  validatePathSyntax(relativePath, undefined, relativePath);
  const absoluteRoot = realpathSync(resolve(root));
  const candidate = resolve(absoluteRoot, relativePath);
  if (candidate !== absoluteRoot && !candidate.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  let current = absoluteRoot;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) break;
    if (stat.isSymbolicLink()) throw new Error(`Path contains a symbolic link: ${relativePath}`);
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(`Path parent is not a directory: ${relativePath}`);
    }
  }
  return candidate;
}

function readRequired(root, relativePath) {
  const path = safePath(root, relativePath);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) throw new Error(`Required file is missing: ${relativePath}`);
  if (!stat.isFile()) throw new Error(`Required path is not a regular file: ${relativePath}`);
  return readFileSync(path);
}

function writePath(root, relativePath, content) {
  let path = safePath(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  path = safePath(root, relativePath);
  const existing = lstatSync(path, { throwIfNoEntry: false });
  if (existing && !existing.isFile()) {
    throw new Error(`Write destination is not a regular file: ${relativePath}`);
  }
  writeFileSync(path, content);
  if (!lstatSync(path).isFile()) {
    throw new Error(`Written destination is not a regular file: ${relativePath}`);
  }
}

function fileDigest(root, path) {
  return sha256(readRequired(root, path));
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
  if (base && overlay && typeof base === 'object' && !Array.isArray(base)
    && typeof overlay === 'object' && !Array.isArray(overlay)) {
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
      importedBodies.push(`<!-- squad-package-import: ${importPath} -->\n${imported.body.trimEnd()}`);
    }
  }
  merged = deepMerge(merged, parsed);
  delete merged.resources;
  return [
    '---',
    stringify(merged, { lineWidth: 0 }).trimEnd(),
    '---',
    '',
    '<!-- Generated by the Squad integrity tool. Edit workflows/*.md and run npm run gh-aw:integrity:write. -->',
    ...importedBodies,
    source.body.trimStart(),
  ].join('\n');
}

function packageWorkflowSource(_root, name) {
  return `workflows/package/${name}.md`;
}

export function buildContract(root) {
  return validateContract({
    schema_version: 1,
    package: PACKAGE_NAME,
    manifest: PACKAGE_MANIFEST,
    minimum_gh_aw_version: MIN_GH_AW_VERSION,
    revision_policy: { ...REVISION_POLICY },
    workflows: WORKFLOW_TUPLES.map(([name, , destination, lock]) => {
      const source = packageWorkflowSource(root, name);
      const content = source.startsWith('workflows/package/')
        ? renderPackageWorkflow(root, name)
        : readFileSync(resolve(root, source));
      return { name, source, destination, lock, source_sha256: sha256(content) };
    }),
    shared_runtime: RUNTIME_TUPLES.map(
      ([path, source, package_destination, destination, ownership]) => ({
        path,
        source,
        package_destination,
        destination,
        ownership,
        sha256: sha256(readFileSync(resolve(root, source))),
      }),
    ),
    skills: SKILL_TUPLES.map(([name, source, destination]) => ({
      name,
      source,
      destination,
      sha256: sha256(readFileSync(resolve(root, source))),
    })),
    bootstrap: { trigger_probe: TRIGGER_PROBE },
  });
}

export function renderManifest(root = process.cwd()) {
  const includes = WORKFLOW_TUPLES
    .map(([name, , destination]) => {
      const source = packageWorkflowSource(root, name).replace(/^workflows\//, '');
      return `  - source: ${source}\n    destination: ${destination}`;
    })
    .concat(['  - skills/gh-aw-enlistment'])
    .join('\n');
  const resources = RUNTIME_TUPLES
    .map(([, source, packageDestination]) =>
      `  - source: ${source.replace(/^workflows\//, '')}\n    destination: ${packageDestination}`)
    .concat([`  - source: squad-workflows.manifest.json\n    destination: ${CONTRACT_DESTINATION}`])
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
      .map((name) => [resolve(root, `workflows/package/${name}.md`), renderPackageWorkflow(root, name)]),
    [resolve(root, PACKAGE_MANIFEST), renderManifest(root)],
    [resolve(root, CONTRACT_SOURCE), stableJson(buildContract(root))],
  ]);
}

function expectedEmbeddedDigests(root) {
  return {
    verifier: sha256(readFileSync(resolve(root, 'workflows/shared/squad-install-verifier.mjs'))),
    cast: sha256(readFileSync(resolve(root, 'workflows/shared/squad-cast-validator.mjs'))),
    bootstrap: sha256(readFileSync(resolve(root, 'workflows/shared/squad-bootstrap-validator.mjs'))),
  };
}

function updateEmbeddedDigests(root) {
  const digests = expectedEmbeddedDigests(root);
  const dispatcherPath = resolve(root, 'workflows/squad.md');
  writeFileSync(
    dispatcherPath,
    readFileSync(dispatcherPath, 'utf8').replace(
      /(# BEGIN GENERATED RESOURCE DIGEST\n\s*validator_expected_sha256=")[0-9a-f]{64}("\n\s*# END GENERATED RESOURCE DIGEST)/,
      `$1${digests.cast}$2`,
    ),
  );
  const bootstrapPath = resolve(root, 'workflows/squad-bootstrap.md');
  writeFileSync(
    bootstrapPath,
    readFileSync(bootstrapPath, 'utf8')
      .replace(/(check_hash "\$install_verifier" ")[0-9a-f]{64}(")/, `$1${digests.verifier}$2`)
      .replace(/(check_hash "\$cast_validator" ")[0-9a-f]{64}(")/, `$1${digests.cast}$2`)
      .replace(/(check_hash "\$bootstrap_validator" ")[0-9a-f]{64}(")/, `$1${digests.bootstrap}$2`),
  );
}

export function writeSource(root) {
  updateEmbeddedDigests(root);
  for (const [path, content] of generatedFiles(root)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

export function checkSource(root) {
  const failures = [];
  try {
    const digests = expectedEmbeddedDigests(root);
    const dispatcher = readFileSync(resolve(root, 'workflows/squad.md'), 'utf8');
    const bootstrap = readFileSync(resolve(root, 'workflows/squad-bootstrap.md'), 'utf8');
    if (!dispatcher.includes(`validator_expected_sha256="${digests.cast}"`)) {
      failures.push('Generated Cast validator digest is stale in workflows/squad.md.');
    }
    for (const [variable, digest] of [
      ['install_verifier', digests.verifier],
      ['cast_validator', digests.cast],
      ['bootstrap_validator', digests.bootstrap],
    ]) {
      if (!bootstrap.includes(`check_hash "$${variable}" "${digest}"`)) {
        failures.push(`Generated ${variable} digest is stale in workflows/squad-bootstrap.md.`);
      }
    }
    for (const [path, expected] of generatedFiles(root)) {
      if (!existsSync(path)) failures.push(`Generated package file is missing: ${relative(root, path)}`);
      else if (readFileSync(path, 'utf8') !== expected) {
        failures.push(`Generated package file is stale: ${relative(root, path)} (run: npm run gh-aw:integrity:write)`);
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  return failures;
}

function parseInstalledContract(root) {
  const bytes = readRequired(root, CONTRACT_DESTINATION);
  let contract;
  try {
    contract = JSON.parse(bytes);
  } catch (error) {
    throw new Error(`Integrity contract is invalid JSON: ${error.message}`);
  }
  validateContract(contract);
  return { bytes, contract };
}

function findOwnershipRecord(root) {
  const packageDir = safePath(root, '.github/aw/packages');
  if (!existsSync(packageDir)) throw new Error('Package ownership metadata is missing.');
  const matches = [];
  for (const name of readdirSync(packageDir)) {
    if (!name.endsWith('.json')) continue;
    const relativePath = `.github/aw/packages/${name}`;
    let record;
    try {
      record = JSON.parse(readRequired(root, relativePath));
    } catch {
      continue;
    }
    if (record.package === PACKAGE_NAME) matches.push({ path: relativePath, record });
  }
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${PACKAGE_NAME} ownership record; found ${matches.length}.`);
  }
  return matches[0].record;
}

function expectedOwnership(contract) {
  return [
    ...contract.workflows.map(({ source, destination }) => ({ source, destination })),
    ...contract.shared_runtime.map(({ source, package_destination: destination }) => ({ source, destination })),
    { source: CONTRACT_SOURCE, destination: CONTRACT_DESTINATION },
  ].sort((left, right) => left.destination.localeCompare(right.destination));
}

function verifyOwnership(root, contract, expectedRevision) {
  const record = findOwnershipRecord(root);
  assertKeys(record, ['schemaVersion', 'package', 'source', 'resolvedCommit', 'installer', 'files'], 'Package ownership');
  if (record.schemaVersion !== 1 || record.package !== PACKAGE_NAME) {
    throw new Error('Package ownership identity is invalid.');
  }
  if (!REVISION_PATTERN.test(record.resolvedCommit)) {
    throw new Error('Package ownership resolvedCommit must be a lowercase 40-character SHA.');
  }
  if (expectedRevision && record.resolvedCommit !== expectedRevision) {
    throw new Error(`Package revision mismatch: expected ${expectedRevision}, got ${record.resolvedCommit}.`);
  }
  if (record.source !== `${PACKAGE_NAME}@${record.resolvedCommit}`) {
    throw new Error(`Package ownership source must be ${PACKAGE_NAME}@${record.resolvedCommit}.`);
  }
  if (typeof record.installer !== 'string' || !/^gh-aw v0\.89\.21(?:\b|$)/.test(record.installer)) {
    throw new Error('Package ownership installer must be gh-aw v0.89.21.');
  }
  assertArray(record.files, OWNERSHIP_ENTRY_COUNT, 'Package ownership files');
  const expected = expectedOwnership(contract);
  const actual = record.files;
  const seen = new Set();
  for (let index = 0; index < expected.length; index += 1) {
    const owned = actual[index];
    assertKeys(owned, ['source', 'destination', 'sha256'], `Package ownership file ${index}`);
    validatePathSyntax(owned.source, expected[index].source, `Ownership source ${index}`);
    validatePathSyntax(owned.destination, expected[index].destination, `Ownership destination ${index}`);
    assertDigest(owned.sha256, `Ownership digest ${index}`);
    if (seen.has(owned.destination)) throw new Error(`Duplicate ownership destination: ${owned.destination}`);
    seen.add(owned.destination);
    const actualDigest = fileDigest(root, owned.destination);
    if (owned.sha256 !== actualDigest) {
      throw new Error(`Package ownership digest is stale for ${owned.destination}.`);
    }
  }
  return record.resolvedCommit;
}

function verifyInstalledBytes(root, contract, revision) {
  for (const entry of contract.workflows) {
    const installed = readRequired(root, entry.destination);
    const sourceBindings = [
      `source: ${PACKAGE_NAME}@${revision}`,
      `source: bradygaster/squad/${entry.source}@${revision}`,
    ];
    let canonicalText = installed.toString('utf8');
    for (const sourceBinding of sourceBindings) {
      canonicalText = canonicalText.replace(`\n${sourceBinding}\n---\n`, '\n---\n');
    }
    const canonical = Buffer.from(canonicalText);
    const canonicalWithFinalNewline = Buffer.from(`${canonicalText}\n`);
    if (![sha256(canonical), sha256(canonicalWithFinalNewline)].includes(entry.source_sha256)) {
      throw new Error(`Installed digest mismatch for ${entry.destination}.`);
    }
  }
  for (const entry of contract.skills) {
    if (fileDigest(root, entry.destination) !== entry.sha256) {
      throw new Error(`Installed digest mismatch for ${entry.destination}.`);
    }
  }
  for (const entry of contract.shared_runtime) {
    for (const destination of new Set([entry.package_destination, entry.destination])) {
      if (fileDigest(root, destination) !== entry.sha256) {
        throw new Error(`Installed digest mismatch for ${destination}.`);
      }
    }
  }
  for (const entry of contract.workflows) readRequired(root, entry.lock);
}

function verifyTriggerNamespace(root) {
  const directory = '.github/workflows/shared';
  const files = readdirSync(safePath(root, directory));
  const unexpected = files.filter(
    (name) => name.startsWith('squad-bootstrap-trigger-')
      && name !== basename(TRIGGER_PROBE_DESTINATION),
  );
  if (unexpected.length > 0) {
    throw new Error(`Unexpected bootstrap trigger probe paths: ${unexpected.join(', ')}`);
  }
}

function verifyTriggerProbe(root, revision) {
  const path = safePath(root, TRIGGER_PROBE_DESTINATION);
  if (!existsSync(path)) return;
  let probe;
  try {
    probe = JSON.parse(readRequired(root, TRIGGER_PROBE_DESTINATION));
  } catch (error) {
    throw new Error(`Bootstrap trigger probe must be valid JSON: ${error.message}`);
  }
  assertKeys(
    probe,
    [
      'schema_version',
      'kind',
      'trusted_source_sha',
      'hosted_run_id',
      'install_merge_sha',
      'default_branch_sha',
    ],
    'Bootstrap trigger probe',
  );
  if (probe.schema_version !== 1 || probe.kind !== 'squad-bootstrap-trigger-probe') {
    throw new Error('Bootstrap trigger probe identity is invalid.');
  }
  if (probe.trusted_source_sha !== revision) {
    throw new Error('Bootstrap trigger probe trusted_source_sha does not match package ownership.');
  }
  if (typeof probe.hosted_run_id !== 'string' || !/^[1-9][0-9]*$/.test(probe.hosted_run_id)) {
    throw new Error('Bootstrap trigger probe hosted_run_id must be a positive decimal string.');
  }
  assertShaValue(probe.install_merge_sha, 'Bootstrap trigger probe install_merge_sha');
  assertShaValue(probe.default_branch_sha, 'Bootstrap trigger probe default_branch_sha');
  if (probe.install_merge_sha !== probe.default_branch_sha) {
    throw new Error('Bootstrap trigger probe default_branch_sha must equal install_merge_sha.');
  }
}

function assertShaValue(value, label) {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase 40-character SHA.`);
  }
}

function strictCompileMatches(root) {
  const scratch = mkdtempSync(join(resolve(root), '.squad-gh-aw-verify-'));
  try {
    const origin = spawnChecked('git', ['config', '--get', 'remote.origin.url'], root).stdout.trim();
    cpSync(safePath(root, '.github'), resolve(scratch, '.github'), { recursive: true });
    spawnChecked('git', ['init', '--quiet'], scratch);
    spawnChecked('git', ['remote', 'add', 'origin', origin], scratch);
    const before = new Map(WORKFLOW_NAMES.map((name) => [
      name,
      readFileSync(resolve(scratch, `.github/workflows/${name}.lock.yml`)),
    ]));
    const ghAwBin = process.env.SQUAD_GH_AW_BIN;
    spawnChecked(
      ghAwBin || 'gh',
      ghAwBin ? ['compile', '--strict', '--no-check-update'] : ['aw', 'compile', '--strict', '--no-check-update'],
      scratch,
    );
    for (const name of WORKFLOW_NAMES) {
      const lock = resolve(scratch, `.github/workflows/${name}.lock.yml`);
      if (!before.get(name).equals(readFileSync(lock))) {
        throw new Error(`Generated lock is stale for ${name}.`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function spawnChecked(command, args, cwd) {
  const safeEnvironment = Object.fromEntries(
    ['CI', 'GH_CONFIG_DIR', 'GH_HOST', 'HOME', 'LANG', 'LC_ALL', 'NO_COLOR', 'PATH', 'SHELL', 'TERM', 'TMPDIR']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: safeEnvironment,
  });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`${command} failed:\n${result.stdout}${result.stderr}`);
  }
  return result;
}

export function verifyInstall(root, { expectedRevision = '', strictCompile = false } = {}) {
  const failures = [];
  let revision = expectedRevision;
  try {
    if (expectedRevision && !REVISION_PATTERN.test(expectedRevision)) {
      throw new Error('Expected revision must be a lowercase 40-character SHA.');
    }
    const { contract } = parseInstalledContract(root);
    revision = verifyOwnership(root, contract, expectedRevision);
    verifyInstalledBytes(root, contract, revision);
    verifyTriggerNamespace(root);
    verifyTriggerProbe(root, revision);
    if (strictCompile) strictCompileMatches(root);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  return { failures, revision };
}

export function verifyCanonicalManifest(sourceRoot, installedRoot) {
  const canonical = readRequired(sourceRoot, CONTRACT_SOURCE);
  const parsed = JSON.parse(canonical);
  validateContract(parsed);
  const installedBytes = readRequired(installedRoot, CONTRACT_DESTINATION);
  if (!canonical.equals(installedBytes)) {
    throw new Error('Installed manifest is not byte-identical to the trusted canonical manifest.');
  }
}

export function verifyResource(root, destination) {
  const { contract } = parseInstalledContract(root);
  const entry = [...contract.shared_runtime, ...contract.workflows, ...contract.skills]
    .find((candidate) => candidate.destination === destination);
  if (!entry) throw new Error(`Resource is not registered in the trusted Squad contract: ${destination}`);
  const actual = fileDigest(root, destination);
  const expected = entry.source_sha256 ?? entry.sha256;
  if (actual !== expected) throw new Error(`Squad resource digest mismatch for ${destination}.`);
  return actual;
}

export function materializeRuntime(root) {
  const { contract } = parseInstalledContract(root);
  for (const entry of contract.shared_runtime) {
    const content = readRequired(root, entry.package_destination);
    if (sha256(content) !== entry.sha256) {
      throw new Error(`Package-owned runtime digest mismatch for ${entry.package_destination}.`);
    }
    if (entry.package_destination === entry.destination) continue;
    writePath(root, entry.destination, content);
    if (fileDigest(root, entry.destination) !== entry.sha256) {
      throw new Error(`Materialized runtime digest mismatch for ${entry.destination}.`);
    }
  }
}

export function writeLocalTestOwnership(root, revision) {
  if (!REVISION_PATTERN.test(revision)) throw new Error('Local test revision must be a lowercase 40-character SHA.');
  const { contract } = parseInstalledContract(root);
  const files = expectedOwnership(contract).map((entry) => ({
    ...entry,
    sha256: fileDigest(root, entry.destination),
  }));
  writePath(root, '.github/aw/packages/bradygaster-squad-workflows-local-test.json', stableJson({
    schemaVersion: 1,
    package: PACKAGE_NAME,
    source: `${PACKAGE_NAME}@${revision}`,
    resolvedCommit: revision,
    installer: 'gh-aw v0.89.21 local package contract test',
    files,
  }));
}

function recoveryMessage(revision) {
  const ref = REVISION_PATTERN.test(revision) ? revision : '<40-character-squad-commit-sha>';
  return [
    'Safe recovery:',
    `  gh aw add ${PACKAGE_NAME}@${ref} --force`,
    '  gh aw compile --strict',
    '  node .github/workflows/shared/squad-install-verifier.mjs --verify-install --strict-compile',
  ].join('\n');
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : '';
}

export function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const root = resolve(optionValue(argv, '--root') || cwd);
  try {
    if (argv.includes('--write-source')) {
      writeSource(root);
      console.log(`Updated ${PACKAGE_MANIFEST}, ${CONTRACT_SOURCE}, and generated package workflows.`);
      return 0;
    }
    if (argv.includes('--check-source')) {
      const failures = checkSource(root);
      if (failures.length > 0) throw new Error(failures.join('\n'));
      console.log('Squad gh-aw package manifest and digests are current.');
      return 0;
    }
    if (argv.includes('--materialize-runtime')) {
      materializeRuntime(root);
      console.log('Materialized verified Squad runtime resources.');
      return 0;
    }
    if (argv.includes('--write-local-test-ownership')) {
      writeLocalTestOwnership(root, optionValue(argv, '--source-revision'));
      console.log('Wrote local-package ownership metadata for contract testing.');
      return 0;
    }
    if (argv.includes('--verify-resource')) {
      const destination = optionValue(argv, '--verify-resource');
      if (!destination) return 2;
      console.log(verifyResource(root, destination));
      return 0;
    }
    if (argv.includes('--verify-install')) {
      const expectedRevision = optionValue(argv, '--source-revision');
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
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  console.error('Usage: squad-install-verifier.mjs --check-source|--write-source|--materialize-runtime|--verify-install|--verify-resource <path>');
  return 2;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = run();
