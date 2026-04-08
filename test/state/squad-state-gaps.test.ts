/**
 * SquadState Coverage Gaps — Tests for edge cases and error paths.
 *
 * Identified during FIDO's Phase 2 coverage audit.
 * Ensures error classes, schema helpers, and IO round-trips are fully tested.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  StateError,
  NotFoundError,
  ParseError,
  WriteConflictError,
  ProviderError,
} from '../../packages/squad-sdk/src/state/domain-types.js';
import { resolveCollectionPath } from '../../packages/squad-sdk/src/state/schema.js';
import {
  parseDecisions,
  serializeDecision,
  serializeDecisions,
} from '../../packages/squad-sdk/src/state/io/decisions-io.js';
import {
  parseRouting,
  serializeRouting,
} from '../../packages/squad-sdk/src/state/io/routing-io.js';
import {
  parseTeam,
  serializeTeam,
} from '../../packages/squad-sdk/src/state/io/team-io.js';
import { createAgentHandle } from '../../packages/squad-sdk/src/state/handles.js';
import { parseHistory } from '../../packages/squad-sdk/src/state/io/history-io.js';
import { InMemoryStorageProvider } from '../../packages/squad-sdk/src/storage/in-memory-storage-provider.js';
import {
  DecisionsCollection,
  RoutingCollection,
  TeamCollection,
} from '../../packages/squad-sdk/src/state/collections.js';

// Mock IO parsers so we can force throws to test ParseError wrapping.
// Each mock delegates to the real implementation by default.
vi.mock('../../packages/squad-sdk/src/state/io/decisions-io.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../packages/squad-sdk/src/state/io/decisions-io.js')>();
  return { ...mod, parseDecisions: vi.fn(mod.parseDecisions) };
});
vi.mock('../../packages/squad-sdk/src/state/io/routing-io.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../packages/squad-sdk/src/state/io/routing-io.js')>();
  return { ...mod, parseRouting: vi.fn(mod.parseRouting) };
});
vi.mock('../../packages/squad-sdk/src/state/io/team-io.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../packages/squad-sdk/src/state/io/team-io.js')>();
  return { ...mod, parseTeam: vi.fn(mod.parseTeam) };
});
vi.mock('../../packages/squad-sdk/src/state/io/history-io.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../packages/squad-sdk/src/state/io/history-io.js')>();
  return { ...mod, parseHistory: vi.fn(mod.parseHistory) };
});

// ── StateError Hierarchy Tests ────────────────────────────────────────────

describe('StateError Hierarchy', () => {
  describe('StateError base class', () => {
    it('has correct name and kind', () => {
      const error = new StateError('parse-error', 'test message');
      expect(error.name).toBe('StateError');
      expect(error.kind).toBe('parse-error');
      expect(error.message).toBe('test message');
      expect(error).toBeInstanceOf(Error);
    });

    it('preserves cause via ErrorOptions', () => {
      const cause = new Error('underlying');
      const error = new StateError('provider-error', 'wrapper', { cause });
      expect(error.cause).toBe(cause);
    });

    it('supports all StateErrorKind values', () => {
      const kinds: Array<import('../../packages/squad-sdk/src/state/domain-types.js').StateErrorKind> = [
        'not-found',
        'parse-error',
        'write-conflict',
        'provider-error',
      ];
      for (const kind of kinds) {
        const e = new StateError(kind, 'test');
        expect(e.kind).toBe(kind);
      }
    });
  });

  describe('NotFoundError', () => {
    it('has correct name and kind', () => {
      const error = new NotFoundError('agents', 'ghost');
      expect(error.name).toBe('NotFoundError');
      expect(error.kind).toBe('not-found');
      expect(error).toBeInstanceOf(StateError);
    });

    it('formats message with collection and id', () => {
      const error = new NotFoundError('agents', 'ghost');
      expect(error.message).toBe('Not found: agents/ghost');
    });

    it('formats message with collection only', () => {
      const error = new NotFoundError('team');
      expect(error.message).toBe('Not found: team');
    });

    it('supports instanceof checks', () => {
      const error = new NotFoundError('agents', 'ghost');
      expect(error instanceof NotFoundError).toBe(true);
      expect(error instanceof StateError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('ParseError', () => {
    it('has correct name and kind', () => {
      const error = new ParseError('decisions', 'invalid YAML');
      expect(error.name).toBe('ParseError');
      expect(error.kind).toBe('parse-error');
      expect(error).toBeInstanceOf(StateError);
    });

    it('formats message with collection and detail', () => {
      const error = new ParseError('decisions', 'invalid YAML');
      expect(error.message).toBe('Parse error in decisions: invalid YAML');
    });

    it('handles Unicode in detail string', () => {
      const error = new ParseError('team', 'Invalid emoji: 🔥💥');
      expect(error.message).toContain('Invalid emoji: 🔥💥');
    });
  });

  describe('WriteConflictError', () => {
    it('has correct name and kind', () => {
      const error = new WriteConflictError('team', 'eecom');
      expect(error.name).toBe('WriteConflictError');
      expect(error.kind).toBe('write-conflict');
      expect(error).toBeInstanceOf(StateError);
    });

    it('formats message with collection and id', () => {
      const error = new WriteConflictError('team', 'eecom');
      expect(error.message).toBe('Write conflict: team/eecom');
    });

    it('formats message with collection only', () => {
      const error = new WriteConflictError('routing');
      expect(error.message).toBe('Write conflict: routing');
    });
  });

  describe('ProviderError', () => {
    it('has correct name and kind', () => {
      const error = new ProviderError('read', 'disk full');
      expect(error.name).toBe('ProviderError');
      expect(error.kind).toBe('provider-error');
      expect(error).toBeInstanceOf(StateError);
    });

    it('formats message with operation and detail', () => {
      const error = new ProviderError('write', 'permission denied');
      expect(error.message).toBe('Provider write failed: permission denied');
    });
  });
});

// ── Schema resolveCollectionPath Tests ───────────────────────────────────

describe('resolveCollectionPath', () => {
  it('resolves static paths without id', () => {
    expect(resolveCollectionPath('decisions')).toBe('.squad/decisions.md');
    expect(resolveCollectionPath('routing')).toBe('.squad/routing.md');
    expect(resolveCollectionPath('team')).toBe('.squad/team.md');
    expect(resolveCollectionPath('log')).toBe('.squad/log');
    expect(resolveCollectionPath('config')).toBe('.squad/config.json');
  });

  it('resolves function paths with id', () => {
    expect(resolveCollectionPath('agents', 'eecom')).toBe('.squad/agents/eecom');
    expect(resolveCollectionPath('skills', 'typescript-testing')).toBe('.copilot/skills/typescript-testing');
    expect(resolveCollectionPath('templates', 'charter.md')).toBe('.squad/templates/charter.md');
  });

  it('throws when function path called without id', () => {
    expect(() => resolveCollectionPath('agents')).toThrow(
      'Collection "agents" requires an entity id to resolve its path',
    );
    expect(() => resolveCollectionPath('skills')).toThrow(
      'Collection "skills" requires an entity id to resolve its path',
    );
  });

  it('handles Unicode ids', () => {
    expect(resolveCollectionPath('agents', '文件')).toBe('.squad/agents/文件');
    expect(resolveCollectionPath('skills', 'résumé-writing')).toBe('.copilot/skills/résumé-writing');
  });

  it('handles ids with special characters', () => {
    expect(resolveCollectionPath('agents', 'agent-007')).toBe('.squad/agents/agent-007');
    expect(resolveCollectionPath('templates', 'issue.template.md')).toBe('.squad/templates/issue.template.md');
  });

  it('does not throw when static path called with id', () => {
    // Static paths ignore the id parameter
    expect(resolveCollectionPath('team', 'ignored')).toBe('.squad/team.md');
  });
});

// ── IO Round-Trip Tests ───────────────────────────────────────────────────

describe('IO Round-Trip', () => {
  describe('decisions-io', () => {
    it('round-trips a single decision', () => {
      const decision = {
        title: 'Use TypeScript',
        body: 'TypeScript provides type safety.',
        configRelevant: true,
        date: '2026-07-20',
        author: 'EECOM',
      };
      const serialized = serializeDecision(decision);
      const fullDoc = `# Decisions\n\n${serialized}\n`;
      const parsed = parseDecisions(fullDoc);
      expect(parsed.length).toBe(1);
      expect(parsed[0]!.title).toBe('Use TypeScript');
      expect(parsed[0]!.date).toBe('2026-07-20');
    });

    it('round-trips multiple decisions', () => {
      const decisions = [
        {
          title: 'First Decision',
          body: 'Body one.',
          configRelevant: true,
          date: '2026-07-20',
          author: 'Alice',
        },
        {
          title: 'Second Decision',
          body: 'Body two.',
          configRelevant: false,
          date: '2026-07-21',
          author: 'Bob',
        },
      ];
      const serialized = serializeDecisions(decisions);
      const parsed = parseDecisions(serialized);
      expect(parsed.length).toBe(2);
      expect(parsed[0]!.title).toBe('First Decision');
      expect(parsed[1]!.title).toBe('Second Decision');
    });

    it('handles decisions without date', () => {
      const decision = {
        title: 'No Date Decision',
        body: 'This has no date.',
        configRelevant: false,
      };
      const serialized = serializeDecision(decision);
      expect(serialized).toContain('### No Date Decision');
      expect(serialized).not.toContain(': No Date Decision');
    });

    it('handles decisions without author', () => {
      const decision = {
        title: 'Anonymous',
        body: 'No author.',
        configRelevant: false,
      };
      const serialized = serializeDecision(decision);
      expect(serialized).toContain('Anonymous');
    });

    it('handles empty decisions array', () => {
      const serialized = serializeDecisions([]);
      expect(serialized).toBe('# Decisions\n');
    });

    it('preserves Unicode in decision content', () => {
      const decision = {
        title: 'Support 日本語',
        body: 'Content with émojis 🚀 and Ελληνικά.',
        configRelevant: false,
        date: '2026-07-20',
        author: 'Ιωάννης',
      };
      const serialized = serializeDecision(decision);
      const parsed = parseDecisions(`# Decisions\n\n${serialized}\n`);
      expect(parsed[0]!.title).toContain('日本語');
      expect(parsed[0]!.body).toContain('🚀');
    });
  });

  describe('routing-io', () => {
    it('round-trips routing rules', () => {
      const rules = [
        {
          workType: 'feature-dev',
          agents: ['EECOM', 'NEWBIE'],
          examples: ['New features', 'Refactors'],
        },
        {
          workType: 'docs',
          agents: ['RETRO'],
          examples: ['API docs'],
        },
      ];
      const serialized = serializeRouting(rules);
      const parsed = parseRouting(serialized);
      expect(parsed.rules.length).toBe(2);
      expect(parsed.rules[0]!.workType).toBe('feature-dev');
      expect(parsed.rules[0]!.agents).toEqual(['EECOM', 'NEWBIE']);
      expect(parsed.rules[1]!.workType).toBe('docs');
    });

    it('handles rules without examples', () => {
      const rules = [
        {
          workType: 'testing',
          agents: ['FIDO'],
          examples: [],
        },
      ];
      const serialized = serializeRouting(rules);
      const parsed = parseRouting(serialized);
      // Parser returns undefined for empty examples column
      expect(parsed.rules[0]!.examples).toBeUndefined();
    });

    it('handles empty rules array', () => {
      const serialized = serializeRouting([]);
      expect(serialized).toContain('# Routing Rules');
      expect(serialized).toContain('| Work Type | Agent | Examples |');
    });

    it('preserves Unicode in routing rules', () => {
      const rules = [
        {
          workType: 'internationalization',
          agents: ['多言語チーム'],
          examples: ['Support 中文', 'Translate to Español'],
        },
      ];
      const serialized = serializeRouting(rules);
      const parsed = parseRouting(serialized);
      expect(parsed.rules[0]!.agents[0]).toBe('多言語チーム');
    });
  });

  describe('team-io', () => {
    it('round-trips team members', () => {
      const agents = [
        { name: 'eecom', role: 'Core Dev', skills: [], status: '✅ Active' },
        { name: 'retro', role: 'Docs Lead', skills: [], status: '✅ Active' },
      ];
      const serialized = serializeTeam(agents);
      const parsed = parseTeam(serialized);
      expect(parsed.agents.length).toBe(2);
      expect(parsed.agents[0]!.name).toBe('eecom');
      expect(parsed.agents[0]!.role).toBe('Core Dev');
      expect(parsed.agents[1]!.name).toBe('retro');
    });

    it('handles team metadata', () => {
      const agents = [{ name: 'agent', role: 'Dev', skills: [] }];
      const serialized = serializeTeam(agents, {
        teamName: 'Alpha Squad',
        tagline: 'First to fight.',
      });
      expect(serialized).toContain('# Alpha Squad');
      expect(serialized).toContain('> First to fight.');
    });

    it('uses default team name when not provided', () => {
      const agents = [{ name: 'agent', role: 'Dev', skills: [] }];
      const serialized = serializeTeam(agents);
      expect(serialized).toContain('# Team');
    });

    it('handles empty agents array', () => {
      const serialized = serializeTeam([]);
      expect(serialized).toContain('# Team');
      expect(serialized).toContain('## Members');
      expect(serialized).toContain('| Name | Role | Charter | Status |');
    });

    it('preserves Unicode in agent names and roles', () => {
      const agents = [
        { name: 'Αλέξανδρος', role: 'Architect 建筑师', skills: [], status: '✅ Active' },
      ];
      const serialized = serializeTeam(agents);
      const parsed = parseTeam(serialized);
      expect(parsed.agents[0]!.name).toBe('αλέξανδρος'); // parseTeam lowercases
      expect(parsed.agents[0]!.role).toContain('建筑师');
    });
  });
});

// ── createAgentHandle Edge Cases ──────────────────────────────────────────

describe('createAgentHandle edge cases', () => {
  it('handles agent name with spaces', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/agents/Agent Smith/charter.md`, '# Agent Smith\nTest');
    storage.writeSync(`${rootDir}/.squad/agents/Agent Smith/history.md`, '# Agent Smith\n');
    storage.writeSync(`${rootDir}/.squad/team.md`, `# Team\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n| Agent Smith | Dev | \`.squad/agents/Agent Smith/charter.md\` | ✅ Active |\n`);

    const handle = createAgentHandle('Agent Smith', storage, rootDir);
    const charter = await handle.charter();
    expect(charter).toContain('Agent Smith');
  });

  it('handles agent name with Unicode', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    const name = '文件管理员';
    storage.writeSync(`${rootDir}/.squad/agents/${name}/charter.md`, `# ${name}\nTest`);
    storage.writeSync(`${rootDir}/.squad/agents/${name}/history.md`, `# ${name}\n`);
    storage.writeSync(`${rootDir}/.squad/team.md`, `# Team\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n| ${name} | Dev | \`.squad/agents/${name}/charter.md\` | ✅ Active |\n`);

    const handle = createAgentHandle(name, storage, rootDir);
    const charter = await handle.charter();
    expect(charter).toContain(name);
  });

  it('appendHistory handles empty timestamp', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/agents/test/charter.md`, '# test');
    storage.writeSync(`${rootDir}/.squad/agents/test/history.md`, '# test\n\n## Learnings\n');
    storage.writeSync(`${rootDir}/.squad/team.md`, `# Team\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n| test | Dev | \`.squad/agents/test/charter.md\` | ✅ Active |\n`);

    const handle = createAgentHandle('test', storage, rootDir);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: 'New learning.',
      timestamp: '', // Empty timestamp
    });

    const entries = await handle.history('Learnings');
    expect(entries.length).toBe(1);
    expect(entries[0]!.content).toContain('New learning.');
  });

  it('history() returns empty array when section has no content', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/agents/test/charter.md`, '# test');
    storage.writeSync(`${rootDir}/.squad/agents/test/history.md`, '# test\n\n## Learnings\n\n## Decisions\n\nSome decision.');
    storage.writeSync(`${rootDir}/.squad/team.md`, `# Team\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n| test | Dev | \`.squad/agents/test/charter.md\` | ✅ Active |\n`);

    const handle = createAgentHandle('test', storage, rootDir);
    const learnings = await handle.history('Learnings');
    expect(learnings).toEqual([]);
  });
});

// ── Adversarial Markdown Tests — appendHistory() ─────────────────────────
//
// Covers hostile inputs flagged by Flight: code fences, empty sections,
// excessive whitespace, sub-headers, missing sections, unicode, large
// sections, and duplicate headers.

describe('appendHistory adversarial markdown', () => {
  const ROOT = '/adversarial';
  const AGENT = 'adversary';
  const HISTORY = `${ROOT}/.squad/agents/${AGENT}/history.md`;
  const CHARTER = `${ROOT}/.squad/agents/${AGENT}/charter.md`;
  const TEAM = `${ROOT}/.squad/team.md`;
  const TEAM_MD = [
    '# Team', '', '## Members', '',
    '| Name | Role | Charter | Status |',
    '|------|------|---------|--------|',
    `| ${AGENT} | Dev | ... | ✅ Active |`, '',
  ].join('\n');

  function setup(historyContent: string) {
    const storage = new InMemoryStorageProvider();
    storage.writeSync(CHARTER, `# ${AGENT}`);
    storage.writeSync(HISTORY, historyContent);
    storage.writeSync(TEAM, TEAM_MD);
    return { storage, handle: createAgentHandle(AGENT, storage, ROOT) };
  }

  it('code block with ## in a preceding section does not confuse append', async () => {
    // The fenced code block contains "## Fake Header" which the regex
    // could match. Placing it BEFORE the target section verifies that
    // the section-name regex finds the correct header.
    const content = [
      '# adversary', '',
      '## Context', '',
      'Example:', '',
      '```markdown',
      '## Fake Header',
      '```', '',
      '## Learnings', '',
      'Existing learning.', '',
    ].join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: 'New learning from test.',
      timestamp: '2026-01-15',
    });

    const result = storage.readSync(HISTORY)!;
    expect(result).toContain('## Learnings');
    expect(result).toContain('### 2026-01-15');
    expect(result).toContain('New learning from test.');
    // Code block still intact
    expect(result).toContain('```markdown');
    expect(result).toContain('## Fake Header');
  });

  it('empty section — append inserts between adjacent headers', async () => {
    const content = [
      '# adversary', '',
      '## Learnings', '',
      '## Patterns', '',
      'Some pattern.',
    ].join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: 'Injected into empty section.',
      timestamp: '2026-02-01',
    });

    const result = storage.readSync(HISTORY)!;
    const learningsIdx = result.indexOf('## Learnings');
    const patternsIdx = result.indexOf('## Patterns');
    const entryIdx = result.indexOf('Injected into empty section.');
    expect(entryIdx).toBeGreaterThan(learningsIdx);
    expect(entryIdx).toBeLessThan(patternsIdx);
  });

  it('consecutive sections with excessive whitespace', async () => {
    const content = [
      '# adversary', '',
      '## Learnings', '',
      'Existing.', '', '', '', '',
      '## Patterns', '',
      'Pattern.',
    ].join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: 'Whitespace test entry.',
      timestamp: '2026-03-01',
    });

    const result = storage.readSync(HISTORY)!;
    expect(result).toContain('Whitespace test entry.');
    const learningsIdx = result.indexOf('## Learnings');
    const patternsIdx = result.indexOf('## Patterns');
    const entryIdx = result.indexOf('Whitespace test entry.');
    expect(entryIdx).toBeGreaterThan(learningsIdx);
    expect(entryIdx).toBeLessThan(patternsIdx);
  });

  it('section with sub-headers — new entry appended after existing entries', async () => {
    const content = [
      '# adversary', '',
      '## Learnings', '',
      '### 2026-01-01', '', 'First learning.', '',
      '### 2026-01-02', '', 'Second learning.', '',
      '## Patterns', '',
      'A pattern.',
    ].join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: 'Third learning.',
      timestamp: '2026-01-03',
    });

    const result = storage.readSync(HISTORY)!;
    expect(result).toContain('### 2026-01-03');
    expect(result).toContain('Third learning.');
    // All entries before Patterns
    const patternsIdx = result.indexOf('## Patterns');
    expect(result.indexOf('Third learning.')).toBeLessThan(patternsIdx);
    // Originals preserved
    expect(result).toContain('First learning.');
    expect(result).toContain('Second learning.');
  });

  it('missing target section — creates it at the end', async () => {
    const content = [
      '# adversary', '',
      '## Learnings', '',
      'Existing learning.',
    ].join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Patterns', {
      section: 'Patterns',
      content: 'Brand new pattern.',
      timestamp: '2026-04-01',
    });

    const result = storage.readSync(HISTORY)!;
    expect(result).toContain('## Patterns');
    expect(result).toContain('### 2026-04-01');
    expect(result).toContain('Brand new pattern.');
    // Original preserved
    expect(result).toContain('## Learnings');
    expect(result).toContain('Existing learning.');
    // New section after existing content
    expect(result.indexOf('## Patterns')).toBeGreaterThan(result.indexOf('## Learnings'));
  });

  it('unicode content — emoji, CJK, RTL text preserved', async () => {
    const content = [
      '# adversary', '',
      '## Learnings', '',
      '### 2026-01-01', '',
      '🚀 Learned about 日本語 processing.', '',
      '### 2026-01-02', '',
      'مرحبا — RTL text with diacritics: café, naïve.',
    ].join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: '新しい学び 🎯 with Ελληνικά and العربية.',
      timestamp: '2026-01-03',
    });

    const result = storage.readSync(HISTORY)!;
    expect(result).toContain('🚀 Learned about 日本語 processing.');
    expect(result).toContain('مرحبا — RTL text with diacritics: café, naïve.');
    expect(result).toContain('新しい学び 🎯 with Ελληνικά and العربية.');
  });

  it('very long section with 50+ entries — append at correct position', async () => {
    const lines = ['# adversary', '', '## Learnings', ''];
    for (let i = 1; i <= 55; i++) {
      const mm = String(Math.ceil(i / 28)).padStart(2, '0');
      const dd = String((i % 28) + 1).padStart(2, '0');
      lines.push(`### 2026-${mm}-${dd}`, '', `Learning entry number ${i}.`, '');
    }
    lines.push('## Patterns', '', 'A pattern.');
    const content = lines.join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: 'Entry number 56.',
      timestamp: '2026-06-01',
    });

    const result = storage.readSync(HISTORY)!;
    expect(result).toContain('Entry number 56.');
    expect(result).toContain('### 2026-06-01');
    // New entry before Patterns section
    const patternsIdx = result.indexOf('## Patterns');
    expect(result.indexOf('Entry number 56.')).toBeLessThan(patternsIdx);
    // First and last originals preserved
    expect(result).toContain('Learning entry number 1.');
    expect(result).toContain('Learning entry number 55.');
  });

  it('duplicate section headers — appends to first occurrence', async () => {
    // Degenerate case: two ## Learnings sections. The regex finds the
    // first, then the "next ##" search finds the second — so the entry
    // lands between the two blocks.
    const content = [
      '# adversary', '',
      '## Learnings', '',
      'First block content.', '',
      '## Learnings', '',
      'Second block content.',
    ].join('\n');

    const { handle, storage } = setup(content);
    await handle.appendHistory('Learnings', {
      section: 'Learnings',
      content: 'Appended entry.',
      timestamp: '2026-05-01',
    });

    const result = storage.readSync(HISTORY)!;
    expect(result).toContain('Appended entry.');
    const firstIdx = result.indexOf('## Learnings');
    const secondIdx = result.indexOf('## Learnings', firstIdx + 1);
    const entryIdx = result.indexOf('Appended entry.');
    expect(entryIdx).toBeGreaterThan(firstIdx);
    expect(entryIdx).toBeLessThan(secondIdx);
  });
});

// ── Adversarial Markdown Tests — parseHistory() ──────────────────────────
//
// Edge cases for the regex-based section parser: empty input, title-only
// files, and malformed h2 headers that should be ignored.

describe('parseHistory adversarial markdown', () => {
  it('empty string returns empty parsed result', () => {
    const result = parseHistory('');
    expect(result.fullContent).toBe('');
    expect(result.context).toBeUndefined();
    expect(result.learnings).toBeUndefined();
    expect(result.decisions).toBeUndefined();
    expect(result.patterns).toBeUndefined();
    expect(result.issues).toBeUndefined();
    expect(result.references).toBeUndefined();
  });

  it('whitespace-only string returns empty parsed result', () => {
    const result = parseHistory('   \n\n   \n');
    expect(result.context).toBeUndefined();
    expect(result.learnings).toBeUndefined();
  });

  it('only title with no ## sections', () => {
    const md = '# Agent Name\n\nSome introductory text with no sections.\n';
    const result = parseHistory(md);
    expect(result.fullContent).toContain('# Agent Name');
    expect(result.context).toBeUndefined();
    expect(result.learnings).toBeUndefined();
    expect(result.decisions).toBeUndefined();
    expect(result.patterns).toBeUndefined();
    expect(result.issues).toBeUndefined();
    expect(result.references).toBeUndefined();
  });

  it('malformed header ##NoSpace is ignored', () => {
    const md = '# Agent\n\n##NoSpace content here\n\n## Learnings\n\nReal content.\n';
    const result = parseHistory(md);
    expect(result.learnings).toBe('Real content.');
    expect(result.context).toBeUndefined();
  });

  it('malformed header "## " (trailing space) — cross-line regex consumption', () => {
    // BUG DOCUMENTED: headerRegex /^##\s+(.+?)\s*$/gm lets \s+ consume
    // newlines, so "## \n\n## Learnings" matches as a SINGLE header with
    // captured name "## Learnings". The real section is consumed and lost.
    const md = '# Agent\n\n## \n\n## Learnings\n\nReal content.\n';
    const result = parseHistory(md);
    expect(result.learnings).toBeUndefined();
  });

  it('malformed header "##" alone — cross-line regex consumption', () => {
    // Same bug: "##" followed by \n lets \s+ match \n\n, then (.+?)
    // consumes the next header line text, destroying the section boundary.
    const md = '# Agent\n\n##\n\n## Learnings\n\nReal content.\n';
    const result = parseHistory(md);
    expect(result.learnings).toBeUndefined();
  });

  it('unrecognized section names are not mapped to known fields', () => {
    const md = [
      '# Agent', '',
      '## Custom Section', '', 'Custom stuff.', '',
      '## Learnings', '', 'A learning.', '',
    ].join('\n');
    const result = parseHistory(md);
    expect(result.learnings).toBe('A learning.');
    // Custom Section parsed but not mapped to any known field
    expect(result.context).toBeUndefined();
    expect(result.decisions).toBeUndefined();
  });
});

// ── ParseError Wrapping at Facade Boundary ───────────────────────────────

import { parseHistory } from '../../packages/squad-sdk/src/state/io/history-io.js';

const mockedParseDecisions = vi.mocked(parseDecisions);
const mockedParseRouting = vi.mocked(parseRouting);
const mockedParseTeam = vi.mocked(parseTeam);
const mockedParseHistory = vi.mocked(parseHistory);

describe('ParseError wrapping at facade boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DecisionsCollection.list() wraps parser errors with ParseError', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/decisions.md`, 'malformed content');
    const col = new DecisionsCollection(storage, rootDir);

    const cause = new Error('unexpected token');
    mockedParseDecisions.mockImplementationOnce(() => { throw cause; });

    const err = await col.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toContain('decisions');
    expect((err as ParseError).cause).toBe(cause);
  });

  it('RoutingCollection.get() wraps parser errors with ParseError', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/routing.md`, 'malformed content');
    const col = new RoutingCollection(storage, rootDir);

    const cause = new Error('bad table');
    mockedParseRouting.mockImplementationOnce(() => { throw cause; });

    const err = await col.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toContain('routing');
    expect((err as ParseError).cause).toBe(cause);
  });

  it('TeamCollection.get() wraps parser errors with ParseError', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/team.md`, 'malformed content');
    const col = new TeamCollection(storage, rootDir);

    const cause = new Error('missing members table');
    mockedParseTeam.mockImplementationOnce(() => { throw cause; });

    const err = await col.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toContain('team');
    expect((err as ParseError).cause).toBe(cause);
  });

  it('AgentHandle.history() wraps parser errors with ParseError', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/agents/test/charter.md`, '# test');
    storage.writeSync(`${rootDir}/.squad/agents/test/history.md`, 'malformed content');
    const handle = createAgentHandle('test', storage, rootDir);

    const cause = new Error('corrupt history');
    mockedParseHistory.mockImplementationOnce(() => { throw cause; });

    const err = await handle.history().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toContain('history');
    expect((err as ParseError).cause).toBe(cause);
  });

  it('AgentHandle.update() wraps team parser errors with ParseError', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/team.md`, 'malformed content');
    const handle = createAgentHandle('test', storage, rootDir);

    const cause = new Error('team parse failure');
    mockedParseTeam.mockImplementationOnce(() => { throw cause; });

    const err = await handle.update({ role: 'Tester' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toContain('team');
    expect((err as ParseError).cause).toBe(cause);
  });

  it('preserves non-Error cause as string in message', async () => {
    const storage = new InMemoryStorageProvider();
    const rootDir = '/test';
    storage.writeSync(`${rootDir}/.squad/decisions.md`, 'malformed content');
    const col = new DecisionsCollection(storage, rootDir);

    mockedParseDecisions.mockImplementationOnce(() => { throw 'raw string error'; });

    const err = await col.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toContain('raw string error');
    expect((err as ParseError).cause).toBe('raw string error');
  });
});
