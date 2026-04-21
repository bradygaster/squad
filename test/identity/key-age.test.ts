/**
 * Tests for H-14 — key age reporting (getKeyAgeDays).
 *
 * @see packages/squad-sdk/src/identity/storage.ts
 * @module test/identity/key-age
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getKeyAgeDays } from '@bradygaster/squad-sdk/identity';

const tmpDirs: string[] = [];

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-keyage-test-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, '.squad', 'identity', 'keys'), { recursive: true });
  return dir;
}

function writeKeyWithAge(dir: string, role: string, ageDays: number): string {
  const path = join(dir, '.squad', 'identity', 'keys', `${role}.pem`);
  writeFileSync(path, '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----\n');
  const mtime = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  utimesSync(path, mtime, mtime);
  return path;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tmpDirs.length = 0;
  delete process.env['SQUAD_IDENTITY_KEY_MAX_AGE_DAYS'];
});

describe('getKeyAgeDays', () => {
  it('returns integer days since mtime for an existing key', () => {
    const dir = makeProject();
    writeKeyWithAge(dir, 'lead', 42);
    const age = getKeyAgeDays(dir, 'lead');
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThanOrEqual(41);
    expect(age!).toBeLessThanOrEqual(43);
  });

  it('returns 0 for a freshly-written key', () => {
    const dir = makeProject();
    writeKeyWithAge(dir, 'lead', 0);
    expect(getKeyAgeDays(dir, 'lead')).toBe(0);
  });

  it('returns null when the PEM file does not exist', () => {
    const dir = makeProject();
    expect(getKeyAgeDays(dir, 'lead')).toBeNull();
  });

  it('returns null when the squad project root is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'squad-keyage-empty-'));
    tmpDirs.push(dir);
    expect(getKeyAgeDays(dir, 'lead')).toBeNull();
  });

  it('distinguishes below-warn, warn, and fail threshold bands', () => {
    const dir = makeProject();
    writeKeyWithAge(dir, 'ok', 30);
    writeKeyWithAge(dir, 'warn', 65);
    writeKeyWithAge(dir, 'fail', 120);

    const ok = getKeyAgeDays(dir, 'ok')!;
    const warn = getKeyAgeDays(dir, 'warn')!;
    const fail = getKeyAgeDays(dir, 'fail')!;

    expect(ok).toBeLessThan(60);
    expect(warn).toBeGreaterThanOrEqual(60);
    expect(warn).toBeLessThan(90);
    expect(fail).toBeGreaterThanOrEqual(90);
  });

  it('honours SQUAD_IDENTITY_KEY_MAX_AGE_DAYS override semantics', () => {
    const dir = makeProject();
    writeKeyWithAge(dir, 'lead', 45);
    const age = getKeyAgeDays(dir, 'lead')!;

    const defaultMax = 90;
    expect(age).toBeLessThan(defaultMax);

    process.env['SQUAD_IDENTITY_KEY_MAX_AGE_DAYS'] = '30';
    const overriddenMax = Number(process.env['SQUAD_IDENTITY_KEY_MAX_AGE_DAYS']);
    expect(age).toBeGreaterThanOrEqual(overriddenMax);
  });
});
