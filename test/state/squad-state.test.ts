/**
 * SquadState integration tests.
 *
 * Uses InMemoryStorageProvider seeded with sample .squad/ files
 * to verify the full facade: SquadState → Collections → Handles → IO.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageProvider } from '../../packages/squad-sdk/src/storage/in-memory-storage-provider.js';
import { SquadState } from '../../packages/squad-sdk/src/state/squad-state.js';
import { NotFoundError } from '../../packages/squad-sdk/src/state/domain-types.js';

// ── Sample data ────────────────────────────────────────────────────────────

const ROOT = '/project';

const CHARTER_EECOM = `# EECOM — Core Dev

> Practical, thorough, makes it work then makes it right.

## Identity

- **Name:** EECOM
- **Role:** Core Dev
- **Expertise:** Runtime implementation, spawning
- **Style:** Practical, thorough, makes it work then makes it right.
`;

const CHARTER_RETRO = `# RETRO — Docs Lead

> Precise, structured, docs-first.

## Identity

- **Name:** RETRO
- **Role:** Docs Lead
- **Expertise:** Documentation, API references
- **Style:** Precise, structured, docs-first.
`;

const HISTORY_EECOM = `# EECOM

## Context

Project uses TypeScript with vitest for testing.

## Learnings

### 2026-07-24

Built the IO layer for state module.

### 2026-07-15

Fixed squad version subcommand.

## Decisions

### 2026-07-20

Use InMemoryStorageProvider for tests.
`;

const TEAM_MD = `# Project Squad

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| EECOM | Core Dev | \`.squad/agents/EECOM/charter.md\` | ✅ Active |
| RETRO | Docs Lead | \`.squad/agents/RETRO/charter.md\` | ✅ Active |
`;

const TEAM_MD_WITH_CONTEXT = `# Apollo 13 Mission Control

> High-stakes systems under pressure

## Project Context
Squad SDK — TypeScript monorepo for AI team orchestration.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| EECOM | Core Dev | \`.squad/agents/EECOM/charter.md\` | ✅ Active |
| RETRO | Docs Lead | \`.squad/agents/RETRO/charter.md\` | ✅ Active |
`;

const DECISIONS_MD = `# Decisions

### 2026-07-20: Use StorageProvider abstraction
**By:** EECOM
All file I/O goes through StorageProvider for testability.

### 2026-07-18: Markdown-first state
**By:** Dina
State files stay as markdown for human readability.
`;

const ROUTING_MD = `# Routing Rules

## Routing Table

| Work Type | Agent | Examples |
|-----------|-------|----------|
| feature-dev | EECOM | New features, refactors |
| docs | RETRO | Documentation updates |
`;

const ROUTING_MD_WITH_OWNERSHIP = `# Routing Rules

## Routing Table

| Work Type | Agent | Examples |
|-----------|-------|----------|
| feature-dev | EECOM | New features, refactors |
| docs | RETRO | Documentation updates |

## Module Ownership

| Module | Owner |
|--------|-------|
| src/storage/ | EECOM |
| src/state/ | CONTROL |
`;

const SKILL_TYPESCRIPT_TESTING = `---
name: TypeScript Testing
domain: testing
triggers: [vitest, jest, test, spec]
roles: [tester, developer]
---
Guidelines for writing TypeScript tests with vitest.
`;

const SKILL_CODE_REVIEW = `---
name: Code Review
domain: quality
triggers: [review, pr, pull-request]
roles: [reviewer]
---
Best practices for code review.
`;

const TEMPLATE_CHARTER = `# {{name}} — {{role}}

> {{tagline}}

## Identity

- **Name:** {{name}}
- **Role:** {{role}}
`;

const TEMPLATE_DECISION = `### {{date}}: {{title}}
**By:** {{author}}
{{body}}
`;

// ── Helpers ────────────────────────────────────────────────────────────────

function seedStorage(storage: InMemoryStorageProvider): void {
  storage.writeSync(`${ROOT}/.squad/agents/EECOM/charter.md`, CHARTER_EECOM);
  storage.writeSync(`${ROOT}/.squad/agents/EECOM/history.md`, HISTORY_EECOM);
  storage.writeSync(`${ROOT}/.squad/agents/RETRO/charter.md`, CHARTER_RETRO);
  storage.writeSync(`${ROOT}/.squad/agents/RETRO/history.md`, `# RETRO\n\n## Learnings\n`);
  storage.writeSync(`${ROOT}/.squad/team.md`, TEAM_MD);
  storage.writeSync(`${ROOT}/.squad/decisions.md`, DECISIONS_MD);
  storage.writeSync(`${ROOT}/.squad/routing.md`, ROUTING_MD);
  // Skills
  storage.writeSync(`${ROOT}/.copilot/skills/typescript-testing/SKILL.md`, SKILL_TYPESCRIPT_TESTING);
  storage.writeSync(`${ROOT}/.copilot/skills/code-review/SKILL.md`, SKILL_CODE_REVIEW);
  // Templates
  storage.writeSync(`${ROOT}/.squad/templates/charter.md`, TEMPLATE_CHARTER);
  storage.writeSync(`${ROOT}/.squad/templates/decision.md`, TEMPLATE_DECISION);
  // Log entries
  storage.writeSync(`${ROOT}/.squad/log/2026-07-24-session.md`, '# Session Log\nSpawned EECOM for feature work.');
  storage.writeSync(`${ROOT}/.squad/log/2026-07-25-review.md`, '# Review Log\nCode review completed.');
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SquadState', () => {
  let storage: InMemoryStorageProvider;
  let state: SquadState;

  beforeEach(async () => {
    storage = new InMemoryStorageProvider();
    seedStorage(storage);
    state = await SquadState.create(storage, ROOT);
  });

  // ── Factory ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('succeeds when .squad/ exists', async () => {
      expect(state).toBeInstanceOf(SquadState);
    });

    it('throws NotFoundError when .squad/ is missing', async () => {
      const empty = new InMemoryStorageProvider();
      await expect(SquadState.create(empty, '/empty')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('isInitialized()', () => {
    it('returns true when .squad/ exists', async () => {
      expect(await state.isInitialized()).toBe(true);
    });

    it('returns false when .squad/ is missing', async () => {
      const empty = new InMemoryStorageProvider();
      // Bypass create() validation with a direct instantiation trick
      // by testing on a state that was created then had squad/ removed
      await storage.deleteDir(`${ROOT}/.squad`);
      expect(await state.isInitialized()).toBe(false);
    });
  });

  // ── AgentsCollection ───────────────────────────────────────────────────

  describe('agents', () => {
    describe('list()', () => {
      it('returns agent names', async () => {
        const names = await state.agents.list();
        expect(names).toContain('EECOM');
        expect(names).toContain('RETRO');
        expect(names).toHaveLength(2);
      });
    });

    describe('get().charter()', () => {
      it('reads charter content', async () => {
        const handle = state.agents.get('EECOM');
        const charter = await handle.charter();
        expect(charter).toContain('EECOM — Core Dev');
        expect(charter).toContain('Practical, thorough');
      });

      it('throws NotFoundError for missing agent', async () => {
        const handle = state.agents.get('GHOST');
        await expect(handle.charter()).rejects.toThrow(NotFoundError);
      });
    });

    describe('get().history()', () => {
      it('returns all parsed history entries', async () => {
        const entries = await state.agents.get('EECOM').history();
        expect(entries.length).toBeGreaterThan(0);
        // Should have entries from Context, Learnings, and Decisions sections
        const sections = new Set(entries.map((e) => e.section));
        expect(sections.has('Learnings')).toBe(true);
        expect(sections.has('Decisions')).toBe(true);
      });

      it('filters by section', async () => {
        const entries = await state.agents.get('EECOM').history('Learnings');
        expect(entries.length).toBe(2);
        expect(entries.every((e) => e.section === 'Learnings')).toBe(true);
      });

      it('returns empty array for agent with no history file', async () => {
        await storage.delete(`${ROOT}/.squad/agents/RETRO/history.md`);
        const entries = await state.agents.get('RETRO').history();
        expect(entries).toEqual([]);
      });

      it('extracts timestamps from sub-headers', async () => {
        const entries = await state.agents.get('EECOM').history('Learnings');
        expect(entries[0]!.timestamp).toBe('2026-07-24');
        expect(entries[1]!.timestamp).toBe('2026-07-15');
      });
    });

    describe('get().appendHistory()', () => {
      it('appends a new entry to an existing section', async () => {
        const handle = state.agents.get('EECOM');
        await handle.appendHistory('Learnings', {
          section: 'Learnings',
          content: 'New learning about testing.',
          timestamp: '2026-07-26',
        });

        const entries = await handle.history('Learnings');
        expect(entries.length).toBe(3);
        expect(entries.some((e) => e.content.includes('New learning about testing.'))).toBe(true);
      });

      it('creates section if it does not exist', async () => {
        const handle = state.agents.get('EECOM');
        await handle.appendHistory('Issues', {
          section: 'Issues',
          content: 'Found a bug in parsing.',
          timestamp: '2026-07-26',
        });

        const entries = await handle.history('Issues');
        expect(entries.length).toBe(1);
        expect(entries[0]!.content).toContain('Found a bug in parsing.');
      });

      it('creates history file if missing', async () => {
        await storage.delete(`${ROOT}/.squad/agents/RETRO/history.md`);
        const handle = state.agents.get('RETRO');
        await handle.appendHistory('Learnings', {
          section: 'Learnings',
          content: 'First learning.',
          timestamp: '2026-07-26',
        });

        const entries = await handle.history('Learnings');
        expect(entries.length).toBe(1);
      });
    });

    describe('get().update()', () => {
      it('updates agent role in team.md', async () => {
        const handle = state.agents.get('EECOM');
        await handle.update({ role: 'Lead Dev' } as Partial<import('../../packages/squad-sdk/src/state/domain-types.js').Agent>);

        const teamConfig = await state.team.get();
        const member = teamConfig.members.find((m) => m.name === 'eecom');
        expect(member?.role).toBe('Lead Dev');
      });

      it('throws NotFoundError when agent not in team.md', async () => {
        const handle = state.agents.get('GHOST');
        await expect(
          handle.update({ role: 'Nobody' } as Partial<import('../../packages/squad-sdk/src/state/domain-types.js').Agent>),
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('create()', () => {
      it('creates agent directory with charter and history', async () => {
        await state.agents.create('NEWBIE', '# NEWBIE — Intern\n');
        const handle = state.agents.get('NEWBIE');
        const charter = await handle.charter();
        expect(charter).toContain('NEWBIE — Intern');

        const names = await state.agents.list();
        expect(names).toContain('NEWBIE');
      });
    });

    describe('delete()', () => {
      it('removes the agent directory', async () => {
        await state.agents.delete('RETRO');
        const names = await state.agents.list();
        expect(names).not.toContain('RETRO');
      });

      it('throws NotFoundError for missing agent', async () => {
        await expect(state.agents.delete('GHOST')).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });

  // ── DecisionsCollection ────────────────────────────────────────────────

  describe('decisions', () => {
    describe('list()', () => {
      it('returns parsed decisions', async () => {
        const decisions = await state.decisions.list();
        expect(decisions.length).toBe(2);
        expect(decisions[0]!.title).toContain('Use StorageProvider abstraction');
        expect(decisions[1]!.title).toContain('Markdown-first state');
      });

      it('returns empty array when file missing', async () => {
        await storage.delete(`${ROOT}/.squad/decisions.md`);
        const decisions = await state.decisions.list();
        expect(decisions).toEqual([]);
      });
    });

    describe('add()', () => {
      it('appends a new decision', async () => {
        await state.decisions.add({
          title: 'Use typed facades',
          author: 'EECOM',
          body: 'SquadState provides typed access to all collections.',
          configRelevant: false,
        });

        const decisions = await state.decisions.list();
        expect(decisions.length).toBe(3);
        expect(decisions.some((d) => d.title.includes('Use typed facades'))).toBe(true);
      });
    });
  });

  // ── RoutingCollection ──────────────────────────────────────────────────

  describe('routing', () => {
    describe('get()', () => {
      it('returns parsed routing config', async () => {
        const config = await state.routing.get();
        expect(config.rules.length).toBe(2);
        expect(config.rules[0]!.workType).toBe('feature-dev');
        expect(config.rules[0]!.agents).toContain('EECOM');
        expect(config.rules[1]!.workType).toBe('docs');
      });

      it('returns empty moduleOwnership when section missing', async () => {
        const config = await state.routing.get();
        expect(config.moduleOwnership.size).toBe(0);
      });

      it('populates moduleOwnership from Module Ownership section', async () => {
        await storage.write(`${ROOT}/.squad/routing.md`, ROUTING_MD_WITH_OWNERSHIP);
        const fresh = await SquadState.create(storage, ROOT);
        const config = await fresh.routing.get();
        expect(config.moduleOwnership.size).toBe(2);
        expect(config.moduleOwnership.get('src/storage/')).toBe('EECOM');
        expect(config.moduleOwnership.get('src/state/')).toBe('CONTROL');
      });

      it('throws NotFoundError when file missing', async () => {
        await storage.delete(`${ROOT}/.squad/routing.md`);
        await expect(state.routing.get()).rejects.toThrow(NotFoundError);
      });
    });

    describe('update()', () => {
      it('writes updated routing config', async () => {
        const config = await state.routing.get();
        const updated = {
          ...config,
          rules: [
            ...config.rules,
            { workType: 'testing', agents: ['EECOM'], examples: ['Unit tests'] },
          ],
        };
        await state.routing.update(updated);

        const reloaded = await state.routing.get();
        expect(reloaded.rules.length).toBe(3);
        expect(reloaded.rules[2]!.workType).toBe('testing');
      });
    });
  });

  // ── TeamCollection ─────────────────────────────────────────────────────

  describe('team', () => {
    describe('get()', () => {
      it('returns parsed team config', async () => {
        const config = await state.team.get();
        expect(config.members.length).toBe(2);
        // parseTeam kebab-cases names, so EECOM → eecom
        expect(config.members[0]!.name).toBe('eecom');
        expect(config.members[0]!.role).toBe('Core Dev');
        expect(config.members[1]!.name).toBe('retro');
      });

      it('returns empty projectContext when section missing', async () => {
        const config = await state.team.get();
        expect(config.projectContext).toBe('');
      });

      it('populates projectContext from content above Members', async () => {
        await storage.write(`${ROOT}/.squad/team.md`, TEAM_MD_WITH_CONTEXT);
        const fresh = await SquadState.create(storage, ROOT);
        const config = await fresh.team.get();
        expect(config.projectContext).toContain('High-stakes systems under pressure');
        expect(config.projectContext).toContain('Squad SDK');
      });

      it('throws NotFoundError when file missing', async () => {
        await storage.delete(`${ROOT}/.squad/team.md`);
        await expect(state.team.get()).rejects.toThrow(NotFoundError);
      });
    });

    describe('update()', () => {
      it('writes updated team config', async () => {
        const config = await state.team.get();
        const updated = {
          ...config,
          members: [
            ...config.members,
            { name: 'NEWBIE', role: 'Intern' },
          ],
        };
        await state.team.update(updated);

        const reloaded = await state.team.get();
        expect(reloaded.members.length).toBe(3);
        // Names survive round-trip as-is since we don't go through parseTeam on write
        expect(reloaded.members[2]!.name).toBe('newbie');
      });
    });
  });

  // ── SkillsCollection ──────────────────────────────────────────────────

  describe('skills', () => {
    describe('list()', () => {
      it('returns skill IDs', async () => {
        const ids = await state.skills.list();
        expect(ids).toContain('typescript-testing');
        expect(ids).toContain('code-review');
        expect(ids).toHaveLength(2);
      });

      it('returns empty array when skills directory is missing', async () => {
        const empty = new InMemoryStorageProvider();
        empty.writeSync(`${ROOT}/.squad/team.md`, TEAM_MD);
        const s = await SquadState.create(empty, ROOT);
        const ids = await s.skills.list();
        expect(ids).toEqual([]);
      });
    });

    describe('get()', () => {
      it('returns SkillDefinition for existing skill', async () => {
        const skill = await state.skills.get('typescript-testing');
        expect(skill).toBeDefined();
        expect(skill!.id).toBe('typescript-testing');
        expect(skill!.name).toBe('TypeScript Testing');
        expect(skill!.domain).toBe('testing');
        expect(skill!.triggers).toEqual(['vitest', 'jest', 'test', 'spec']);
        expect(skill!.agentRoles).toEqual(['tester', 'developer']);
        expect(skill!.content).toContain('Guidelines for writing TypeScript tests');
      });

      it('returns undefined for missing skill', async () => {
        const skill = await state.skills.get('nonexistent');
        expect(skill).toBeUndefined();
      });
    });

    describe('exists()', () => {
      it('returns true for existing skill', async () => {
        expect(await state.skills.exists('code-review')).toBe(true);
      });

      it('returns false for missing skill', async () => {
        expect(await state.skills.exists('nonexistent')).toBe(false);
      });
    });
  });

  // ── TemplatesCollection ───────────────────────────────────────────────

  describe('templates', () => {
    describe('list()', () => {
      it('returns template filenames', async () => {
        const names = await state.templates.list();
        expect(names).toContain('charter.md');
        expect(names).toContain('decision.md');
        expect(names).toHaveLength(2);
      });
    });

    describe('get()', () => {
      it('returns raw template content', async () => {
        const content = await state.templates.get('charter.md');
        expect(content).toBeDefined();
        expect(content).toContain('{{name}}');
        expect(content).toContain('{{role}}');
      });

      it('returns undefined for missing template', async () => {
        const content = await state.templates.get('nonexistent.md');
        expect(content).toBeUndefined();
      });
    });

    describe('exists()', () => {
      it('returns true for existing template', async () => {
        expect(await state.templates.exists('charter.md')).toBe(true);
      });

      it('returns false for missing template', async () => {
        expect(await state.templates.exists('nonexistent.md')).toBe(false);
      });
    });
  });

  // ── ConfigCollection ──────────────────────────────────────────────────

  describe('config', () => {
    describe('get()', () => {
      it('returns parsed config when file exists', async () => {
        storage.writeSync(
          `${ROOT}/.squad/config.json`,
          JSON.stringify({ cacheEnabled: true, cacheTtlMs: 60_000 }),
        );
        const s = await SquadState.create(storage, ROOT);
        const config = await s.config.get();
        expect(config.cacheEnabled).toBe(true);
        expect(config.cacheTtlMs).toBe(60_000);
      });

      it('returns defaults when file is missing', async () => {
        const config = await state.config.get();
        expect(config.cacheEnabled).toBe(false);
        expect(config.cacheTtlMs).toBe(300_000);
      });
    });

    describe('update()', () => {
      it('persists config and is readable', async () => {
        await state.config.update({ cacheEnabled: true, cacheTtlMs: 120_000 });
        const config = await state.config.get();
        expect(config.cacheEnabled).toBe(true);
        expect(config.cacheTtlMs).toBe(120_000);
      });
    });

    describe('exists()', () => {
      it('returns false when config.json is missing', async () => {
        expect(await state.config.exists()).toBe(false);
      });

      it('returns true after config is written', async () => {
        await state.config.update({ cacheEnabled: false });
        expect(await state.config.exists()).toBe(true);
      });
    });
  });

  // ── LogCollection ─────────────────────────────────────────────────────

  describe('log', () => {
    describe('list()', () => {
      it('returns log entry filenames', async () => {
        const names = await state.log.list();
        expect(names).toContain('2026-07-24-session.md');
        expect(names).toContain('2026-07-25-review.md');
        expect(names).toHaveLength(2);
      });
    });

    describe('get()', () => {
      it('reads a specific log entry', async () => {
        const content = await state.log.get('2026-07-24-session.md');
        expect(content).toContain('Session Log');
        expect(content).toContain('Spawned EECOM');
      });

      it('returns undefined for missing log entry', async () => {
        const content = await state.log.get('nonexistent.md');
        expect(content).toBeUndefined();
      });
    });

    describe('write()', () => {
      it('persists a new log entry and is readable', async () => {
        await state.log.write('2026-07-26-deploy.md', '# Deploy Log\nDeployed v1.2.0.');

        const content = await state.log.get('2026-07-26-deploy.md');
        expect(content).toBe('# Deploy Log\nDeployed v1.2.0.');

        const names = await state.log.list();
        expect(names).toContain('2026-07-26-deploy.md');
        expect(names).toHaveLength(3);
      });
    });
  });
});
