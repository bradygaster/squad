/**
 * Team Capability Advertisement — lifecycle wiring (#1608)
 *
 * The generator itself is unit-tested in `team-capabilities.test.ts`. This file
 * proves the *plumbing*: that a cast-composition change actually rewrites
 * `.github/agents/squad.agent.md`, and that the file is legitimately
 * Squad-owned (fully generated) rather than user-authored.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageProvider } from '../packages/squad-sdk/src/storage/in-memory-storage-provider.js';
import {
  syncTeamCapabilities,
  TEAM_CAPABILITIES_BEGIN,
  TEAM_CAPABILITIES_END,
} from '../packages/squad-sdk/src/config/team-capabilities.js';
import { TEMPLATE_MANIFEST } from '../packages/squad-cli/src/cli/core/templates.js';

const SQUAD_DIR = '/repo/.squad';
const AGENT_FILE = '/repo/.github/agents/squad.agent.md';

const AGENT_DOC = [
  '<!-- SQUAD_COORDINATOR_CANARY_HEAD_b7d2 -->',
  '',
  '# Squad (Coordinator)',
  '',
  'Some coordinator prose.',
  '',
  '## Init Mode',
  '',
  'Init body.',
  '',
  '<!-- SQUAD_COORDINATOR_CANARY_a8f3 -->',
  '',
].join('\n');

function teamMd(rows: string): string {
  return `# Team\n\n## Members\n\n| Name | Role | Charter | Status |\n|---|---|---|---|\n${rows}\n`;
}

function routingMd(rows: string): string {
  return `# Routing\n\n## Work Type → Agent\n\n| Work Type | Agent |\n|---|---|\n${rows}\n`;
}

let storage: InMemoryStorageProvider;

function seed(team: string, routing: string): void {
  storage.writeSync(`${SQUAD_DIR}/team.md`, team);
  storage.writeSync(`${SQUAD_DIR}/routing.md`, routing);
  storage.writeSync(AGENT_FILE, AGENT_DOC);
}

beforeEach(() => {
  storage = new InMemoryStorageProvider();
});

describe('#1608 — cast lifecycle regenerates the agent file', () => {
  it('injects the block on first sync and reports the profile it used', () => {
    seed(
      teamMd('| Nori | Data Engineer | .squad/agents/nori/charter.md | ✅ Active |'),
      routingMd('| Pipelines | Nori |'),
    );

    const result = syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    expect(result.updated).toBe(true);
    expect(result.profile.specialists.map((s) => s.name)).toEqual(['Nori']);

    const doc = storage.readSync(AGENT_FILE);
    expect(doc).toContain(TEAM_CAPABILITIES_BEGIN);
    expect(doc).toContain(TEAM_CAPABILITIES_END);
    expect(doc).toContain('| Nori | Data Engineer |');
    expect(doc).toContain('| Pipelines | Nori |');
  });

  it('rewrites the block when a member is added to the cast', () => {
    seed(teamMd('| Nori | Data Engineer |'), routingMd('| Pipelines | Nori |'));
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    storage.writeSync(
      `${SQUAD_DIR}/team.md`,
      teamMd('| Nori | Data Engineer |\n| Saffron | Security |'),
    );
    storage.writeSync(
      `${SQUAD_DIR}/routing.md`,
      routingMd('| Pipelines | Nori |\n| Security | Saffron |'),
    );

    const result = syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    expect(result.updated).toBe(true);
    const doc = storage.readSync(AGENT_FILE);
    expect(doc).toContain('Saffron');
    expect(doc).toContain('| Security | Saffron |');
  });

  it('erases a recast squad’s previous names entirely', () => {
    seed(
      teamMd('| Keaton | Lead |\n| Verbal | Dev |\n| Fenster | Tester |'),
      routingMd('| Architecture | Keaton |\n| Implementation | Verbal |\n| Testing | Fenster |'),
    );
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });
    expect(storage.readSync(AGENT_FILE)).toContain('Keaton');

    // Recast to a completely different universe.
    storage.writeSync(
      `${SQUAD_DIR}/team.md`,
      teamMd('| Flight | Lead |\n| EECOM | Dev |\n| FIDO | Tester |'),
    );
    storage.writeSync(
      `${SQUAD_DIR}/routing.md`,
      routingMd('| Architecture | Flight |\n| Implementation | EECOM |\n| Testing | FIDO |'),
    );
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    const doc = storage.readSync(AGENT_FILE);
    for (const stale of ['Keaton', 'Verbal', 'Fenster']) {
      expect(doc).not.toContain(stale);
    }
    expect(doc).toContain('Flight');
  });

  it('drops a retired agent on the next sync', () => {
    seed(
      teamMd('| Nori | Data Engineer |\n| Saffron | Security |'),
      routingMd('| Pipelines | Nori |\n| Security | Saffron |'),
    );
    storage.writeSync(
      `${SQUAD_DIR}/casting/registry.json`,
      JSON.stringify({
        agents: {
          nori: { persistent_name: 'Nori', status: 'active' },
          saffron: { persistent_name: 'Saffron', status: 'active' },
        },
      }),
    );
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });
    expect(storage.readSync(AGENT_FILE)).toContain('Saffron');

    storage.writeSync(
      `${SQUAD_DIR}/casting/registry.json`,
      JSON.stringify({
        agents: {
          nori: { persistent_name: 'Nori', status: 'active' },
          saffron: { persistent_name: 'Saffron', status: 'retired' },
        },
      }),
    );
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    const doc = storage.readSync(AGENT_FILE);
    expect(doc).not.toContain('Saffron');
    expect(doc).toContain('Nori');
  });

  it('reads charters off disk to ground the focus column', () => {
    seed(teamMd('| Nori | Data Engineer |'), routingMd('| Pipelines | Nori |'));
    storage.writeSync(
      `${SQUAD_DIR}/agents/nori/charter.md`,
      `# Nori\n\n## Identity\n- **Name:** Nori\n- **Role:** Data Engineer\n- **Expertise:** ingestion pipelines, schema evolution\n\n## Boundaries\n**I handle:** implementation of data pipelines\n`,
    );

    const result = syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    expect(result.profile.specialists[0]!.focus).toBe('ingestion pipelines, schema evolution');
    expect(result.profile.specialists[0]!.authority).toContain('edit');
  });

  it('ignores alumni and dotfile entries under .squad/agents', () => {
    seed(teamMd('| Nori | Data Engineer |'), routingMd('| Pipelines | Nori |'));
    storage.writeSync(`${SQUAD_DIR}/agents/_alumni/verbal/charter.md`, '# Verbal\n');
    storage.writeSync(`${SQUAD_DIR}/agents/.cache/charter.md`, '# cache\n');

    const result = syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    expect(result.profile.specialists.map((s) => s.name)).toEqual(['Nori']);
    expect(storage.readSync(AGENT_FILE)).not.toContain('Verbal');
  });

  it('is a no-op when nothing about the cast changed', () => {
    seed(teamMd('| Nori | Data Engineer |'), routingMd('| Pipelines | Nori |'));
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });
    const first = storage.readSync(AGENT_FILE);

    const second = syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    expect(second.updated).toBe(false);
    expect(storage.readSync(AGENT_FILE)).toBe(first);
  });

  it('keeps the EOF canary as the last non-empty line', () => {
    seed(teamMd('| Nori | Data Engineer |'), routingMd('| Pipelines | Nori |'));
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    const lines = storage.readSync(AGENT_FILE).split('\n').filter((l) => l.trim().length > 0);
    expect(lines.at(-1)).toBe('<!-- SQUAD_COORDINATOR_CANARY_a8f3 -->');
    expect(lines[0]).toBe('<!-- SQUAD_COORDINATOR_CANARY_HEAD_b7d2 -->');
  });

  it('preserves coordinator prose outside the markers', () => {
    seed(teamMd('| Nori | Data Engineer |'), routingMd('| Pipelines | Nori |'));
    syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    const doc = storage.readSync(AGENT_FILE);
    expect(doc).toContain('Some coordinator prose.');
    expect(doc).toContain('## Init Mode');
    expect(doc).toContain('Init body.');
  });

  it('skips silently when there is no agent file to update', () => {
    storage.writeSync(`${SQUAD_DIR}/team.md`, teamMd('| Nori | Dev |'));

    const result = syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    expect(result.updated).toBe(false);
    expect(result.skipped).toBe('missing-agent-file');
  });

  it('still renders an honest empty block for an uncast squad', () => {
    storage.writeSync(AGENT_FILE, AGENT_DOC);

    const result = syncTeamCapabilities({ squadDir: SQUAD_DIR, agentFile: AGENT_FILE, storage });

    expect(result.updated).toBe(true);
    expect(result.profile.empty).toBe(true);
    expect(storage.readSync(AGENT_FILE)).toContain('has not been cast yet');
  });
});

describe('#1608 — squad.agent.md is fully generated, not user-authored', () => {
  it('is declared overwrite-on-upgrade in the template manifest', () => {
    const entry = TEMPLATE_MANIFEST.find((t) => t.destination.endsWith('squad.agent.md'));
    expect(entry).toBeDefined();
    expect(entry!.overwriteOnUpgrade).toBe(true);
  });
});

describe('#1608 — coordinator cast-composition procedures regenerate capabilities', () => {
  const template = readFileSync(resolve(__dirname, '../.squad-templates/squad.agent.md'), 'utf8');

  it('regenerates after adding a member', () => {
    const section = template.split('### Adding Team Members')[1]?.split('### Removing Team Members')[0];
    expect(section).toContain('squad upgrade');
    expect(section).toContain('regenerate Team Capabilities');
  });

  it('regenerates after retiring a member', () => {
    const section = template.split('### Removing Team Members')[1]?.split('### Plugin Marketplace')[0];
    expect(section).toContain('squad upgrade');
    expect(section).toContain('remove stale references');
  });
});
