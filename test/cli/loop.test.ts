/**
 * CLI Loop Command — Unit Tests
 *
 * Tests the pure functions parseLoopFile() and generateLoopFile() from the
 * loop command without spawning processes or touching the file system.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLoopFile,
  generateLoopFile,
} from '../../packages/squad-cli/src/cli/commands/loop.js';

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
