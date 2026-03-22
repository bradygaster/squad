/**
 * Shell integration tests — lifecycle, input routing, coordinator response
 * parsing, session cleanup, and error handling.
 *
 * Covers audit gaps: startup, input routing, coordinator parsing,
 * session cleanup, SDK not connected graceful degradation.
 *
 * @module test/shell-integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { SessionRegistry } from '@bradygaster/squad-cli/shell/sessions';
import { ShellLifecycle, type LifecycleOptions, type DiscoveredAgent } from '@bradygaster/squad-cli/shell/lifecycle';
import { ShellRenderer } from '@bradygaster/squad-cli/shell/render';
import { parseInput, type ParsedInput, type MessageType } from '@bradygaster/squad-cli/shell/router';
import {
  parseCoordinatorResponse,
  formatConversationContext,
  type RoutingDecision,
} from '@bradygaster/squad-cli/shell/coordinator';

// ============================================================================
// Helpers
// ============================================================================

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

function makeTeamMd(agents: Array<{ name: string; role: string; status?: string }>): string {
  const rows = agents
    .map(a => `| ${a.name} | ${a.role} | \`.squad/agents/${a.name.toLowerCase()}/charter.md\` | ✅ ${a.status ?? 'Active'} |`)
    .join('\n');
  return `# Team Manifest

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
${rows}

## Notes
Placeholder
`;
}

// ============================================================================
// 1. Shell Startup — ShellLifecycle.initialize()
// ============================================================================

describe('ShellLifecycle — startup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir('shell-int-');
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  function makeLifecycle(teamRoot: string): ShellLifecycle {
    return new ShellLifecycle({
      teamRoot,
      renderer: new ShellRenderer(),
      registry: new SessionRegistry(),
    });
  }

  it('throws when .squad/ directory does not exist', async () => {
    const lc = makeLifecycle(tmpDir);
    await expect(lc.initialize()).rejects.toThrow('No team found');
  });

  it('throws when team.md is missing', async () => {
    fs.mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });
    const lc = makeLifecycle(tmpDir);
    await expect(lc.initialize()).rejects.toThrow('No team manifest found');
  });

  it('sets state to error on failure', async () => {
    const lc = makeLifecycle(tmpDir);
    try { await lc.initialize(); } catch { /* expected */ }
    expect(lc.getState().status).toBe('error');
  });

  it('discovers agents from team.md', async () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'team.md'), makeTeamMd([
      { name: 'Fenster', role: 'Core Dev' },
      { name: 'Hockney', role: 'Tester' },
    ]));
    const lc = makeLifecycle(tmpDir);
    await lc.initialize();

    const agents = lc.getDiscoveredAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map(a => a.name)).toContain('Fenster');
    expect(agents.map(a => a.name)).toContain('Hockney');
  });

  it('registers active agents in session registry', async () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'team.md'), makeTeamMd([
      { name: 'Keaton', role: 'Lead' },
    ]));
    const registry = new SessionRegistry();
    const lc = new ShellLifecycle({ teamRoot: tmpDir, renderer: new ShellRenderer(), registry });
    await lc.initialize();

    expect(registry.get('Keaton')).toBeDefined();
    expect(registry.get('Keaton')?.role).toBe('Lead');
  });

  it('sets state to ready after successful init', async () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'team.md'), makeTeamMd([
      { name: 'Fenster', role: 'Core Dev' },
    ]));
    const lc = makeLifecycle(tmpDir);
    await lc.initialize();
    expect(lc.getState().status).toBe('ready');
  });

  it('tracks message history after init', async () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'team.md'), makeTeamMd([
      { name: 'A', role: 'R' },
    ]));
    const lc = makeLifecycle(tmpDir);
    await lc.initialize();

    lc.addUserMessage('hello');
    lc.addAgentMessage('A', 'response');
    lc.addSystemMessage('system info');
    expect(lc.getHistory()).toHaveLength(3);
    expect(lc.getHistory('A')).toHaveLength(1);
  });
});

// ============================================================================
// 2. Input Routing — parseInput()
// ============================================================================

describe('parseInput — input routing', () => {
  const knownAgents = ['Fenster', 'Hockney', 'Keaton', 'Verbal'];

  it('@Fenster fix the bug → direct_agent', () => {
    const result = parseInput('@Fenster fix the bug', knownAgents);
    expect(result.type).toBe('direct_agent');
    expect(result.agentName).toBe('Fenster');
    expect(result.content).toBe('fix the bug');
  });

  it('"fix the bug" → coordinator', () => {
    const result = parseInput('fix the bug', knownAgents);
    expect(result.type).toBe('coordinator');
    expect(result.content).toBe('fix the bug');
  });

  it('/help → slash_command', () => {
    const result = parseInput('/help', knownAgents);
    expect(result.type).toBe('slash_command');
    expect(result.command).toBe('help');
    expect(result.args).toEqual([]);
  });

  it('/status verbose → slash_command with args', () => {
    const result = parseInput('/status verbose', knownAgents);
    expect(result.type).toBe('slash_command');
    expect(result.command).toBe('status');
    expect(result.args).toEqual(['verbose']);
  });

  it('@unknown message → coordinator (not known agent)', () => {
    const result = parseInput('@UnknownAgent do something', knownAgents);
    expect(result.type).toBe('coordinator');
  });

  it('preserves raw input', () => {
    const result = parseInput('  @Fenster help  ', knownAgents);
    expect(result.raw).toBe('@Fenster help');
  });

  it('case-insensitive agent matching', () => {
    const result = parseInput('@fenster fix it', knownAgents);
    expect(result.type).toBe('direct_agent');
    expect(result.agentName).toBe('Fenster');
  });

  it('"Fenster, do something" comma syntax → direct_agent', () => {
    const result = parseInput('Fenster, do something', knownAgents);
    expect(result.type).toBe('direct_agent');
    expect(result.agentName).toBe('Fenster');
    expect(result.content).toBe('do something');
  });

  it('empty string → coordinator', () => {
    const result = parseInput('', knownAgents);
    expect(result.type).toBe('coordinator');
  });

  it('slash command with multiple args', () => {
    const result = parseInput('/deploy staging --force', knownAgents);
    expect(result.type).toBe('slash_command');
    expect(result.command).toBe('deploy');
    expect(result.args).toEqual(['staging', '--force']);
  });

  it('@agent with no message → routes to coordinator', () => {
    const result = parseInput('@Fenster', knownAgents);
    expect(result.type).toBe('coordinator');
    expect(result.raw).toBe('@Fenster');
  });
});

// ============================================================================
// 3. Coordinator Response Parsing — ROUTE, DIRECT, MULTI
// ============================================================================

describe('parseCoordinatorResponse', () => {
  it('parses ROUTE format', () => {
    const response = `ROUTE: Fenster
TASK: Fix the null pointer exception in parser.ts
CONTEXT: User reported crash on line 42`;
    const result = parseCoordinatorResponse(response);
    expect(result.type).toBe('route');
    expect(result.routes).toHaveLength(1);
    expect(result.routes![0].agent).toBe('Fenster');
    expect(result.routes![0].task).toBe('Fix the null pointer exception in parser.ts');
    expect(result.routes![0].context).toBe('User reported crash on line 42');
  });

  it('parses DIRECT format', () => {
    const response = 'DIRECT: The team has 5 active agents.';
    const result = parseCoordinatorResponse(response);
    expect(result.type).toBe('direct');
    expect(result.directAnswer).toBe('The team has 5 active agents.');
  });

  it('parses MULTI format', () => {
    const response = `MULTI:
- Fenster: Fix the parser bug
- Hockney: Write regression tests`;
    const result = parseCoordinatorResponse(response);
    expect(result.type).toBe('multi');
    expect(result.routes).toHaveLength(2);
    expect(result.routes![0].agent).toBe('Fenster');
    expect(result.routes![0].task).toBe('Fix the parser bug');
    expect(result.routes![1].agent).toBe('Hockney');
    expect(result.routes![1].task).toBe('Write regression tests');
  });

  it('unrecognized format → fallback direct', () => {
    const response = 'Some freeform response from the LLM';
    const result = parseCoordinatorResponse(response);
    expect(result.type).toBe('direct');
    expect(result.directAnswer).toBe('Some freeform response from the LLM');
  });

  it('ROUTE without CONTEXT', () => {
    const response = `ROUTE: Keaton
TASK: Review the proposal`;
    const result = parseCoordinatorResponse(response);
    expect(result.type).toBe('route');
    expect(result.routes![0].context).toBeUndefined();
  });

  it('MULTI with no valid agent lines → empty routes', () => {
    const response = `MULTI:
Some nonsense line`;
    const result = parseCoordinatorResponse(response);
    expect(result.type).toBe('multi');
    expect(result.routes).toHaveLength(0);
  });

  it('DIRECT with empty content', () => {
    const response = 'DIRECT:';
    const result = parseCoordinatorResponse(response);
    expect(result.type).toBe('direct');
    expect(result.directAnswer).toBe('');
  });
});

// ============================================================================
// 4. formatConversationContext
// ============================================================================

describe('formatConversationContext', () => {
  it('formats messages with role prefixes', () => {
    const messages = [
      { role: 'user' as const, content: 'hello', timestamp: new Date() },
      { role: 'agent' as const, agentName: 'Fenster', content: 'hi', timestamp: new Date() },
      { role: 'system' as const, content: 'info', timestamp: new Date() },
    ];
    const ctx = formatConversationContext(messages);
    expect(ctx).toContain('[user]: hello');
    expect(ctx).toContain('[Fenster]: hi');
    expect(ctx).toContain('[system]: info');
  });

  it('respects maxMessages', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      role: 'user' as const,
      content: `msg${i}`,
      timestamp: new Date(),
    }));
    const ctx = formatConversationContext(messages, 5);
    const lines = ctx.split('\n');
    expect(lines).toHaveLength(5);
    expect(ctx).toContain('msg49');
    expect(ctx).not.toContain('msg0');
  });

  it('empty messages → empty string', () => {
    expect(formatConversationContext([])).toBe('');
  });
});

// ============================================================================
// 5. Session Cleanup
// ============================================================================

describe('Session cleanup on shutdown', () => {
  it('all sessions cleared on shutdown', async () => {
    const tmpDir = makeTempDir('shell-cleanup-');
    try {
      const squadDir = path.join(tmpDir, '.squad');
      fs.mkdirSync(squadDir, { recursive: true });
      fs.writeFileSync(path.join(squadDir, 'team.md'), makeTeamMd([
        { name: 'Fenster', role: 'Core Dev' },
        { name: 'Hockney', role: 'Tester' },
      ]));

      const registry = new SessionRegistry();
      const lc = new ShellLifecycle({ teamRoot: tmpDir, renderer: new ShellRenderer(), registry });
      await lc.initialize();

      expect(registry.getAll()).toHaveLength(2);

      await lc.shutdown();

      expect(registry.getAll()).toHaveLength(0);
      expect(lc.getDiscoveredAgents()).toHaveLength(0);
      expect(lc.getHistory()).toHaveLength(0);
    } finally {
      cleanDir(tmpDir);
    }
  });

  it('message history cleared on shutdown', async () => {
    const tmpDir = makeTempDir('shell-cleanup2-');
    try {
      const squadDir = path.join(tmpDir, '.squad');
      fs.mkdirSync(squadDir, { recursive: true });
      fs.writeFileSync(path.join(squadDir, 'team.md'), makeTeamMd([
        { name: 'A', role: 'R' },
      ]));

      const lc = new ShellLifecycle({ teamRoot: tmpDir, renderer: new ShellRenderer(), registry: new SessionRegistry() });
      await lc.initialize();
      lc.addUserMessage('test');
      expect(lc.getHistory()).toHaveLength(1);

      await lc.shutdown();
      expect(lc.getHistory()).toHaveLength(0);
    } finally {
      cleanDir(tmpDir);
    }
  });
});

// ============================================================================
// 6. Error Handling — SDK not connected
// ============================================================================

describe('Error handling — graceful degradation', () => {
  it('HealthMonitor check() returns unhealthy when client not connected', async () => {
    // Lazy import to avoid pulling in real SDK deps at top level
    const { HealthMonitor } = await import('../packages/squad-sdk/src/runtime/health.js');

    const mockClient = {
      isConnected: () => false,
      getState: () => 'disconnected',
      ping: vi.fn(),
    };

    const monitor = new HealthMonitor({ client: mockClient as any, logDiagnostics: false });
    const result = await monitor.check();

    expect(result.status).toBe('unhealthy');
    expect(result.connected).toBe(false);
    expect(result.error).toContain('not connected');
    expect(mockClient.ping).not.toHaveBeenCalled();
  });

  it('ShellLifecycle shutdown is safe to call multiple times', async () => {
    const tmpDir = makeTempDir('shell-err-');
    try {
      const squadDir = path.join(tmpDir, '.squad');
      fs.mkdirSync(squadDir, { recursive: true });
      fs.writeFileSync(path.join(squadDir, 'team.md'), makeTeamMd([
        { name: 'A', role: 'R' },
      ]));

      const lc = new ShellLifecycle({ teamRoot: tmpDir, renderer: new ShellRenderer(), registry: new SessionRegistry() });
      await lc.initialize();
      await lc.shutdown();
      await lc.shutdown(); // second call should not throw
      expect(lc.getHistory()).toHaveLength(0);
    } finally {
      cleanDir(tmpDir);
    }
  });
});
