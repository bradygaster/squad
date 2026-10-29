import { describe, expect, it } from 'vitest';
import {
  assertNodeSecurityFloor,
  compareNodeVersions,
  loadNodeSecurityFloor,
  parseNodeVersion,
} from '../scripts/release/node-security-floor.mjs';

describe('Node security floor', () => {
  it.each([
    ['22.23.3', '22.23.4', -1],
    ['22.23.4', '22.23.4', 0],
    ['22.24.0', '22.23.4', 1],
    ['24.22.1', '22.23.4', 1],
    ['v26.12.1', '26.12.1', 0],
  ])('compares %s with %s', (left, right, expected) => {
    expect(compareNodeVersions(left, right)).toBe(expected);
  });

  it.each(['22', '22.23', '22.23.4.1', '22.23.4-rc.1', 'v22.23.4+build', '', 'latest'])(
    'rejects invalid or prerelease input %j',
    (version) => {
      expect(() => parseNodeVersion(version)).toThrow(/expected a stable X\.Y\.Z version/);
    },
  );

  it('enforces the published floor for each approved major', () => {
    const policy = loadNodeSecurityFloor();
    expect(policy.minimumByMajor).toEqual({
      22: '22.23.4',
      24: '24.22.1',
      26: '26.12.1',
    });
    expect(assertNodeSecurityFloor('22.23.4', policy)).toMatchObject({ minimum: '22.23.4' });
    expect(assertNodeSecurityFloor('24.22.2', policy)).toMatchObject({ minimum: '24.22.1' });
    expect(() => assertNodeSecurityFloor('22.23.3', policy)).toThrow(/below the 22\.x security floor/);
    expect(() => assertNodeSecurityFloor('23.11.1', policy)).toThrow(/not an approved vendored major/);
  });
});
