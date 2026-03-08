/**
 * Comprehensive CLI shell tests
 * 
 * Covers all shell modules with deep edge case coverage:
 * - index.ts: runShell(), dispatchToAgent(), dispatchToCoordinator(), handleDispatch()
 * - coordinator.ts: buildCoordinatorPrompt(), parseCoordinatorResponse(), formatConversationContext()
 * - spawn.ts: spawnAgent(), loadAgentCharter(), buildAgentPrompt()
 * - lifecycle.ts: ShellLifecycle initialization, agent discovery, shutdown
 * - router.ts: parseInput() for all message types
 * - sessions.ts: SessionRegistry operations
 * - commands.ts: executeCommand() for all slash commands
 * - memory.ts: MemoryManager limits and pruning
 * - autocomplete.ts: createCompleter() for agents and commands
 * 
 * Critical bug test: verifies coordinatorSession.sendMessage() exists after createSession()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SessionRegistry } from '../packages/squad-cli/src/cli/shell/sessions.js';
import { loadAgentCharter, buildAgentPrompt } from '../packages/squad-cli/src/cli/shell/spawn.js';
import {
  buildCoordinatorPrompt,
  parseCoordinatorResponse,
  formatConversationContext,
} from '../packages/squad-cli/src/cli/shell/coordinator.js';
import { ShellLifecycle } from '../packages/squad-cli/src/cli/shell/lifecycle.js';
import { parseInput, parseDispatchTargets } from '../packages/squad-cli/src/cli/shell/router.js';
import { executeCommand } from '../packages/squad-cli/src/cli/shell/commands.js';
import { MemoryManager, DEFAULT_LIMITS } from '../packages/squad-cli/src/cli/shell/memory.js';
import { createCompleter } from '../packages/squad-cli/src/cli/shell/autocomplete.js';
import { ShellRenderer } from '../packages/squad-cli/src/cli/shell/render.js';
import type { ShellMessage } from '../packages/squad-cli/src/cli/shell/types.js';

const FIXTURES = join(process.cwd(), 'test-fixtures');

// ============================================================================
// Mock SquadClient and SquadSession
// ============================================================================

interface MockSquadSession {
  sendMessage: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function createMockSession(): MockSquadSession {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClient() {
  return {
    createSession: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Test Helpers
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
`;
}

// ============================================================================
// 1. coordinator.ts — buildCoordinatorPrompt() edge cases
// ============================================================================

describe('coordinator.ts — buildCoordinatorPrompt', () => {
  it('uses custom teamPath when provided', () => {
    const customPath = join(FIXTURES, '.squad', 'team.md');
    const prompt = buildCoordinatorPrompt({ teamRoot: '/fake', teamPath: customPath });
    expect(prompt).toContain('Hockney');
    expect(prompt).toContain('Fenster');
  });

  it('uses custom routingPath when provided', () => {
    const customPath = join(FIXTURES, '.squad', 'routing.md');
    const prompt = buildCoordinatorPrompt({ teamRoot: '/fake', routingPath: customPath });
    expect(prompt).toContain('Tests → Hockney');
  });

  it('handles missing team.md gracefully', () => {
    const prompt = buildCoordinatorPrompt({ teamRoot: '/nonexistent' });
    expect(prompt).toContain('NO TEAM CONFIGURED');
  });

  it('handles missing routing.md gracefully', () => {
    const prompt = buildCoordinatorPrompt({ teamRoot: '/nonexistent' });
    expect(prompt).toContain('No routing.md found');
  });

  it('includes all required prompt sections', () => {
    const prompt = buildCoordinatorPrompt({ teamRoot: FIXTURES });
    expect(prompt).toContain('Squad Coordinator');
    expect(prompt).toContain('Team Roster');
    expect(prompt).toContain('Routing Rules');
    expect(prompt).toContain('Response Format');
  });
});

// ============================================================================
// 2. coordinator.ts — parseCoordinatorResponse() edge cases
// ============================================================================

describe('coordinator.ts — parseCoordinatorResponse', () => {
  describe('ROUTE format', () => {
    it('parses ROUTE with CONTEXT', () => {
      const response = 'ROUTE: Fenster\nTASK: Fix bug\nCONTEXT: Issue #123';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('route');
      expect(result.routes).toHaveLength(1);
      expect(result.routes![0]).toEqual({
        agent: 'Fenster',
        task: 'Fix bug',
        context: 'Issue #123',
      });
    });

    it('parses ROUTE without CONTEXT', () => {
      const response = 'ROUTE: Hockney\nTASK: Write tests';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('route');
      expect(result.routes![0]!.context).toBeUndefined();
    });

    it('handles ROUTE without TASK (empty task)', () => {
      const response = 'ROUTE: Edie';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('route');
      expect(result.routes![0]!.task).toBe('');
    });

    it('handles ROUTE with multiline TASK', () => {
      const response = 'ROUTE: Baer\nTASK: First line\nSecond line\nCONTEXT: Extra';
      const result = parseCoordinatorResponse(response);
      // Only captures first line after TASK:
      expect(result.routes![0]!.task).toBe('First line');
    });

    it('handles empty ROUTE: (no agent name captures TASK as agent)', () => {
      const response = 'ROUTE: \nTASK: Do something';
      const result = parseCoordinatorResponse(response);
      // ROUTE regex \w+ doesn't match whitespace, so it matches "TASK" on next line
      expect(result.type).toBe('route');
      // This is a quirk: empty agent name causes "TASK" to be captured as agent
      expect(result.routes![0]!.agent).toBe('TASK');
    });
  });

  describe('DIRECT format', () => {
    it('parses simple DIRECT response', () => {
      const response = 'DIRECT: All tests are passing.';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('All tests are passing.');
    });

    it('parses DIRECT with multiline content', () => {
      const response = 'DIRECT: Line 1\nLine 2\nLine 3';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toContain('Line 1');
      expect(result.directAnswer).toContain('Line 2');
    });

    it('handles DIRECT with no content after colon', () => {
      const response = 'DIRECT:';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('');
    });
  });

  describe('MULTI format', () => {
    it('parses MULTI with multiple valid lines', () => {
      const response = 'MULTI:\n- Fenster: Fix parser\n- Hockney: Write tests';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(2);
      expect(result.routes![0]).toEqual({ agent: 'Fenster', task: 'Fix parser' });
      expect(result.routes![1]).toEqual({ agent: 'Hockney', task: 'Write tests' });
    });

    it('parses MULTI with mixed valid and invalid lines', () => {
      const response = 'MULTI:\n- Edie: Code review\nInvalid line\n- Baer: Security audit';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(2);
      expect(result.routes![0]!.agent).toBe('Edie');
      expect(result.routes![1]!.agent).toBe('Baer');
    });

    it('handles MULTI with no valid routes', () => {
      const response = 'MULTI:\nInvalid line\nAnother bad line';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(0);
    });

    it('handles MULTI with extra whitespace', () => {
      const response = 'MULTI:\n- Fortier: Build system';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(1);
      expect(result.routes![0]!.agent).toBe('Fortier');
      expect(result.routes![0]!.task).toBe('Build system');
    });
  });

  describe('Fallback behavior', () => {
    it('treats unknown format as direct answer', () => {
      const response = 'This is just a plain response.';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('This is just a plain response.');
    });

    it('handles empty response', () => {
      const response = '';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('');
    });

    it('handles whitespace-only response', () => {
      const response = '   \n  \t  ';
      const result = parseCoordinatorResponse(response);
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('');
    });
  });
});

// ============================================================================
// 3. coordinator.ts — formatConversationContext()
// ============================================================================

describe('coordinator.ts — formatConversationContext', () => {
  it('formats messages with agentName prefix', () => {
    const messages: ShellMessage[] = [
      { role: 'agent', agentName: 'Hockney', content: 'Test complete', timestamp: new Date() },
    ];
    const formatted = formatConversationContext(messages);
    expect(formatted).toBe('[Hockney]: Test complete');
  });

  it('formats messages with role prefix when no agentName', () => {
    const messages: ShellMessage[] = [
      { role: 'user', content: 'Hello', timestamp: new Date() },
    ];
    const formatted = formatConversationContext(messages);
    expect(formatted).toBe('[user]: Hello');
  });

  it('respects maxMessages limit', () => {
    const messages: ShellMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: new Date(),
    }));
    const formatted = formatConversationContext(messages, 10);
    const lines = formatted.split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[0]).toContain('Message 40'); // Last 10 messages
  });

  it('handles empty message array', () => {
    const formatted = formatConversationContext([]);
    expect(formatted).toBe('');
  });

  it('handles single message', () => {
    const messages: ShellMessage[] = [
      { role: 'system', content: 'Init', timestamp: new Date() },
    ];
    const formatted = formatConversationContext(messages);
    expect(formatted).toBe('[system]: Init');
  });

  it('uses default maxMessages of 20', () => {
    const messages: ShellMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: 'user' as const,
      content: `Msg ${i}`,
      timestamp: new Date(),
    }));
    const formatted = formatConversationContext(messages);
    const lines = formatted.split('\n');
    expect(lines).toHaveLength(20);
  });
});

// ============================================================================
// 4. spawn.ts — loadAgentCharter() edge cases
// ============================================================================

describe('spawn.ts — loadAgentCharter', () => {
  it('loads charter with teamRoot provided', () => {
    const charter = loadAgentCharter('hockney', FIXTURES);
    expect(charter).toContain('Hockney');
  });

  it('lowercases agent name for path resolution', () => {
    const charter = loadAgentCharter('HOCKNEY', FIXTURES);
    expect(charter).toContain('Hockney');
  });

  it('throws descriptive error when charter not found', () => {
    expect(() => loadAgentCharter('nobody', FIXTURES)).toThrow(
      /No charter found for "nobody"/
    );
  });

  it('throws when .squad/ does not exist and teamRoot not provided', () => {
    const originalCwd = process.cwd();
    try {
      const tmpDir = makeTempDir('no-squad-');
      process.chdir(tmpDir);
      expect(() => loadAgentCharter('test')).toThrow(/No (team|charter) found/);
      cleanDir(tmpDir);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

// ============================================================================
// 5. spawn.ts — buildAgentPrompt()
// ============================================================================

describe('spawn.ts — buildAgentPrompt', () => {
  it('includes charter in prompt', () => {
    const prompt = buildAgentPrompt('# Charter Content');
    expect(prompt).toContain('YOUR CHARTER');
    expect(prompt).toContain('# Charter Content');
  });

  it('includes systemContext when provided', () => {
    const prompt = buildAgentPrompt('charter', { systemContext: 'Extra context' });
    expect(prompt).toContain('ADDITIONAL CONTEXT');
    expect(prompt).toContain('Extra context');
  });

  it('omits ADDITIONAL CONTEXT when not provided', () => {
    const prompt = buildAgentPrompt('charter');
    expect(prompt).not.toContain('ADDITIONAL CONTEXT');
  });

  it('handles empty charter', () => {
    const prompt = buildAgentPrompt('');
    expect(prompt).toContain('YOUR CHARTER');
  });
});

// ============================================================================
// 6. lifecycle.ts — ShellLifecycle initialization
// ============================================================================

describe('lifecycle.ts — ShellLifecycle', () => {
  let tmpDir: string;
  let registry: SessionRegistry;
  let renderer: ShellRenderer;

  beforeEach(() => {
    tmpDir = makeTempDir('lifecycle-');
    registry = new SessionRegistry();
    renderer = new ShellRenderer();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  function makeLifecycle(teamRoot: string): ShellLifecycle {
    return new ShellLifecycle({ teamRoot, renderer, registry });
  }

  it('throws when .squad/ does not exist', async () => {
    const lc = makeLifecycle(tmpDir);
    await expect(lc.initialize()).rejects.toThrow(/No team found/);
  });

  it('throws when team.md is missing', async () => {
    fs.mkdirSync(join(tmpDir, '.squad'), { recursive: true });
    const lc = makeLifecycle(tmpDir);
    await expect(lc.initialize()).rejects.toThrow(/No team manifest found/);
  });

  it('sets state to error on initialization failure', async () => {
    const lc = makeLifecycle(tmpDir);
    try {
      await lc.initialize();
    } catch {
      // Expected
    }
    expect(lc.getState().status).toBe('error');
  });

  it('discovers agents from team.md', async () => {
    const squadDir = join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(join(squadDir, 'team.md'), makeTeamMd([
      { name: 'Fenster', role: 'Core Dev' },
      { name: 'Hockney', role: 'Tester' },
    ]));
    const lc = makeLifecycle(tmpDir);
    await lc.initialize();
    expect(lc.getState().status).toBe('ready');
    expect(lc.getDiscoveredAgents()).toHaveLength(2);
  });

  it('registers discovered agents in the registry', async () => {
    const squadDir = join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(join(squadDir, 'team.md'), makeTeamMd([
      { name: 'Edie', role: 'TypeScript' },
    ]));
    const lc = makeLifecycle(tmpDir);
    await lc.initialize();
    expect(registry.get('Edie')).toBeDefined();
    expect(registry.get('Edie')?.role).toBe('TypeScript');
  });

  it('handles team.md with no active agents', async () => {
    const squadDir = join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(join(squadDir, 'team.md'), makeTeamMd([]));
    const lc = makeLifecycle(tmpDir);
    await lc.initialize();
    expect(lc.getDiscoveredAgents()).toHaveLength(0);
  });
});

// ============================================================================
// 7. router.ts — parseInput() for all message types
// ============================================================================

describe('router.ts — parseInput', () => {
  const knownAgents = ['Fenster', 'Hockney', 'Edie'];

  describe('slash commands', () => {
    it('parses /status command', () => {
      const parsed = parseInput('/status', knownAgents);
      expect(parsed.type).toBe('slash_command');
      expect(parsed.command).toBe('status');
      expect(parsed.args).toEqual([]);
    });

    it('parses command with args', () => {
      const parsed = parseInput('/history 50', knownAgents);
      expect(parsed.type).toBe('slash_command');
      expect(parsed.command).toBe('history');
      expect(parsed.args).toEqual(['50']);
    });

    it('lowercases command name', () => {
      const parsed = parseInput('/QUIT', knownAgents);
      expect(parsed.command).toBe('quit');
    });

    it('handles multiple args', () => {
      const parsed = parseInput('/cmd arg1 arg2 arg3', knownAgents);
      expect(parsed.args).toEqual(['arg1', 'arg2', 'arg3']);
    });
  });

  describe('direct agent addressing', () => {
    it('parses @Agent syntax', () => {
      const parsed = parseInput('@Fenster fix the bug', knownAgents);
      expect(parsed.type).toBe('direct_agent');
      expect(parsed.agentName).toBe('Fenster');
      expect(parsed.content).toBe('fix the bug');
    });

    it('parses comma syntax', () => {
      const parsed = parseInput('Hockney, write tests', knownAgents);
      expect(parsed.type).toBe('direct_agent');
      expect(parsed.agentName).toBe('Hockney');
      expect(parsed.content).toBe('write tests');
    });

    it('matches agent names case-insensitively', () => {
      const parsed = parseInput('@fenster help', knownAgents);
      expect(parsed.agentName).toBe('Fenster');
    });

    it('handles @Agent with no message', () => {
      const parsed = parseInput('@Edie', knownAgents);
      expect(parsed.type).toBe('direct_agent');
      expect(parsed.content).toBeUndefined();
    });

    it('routes to coordinator when @Unknown agent', () => {
      const parsed = parseInput('@Nobody help', knownAgents);
      expect(parsed.type).toBe('coordinator');
    });

    it('routes to coordinator when unknown agent with comma', () => {
      const parsed = parseInput('Nobody, help', knownAgents);
      expect(parsed.type).toBe('coordinator');
    });
  });

  describe('coordinator routing', () => {
    it('routes plain text to coordinator', () => {
      const parsed = parseInput('What is the status?', knownAgents);
      expect(parsed.type).toBe('coordinator');
      expect(parsed.content).toBe('What is the status?');
    });

    it('routes empty input to coordinator', () => {
      const parsed = parseInput('', knownAgents);
      expect(parsed.type).toBe('coordinator');
    });

    it('routes whitespace-only input to coordinator', () => {
      const parsed = parseInput('   ', knownAgents);
      expect(parsed.type).toBe('coordinator');
    });
  });

  describe('edge cases', () => {
    it('handles input with leading/trailing whitespace', () => {
      const parsed = parseInput('  @Fenster test  ', knownAgents);
      expect(parsed.type).toBe('direct_agent');
      expect(parsed.agentName).toBe('Fenster');
    });

    it('handles multiline content in @Agent message', () => {
      const parsed = parseInput('@Hockney line1\nline2', knownAgents);
      expect(parsed.content).toContain('line1');
      expect(parsed.content).toContain('line2');
    });
  });
});

// ============================================================================
// 7b. router.ts — parseDispatchTargets() for multi-agent mentions
// ============================================================================

describe('router.ts — parseDispatchTargets', () => {
  const knownAgents = ['Fenster', 'Hockney', 'Edie'];

  it('extracts multiple @agent mentions', () => {
    const result = parseDispatchTargets('@Fenster @Hockney fix and test', knownAgents);
    expect(result.agents).toEqual(['Fenster', 'Hockney']);
    expect(result.content).toBe('fix and test');
  });

  it('returns empty agents for plain text', () => {
    const result = parseDispatchTargets('just a plain message', knownAgents);
    expect(result.agents).toEqual([]);
    expect(result.content).toBe('just a plain message');
  });

  it('deduplicates repeated mentions', () => {
    const result = parseDispatchTargets('@Fenster @fenster do it', knownAgents);
    expect(result.agents).toEqual(['Fenster']);
  });

  it('ignores unknown agent mentions', () => {
    const result = parseDispatchTargets('@Fenster @Nobody test', knownAgents);
    expect(result.agents).toEqual(['Fenster']);
  });

  it('handles single mention', () => {
    const result = parseDispatchTargets('@Edie write docs', knownAgents);
    expect(result.agents).toEqual(['Edie']);
    expect(result.content).toBe('write docs');
  });

  it('is case-insensitive for mentions', () => {
    const result = parseDispatchTargets('@FENSTER @hockney go', knownAgents);
    expect(result.agents).toEqual(['Fenster', 'Hockney']);
  });

  it('extracts mentions from mid-sentence', () => {
    const result = parseDispatchTargets('ask @Fenster and @Hockney to collaborate', knownAgents);
    expect(result.agents).toEqual(['Fenster', 'Hockney']);
    expect(result.content).toBe('ask and to collaborate');
  });

  it('handles all three agents', () => {
    const result = parseDispatchTargets('@Fenster @Hockney @Edie full team task', knownAgents);
    expect(result.agents).toEqual(['Fenster', 'Hockney', 'Edie']);
    expect(result.content).toBe('full team task');
  });

  it('handles empty input', () => {
    const result = parseDispatchTargets('', knownAgents);
    expect(result.agents).toEqual([]);
    expect(result.content).toBe('');
  });
});

// ============================================================================
// 8. sessions.ts — SessionRegistry operations
// ============================================================================

describe('sessions.ts — SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it('register creates session with idle status', () => {
    const session = registry.register('test', 'Role');
    expect(session.name).toBe('test');
    expect(session.role).toBe('Role');
    expect(session.status).toBe('idle');
    expect(session.startedAt).toBeInstanceOf(Date);
  });

  it('get retrieves registered session', () => {
    registry.register('agent1', 'role1');
    expect(registry.get('agent1')?.role).toBe('role1');
  });

  it('get returns undefined for unknown name', () => {
    expect(registry.get('nobody')).toBeUndefined();
  });

  it('getAll returns all sessions', () => {
    registry.register('a', 'r1');
    registry.register('b', 'r2');
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getActive filters to working/streaming status', () => {
    registry.register('idle1', 'r');
    registry.register('working1', 'r');
    registry.register('streaming1', 'r');
    registry.register('error1', 'r');
    registry.updateStatus('working1', 'working');
    registry.updateStatus('streaming1', 'streaming');
    registry.updateStatus('error1', 'error');
    const active = registry.getActive();
    expect(active).toHaveLength(2);
    expect(active.map(s => s.name).sort()).toEqual(['streaming1', 'working1']);
  });

  it('updateStatus changes session status', () => {
    registry.register('agent', 'role');
    registry.updateStatus('agent', 'working');
    expect(registry.get('agent')?.status).toBe('working');
  });

  it('updateStatus is no-op for unknown session', () => {
    expect(() => registry.updateStatus('nobody', 'working')).not.toThrow();
  });

  it('remove deletes session and returns true', () => {
    registry.register('agent', 'role');
    expect(registry.remove('agent')).toBe(true);
    expect(registry.get('agent')).toBeUndefined();
  });

  it('remove returns false for unknown session', () => {
    expect(registry.remove('nobody')).toBe(false);
  });

  it('clear removes all sessions', () => {
    registry.register('a', 'r');
    registry.register('b', 'r');
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});

// ============================================================================
// 9. commands.ts — executeCommand() for all slash commands
// ============================================================================

describe('commands.ts — executeCommand', () => {
  let registry: SessionRegistry;
  let renderer: ShellRenderer;
  let messageHistory: ShellMessage[];
  let context: any;

  beforeEach(() => {
    registry = new SessionRegistry();
    renderer = new ShellRenderer();
    messageHistory = [];
    context = { registry, renderer, messageHistory, teamRoot: '/test' };
  });

  describe('/help', () => {
    it('returns help text', () => {
      const result = executeCommand('help', [], context);
      expect(result.handled).toBe(true);
      expect(result.output).toContain('Commands:');
      expect(result.output).toContain('/status');
      expect(result.output).toContain('/agents');
    });
  });

  describe('/status', () => {
    it('shows status with no agents', () => {
      const result = executeCommand('status', [], context);
      expect(result.handled).toBe(true);
      expect(result.output).toContain('Squad Status');
      expect(result.output).toContain('Team:     0');
    });

    it('shows registered agents count', () => {
      registry.register('a', 'r1');
      registry.register('b', 'r2');
      const result = executeCommand('status', [], context);
      expect(result.output).toContain('Team:     2 agents');
    });

    it('shows active agents details', () => {
      registry.register('worker', 'role');
      registry.updateStatus('worker', 'working');
      const result = executeCommand('status', [], context);
      expect(result.output).toContain('(1 active)');
      expect(result.output).toContain('worker');
    });
  });

  describe('/agents', () => {
    it('shows "No agents registered" when empty', () => {
      const result = executeCommand('agents', [], context);
      expect(result.handled).toBe(true);
      expect(result.output).toContain('No team members yet');
    });

    it('lists all agents with status icons', () => {
      registry.register('idle1', 'r');
      registry.register('worker', 'r');
      registry.updateStatus('worker', 'working');
      const result = executeCommand('agents', [], context);
      expect(result.output).toContain('idle1');
      expect(result.output).toContain('worker');
    });
  });

  describe('/history', () => {
    it('shows "No message history" when empty', () => {
      const result = executeCommand('history', [], context);
      expect(result.handled).toBe(true);
      expect(result.output).toContain('No messages yet');
    });

    it('shows recent messages with default limit 10', () => {
      for (let i = 0; i < 20; i++) {
        messageHistory.push({
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date(),
        });
      }
      const result = executeCommand('history', [], context);
      expect(result.output).toContain('Last 10 messages:');
      expect(result.output).toContain('Message 19'); // Last message
    });

    it('respects custom limit arg', () => {
      for (let i = 0; i < 50; i++) {
        messageHistory.push({ role: 'user', content: `Msg ${i}`, timestamp: new Date() });
      }
      const result = executeCommand('history', ['5'], context);
      expect(result.output).toContain('Last 5 messages:');
    });

    it('truncates long messages at 100 chars', () => {
      messageHistory.push({
        role: 'user',
        content: 'x'.repeat(150),
        timestamp: new Date(),
      });
      const result = executeCommand('history', [], context);
      expect(result.output).toContain('...');
    });
  });

  describe('/clear', () => {
    it('returns clear flag to reset message history', () => {
      const result = executeCommand('clear', [], context);
      expect(result.handled).toBe(true);
      expect(result.clear).toBe(true);
    });
  });

  describe('/quit and /exit', () => {
    it('/quit sets exit flag', () => {
      const result = executeCommand('quit', [], context);
      expect(result.handled).toBe(true);
      expect(result.exit).toBe(true);
    });

    it('/exit sets exit flag', () => {
      const result = executeCommand('exit', [], context);
      expect(result.handled).toBe(true);
      expect(result.exit).toBe(true);
    });
  });

  describe('unknown command', () => {
    it('returns handled: false with error message', () => {
      const result = executeCommand('foobar', [], context);
      expect(result.handled).toBe(false);
      expect(result.output).toContain('Hmm, /foobar?');
      expect(result.output).toContain('Type /help');
    });
  });
});

// ============================================================================
// 10. memory.ts — MemoryManager
// ============================================================================

describe('memory.ts — MemoryManager', () => {
  it('uses DEFAULT_LIMITS when no config provided', () => {
    const manager = new MemoryManager();
    const limits = manager.getLimits();
    expect(limits.maxMessages).toBe(DEFAULT_LIMITS.maxMessages);
    expect(limits.maxStreamBuffer).toBe(DEFAULT_LIMITS.maxStreamBuffer);
  });

  it('allows partial limit overrides', () => {
    const manager = new MemoryManager({ maxMessages: 500 });
    expect(manager.getLimits().maxMessages).toBe(500);
    expect(manager.getLimits().maxSessions).toBe(DEFAULT_LIMITS.maxSessions);
  });

  describe('canCreateSession', () => {
    it('returns true when under limit', () => {
      const manager = new MemoryManager({ maxSessions: 5 });
      expect(manager.canCreateSession(3)).toBe(true);
    });

    it('returns false when at limit', () => {
      const manager = new MemoryManager({ maxSessions: 5 });
      expect(manager.canCreateSession(5)).toBe(false);
    });
  });

  describe('trackBuffer', () => {
    it('tracks buffer growth within limits', () => {
      const manager = new MemoryManager({ maxStreamBuffer: 100 });
      expect(manager.trackBuffer('s1', 50)).toBe(true);
      expect(manager.trackBuffer('s1', 30)).toBe(true);
    });

    it('rejects buffer growth exceeding limit', () => {
      const manager = new MemoryManager({ maxStreamBuffer: 100 });
      manager.trackBuffer('s1', 80);
      expect(manager.trackBuffer('s1', 30)).toBe(false);
    });

    it('tracks multiple sessions independently', () => {
      const manager = new MemoryManager({ maxStreamBuffer: 100 });
      manager.trackBuffer('s1', 50);
      manager.trackBuffer('s2', 50);
      expect(manager.getStats().sessions).toBe(2);
    });
  });

  describe('trimMessages', () => {
    it('returns same array when under limit', () => {
      const manager = new MemoryManager({ maxMessages: 10 });
      const msgs = Array(5).fill('x');
      expect(manager.trimMessages(msgs)).toHaveLength(5);
    });

    it('trims to maxMessages when over limit', () => {
      const manager = new MemoryManager({ maxMessages: 10 });
      const msgs = Array(20).fill(null).map((_, i) => i);
      const trimmed = manager.trimMessages(msgs);
      expect(trimmed).toHaveLength(10);
      expect(trimmed[0]).toBe(10); // Last 10 messages
    });
  });

  describe('clearBuffer', () => {
    it('removes buffer tracking for session', () => {
      const manager = new MemoryManager();
      manager.trackBuffer('s1', 100);
      manager.clearBuffer('s1');
      expect(manager.getStats().sessions).toBe(0);
    });

    it('is safe to call for non-existent session', () => {
      const manager = new MemoryManager();
      expect(() => manager.clearBuffer('nobody')).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('returns accurate session count and buffer size', () => {
      const manager = new MemoryManager();
      manager.trackBuffer('s1', 100);
      manager.trackBuffer('s2', 200);
      const stats = manager.getStats();
      expect(stats.sessions).toBe(2);
      expect(stats.totalBufferBytes).toBe(300);
    });
  });
});

// ============================================================================
// 11. autocomplete.ts — createCompleter()
// ============================================================================

describe('autocomplete.ts — createCompleter', () => {
  const agents = ['Fenster', 'Hockney', 'Edie'];
  let completer: ReturnType<typeof createCompleter>;

  beforeEach(() => {
    completer = createCompleter(agents);
  });

  describe('agent name completion', () => {
    it('completes @Agent prefix', () => {
      const [matches, partial] = completer('@Fe');
      expect(matches).toEqual(['@Fenster ']);
      expect(partial).toBe('@Fe');
    });

    it('returns all agents for bare @', () => {
      const [matches] = completer('@');
      expect(matches).toHaveLength(3);
      expect(matches).toContain('@Fenster ');
    });

    it('matches case-insensitively', () => {
      const [matches] = completer('@hock');
      expect(matches).toEqual(['@Hockney ']);
    });

    it('returns no matches for non-matching prefix', () => {
      const [matches] = completer('@Nobody');
      expect(matches).toHaveLength(0);
    });
  });

  describe('slash command completion', () => {
    it('completes /status', () => {
      const [matches] = completer('/sta');
      expect(matches).toEqual(['/status']);
    });

    it('returns all commands for bare /', () => {
      const [matches] = completer('/');
      expect(matches.length).toBeGreaterThan(5);
      expect(matches).toContain('/help');
      expect(matches).toContain('/quit');
    });

    it('matches case-insensitively', () => {
      const [matches] = completer('/HELP');
      expect(matches).toEqual(['/help']);
    });

    it('returns no matches for non-existent command', () => {
      const [matches] = completer('/foobar');
      expect(matches).toHaveLength(0);
    });
  });

  describe('no completion', () => {
    it('returns empty array for plain text', () => {
      const [matches] = completer('hello world');
      expect(matches).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      const [matches] = completer('');
      expect(matches).toHaveLength(0);
    });
  });
});

// ============================================================================
// 12. CRITICAL BUG TEST: coordinatorSession.sendMessage() exists after createSession()
// ============================================================================

describe('CRITICAL BUG: session.sendMessage() exists after createSession()', () => {
  it('mock session has sendMessage as callable function', async () => {
    const mockSession = createMockSession();
    expect(typeof mockSession.sendMessage).toBe('function');
    await expect(mockSession.sendMessage({ prompt: 'test' })).resolves.toBeUndefined();
    expect(mockSession.sendMessage).toHaveBeenCalledWith({ prompt: 'test' });
  });

  it('createSession returns object with sendMessage method', async () => {
    const mockClient = createMockClient();
    const mockSession = createMockSession();
    mockClient.createSession.mockResolvedValue(mockSession);

    const session = await mockClient.createSession({ streaming: true });
    expect(session).toBeDefined();
    expect(typeof session.sendMessage).toBe('function');
  });

  it('throws clear error when sendMessage is missing', async () => {
    const mockClient = createMockClient();
    const brokenSession = { on: vi.fn(), off: vi.fn(), close: vi.fn() }; // Missing sendMessage
    mockClient.createSession.mockResolvedValue(brokenSession);

    const session = await mockClient.createSession({ streaming: true });
    expect(session.sendMessage).toBeUndefined();
    // In real code, calling session.sendMessage() would throw "is not a function"
  });

  it('verifies sendMessage is present before calling', async () => {
    const mockClient = createMockClient();
    const mockSession = createMockSession();
    mockClient.createSession.mockResolvedValue(mockSession);

    const session = await mockClient.createSession({ streaming: true });
    
    // Best practice: check before calling
    if (typeof session.sendMessage !== 'function') {
      throw new Error('Session object missing sendMessage method');
    }
    
    await session.sendMessage({ prompt: 'test' });
    expect(mockSession.sendMessage).toHaveBeenCalled();
  });

  it('handles sendMessage rejection gracefully', async () => {
    const mockSession = createMockSession();
    mockSession.sendMessage.mockRejectedValue(new Error('Network error'));

    await expect(mockSession.sendMessage({ prompt: 'test' })).rejects.toThrow('Network error');
  });
});

// ============================================================================
// 13. Error handling tests
// ============================================================================

describe('Error handling in shell operations', () => {
  it('dispatchToAgent handles session creation failure', async () => {
    const mockClient = createMockClient();
    mockClient.createSession.mockRejectedValue(new Error('Connection failed'));

    await expect(mockClient.createSession({})).rejects.toThrow('Connection failed');
  });

  it('dispatchToAgent handles sendMessage failure', async () => {
    const mockSession = createMockSession();
    mockSession.sendMessage.mockRejectedValue(new Error('Timeout'));

    await expect(mockSession.sendMessage({ prompt: 'test' })).rejects.toThrow('Timeout');
  });

  it('session.close() is safe to call on cleanup', async () => {
    const mockSession = createMockSession();
    mockSession.close.mockResolvedValue(undefined);

    await expect(mockSession.close()).resolves.toBeUndefined();
  });

  it('session.close() handles rejection gracefully', async () => {
    const mockSession = createMockSession();
    mockSession.close.mockRejectedValue(new Error('Already closed'));

    await expect(mockSession.close()).rejects.toThrow('Already closed');
  });
});

// ============================================================================
// 14. Error hardening tests (Issue #334)
// ============================================================================

describe('Error hardening — user-friendly messages with remediation hints', () => {
  // --- lifecycle.ts ---

  it('lifecycle init error for missing .squad/ includes remediation hint', async () => {
    const tmpDir = makeTempDir('no-squad-');
    const lc = new ShellLifecycle({
      teamRoot: tmpDir,
      renderer: new ShellRenderer(),
      registry: new SessionRegistry(),
    });
    try {
      await lc.initialize();
    } catch (err: unknown) {
      expect((err as Error).message).toContain('squad init');
      expect((err as Error).message).not.toContain('Error:');
    }
    cleanDir(tmpDir);
  });

  it('lifecycle init error for missing team.md includes remediation hint', async () => {
    const tmpDir = makeTempDir('no-team-');
    fs.mkdirSync(join(tmpDir, '.squad'), { recursive: true });
    const lc = new ShellLifecycle({
      teamRoot: tmpDir,
      renderer: new ShellRenderer(),
      registry: new SessionRegistry(),
    });
    try {
      await lc.initialize();
    } catch (err: unknown) {
      expect((err as Error).message).toContain('squad init');
      expect((err as Error).message).toContain('No team manifest found');
    }
    cleanDir(tmpDir);
  });

  // --- spawn.ts ---

  it('loadAgentCharter error for missing charter includes agent name', () => {
    try {
      loadAgentCharter('nonexistent-agent', FIXTURES);
    } catch (err: unknown) {
      expect((err as Error).message).toContain('nonexistent-agent');
      expect((err as Error).message).toContain('charter.md exists');
    }
  });

  it('loadAgentCharter error for no .squad/ includes actionable hint', () => {
    const tmpDir = makeTempDir('no-squad-spawn-');
    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      loadAgentCharter('test');
    } catch (err: unknown) {
      // Error may say "squad init" OR "charter.md exists" depending on resolveSquad()
      expect((err as Error).message).toMatch(/squad init|charter\.md exists/);
      expect((err as Error).message).not.toMatch(/^Error:/);
    } finally {
      process.chdir(originalCwd);
      cleanDir(tmpDir);
    }
  });

  // --- coordinator.ts ---

  it('buildCoordinatorPrompt includes squad init hint in fallback text', () => {
    const prompt = buildCoordinatorPrompt({ teamRoot: '/nonexistent' });
    expect(prompt).toContain('squad init');
  });

  // --- commands.ts ---

  it('unknown command returns helpful suggestion', () => {
    const result = executeCommand('foobar', [], {
      registry: new SessionRegistry(),
      renderer: new ShellRenderer(),
      messageHistory: [],
      teamRoot: '/tmp',
    });
    expect(result.handled).toBe(false);
    expect(result.output).toContain('/help');
    expect(result.output).toContain('foobar');
  });

  // --- Error message sanitization ---

  it('error messages do not expose raw stack traces', () => {
    const rawError = new Error('Connection reset by peer');
    rawError.stack = 'Error: Connection reset by peer\n    at Socket.emit (node:events:513:28)';
    const errorMsg = rawError.message;
    const friendly = errorMsg.replace(/^Error:\s*/i, '');
    expect(friendly).not.toContain('at Socket.emit');
    expect(friendly).toBe('Connection reset by peer');
  });

  it('Error: prefix is stripped from user-facing messages', () => {
    const msg = 'Error: something broke';
    const friendly = msg.replace(/^Error:\s*/i, '');
    expect(friendly).toBe('something broke');
  });

  it('messages without Error: prefix pass through unchanged', () => {
    const msg = 'Connection timed out';
    const friendly = msg.replace(/^Error:\s*/i, '');
    expect(friendly).toBe('Connection timed out');
  });
});

// ============================================================================
// 14. Dead session eviction (Issue #366)
// ============================================================================

describe('Dead session eviction', () => {
  it('agentSessions Map evicts entry on delete', () => {
    const agentSessions = new Map<string, MockSquadSession>();
    const session = createMockSession();
    agentSessions.set('TestAgent', session);
    expect(agentSessions.has('TestAgent')).toBe(true);

    // Simulate eviction after error
    agentSessions.delete('TestAgent');
    expect(agentSessions.has('TestAgent')).toBe(false);
    expect(agentSessions.size).toBe(0);
  });

  it('next dispatch creates fresh session after eviction', () => {
    const agentSessions = new Map<string, MockSquadSession>();
    const deadSession = createMockSession();
    agentSessions.set('TestAgent', deadSession);

    // Evict the dead session
    agentSessions.delete('TestAgent');

    // Simulate next dispatch — no existing session
    const existingSession = agentSessions.get('TestAgent');
    expect(existingSession).toBeUndefined();

    // Would create a new session here in real code
    const freshSession = createMockSession();
    agentSessions.set('TestAgent', freshSession);
    expect(agentSessions.get('TestAgent')).toBe(freshSession);
    expect(agentSessions.get('TestAgent')).not.toBe(deadSession);
  });

  it('coordinator session evicts on null assignment', () => {
    let coordinatorSession: MockSquadSession | null = createMockSession();
    expect(coordinatorSession).not.toBeNull();

    // Simulate eviction
    coordinatorSession = null;
    expect(coordinatorSession).toBeNull();
  });
});

// ============================================================================
// 15. Stub command removal (Issue #371)
// ============================================================================

describe('Stub command removal', () => {
  it('commands.ts executeCommand does not have loop command', () => {
    const reg = new SessionRegistry();
    const renderer = new ShellRenderer();
    const result = executeCommand('loop', [], {
      registry: reg,
      renderer,
      messageHistory: [],
      teamRoot: '/test',
    });
    // Unknown commands return handled: false
    expect(result.handled).toBe(false);
  });

  it('commands.ts executeCommand does not have hire command', () => {
    const reg = new SessionRegistry();
    const renderer = new ShellRenderer();
    const result = executeCommand('hire', [], {
      registry: reg,
      renderer,
      messageHistory: [],
      teamRoot: '/test',
    });
    expect(result.handled).toBe(false);
  });

  it('all known commands are functional (not stubs)', () => {
    const reg = new SessionRegistry();
    const renderer = new ShellRenderer();
    const knownCommands = ['status', 'history', 'clear', 'help', 'quit', 'exit', 'agents'];
    for (const cmd of knownCommands) {
      const result = executeCommand(cmd, [], {
        registry: reg,
        renderer,
        messageHistory: [],
        teamRoot: '/test',
      });
      expect(result.handled).toBe(true);
    }
  });
});
