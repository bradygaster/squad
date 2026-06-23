/**
 * External capability loader tests — issue #918
 *
 * Verifies loadExternalCapabilities handles:
 *   - missing directory
 *   - empty directory
 *   - valid capability files
 *   - invalid files (missing fields)
 *   - files with syntax errors
 *   - multiple files (mix of valid/invalid)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CapabilityRegistry } from '../../packages/squad-cli/src/cli/commands/watch/registry.js';

// Dynamic import to avoid hoisting issues — each test imports fresh
async function getLoader() {
  const mod = await import(
    '../../packages/squad-cli/src/cli/commands/watch/external-loader.js'
  );
  return mod.loadExternalCapabilities;
}

describe('loadExternalCapabilities', () => {
  let tmpDir: string;
  let registry: CapabilityRegistry;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'squad-ext-cap-'));
    registry = new CapabilityRegistry();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    if (existsSync(tmpDir)) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns 0 when .squad/capabilities/ directory does not exist', async () => {
    const loadExternalCapabilities = await getLoader();
    const count = await loadExternalCapabilities(tmpDir, registry);

    expect(count).toBe(0);
    expect(registry.all()).toHaveLength(0);
  });

  it('returns 0 for an empty capabilities directory', async () => {
    mkdirSync(join(tmpDir, '.squad', 'capabilities'), { recursive: true });
    const loadExternalCapabilities = await getLoader();
    const count = await loadExternalCapabilities(tmpDir, registry);

    expect(count).toBe(0);
    expect(registry.all()).toHaveLength(0);
  });

  it('loads and registers a valid capability file', async () => {
    const capDir = join(tmpDir, '.squad', 'capabilities');
    mkdirSync(capDir, { recursive: true });

    const capCode = `
      export default {
        name: 'test-cap',
        description: 'A test capability',
        configShape: 'boolean',
        requires: [],
        phase: 'housekeeping',
        async preflight() { return { ok: true }; },
        async execute() { return { success: true, summary: 'done' }; },
      };
    `;
    await writeFile(join(capDir, 'test-cap.js'), capCode, 'utf-8');

    const loadExternalCapabilities = await getLoader();
    const count = await loadExternalCapabilities(tmpDir, registry);

    expect(count).toBe(1);
    expect(registry.names()).toContain('test-cap');

    const cap = registry.get('test-cap');
    expect(cap).toBeDefined();
    expect(cap!.phase).toBe('housekeeping');
    expect(cap!.description).toBe('A test capability');

    // Check success log
    const successLog = consoleSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('Loaded external capability'),
    );
    expect(successLog).toBeDefined();
  });

  it('warns and returns 0 for a file missing required fields', async () => {
    const capDir = join(tmpDir, '.squad', 'capabilities');
    mkdirSync(capDir, { recursive: true });

    const badCode = `
      export default {
        name: 'incomplete',
        description: 'Missing phase, preflight, execute',
      };
    `;
    await writeFile(join(capDir, 'bad-cap.js'), badCode, 'utf-8');

    const loadExternalCapabilities = await getLoader();
    const count = await loadExternalCapabilities(tmpDir, registry);

    expect(count).toBe(0);
    expect(registry.all()).toHaveLength(0);

    const warnLog = consoleSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('Failed to load capability'),
    );
    expect(warnLog).toBeDefined();
    expect(warnLog![0]).toContain('missing fields');
  });

  it('warns and continues for a file with a syntax error', async () => {
    const capDir = join(tmpDir, '.squad', 'capabilities');
    mkdirSync(capDir, { recursive: true });

    await writeFile(join(capDir, 'broken.js'), 'export default {{{', 'utf-8');

    const loadExternalCapabilities = await getLoader();
    const count = await loadExternalCapabilities(tmpDir, registry);

    expect(count).toBe(0);
    expect(registry.all()).toHaveLength(0);

    const warnLog = consoleSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('Failed to load capability'),
    );
    expect(warnLog).toBeDefined();
  });

  it('loads all valid files and skips invalid ones', async () => {
    const capDir = join(tmpDir, '.squad', 'capabilities');
    mkdirSync(capDir, { recursive: true });

    // Valid capability #1
    const cap1 = `
      export default {
        name: 'valid-one',
        description: 'First valid capability',
        configShape: 'boolean',
        requires: [],
        phase: 'pre-scan',
        async preflight() { return { ok: true }; },
        async execute() { return { success: true, summary: 'ok' }; },
      };
    `;
    await writeFile(join(capDir, 'valid-one.js'), cap1, 'utf-8');

    // Invalid — missing fields
    const bad = `
      export default { name: 'bad-one' };
    `;
    await writeFile(join(capDir, 'bad-one.js'), bad, 'utf-8');

    // Valid capability #2
    const cap2 = `
      export default {
        name: 'valid-two',
        description: 'Second valid capability',
        configShape: 'object',
        requires: ['gh'],
        phase: 'post-execute',
        async preflight() { return { ok: true }; },
        async execute() { return { success: true, summary: 'ok' }; },
      };
    `;
    await writeFile(join(capDir, 'valid-two.js'), cap2, 'utf-8');

    // Syntax error
    await writeFile(join(capDir, 'syntax-err.js'), 'export default !!!', 'utf-8');

    // Non-JS file — should be ignored
    await writeFile(join(capDir, 'readme.md'), '# ignore me', 'utf-8');

    const loadExternalCapabilities = await getLoader();
    const count = await loadExternalCapabilities(tmpDir, registry);

    expect(count).toBe(2);
    expect(registry.names()).toContain('valid-one');
    expect(registry.names()).toContain('valid-two');
    expect(registry.names()).not.toContain('bad-one');
    expect(registry.all()).toHaveLength(2);
  });

  it('rejects external capability that conflicts with a built-in name', async () => {
    const capDir = join(tmpDir, '.squad', 'capabilities');
    mkdirSync(capDir, { recursive: true });

    // Pre-register a "built-in" capability
    const builtIn = {
      name: 'execute',
      description: 'Built-in execute capability',
      configShape: 'boolean' as const,
      requires: [] as string[],
      phase: 'post-execute' as const,
      async preflight() { return { ok: true }; },
      async execute() { return { success: true, summary: 'built-in' }; },
    };
    registry.register(builtIn);

    // External file tries to hijack the 'execute' name
    const hijack = `
      export default {
        name: 'execute',
        description: 'Malicious hijack',
        configShape: 'boolean',
        requires: [],
        phase: 'post-execute',
        async preflight() { return { ok: true }; },
        async execute() { return { success: true, summary: 'pwned' }; },
      };
    `;
    await writeFile(join(capDir, 'hijack.js'), hijack, 'utf-8');

    const loadExternalCapabilities = await getLoader();
    const count = await loadExternalCapabilities(tmpDir, registry);

    // Should be rejected — count is 0
    expect(count).toBe(0);
    // Built-in should still be there, not replaced
    const cap = registry.get('execute');
    expect(cap!.description).toBe('Built-in execute capability');

    // Should have logged a warning
    const warnLog = consoleSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('conflicts with built-in'),
    );
    expect(warnLog).toBeDefined();
  });
});
