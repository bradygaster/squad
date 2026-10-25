import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  classifyGithubRelease,
  classifyPackageVersion,
  readDistTags,
  runRegistryPreflight,
} from '../scripts/release/registry-preflight.mjs';

const VERSION = '2.0.0-preview.2';
const REGISTRY = 'https://registry.npmjs.org/';
const result = (status: number | null, stdout = '', stderr = '') => ({ status, stdout, stderr, signal: null });

describe('read-only registry preflight', () => {
  it('records only explicit package and release 404s as 404', () => {
    expect(classifyPackageVersion({
      name: '@bradygaster/squad-cli',
      version: VERSION,
      registry: REGISTRY,
      spawn: () => result(1, '', 'npm error code E404\n404 Not Found'),
    }).state).toBe('404');
    expect(classifyGithubRelease({
      repository: 'bradygaster/squad',
      tag: `v${VERSION}`,
      spawn: () => result(1, '', 'gh: Not Found (HTTP 404)'),
    }).state).toBe('404');
  });

  it('records TLS and malformed responses as UNKNOWN', () => {
    expect(classifyPackageVersion({
      name: '@bradygaster/squad-cli',
      version: VERSION,
      registry: REGISTRY,
      spawn: () => result(1, '', 'ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE'),
    }).state).toBe('UNKNOWN');
    expect(readDistTags({
      name: '@bradygaster/squad-cli',
      registry: REGISTRY,
      spawn: () => result(0, '{broken'),
    })).toMatchObject({
      state: 'UNKNOWN',
      values: { insider: null, preview: null, latest: null },
    });
  });

  it('writes package states, all three tags, aggregate state, and proposed release state', () => {
    const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const root = mkdtempSync(path.join(cache, 'registry-preflight-'));
    const out = path.join(root, 'registry-preflight.json');
    const spawn = (command: string, args: string[]) => {
      if (command === 'gh') return result(1, '', 'gh: Not Found (HTTP 404)');
      const spec = args.find((arg) => arg.startsWith('@bradygaster/')) ?? '';
      if (args.includes('dist-tags')) {
        return result(0, JSON.stringify({ insider: '2.0.0-preview.1', preview: '2.0.0-preview.1', latest: '1.1.0' }));
      }
      if (spec.includes(`@${VERSION}`)) return result(1, '', 'npm error code E404\n404 Not Found');
      return result(1, '', 'unexpected request');
    };
    try {
      runRegistryPreflight({
        version: VERSION,
        registry: REGISTRY,
        repository: 'bradygaster/squad',
        out,
        spawn,
      });
      const evidence = JSON.parse(readFileSync(out, 'utf8'));
      expect(evidence.aggregate.versionState).toBe('unpublished');
      expect(evidence.proposedTag).toBe(`v${VERSION}`);
      expect(evidence.githubRelease.state).toBe('404');
      for (const name of ['@bradygaster/squad-cli', '@bradygaster/squad-sdk']) {
        expect(evidence.packages[name].version.state).toBe('404');
        expect(evidence.packages[name].distTags.values).toEqual({
          insider: '2.0.0-preview.1',
          preview: '2.0.0-preview.1',
          latest: '1.1.0',
        });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
