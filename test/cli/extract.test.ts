/**
 * Extract Command Tests — Extract learnings from consult mode
 *
 * Tests module exports and error handling for missing config.
 * Does NOT test interactive prompts (requires stdin).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const TEST_ROOT = join(tmpdir(), `.test-cli-extract-${randomBytes(4).toString('hex')}`);

describe('CLI: extract command', () => {
  afterEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('module exports runExtract function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/extract');
    expect(typeof mod.runExtract).toBe('function');
  });

  it('runExtract accepts cwd and args parameters', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/extract');
    // runExtract(cwd, args) — 2 parameters
    expect(mod.runExtract.length).toBe(2);
  });

  it('throws when no .squad/config.json exists', async () => {
    const { runExtract } = await import('@bradygaster/squad-cli/commands/extract');
    mkdirSync(TEST_ROOT, { recursive: true });

    await expect(runExtract(TEST_ROOT, [])).rejects.toThrow(/config\.json/i);
  });

  it('throws when config.json is invalid JSON', async () => {
    const { runExtract } = await import('@bradygaster/squad-cli/commands/extract');
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.squad', 'config.json'), '{broken json!!!');

    await expect(runExtract(TEST_ROOT, [])).rejects.toThrow(/parse/i);
  });

  it('throws when not in consult mode', async () => {
    const { runExtract } = await import('@bradygaster/squad-cli/commands/extract');
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
    writeFileSync(
      join(TEST_ROOT, '.squad', 'config.json'),
      JSON.stringify({ version: 1, teamRoot: '.', projectKey: null }),
    );

    await expect(runExtract(TEST_ROOT, [])).rejects.toThrow(/not in consult mode/i);
  });
});
