/**
 * `squad health` on legacy and multi-table repos (#2298, #2234, #1785):
 *  - markdown table header/separator rows are never reported as unknown agents;
 *  - `{Name}`-style template placeholders are ignored;
 *  - built-in support agents (Rai, Fact Checker, Scribe, Ralph) are valid routing targets;
 *  - display names resolve against persistent_name;
 *  - a charter with a BOM or a one-line `**Role:** … | **Expertise:** …` identity parses;
 *  - a charter without any identity is a WARN with a hint, not a FAIL;
 *  - optional built-ins without a team.md row are INFO (available but not configured);
 *  - routing to an unavailable built-in is a real failure;
 *  - output ordering is deterministic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runSquadHealth, type HealthCheckId, type HealthReport } from '../../packages/squad-cli/src/cli/commands/health.js';
import { parseRoutingRulesMarkdown } from '@bradygaster/squad-sdk/parsers';
import { parseCharterMarkdown } from '@bradygaster/squad-sdk/agents';

let repoRoot: string;

function writeSquad(rel: string, content: string): void {
  const file = path.join(repoRoot, '.squad', rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

function registry(agents: Record<string, { name: string; role: string }>): void {
  const entries: Record<string, unknown> = {};
  for (const [id, { name, role }] of Object.entries(agents)) {
    entries[id] = {
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
      display_name: name, persistent_name: name, role, universe: 'descriptive', status: 'active',
    };
  }
  writeSquad('casting/registry.json', JSON.stringify({ schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1, generated_at: '2026-01-01T00:00:00.000Z', agents: entries }));
  writeSquad('casting/history.json', JSON.stringify({
    assignment_cast_snapshots: { 'repl-cast-r1-2026-01-01T00:00:00.000Z': { created_at: '2026-01-01T00:00:00.000Z', agents: Object.keys(agents), universe: 'descriptive' } },
    universe_usage_history: [{ universe: 'descriptive', used_at: '2026-01-01T00:00:00.000Z' }],
  }));
}

function check(report: HealthReport, id: HealthCheckId) {
  const item = report.checks.find((c) => c.id === id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

const TEAM = `# Team

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Nick Fury | Lead | \`.squad/agents/nick-fury/charter.md\` | ✅ Active |
| Alpha | Developer | \`.squad/agents/alpha/charter.md\` | ✅ Active |
`;

const MULTI_TABLE_ROUTING = `# Routing

## Work Type → Agent

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature | Nick Fury | New features, {example tasks} |
| code review | Alpha | Review PRs, check quality |
| rai review | Rai | Content safety |
| verification | Fact Checker | Claim checks |
| testing | {Name} | Write tests, find edge cases |

### Tiers

| Tier | Route To | Examples |
|------|----------|----------|
| 1 | Lead | Scope & priorities |

| Label | Capability key | What it means |
|-------|----------------|---------------|
| needs:gpu | gpu | Machine must have a GPU |

## Rules

| Work Type | Primary | Secondary |
|-----------|---------|-----------|
| escalation | Alpha | Nick Fury |
`;

beforeEach(() => {
  repoRoot = mkdtempSync(path.join(tmpdir(), 'squad-health-legacy-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  writeSquad('team.md', TEAM);
  registry({ 'nick-fury': { name: 'Nick Fury', role: 'Lead' }, alpha: { name: 'Alpha', role: 'Developer' } });
  writeSquad('agents/nick-fury/charter.md', '# Nick Fury — Lead\n\n## Identity\n\n- **Name:** Nick Fury\n- **Role:** Lead\n');
  writeSquad('agents/alpha/charter.md', '# Alpha — Developer\n\n## Identity\n\n- **Name:** Alpha\n- **Role:** Developer\n');
  writeSquad('agents/rai/charter.md', '# Rai\n');
  writeSquad('agents/fact-checker/charter.md', '# Fact Checker\n');
  writeSquad('routing.md', MULTI_TABLE_ROUTING);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('routing parsing never reports table headers or placeholders as agents (#2298, #1785, #2234)', () => {
  it('parseRoutingRulesMarkdown skips header rows of later tables, placeholder cells and non-routing tables', () => {
    const parsed = parseRoutingRulesMarkdown(MULTI_TABLE_ROUTING);
    const refs = parsed.agentReferences ?? [];
    for (const header of ['Route To', 'Examples', 'Tier', 'Label', 'Capability key', 'Primary', 'Secondary', 'Work Type']) {
      expect(refs, `header cell "${header}" leaked as an agent`).not.toContain(header);
    }
    expect(refs).not.toContain('{Name}');
    expect(refs).not.toContain('{example tasks}');
    expect(refs).not.toContain('Write tests');
    expect(refs).not.toContain('gpu');
    expect(refs).toEqual(expect.arrayContaining(['Nick Fury', 'Alpha', 'Rai', 'Fact Checker']));
    expect(parsed.rules.map((r) => r.workType)).toEqual(['feature', 'code review', 'rai review', 'verification']);
  });

  it('squad health routing passes: display names resolve, built-ins are known, headers are ignored', () => {
    const report = runSquadHealth(path.join(repoRoot, '.squad'), repoRoot);
    const routing = check(report, 'routing');
    expect(routing.diagnostics ?? []).toEqual([]);
    expect(routing.status).toBe('pass');
    expect(report.status).toBe('pass');
  });

  it('a genuinely unknown agent is still reported', () => {
    writeSquad('routing.md', MULTI_TABLE_ROUTING.replace('| code review | Alpha | Review PRs, check quality |', '| code review | Ghost | Review PRs, check quality |'));
    const routing = check(runSquadHealth(path.join(repoRoot, '.squad'), repoRoot), 'routing');
    expect(routing.status).toBe('fail');
    expect(routing.diagnostics).toEqual(['unknown agent: Ghost']);
  });
});

describe('legacy charters (#2298)', () => {
  it('parses a BOM-prefixed H1 and a one-line pipe-joined identity block', () => {
    const legacy = '\ufeff# B\'Elanna — Infrastructure Expert\r\n\r\n> Ships reliably.\r\n\r\n## Identity\r\n**Role:** Infrastructure Expert | **Expertise:** K8s, Helm | **Style:** Direct.\r\n';
    const parsed = parseCharterMarkdown(legacy);
    expect(parsed.identity.name).toBe("B'Elanna");
    expect(parsed.identity.role).toBe('Infrastructure Expert');
    expect(parsed.identity.expertise).toEqual(['K8s', 'Helm']);
    expect(parsed.identity.style).toBe('Direct.');
  });

  it('health accepts such charters (no identity failure)', () => {
    writeSquad('agents/alpha/charter.md', '\ufeff# Alpha — Developer\r\n\r\n## Identity\r\n**Role:** Developer | **Expertise:** TS | **Style:** Direct.\r\n');
    const item = check(runSquadHealth(path.join(repoRoot, '.squad'), repoRoot), 'registry-charters');
    expect(item.status).toBe('pass');
  });

  it('a charter with no identity at all is a WARN with a hint, not a FAIL', () => {
    writeSquad('agents/alpha/charter.md', '# Alpha\n\nJust prose, no identity block.\n');
    const report = runSquadHealth(path.join(repoRoot, '.squad'), repoRoot);
    const item = check(report, 'registry-charters');
    expect(item.status).toBe('warn');
    expect(item.diagnostics).toEqual([
      'alpha: legacy charter — add "## Identity" with "- **Name:** Alpha" and "- **Role:** <role>" (see .squad/templates/charter.md)',
    ]);
    expect(report.status).toBe('pass');
  });

  it('a real registry failure still fails and lists legacy hints after it', () => {
    writeSquad('agents/alpha/charter.md', '# Alpha\n\nno identity\n');
    rmSync(path.join(repoRoot, '.squad', 'agents', 'nick-fury'), { recursive: true });
    const item = check(runSquadHealth(path.join(repoRoot, '.squad'), repoRoot), 'registry-charters');
    expect(item.status).toBe('fail');
    expect(item.diagnostics?.[0]).toMatch(/^alpha: legacy charter/);
    expect(item.diagnostics?.[1]).toMatch(/^nick-fury: .*charter\.md not found/);
  });
});

describe('built-in roster drift (#2298)', () => {
  it('reports INFO when optional built-ins are available but not configured and passes once rows exist', () => {
    const report = runSquadHealth(path.join(repoRoot, '.squad'), repoRoot);
    const team = check(report, 'team');
    expect(team.status).toBe('info');
    expect(team.message).toContain('available but not configured');
    expect(team.diagnostics).toEqual([
      'Fact Checker is available but not configured — run `squad roster add fact-checker` to opt in',
      'Rai is available but not configured — run `squad roster add rai` to opt in',
    ]);
    expect(report.status).toBe('pass');

    writeSquad('team.md', TEAM + '| Rai | RAI Reviewer | `.squad/agents/rai/charter.md` | 🛡️ RAI |\n| Fact Checker | Verifier | `.squad/agents/fact-checker/charter.md` | 🔍 Verifier |\n');
    expect(check(runSquadHealth(path.join(repoRoot, '.squad'), repoRoot), 'team').status).toBe('pass');
  });

  it('fails when routing references a built-in whose charter is missing', () => {
    rmSync(path.join(repoRoot, '.squad', 'agents', 'rai'), { recursive: true });
    const routing = check(runSquadHealth(path.join(repoRoot, '.squad'), repoRoot), 'routing');
    expect(routing.status).toBe('fail');
    expect(routing.diagnostics).toContain('unknown agent: Rai');
  });

  it('is deterministic across runs', () => {
    writeSquad('agents/alpha/charter.md', '# Alpha\n\nno identity\n');
    const a = JSON.stringify(runSquadHealth(path.join(repoRoot, '.squad'), repoRoot));
    const b = JSON.stringify(runSquadHealth(path.join(repoRoot, '.squad'), repoRoot));
    expect(a).toBe(b);
  });
});
