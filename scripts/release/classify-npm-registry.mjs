#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_KEYS = [
  ['sdk', '@bradygaster/squad-sdk'],
  ['cli', '@bradygaster/squad-cli'],
];

export function classifyRegistryVersion({
  name,
  version,
  localIntegrity,
  registry,
  spawn = spawnSync,
}) {
  const result = spawn('npm', [
    'view',
    `${name}@${version}`,
    'version',
    'dist.integrity',
    '--json',
    `--registry=${registry}`,
  ], { encoding: 'utf8' });
  const diagnostic = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.status !== 0) {
    if (/\bE404\b|404 Not Found/i.test(diagnostic)) {
      return { state: 'missing', diagnostic: diagnostic.slice(-500) };
    }
    return {
      state: 'unknown',
      diagnostic: diagnostic.slice(-500) || `npm view exited ${String(result.status)}`,
      exitCode: result.status,
      signal: result.signal ?? null,
    };
  }
  let data;
  try {
    data = JSON.parse(result.stdout || '{}');
  } catch (error) {
    return { state: 'unknown', diagnostic: `invalid npm view JSON: ${error}` };
  }
  if (data.version !== version || typeof data['dist.integrity'] !== 'string') {
    return { state: 'unknown', diagnostic: `unexpected registry response ${JSON.stringify(data)}` };
  }
  if (data['dist.integrity'] !== localIntegrity) {
    return {
      state: 'conflict',
      version: data.version,
      integrity: data['dist.integrity'],
      localIntegrity,
      diagnostic: `${name}@${version} exists with different integrity`,
    };
  }
  return {
    state: 'present',
    version: data.version,
    integrity: data['dist.integrity'],
    localIntegrity,
  };
}

export function classifyRegistryVersions({
  version,
  local,
  registry,
  spawn = spawnSync,
}) {
  return Object.fromEntries(PACKAGE_KEYS.map(([, name]) => [
    name,
    classifyRegistryVersion({
      name,
      version,
      localIntegrity: local[name]?.integrity,
      registry,
      spawn,
    }),
  ]));
}

export function classifyRegistryTags({
  name,
  version,
  primaryTag,
  requirePreviewAlias,
  versionState,
  registry,
  spawn = spawnSync,
}) {
  const result = spawn('npm', [
    'view',
    name,
    'dist-tags',
    '--json',
    `--registry=${registry}`,
  ], { encoding: 'utf8' });
  const diagnostic = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.status !== 0) {
    if (versionState === 'missing' && /\bE404\b|404 Not Found/i.test(diagnostic)) {
      return {
        state: 'known',
        primary: { tag: primaryTag, current: null, matches: false },
        preview: requirePreviewAlias
          ? { tag: 'preview', current: null, matches: false }
          : { tag: 'preview', current: null, matches: true, required: false },
      };
    }
    return {
      state: 'unknown',
      diagnostic: diagnostic.slice(-500) || `npm view exited ${String(result.status)}`,
      exitCode: result.status,
      signal: result.signal ?? null,
    };
  }
  let tags;
  try {
    tags = JSON.parse(result.stdout || '{}');
  } catch (error) {
    return { state: 'unknown', diagnostic: `invalid npm dist-tags JSON: ${error}` };
  }
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
    return { state: 'unknown', diagnostic: `unexpected dist-tags response ${JSON.stringify(tags)}` };
  }
  const primary = tags[primaryTag] ?? null;
  const preview = requirePreviewAlias ? (tags.preview ?? null) : null;
  return {
    state: 'known',
    primary: { tag: primaryTag, current: primary, matches: primary === version },
    preview: requirePreviewAlias
      ? { tag: 'preview', current: preview, matches: preview === version }
      : { tag: 'preview', current: null, matches: true, required: false },
  };
}

export function planRegistryReconciliation({
  versions,
  tags,
  requirePreviewAlias,
}) {
  const byKey = Object.fromEntries(PACKAGE_KEYS);
  const packageState = (key) => versions[byKey[key]]?.state;
  const tagState = (key) => tags[byKey[key]];
  const states = PACKAGE_KEYS.map(([key]) => packageState(key));
  if (states.includes('conflict')) return { state: 'abort_conflict' };
  if (states.some((state) => !['missing', 'present'].includes(state))
    || PACKAGE_KEYS.some(([key]) => tagState(key)?.state !== 'known')) {
    return { state: 'abort_unknown' };
  }

  const sdkMissing = packageState('sdk') === 'missing';
  const cliMissing = packageState('cli') === 'missing';
  const stagePair = sdkMissing || cliMissing;
  const setSdkPrimary = !tagState('sdk').primary.matches;
  const setCliPrimary = !tagState('cli').primary.matches;
  const setSdkPreview = requirePreviewAlias && !tagState('sdk').preview.matches;
  const setCliPreview = requirePreviewAlias && !tagState('cli').preview.matches;
  const tagMutationNeeded = setSdkPrimary || setCliPrimary || setSdkPreview || setCliPreview;

  let state;
  if (sdkMissing && cliMissing) state = 'publish_both';
  else if (sdkMissing) state = 'publish_sdk';
  else if (cliMissing) state = 'publish_cli';
  else if (tagMutationNeeded) state = 'promote_tags';
  else state = 'complete';

  return {
    state,
    stagePair,
    publishSdk: sdkMissing,
    publishCli: cliMissing,
    setSdkPrimary,
    setCliPrimary,
    setSdkPreview,
    setCliPreview,
    noOp: state === 'complete',
  };
}

export function runRegistryClassification({
  version,
  packsDir,
  reconDir,
  registry,
  distTag,
  addPreviewAlias,
  spawn = spawnSync,
}) {
  const local = JSON.parse(readFileSync(path.join(packsDir, 'local-packs.json'), 'utf8'));
  const requirePreviewAlias = addPreviewAlias && distTag !== 'preview';
  const versions = classifyRegistryVersions({ version, local, registry, spawn });
  const tags = Object.fromEntries(PACKAGE_KEYS.map(([, name]) => [
    name,
    classifyRegistryTags({
      name,
      version,
      primaryTag: distTag,
      requirePreviewAlias,
      versionState: versions[name].state,
      registry,
      spawn,
    }),
  ]));
  const plan = planRegistryReconciliation({ versions, tags, requirePreviewAlias });
  const state = { version, distTag, requirePreviewAlias, packages: versions, tags, plan };
  writeFileSync(path.join(reconDir, 'pre-publish-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  for (const [key, name] of PACKAGE_KEYS) console.log(`${key}_state=${versions[name].state}`);
  for (const [key, value] of [
    ['reconciliation_state', plan.state],
    ['stage_pair', plan.stagePair],
    ['publish_sdk', plan.publishSdk],
    ['publish_cli', plan.publishCli],
    ['set_sdk_primary', plan.setSdkPrimary],
    ['set_cli_primary', plan.setCliPrimary],
    ['set_sdk_preview', plan.setSdkPreview],
    ['set_cli_preview', plan.setCliPreview],
    ['no_op', plan.noOp],
  ]) {
    console.log(`${key}=${String(value)}`);
  }
  if (plan.state === 'abort_conflict') {
    const conflict = Object.entries(versions).filter(([, value]) => value.state === 'conflict');
    throw new Error(conflict.map(([name, value]) => `${name}@${version} registry state is CONFLICT: ${value.diagnostic}`).join('; '));
  }
  if (plan.state === 'abort_unknown') {
    const unknown = [
      ...Object.entries(versions).filter(([, value]) => value.state === 'unknown'),
      ...Object.entries(tags).filter(([, value]) => value.state === 'unknown'),
    ];
    throw new Error(unknown.map(([name, value]) => `${name}@${version} registry state is UNKNOWN: ${value.diagnostic}`).join('; '));
  }
  return state;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required ${name}`);
    return value;
  };
  runRegistryClassification({
    version: required('VERSION'),
    packsDir: required('PACKS_DIR'),
    reconDir: required('RECON_DIR'),
    registry: required('PUBLIC_REGISTRY'),
    distTag: required('DIST_TAG'),
    addPreviewAlias: required('ADD_PREVIEW_ALIAS') === 'true',
  });
}
