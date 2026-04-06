/**
 * CLI Loop Command — Unit Tests
 *
 * Tests the pure functions parseLoopFile() and generateLoopFile() from the
 * loop command without spawning processes or touching the file system.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import {
  parseLoopFile,
  generateLoopFile,
  runLoop,
  type LoopConfig,
} from '../../packages/squad-cli/src/cli/commands/loop.js';
import { detectSquadDir } from '../../packages/squad-cli/src/cli/core/detect-squad-dir.js';
import { createDefaultRegistry } from '../../packages/squad-cli/src/cli/commands/watch/index.js';
import { parseRoster } from '@bradygaster/squad-sdk/ralph/triage';

// ── Module Mocks (hoisted by vitest) ─────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('../../packages/squad-cli/src/cli/core/detect-squad-dir.js', () => ({
  detectSquadDir: vi.fn(),
}));

vi.mock('../../packages/squad-cli/src/cli/commands/watch/index.js', () => ({
  createDefaultRegistry: vi.fn(),
  CapabilityRegistry: vi.fn(),
}));

vi.mock('@bradygaster/squad-sdk/platform', () => ({
  createPlatformAdapter: vi.fn(),
}));

vi.mock('@bradygaster/squad-sdk/ralph/triage', () => ({
  parseRoster: vi.fn(),
}));

// ── parseLoopFile ────────────────────────────────────────────────

describe('parseLoopFile', () => {
  it('parses valid frontmatter with all fields', () => {
    const content = [
      '---',
      'configured: true',
      'interval: 5',
      'timeout: 15',
      'description: "Run health checks"',
      '---',
      '',
      'Do the thing.',
    ].join('\n');

    const { frontmatter, prompt } = parseLoopFile(content);

    expect(frontmatter.configured).toBe(true);
    expect(frontmatter.interval).toBe(5);
    expect(frontmatter.timeout).toBe(15);
    expect(frontmatter.description).toBe('Run health checks');
    expect(prompt).toBe('Do the thing.');
  });

  it('returns defaults when frontmatter is missing', () => {
    const { frontmatter, prompt } = parseLoopFile('Just a prompt with no frontmatter.');

    expect(frontmatter.configured).toBe(false);
    expect(frontmatter.interval).toBe(10);
    expect(frontmatter.timeout).toBe(30);
    expect(frontmatter.description).toBeUndefined();
    expect(prompt).toBe('Just a prompt with no frontmatter.');
  });

  it('handles opener --- without a closing ---', () => {
    const content = [
      '---',
      'configured: true',
      'interval: 3',
      'some body text that never gets a closer',
    ].join('\n');

    const { frontmatter, prompt } = parseLoopFile(content);

    // Frontmatter lines are still parsed even without a closing delimiter
    expect(frontmatter.configured).toBe(true);
    expect(frontmatter.interval).toBe(3);
    // bodyStart stays 0 → entire content (including ---) becomes the prompt
    expect(prompt).toBe(content);
  });

  it('fills defaults for missing frontmatter fields', () => {
    const content = [
      '---',
      'configured: true',
      '---',
      '',
      'Partial config prompt.',
    ].join('\n');

    const { frontmatter, prompt } = parseLoopFile(content);

    expect(frontmatter.configured).toBe(true);
    expect(frontmatter.interval).toBe(10);
    expect(frontmatter.timeout).toBe(30);
    expect(frontmatter.description).toBeUndefined();
    expect(prompt).toBe('Partial config prompt.');
  });

  it('parses configured: false as boolean false', () => {
    const content = ['---', 'configured: false', '---'].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.configured).toBe(false);
  });

  it('parses configured: true as boolean true', () => {
    const content = ['---', 'configured: true', '---'].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.configured).toBe(true);
  });

  it('treats any non-"true" configured value as false', () => {
    const content = ['---', 'configured: yes', '---'].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.configured).toBe(false);
  });

  it('strips double-quoted description', () => {
    const content = ['---', 'description: "Hello World"', '---'].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.description).toBe('Hello World');
  });

  it('strips single-quoted description', () => {
    const content = ["---", "description: 'Hello World'", "---"].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.description).toBe('Hello World');
  });

  it('leaves unquoted description as-is', () => {
    const content = ['---', 'description: Hello World', '---'].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.description).toBe('Hello World');
  });

  it('falls back to default interval for non-numeric value', () => {
    const content = ['---', 'interval: abc', '---'].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.interval).toBe(10);
  });

  it('falls back to default timeout for non-numeric value', () => {
    const content = ['---', 'timeout: xyz', '---'].join('\n');
    const { frontmatter } = parseLoopFile(content);
    expect(frontmatter.timeout).toBe(30);
  });

  it('captures multi-line body text as prompt', () => {
    const content = [
      '---',
      'configured: true',
      '---',
      '',
      'Line one.',
      '',
      'Line two.',
    ].join('\n');

    const { prompt } = parseLoopFile(content);
    expect(prompt).toBe('Line one.\n\nLine two.');
  });

  it('returns empty prompt when body is empty', () => {
    const content = ['---', 'configured: true', '---'].join('\n');
    const { prompt } = parseLoopFile(content);
    expect(prompt).toBe('');
  });

  it('returns empty prompt for empty string input', () => {
    const { frontmatter, prompt } = parseLoopFile('');
    expect(frontmatter.configured).toBe(false);
    expect(prompt).toBe('');
  });
});

// ── generateLoopFile ─────────────────────────────────────────────

describe('generateLoopFile', () => {
  let templateContent: string;

  beforeAll(async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    templateContent = realFs.readFileSync(
      path.resolve('packages/squad-cli/templates/loop.md'),
      'utf-8',
    ) as string;
  });

  beforeEach(() => {
    vi.mocked(readFileSync).mockReturnValue(templateContent);
  });

  afterEach(() => {
    vi.mocked(readFileSync).mockReset();
  });

  it('returns a string', () => {
    expect(typeof generateLoopFile()).toBe('string');
  });

  it('contains configured: false', () => {
    expect(generateLoopFile()).toContain('configured: false');
  });

  it('has opening and closing frontmatter delimiters', () => {
    const content = generateLoopFile();
    const lines = content.split('\n');
    const dashes = lines.filter(l => l.trim() === '---');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('includes default interval and timeout values', () => {
    const content = generateLoopFile();
    expect(content).toContain('interval: 10');
    expect(content).toContain('timeout: 30');
  });

  it('includes guidance about setting configured: true', () => {
    expect(generateLoopFile()).toContain('configured: true');
  });

  it('is parseable by parseLoopFile and round-trips defaults', () => {
    const { frontmatter } = parseLoopFile(generateLoopFile());
    expect(frontmatter.configured).toBe(false);
    expect(frontmatter.interval).toBe(10);
    expect(frontmatter.timeout).toBe(30);
  });
});

// ── runLoop ──────────────────────────────────────────────────────

describe('runLoop', () => {
  const DEST = '/fake/project';

  const validLoopMd = [
    '---',
    'configured: true',
    'interval: 5',
    'timeout: 15',
    'description: "Test loop"',
    '---',
    '',
    'Do the work.',
  ].join('\n');

  const unconfiguredLoopMd = [
    '---',
    'configured: false',
    'interval: 5',
    'timeout: 15',
    '---',
    '',
    'Do the work.',
  ].join('\n');

  const emptyBodyLoopMd = [
    '---',
    'configured: true',
    'interval: 5',
    'timeout: 15',
    '---',
  ].join('\n');

  const defaultOptions: LoopConfig = {
    capabilities: {},
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(detectSquadDir).mockReturnValue({
      path: path.resolve(DEST, '.squad'),
      name: '.squad',
      isLegacy: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when loop.md does not exist', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p).endsWith('team.md')) return true;
      return false;
    });

    await runLoop(DEST, defaultOptions);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('squad loop --init'),
    );
  });

  it('runs in onboarding mode when configured is false', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(unconfiguredLoopMd as any);
    vi.mocked(parseRoster).mockReturnValue([]);
    // Throw sentinel in createDefaultRegistry to halt execution after onboarding log
    vi.mocked(createDefaultRegistry).mockImplementation(() => {
      throw new Error('test-sentinel: stop after preflight');
    });

    await expect(runLoop(DEST, { ...defaultOptions, agentCmd: 'custom-agent' })).rejects.toThrow('test-sentinel');

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Onboarding mode'),
    );
  });

  it('calls fatal when prompt body is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(emptyBodyLoopMd as any);

    await expect(runLoop(DEST, defaultOptions)).rejects.toThrow(
      /no prompt body/i,
    );
  });

  it('calls fatal when interval is less than 1', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(validLoopMd as any);

    await expect(
      runLoop(DEST, { ...defaultOptions, interval: 0 }),
    ).rejects.toThrow(/interval/i);
  });

  it('calls fatal when timeout is less than 1', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(validLoopMd as any);

    await expect(
      runLoop(DEST, { ...defaultOptions, timeout: 0 }),
    ).rejects.toThrow(/timeout/i);
  });

  it('calls fatal when gh copilot preflight fails without agentCmd', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(validLoopMd as any);
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') (cb as Function)(new Error('gh not found'));
      return {} as any;
    });

    await expect(runLoop(DEST, defaultOptions)).rejects.toThrow(
      /gh CLI/i,
    );
  });

  it('skips gh copilot preflight when agentCmd is provided', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(validLoopMd as any);
    vi.mocked(parseRoster).mockReturnValue([]);
    // Throw sentinel in createDefaultRegistry to halt execution after preflight
    vi.mocked(createDefaultRegistry).mockImplementation(() => {
      throw new Error('test-sentinel: stop after preflight');
    });

    await expect(
      runLoop(DEST, { ...defaultOptions, agentCmd: 'custom-agent --run' }),
    ).rejects.toThrow('test-sentinel');

    // execFile should NOT have been called — preflight was skipped
    expect(execFile).not.toHaveBeenCalled();
  });
});
