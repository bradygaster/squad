/**
 * squad cast — session cast display tests
 *
 * Verifies the cast command correctly discovers project agents
 * by passing repo root (not .squad/ dir) to LocalAgentSource.
 * Regression test for #871 (double-nested .squad/.squad/agents path).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';

const TEST_ROOT = join(process.cwd(), `.test-cast-${randomBytes(4).toString('hex')}`);

const SAMPLE_CHARTER = `---
name: TestAgent
role: Core Dev
---
# TestAgent

Test agent for cast command tests.
`;

async function scaffold(root: string): Promise<void> {
  const sq = join(root, '.squad');
  await mkdir(join(sq, 'agents', 'test-agent'), { recursive: true });
  await writeFile(join(sq, 'agents', 'test-agent', 'charter.md'), SAMPLE_CHARTER);
  await mkdir(join(sq, 'casting'), { recursive: true });
  await writeFile(join(sq, 'team.md'), '# Team\n\n## Members\n\n- TestAgent\n');
  await writeFile(join(sq, 'routing.md'), '# Routing\n');
  await writeFile(join(sq, 'decisions.md'), '# Decisions\n');
  await writeFile(
    join(sq, 'casting', 'registry.json'),
    JSON.stringify({ agents: [] }, null, 2),
  );
}

// Mock personal agents to isolate project agent discovery
vi.mock('@bradygaster/squad-sdk/agents/personal', () => ({
  resolvePersonalAgents: vi.fn(async () => [] as unknown[]),
  mergeSessionCast: vi.fn((project: unknown[], personal: unknown[]) => [...(project as unknown[]), ...(personal as unknown[])]),
}));

describe('squad cast', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('discovers project agents using repo root, not .squad/ dir (#871)', async () => {
    await scaffold(TEST_ROOT);

    // Suppress console output during test
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCast } = await import('@bradygaster/squad-cli/commands/cast');
    await runCast(TEST_ROOT);

    // If the bug were present (passing paths.teamDir = .squad/ to LocalAgentSource),
    // it would look in .squad/.squad/agents/ — which doesn't exist — and find 0 agents.
    // With the fix, it looks in TEST_ROOT/.squad/agents/ and finds our test agent.
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    // Agent discovered from .squad/agents/test-agent/ (name derived from directory)
    expect(output).toContain('test-agent');
    expect(output).toContain('Session Cast');
  });

  it('does not look in double-nested .squad/.squad/agents/ path', async () => {
    await scaffold(TEST_ROOT);

    // Create a decoy agent at the WRONG double-nested path
    const wrongPath = join(TEST_ROOT, '.squad', '.squad', 'agents', 'decoy');
    await mkdir(wrongPath, { recursive: true });
    await writeFile(join(wrongPath, 'charter.md'), `---\nname: Decoy\nrole: Wrong\n---\n# Decoy\n`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCast } = await import('@bradygaster/squad-cli/commands/cast');
    await runCast(TEST_ROOT);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    // Should find test-agent from correct path, not decoy from wrong path
    expect(output).toContain('test-agent');
    expect(output).not.toContain('decoy');
  });
});
