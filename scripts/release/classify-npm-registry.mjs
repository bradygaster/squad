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

export function runRegistryClassification({
  version,
  packsDir,
  reconDir,
  registry,
  spawn = spawnSync,
}) {
  const local = JSON.parse(readFileSync(path.join(packsDir, 'local-packs.json'), 'utf8'));
  const state = classifyRegistryVersions({ version, local, registry, spawn });
  writeFileSync(path.join(reconDir, 'pre-publish-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  for (const [key, name] of PACKAGE_KEYS) console.log(`${key}_state=${state[name].state}`);
  const conflict = Object.entries(state).filter(([, value]) => value.state === 'conflict');
  if (conflict.length) {
    throw new Error(conflict.map(([name, value]) => `${name}@${version} registry state is CONFLICT: ${value.diagnostic}`).join('; '));
  }
  const unknown = Object.entries(state).filter(([, value]) => value.state === 'unknown');
  if (unknown.length) {
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
  });
}
