/**
 * Tests for CharterCompiler class + parseCharterMarkdown + compileCharterFull
 *
 * Covers:
 * - CharterCompiler.compile() reads charter.md and produces AgentCharter
 * - CharterCompiler.compileAll() finds all charters in a team root
 * - Error handling (missing file, malformed charter)
 * - parseCharterMarkdown with real charter content from test-fixtures
 * - compileCharterFull metadata (resolvedModel, resolvedTools, parsed)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  CharterCompiler,
  parseCharterMarkdown,
  compileCharter,
  compileCharterFull,
  type CharterCompileOptions,
} from '@bradygaster/squad-sdk/agents';

// --- Fixtures ---

const FIXTURES_ROOT = path.resolve(__dirname, '..', 'test-fixtures', '.squad');
const FENSTER_CHARTER = path.join(FIXTURES_ROOT, 'agents', 'fenster', 'charter.md');
const HOCKNEY_CHARTER = path.join(FIXTURES_ROOT, 'agents', 'hockney', 'charter.md');

const FULL_CHARTER = `# Verbal — Prompt Engineer

## Identity

**Name:** Verbal
**Role:** Prompt Engineer
**Expertise:** LLM prompts, agent design, system instructions
**Style:** Precise. Every word in a prompt earns its place.

## What I Own

Prompt engineering and agent instruction design.

## Boundaries

Do not modify runtime code. Stay within prompt and charter files.

## Model

**Preferred:** claude-sonnet-4.5
**Rationale:** Best balance of speed and quality for prompt work
**Fallback:** claude-haiku-4.5

## Collaboration

Works closely with Fenster on agent integration testing.
`;

const MINIMAL_CHARTER = `# Barebones Agent

Some content but no structured sections.
`;

const EMPTY_CHARTER = '';

// =============================================================================
// parseCharterMarkdown Tests
// =============================================================================

describe('parseCharterMarkdown', () => {
  describe('identity parsing', () => {
    it('extracts name from ** bold format', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.identity.name).toBe('Verbal');
    });

    it('extracts role', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.identity.role).toBe('Prompt Engineer');
    });

    it('extracts expertise as array', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.identity.expertise).toEqual([
        'LLM prompts',
        'agent design',
        'system instructions',
      ]);
    });

    it('extracts style', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.identity.style).toBe('Precise. Every word in a prompt earns its place.');
    });
  });

  describe('section extraction', () => {
    it('extracts ownership section', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.ownership).toContain('Prompt engineering');
    });

    it('extracts boundaries section', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.boundaries).toContain('Do not modify runtime code');
    });

    it('extracts model preference', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.modelPreference).toBe('claude-sonnet-4.5');
    });

    it('extracts model rationale', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.modelRationale).toBe('Best balance of speed and quality for prompt work');
    });

    it('extracts model fallback', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.modelFallback).toBe('claude-haiku-4.5');
    });

    it('extracts collaboration section', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.collaboration).toContain('Fenster');
    });

    it('preserves full content', () => {
      const parsed = parseCharterMarkdown(FULL_CHARTER);
      expect(parsed.fullContent).toBe(FULL_CHARTER);
    });
  });

  describe('missing sections', () => {
    it('returns empty identity for minimal charter', () => {
      const parsed = parseCharterMarkdown(MINIMAL_CHARTER);
      expect(parsed.identity.name).toBeUndefined();
      expect(parsed.identity.role).toBeUndefined();
      expect(parsed.identity.expertise).toBeUndefined();
    });

    it('returns undefined ownership when section missing', () => {
      const parsed = parseCharterMarkdown(MINIMAL_CHARTER);
      expect(parsed.ownership).toBeUndefined();
    });

    it('returns undefined model preference when section missing', () => {
      const parsed = parseCharterMarkdown(MINIMAL_CHARTER);
      expect(parsed.modelPreference).toBeUndefined();
    });

    it('returns undefined model rationale when section missing', () => {
      const parsed = parseCharterMarkdown(MINIMAL_CHARTER);
      expect(parsed.modelRationale).toBeUndefined();
    });

    it('returns undefined model fallback when section missing', () => {
      const parsed = parseCharterMarkdown(MINIMAL_CHARTER);
      expect(parsed.modelFallback).toBeUndefined();
    });
  });

  describe('empty / malformed content', () => {
    it('handles empty string', () => {
      const parsed = parseCharterMarkdown(EMPTY_CHARTER);
      expect(parsed.identity).toEqual({});
      expect(parsed.fullContent).toBe('');
    });

    it('handles whitespace-only string', () => {
      const parsed = parseCharterMarkdown('   \n\n   ');
      expect(parsed.identity).toEqual({});
    });

    it('handles charter with only heading', () => {
      const parsed = parseCharterMarkdown('# Just A Heading\n');
      expect(parsed.identity.name).toBeUndefined();
      expect(parsed.fullContent).toContain('Just A Heading');
    });
  });

  describe('real fixture charters', () => {
    it('parses fenster charter from test-fixtures', async () => {
      const content = await fs.readFile(FENSTER_CHARTER, 'utf-8');
      const parsed = parseCharterMarkdown(content);
      expect(parsed.identity.name).toBe('Fenster');
      expect(parsed.identity.role).toBe('Core Dev');
    });

    it('parses hockney charter from test-fixtures', async () => {
      const content = await fs.readFile(HOCKNEY_CHARTER, 'utf-8');
      const parsed = parseCharterMarkdown(content);
      expect(parsed.identity.name).toBe('Hockney');
      expect(parsed.identity.role).toBe('Tester');
    });
  });
});

// =============================================================================
// compileCharterFull Tests
// =============================================================================

describe('compileCharterFull', () => {
  it('returns CompiledCharter with parsed metadata', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/verbal/charter.md',
      charterContent: FULL_CHARTER,
    });

    expect(result.parsed).toBeDefined();
    expect(result.parsed.identity.name).toBe('Verbal');
    expect(result.parsed.identity.role).toBe('Prompt Engineer');
  });

  it('resolves model from charter preference', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
    });

    expect(result.resolvedModel).toBe('claude-sonnet-4.5');
  });

  it('config override model wins over charter', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
      configOverrides: { model: 'claude-opus-4.6' },
    });

    expect(result.resolvedModel).toBe('claude-opus-4.6');
  });

  it('config override role wins over charter role', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
      configOverrides: { role: 'Lead Engineer' },
    });

    expect(result.displayName).toContain('Lead Engineer');
  });

  it('config override displayName wins', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
      configOverrides: { displayName: 'Custom Display Name' },
    });

    expect(result.displayName).toBe('Custom Display Name');
  });

  it('config override tools are set', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
      configOverrides: { tools: ['grep', 'edit'] },
    });

    expect(result.resolvedTools).toEqual(['grep', 'edit']);
    expect(result.tools).toEqual(['grep', 'edit']);
  });

  it('appends extraPrompt from config overrides', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
      configOverrides: { extraPrompt: 'ALWAYS follow the style guide.' },
    });

    expect(result.prompt).toContain('ALWAYS follow the style guide.');
  });

  it('includes team context in prompt', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
      teamContext: 'Team: Fenster, Verbal, Hockney',
    });

    expect(result.prompt).toContain('Team Context');
    expect(result.prompt).toContain('Fenster, Verbal, Hockney');
  });

  it('handles empty charter content gracefully', () => {
    const result = compileCharterFull({
      agentName: 'empty',
      charterPath: '/test/charter.md',
      charterContent: '',
    });

    expect(result.name).toBe('empty');
    expect(result.prompt).toContain('empty');
  });

  it('description includes expertise when available', () => {
    const result = compileCharterFull({
      agentName: 'verbal',
      charterPath: '/test/charter.md',
      charterContent: FULL_CHARTER,
    });

    expect(result.description).toContain('Expertise');
    expect(result.description).toContain('LLM prompts');
  });
});

// =============================================================================
// CharterCompiler class Tests (stub — not yet implemented)
// =============================================================================

describe('CharterCompiler class', () => {
  let compiler: CharterCompiler;

  beforeAll(() => {
    compiler = new CharterCompiler();
  });

  describe('compile()', () => {
    it('reads charter.md and produces AgentCharter', async () => {
      const charter = await compiler.compile(FENSTER_CHARTER);
      expect(charter.name).toBe('fenster');
      expect(charter.role).toBe('Core Dev');
      expect(charter.displayName).toContain('Fenster');
      expect(charter.prompt).toBeTruthy();
    });

    it('parses hockney charter correctly', async () => {
      const charter = await compiler.compile(HOCKNEY_CHARTER);
      expect(charter.name).toBe('hockney');
      expect(charter.role).toBe('Tester');
    });

    it('includes model preference from charter', async () => {
      const charter = await compiler.compile(FENSTER_CHARTER);
      // modelPreference may or may not be set depending on charter content
      expect(charter).toHaveProperty('modelPreference');
    });

    it('throws on missing file', async () => {
      await expect(compiler.compile('/nonexistent/path/charter.md')).rejects.toThrow();
    });
  });

  describe('compileAll()', () => {
    it('finds all charters in test-fixtures team root', async () => {
      const teamRoot = path.resolve(__dirname, '..', 'test-fixtures');
      const charters = await compiler.compileAll(teamRoot);
      expect(charters.length).toBeGreaterThanOrEqual(1);
      const names = charters.map(c => c.name);
      expect(names).toContain('fenster');
    });

    it('skips agents without charter.md (no error)', async () => {
      const teamRoot = path.resolve(__dirname, '..', 'test-fixtures');
      // Should not throw even if some directories lack charter.md
      const charters = await compiler.compileAll(teamRoot);
      expect(Array.isArray(charters)).toBe(true);
    });

    it('throws on non-existent team root', async () => {
      await expect(compiler.compileAll('/nonexistent/root')).rejects.toThrow();
    });
  });
});
