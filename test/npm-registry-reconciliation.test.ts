import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  classifyRegistryVersion,
  runRegistryClassification,
} from '../scripts/release/classify-npm-registry.mjs';

const VERSION = '2.0.0-preview.1';
const INTEGRITY = 'sha512-local';
const result = (status: number | null, stdout = '', stderr = '', signal: string | null = null) => ({
  status,
  stdout,
  stderr,
  signal,
});

describe('npm pre-publish registry reconciliation', () => {
  it('classifies only an explicit 404 as missing', () => {
    const state = classifyRegistryVersion({
      name: '@bradygaster/squad-sdk',
      version: VERSION,
      localIntegrity: INTEGRITY,
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(1, '', 'npm error code E404\n404 Not Found'),
    });
    expect(state.state).toBe('missing');
  });

  it('classifies timeout, TLS, 5xx, and other failures as unknown', () => {
    for (const failure of [
      result(null, '', 'request timed out', 'SIGTERM'),
      result(1, '', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'),
      result(1, '', '503 Service Unavailable'),
    ]) {
      const state = classifyRegistryVersion({
        name: '@bradygaster/squad-sdk',
        version: VERSION,
        localIntegrity: INTEGRITY,
        registry: 'https://registry.npmjs.org/',
        spawn: () => failure,
      });
      expect(state.state).toBe('unknown');
    }
  });

  it('accepts a present version only when registry integrity matches the verified tarball', () => {
    const state = classifyRegistryVersion({
      name: '@bradygaster/squad-sdk',
      version: VERSION,
      localIntegrity: INTEGRITY,
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(0, JSON.stringify({ version: VERSION, 'dist.integrity': INTEGRITY })),
    });
    expect(state).toMatchObject({ state: 'present', version: VERSION, integrity: INTEGRITY });
  });

  it('classifies mismatching integrity as conflict and the workflow entry point fails closed', () => {
    const state = classifyRegistryVersion({
      name: '@bradygaster/squad-sdk',
      version: VERSION,
      localIntegrity: INTEGRITY,
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(0, JSON.stringify({ version: VERSION, 'dist.integrity': 'sha512-other' })),
    });
    expect(state.state).toBe('conflict');

    const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const root = mkdtempSync(path.join(cache, 'npm-reconciliation-'));
    const packsDir = path.join(root, 'packs');
    const reconDir = path.join(root, 'reconciliation');
    mkdirSync(packsDir);
    mkdirSync(reconDir);
    writeFileSync(path.join(packsDir, 'local-packs.json'), JSON.stringify({
      '@bradygaster/squad-sdk': { integrity: INTEGRITY },
      '@bradygaster/squad-cli': { integrity: INTEGRITY },
    }));
    try {
      expect(() => runRegistryClassification({
        version: VERSION,
        packsDir,
        reconDir,
        registry: 'https://registry.npmjs.org/',
        spawn: () => result(0, JSON.stringify({ version: VERSION, 'dist.integrity': 'sha512-other' })),
      })).toThrow(/CONFLICT/);
      const recorded = JSON.parse(readFileSync(path.join(reconDir, 'pre-publish-state.json'), 'utf8'));
      expect(recorded['@bradygaster/squad-sdk'].state).toBe('conflict');
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
