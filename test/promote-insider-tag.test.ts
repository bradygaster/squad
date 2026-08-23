/**
 * Tests for scripts/promote-insider-tag.mjs
 *
 * Covers Issue #1491: the pure decision logic that keeps the `insider`
 * npm dist-tag from lagging `latest` after a stable release.
 *
 * This file keeps the pure helper coverage (compareVersions, shouldPromote,
 * parseVersion) and adds a static workflow-graph regression for release CI.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
// @ts-expect-error - .mjs script imported by test
import { compareVersions, parseVersion, shouldPromote } from '../scripts/promote-insider-tag.mjs';

function workflowJobBlock(jobName: string) {
  const workflow = readFileSync(
    new URL('../.github/workflows/squad-npm-publish.yml', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  if (start === -1) {
    throw new Error(`missing workflow job: ${jobName}`);
  }
  const rest = workflow.slice(start + marker.length);
  const nextJob = rest.search(/\n  [A-Za-z0-9_-]+:\n/);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

describe('parseVersion', () => {
  it('parses a stable version', () => {
    expect(parseVersion('0.11.0')).toEqual({ major: 0, minor: 11, patch: 0, prerelease: '' });
  });

  it('parses a prerelease version', () => {
    expect(parseVersion('0.10.0-insider.1')).toEqual({
      major: 0,
      minor: 10,
      patch: 0,
      prerelease: 'insider.1',
    });
  });

  it('rejects invalid input', () => {
    expect(parseVersion('not a version')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
    expect(parseVersion('')).toBeNull();
    // @ts-expect-error - intentionally wrong type
    expect(parseVersion(undefined)).toBeNull();
    // Leading zeros violate semver
    expect(parseVersion('01.2.3')).toBeNull();
  });
});

describe('compareVersions (semver precedence)', () => {
  it('numerically compares major/minor/patch', () => {
    expect(compareVersions('0.10.0', '0.11.0')).toBeLessThan(0);
    expect(compareVersions('0.11.0', '0.10.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    expect(compareVersions('0.11.0', '0.11.0')).toBe(0);
  });

  it('prerelease has lower precedence than release with same M.m.p', () => {
    expect(compareVersions('0.11.0-insider.1', '0.11.0')).toBeLessThan(0);
    expect(compareVersions('0.11.0', '0.11.0-insider.1')).toBeGreaterThan(0);
  });

  it('compares numeric prerelease identifiers numerically', () => {
    expect(compareVersions('0.11.0-insider.2', '0.11.0-insider.10')).toBeLessThan(0);
    expect(compareVersions('0.11.0-insider.10', '0.11.0-insider.2')).toBeGreaterThan(0);
  });

  it('shorter prerelease is lower when all prior identifiers match', () => {
    expect(compareVersions('0.11.0-insider', '0.11.0-insider.1')).toBeLessThan(0);
  });

  it('non-numeric identifier ranks higher than numeric one', () => {
    expect(compareVersions('0.11.0-1', '0.11.0-alpha')).toBeLessThan(0);
  });

  it('throws on invalid input', () => {
    expect(() => compareVersions('bad', '1.0.0')).toThrow();
    expect(() => compareVersions('1.0.0', 'bad')).toThrow();
  });
});

describe('shouldPromote (Issue #1491 decision matrix)', () => {
  it('promotes when insider is unset', () => {
    expect(shouldPromote('', '0.11.0')).toBe(true);
    expect(shouldPromote(undefined as unknown as string, '0.11.0')).toBe(true);
  });

  it('promotes when insider is semver-lower than new stable (the #1491 scenario)', () => {
    expect(shouldPromote('0.10.0-insider.1', '0.11.0')).toBe(true);
  });

  it('promotes when insider is a prerelease of the same release', () => {
    expect(shouldPromote('0.11.0-insider.1', '0.11.0')).toBe(true);
  });

  it('does NOT promote when insider is already at the new stable', () => {
    expect(shouldPromote('0.11.0', '0.11.0')).toBe(false);
  });

  it('does NOT promote when insider is ahead of the new stable', () => {
    expect(shouldPromote('0.12.0-insider.1', '0.11.0')).toBe(false);
    expect(shouldPromote('0.12.0', '0.11.0')).toBe(false);
  });

  it('does NOT downgrade insider across a major boundary', () => {
    expect(shouldPromote('1.0.0-insider.1', '0.11.0')).toBe(false);
  });
});

describe('publish workflow insider promotion graph (Issue #1497)', () => {
  it('promotes squad-sdk independently of squad-cli publish success', () => {
    const sdkPromotion = workflowJobBlock('promote-insider-tag-sdk');

    expect(sdkPromotion).toContain('needs: publish-sdk');
    expect(sdkPromotion).not.toContain('publish-cli');
    expect(sdkPromotion).toContain('@bradygaster/squad-sdk');
  });

  it('promotes squad-cli after its own publish succeeds', () => {
    const cliPromotion = workflowJobBlock('promote-insider-tag-cli');

    expect(cliPromotion).toContain('needs: publish-cli');
    expect(cliPromotion).toContain('@bradygaster/squad-cli');
  });
});
