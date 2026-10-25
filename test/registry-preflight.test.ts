import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  assertRegistryPreflight,
  classifyGitRemoteTag,
  classifyGithubTagRef,
  classifyGithubRelease,
  classifyPackageVersion,
  readDistTags,
  runRegistryPreflight,
} from '../scripts/release/registry-preflight.mjs';

const VERSION = '2.0.0-preview.2';
const REGISTRY = 'https://registry.npmjs.org/';
const result = (status: number | null, stdout = '', stderr = '') => ({ status, stdout, stderr, signal: null });

describe('read-only registry preflight', () => {
  it('records only explicit package, tag-ref, and release absence responses as absent', () => {
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
    expect(classifyGitRemoteTag({
      tag: `v${VERSION}`,
      spawn: () => result(0),
    }).state).toBe('absent');
    expect(classifyGithubTagRef({
      repository: 'bradygaster/squad',
      tag: `v${VERSION}`,
      spawn: () => result(1, '', 'gh: Not Found (HTTP 404)'),
    }).state).toBe('404');
  });

  it('records TLS, git transport, and malformed responses as UNKNOWN', () => {
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
    expect(classifyGitRemoteTag({
      tag: `v${VERSION}`,
      spawn: () => result(128, '', 'fatal: unable to access origin'),
    }).state).toBe('UNKNOWN');
    expect(classifyGithubTagRef({
      repository: 'bradygaster/squad',
      tag: `v${VERSION}`,
      spawn: () => result(0, '{broken'),
    }).state).toBe('UNKNOWN');
  });

  it('writes package states, dist-tags, aggregate state, Git tag absence, and release absence', () => {
    const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const root = mkdtempSync(path.join(cache, 'registry-preflight-'));
    const out = path.join(root, 'registry-preflight.json');
    const spawn = (command: string, args: string[]) => {
      if (command === 'gh') return result(1, '', 'gh: Not Found (HTTP 404)');
      if (command === 'git') return result(0);
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
      expect(evidence.gitTag).toMatchObject({
        state: 'absent',
        remote: { state: 'absent', ref: `refs/tags/v${VERSION}` },
        githubRef: { state: '404', ref: `refs/tags/v${VERSION}` },
      });
      expect(evidence.githubRelease.state).toBe('404');
      for (const name of ['@bradygaster/squad-cli', '@bradygaster/squad-sdk']) {
        expect(evidence.packages[name].version.state).toBe('404');
        expect(evidence.packages[name].distTags.values).toEqual({
          insider: '2.0.0-preview.1',
          preview: '2.0.0-preview.1',
          latest: '1.1.0',
        });
      }
      expect(() => assertRegistryPreflight(evidence, { requireAbsence: true })).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when either Git tag absence probe is UNKNOWN', () => {
    const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const root = mkdtempSync(path.join(cache, 'registry-preflight-'));
    const out = path.join(root, 'registry-preflight.json');
    const spawn = (command: string, args: string[]) => {
      if (command === 'git') return result(128, '', 'fatal: transport failure');
      if (command === 'gh') return result(1, '', 'gh: Not Found (HTTP 404)');
      if (args.includes('dist-tags')) return result(0, JSON.stringify({ insider: '2.0.0-preview.1' }));
      return result(1, '', 'npm error code E404\n404 Not Found');
    };
    try {
      const evidence = runRegistryPreflight({
        version: VERSION,
        registry: REGISTRY,
        repository: 'bradygaster/squad',
        out,
        spawn,
      });
      expect(evidence.gitTag.state).toBe('UNKNOWN');
      expect(() => assertRegistryPreflight(evidence, { requireAbsence: true })).toThrow(/UNKNOWN.*Git tag/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
