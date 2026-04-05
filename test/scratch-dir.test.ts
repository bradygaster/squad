import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scratchDir, scratchFile } from '@bradygaster/squad-sdk';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), `squad-scratch-test-${Date.now()}`);
const SQUAD_ROOT = path.join(TEST_ROOT, '.squad');

beforeEach(() => {
  mkdirSync(SQUAD_ROOT, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('scratchDir', () => {
  it('creates .scratch/ inside .squad/ when create=true (default)', () => {
    const dir = scratchDir(SQUAD_ROOT);
    expect(dir).toBe(path.join(SQUAD_ROOT, '.scratch'));
    expect(existsSync(dir)).toBe(true);
  });

  it('returns path without creating when create=false', () => {
    const dir = scratchDir(SQUAD_ROOT, false);
    expect(dir).toBe(path.join(SQUAD_ROOT, '.scratch'));
    expect(existsSync(dir)).toBe(false);
  });

  it('is idempotent — calling twice does not throw', () => {
    scratchDir(SQUAD_ROOT);
    scratchDir(SQUAD_ROOT);
    expect(existsSync(path.join(SQUAD_ROOT, '.scratch'))).toBe(true);
  });
});

describe('scratchFile', () => {
  it('creates a temp file with prefix and default .tmp extension', () => {
    const filePath = scratchFile(SQUAD_ROOT, 'test-prompt');
    expect(filePath).toContain('.scratch');
    expect(filePath).toMatch(/test-prompt-\d+-[0-9a-f]{8}\.tmp$/);
    // File exists only if content was provided — otherwise just returns path
    expect(existsSync(path.dirname(filePath))).toBe(true);
  });

  it('creates a file with content when provided', () => {
    const content = 'hello from scratch';
    const filePath = scratchFile(SQUAD_ROOT, 'msg', '.txt', content);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('uses custom extension', () => {
    const filePath = scratchFile(SQUAD_ROOT, 'fleet', '.md');
    expect(filePath).toMatch(/fleet-\d+-[0-9a-f]{8}\.md$/);
  });

  it('generates unique filenames on successive calls', () => {
    const a = scratchFile(SQUAD_ROOT, 'dup', '.txt', 'a');
    const b = scratchFile(SQUAD_ROOT, 'dup', '.txt', 'b');
    // Random hex suffix from crypto.randomBytes guarantees uniqueness
    // even when Date.now() returns the same millisecond value.
    expect(a).not.toBe(b);
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(true);
  });

  it('creates the .scratch/ directory if missing', () => {
    expect(existsSync(path.join(SQUAD_ROOT, '.scratch'))).toBe(false);
    scratchFile(SQUAD_ROOT, 'auto-create', '.txt', 'data');
    expect(existsSync(path.join(SQUAD_ROOT, '.scratch'))).toBe(true);
  });
});
