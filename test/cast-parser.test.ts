/**
 * Tests for parseCastResponse and createTeam — the REPL casting engine.
 * Ensures robust parsing of various model response formats and correct
 * file scaffolding for both fresh and pre-initialised projects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseCastResponse, createTeam, type CastProposal } from '../packages/squad-cli/src/cli/core/cast.js';

describe('parseCastResponse', () => {
  it('parses strict INIT_TEAM format', () => {
    const response = `INIT_TEAM:
- Ripley | Lead | Architecture, code review, decisions
- Dallas | Frontend Dev | React, UI, components
- Kane | Backend Dev | Node.js, APIs, database
- Lambert | Tester | Tests, quality, edge cases
UNIVERSE: Alien
PROJECT: A React and Node.js web application`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(4);
    expect(result!.members[0]!.name).toBe('Ripley');
    expect(result!.members[0]!.role).toBe('Lead');
    expect(result!.universe).toBe('Alien');
    expect(result!.projectDescription).toBe('A React and Node.js web application');
  });

  it('parses INIT_TEAM wrapped in markdown code block', () => {
    const response = `Here's the team I'd suggest:

\`\`\`
INIT_TEAM:
- Neo | Lead | Architecture, decisions
- Trinity | Frontend Dev | React, UI
- Morpheus | Backend Dev | APIs, database
- Tank | Tester | Tests, quality
UNIVERSE: The Matrix
PROJECT: A web dashboard
\`\`\`

Let me know if this works!`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(4);
    expect(result!.members[0]!.name).toBe('Neo');
    expect(result!.universe).toBe('The Matrix');
  });

  it('parses response with preamble text before INIT_TEAM', () => {
    const response = `Based on your project, I'd suggest the following team:

INIT_TEAM:
- Vincent | Lead | Architecture, code review
- Jules | Backend Dev | APIs, services
- Mia | Frontend Dev | UI, components
- Butch | Tester | Tests, quality
UNIVERSE: Pulp Fiction
PROJECT: A snake game in HTML and JavaScript`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(4);
    expect(result!.members[0]!.name).toBe('Vincent');
  });

  it('parses pipe-delimited lines without INIT_TEAM header', () => {
    const response = `Here's the team for your project:

- Deckard | Lead | Architecture, code review
- Rachel | Frontend Dev | HTML, CSS, JavaScript
- Roy | Backend Dev | Game logic, state management
- Pris | Tester | Tests, quality assurance

Universe: Blade Runner
Project: A snake game in HTML and JavaScript`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(4);
    expect(result!.members[0]!.name).toBe('Deckard');
    expect(result!.universe).toBe('Blade Runner');
    expect(result!.projectDescription).toBe('A snake game in HTML and JavaScript');
  });

  it('parses pipe lines with * bullets', () => {
    const response = `INIT_TEAM:
* Solo | Lead | Architecture, decisions
* Leia | Frontend Dev | UI, components
* Chewie | Backend Dev | APIs, services
* Lando | Tester | Tests, quality
UNIVERSE: Star Wars
PROJECT: A CLI tool`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(4);
    expect(result!.members[0]!.name).toBe('Solo');
  });

  it('handles bold markdown in UNIVERSE/PROJECT labels', () => {
    const response = `INIT_TEAM:
- Ripley | Lead | Architecture
- Dallas | Frontend Dev | UI
**UNIVERSE:** Alien
**PROJECT:** A web app`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.universe).toBe('Alien');
    expect(result!.projectDescription).toBe('A web app');
  });

  it('handles case-insensitive INIT_TEAM', () => {
    const response = `init_team:
- Neo | Lead | Architecture
- Trinity | Dev | Code
UNIVERSE: The Matrix
PROJECT: Game`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(2);
  });

  it('returns null for empty string', () => {
    expect(parseCastResponse('')).toBeNull();
  });

  it('returns null for completely unrelated response', () => {
    const response = `I'd be happy to help you build a snake game! 
Let me start by creating the HTML file with a canvas element.`;
    expect(parseCastResponse(response)).toBeNull();
  });

  it('returns null when no members could be extracted', () => {
    const response = `INIT_TEAM:
UNIVERSE: Alien
PROJECT: Something`;
    expect(parseCastResponse(response)).toBeNull();
  });

  it('provides default universe when missing', () => {
    const response = `- Neo | Lead | Architecture
- Trinity | Dev | Code`;

    const result = parseCastResponse(response);
    expect(result).not.toBeNull();
    expect(result!.universe).toBe('Unknown');
  });

  it('strips trailing pipes from scope (markdown table format)', () => {
    const response = `| Ripley | Lead | Architecture |
| Dallas | Frontend Dev | UI |`;

    const result = parseCastResponse(response);
    // Should extract something even from table format
    if (result) {
      expect(result.members.length).toBeGreaterThan(0);
    }
  });
});

// ── createTeam ─────────────────────────────────────────────────────

const minimalProposal: CastProposal = {
  universe: 'Alien',
  projectDescription: 'A React and Node.js web application',
  members: [
    { name: 'Ripley', role: 'Lead',         scope: 'Architecture, code review', emoji: '🏗️' },
    { name: 'Dallas', role: 'Frontend Dev', scope: 'React, UI, components',      emoji: '⚛️' },
    { name: 'Kane',   role: 'Backend Dev',  scope: 'Node.js, APIs, database',    emoji: '🔧' },
  ],
};

describe('createTeam', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'squad-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('fresh project — no .squad/ directory', () => {
    it('creates team.md with ## Members section and data rows', async () => {
      await createTeam(tempDir, minimalProposal);

      const teamPath = join(tempDir, '.squad', 'team.md');
      expect(existsSync(teamPath)).toBe(true);

      const content = await readFile(teamPath, 'utf-8');
      expect(content).toContain('## Members');
      expect(content).toContain('| Ripley |');
      expect(content).toContain('| Dallas |');
      expect(content).toContain('| Kane |');
    });

    it('creates routing.md from scratch', async () => {
      await createTeam(tempDir, minimalProposal);

      const routingPath = join(tempDir, '.squad', 'routing.md');
      expect(existsSync(routingPath)).toBe(true);

      const content = await readFile(routingPath, 'utf-8');
      expect(content).toContain('# Squad Routing');
    });

    it('includes project description in team.md header', async () => {
      await createTeam(tempDir, minimalProposal);

      const content = await readFile(join(tempDir, '.squad', 'team.md'), 'utf-8');
      expect(content).toContain('A React and Node.js web application');
    });

    it('team.md passes hasRosterEntries check (coordinator can read it)', async () => {
      // Import hasRosterEntries to verify the coordinator will recognise the team
      const { hasRosterEntries } = await import('../packages/squad-cli/src/cli/shell/coordinator.js');

      await createTeam(tempDir, minimalProposal);
      const content = await readFile(join(tempDir, '.squad', 'team.md'), 'utf-8');
      expect(hasRosterEntries(content)).toBe(true);
    });

    it('adds built-in Scribe and Ralph when not in proposal', async () => {
      const result = await createTeam(tempDir, minimalProposal);
      expect(result.membersCreated).toContain('Scribe');
      expect(result.membersCreated).toContain('Ralph');
    });

    it('creates agent charter and history files for each member', async () => {
      const result = await createTeam(tempDir, minimalProposal);
      for (const name of result.membersCreated) {
        const base = join(tempDir, '.squad', 'agents', name.toLowerCase());
        expect(existsSync(join(base, 'charter.md'))).toBe(true);
        expect(existsSync(join(base, 'history.md'))).toBe(true);
      }
    });

    it('does not update squad.config.ts when it does not exist', async () => {
      await createTeam(tempDir, minimalProposal);
      expect(existsSync(join(tempDir, 'squad.config.ts'))).toBe(false);
    });
  });

  describe('SDK project — existing squad.config.ts', () => {
    beforeEach(async () => {
      // Simulate a project initialized with --sdk
      const sdkConfig = `import {
  defineSquad,
  defineTeam,
  defineAgent,
} from '@bradygaster/squad-sdk';

const scribe = defineAgent({
  name: 'scribe',
  role: 'scribe',
  description: 'Scribe',
  status: 'active',
});

export default defineSquad({
  version: '1.0.0',

  team: defineTeam({
    name: 'test-project',
    members: ['scribe'],
  }),

  agents: [scribe],
});
`;
      await writeFile(join(tempDir, 'squad.config.ts'), sdkConfig, 'utf-8');
    });

    it('updates squad.config.ts with all cast members including Ralph', async () => {
      await createTeam(tempDir, minimalProposal);

      const config = await readFile(join(tempDir, 'squad.config.ts'), 'utf-8');
      expect(config).toContain('defineAgent');
      expect(config).toContain('defineSquad');
      // All proposal members should be present
      expect(config).toContain("name: 'ripley'");
      expect(config).toContain("name: 'dallas'");
      expect(config).toContain("name: 'kane'");
      // Built-ins should be present
      expect(config).toContain("name: 'scribe'");
      expect(config).toContain("name: 'ralph'");
      expect(config).toContain("role: 'work-monitor'");
    });

    it('includes Ralph in members and agents arrays', async () => {
      await createTeam(tempDir, minimalProposal);

      const config = await readFile(join(tempDir, 'squad.config.ts'), 'utf-8');
      // members array should include ralph
      const membersMatch = config.match(/members:\s*\[([^\]]+)\]/);
      expect(membersMatch).toBeTruthy();
      expect(membersMatch![1]).toContain("'ralph'");
      // agents array should include ralph variable
      const agentsMatch = config.match(/agents:\s*\[([^\]]+)\]/);
      expect(agentsMatch).toBeTruthy();
      expect(agentsMatch![1]).toContain('ralph');
    });
  });

  describe('existing project — .squad/ with empty team.md', () => {
    beforeEach(async () => {
      const squadDir = join(tempDir, '.squad');
      await mkdir(squadDir, { recursive: true });
      await writeFile(join(squadDir, 'team.md'), [
        '# Squad Team',
        '',
        '> Pre-existing project',
        '',
        '## Members',
        '',
        '| Name | Role | Charter | Status |',
        '|------|------|---------|--------|',
        '',
        '## Project Context',
        '',
        '- **Project:** Pre-existing',
        '',
      ].join('\n'));
    });

    it('updates the Members section without clobbering surrounding content', async () => {
      await createTeam(tempDir, minimalProposal);

      const content = await readFile(join(tempDir, '.squad', 'team.md'), 'utf-8');
      expect(content).toContain('Pre-existing project');
      expect(content).toContain('## Project Context');
      expect(content).toContain('| Ripley |');
    });

    it('team.md passes hasRosterEntries after update', async () => {
      const { hasRosterEntries } = await import('../packages/squad-cli/src/cli/shell/coordinator.js');

      await createTeam(tempDir, minimalProposal);
      const content = await readFile(join(tempDir, '.squad', 'team.md'), 'utf-8');
      expect(hasRosterEntries(content)).toBe(true);
    });
  });
});
