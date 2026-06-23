import { SessionRegistry } from './sessions.js';
import { ShellRenderer } from './render.js';
import { getTerminalWidth } from './terminal.js';
import { BOLD, DIM, RESET } from '../core/output.js';
import { listSessions, loadSessionById, type SessionData } from './session-store.js';
import { formatAgentLine, getStatusTag } from './agent-status.js';
import type { ShellMessage } from './types.js';
import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { runNapSync, formatNapReport } from '../core/nap.js';

const storage = new FSStorageProvider();

export interface CommandContext {
  registry: SessionRegistry;
  renderer: ShellRenderer;
  messageHistory: ShellMessage[];
  teamRoot: string;
  version?: string;
  /** Callback to restore a previous session's messages into the shell. */
  onRestoreSession?: (session: SessionData) => void;
}

export interface CommandResult {
  handled: boolean;
  exit?: boolean;
  output?: string;
  /** When true, the shell should clear its message history. */
  clear?: boolean;
  /** When true, the shell should trigger init casting with the provided prompt. */
  triggerInitCast?: { prompt: string };
  /**
   * When true, the shell should enter "awaiting init prompt" mode:
   * the next user message will be treated as a team-cast request.
   * Set when `/init` is run with no inline prompt.
   */
  awaitInitPrompt?: boolean;
}

/**
 * Execute a slash command.
 */
export function executeCommand(
  command: string,
  args: string[],
  context: CommandContext
): CommandResult {
  switch (command) {
    case 'status':
      return handleStatus(context);
    case 'history':
      return handleHistory(args, context);
    case 'clear':
      return handleClear();
    case 'help':
      return handleHelp(args);
    case 'quit':
    case 'exit':
      return { handled: true, exit: true };
    case 'agents':
      return handleAgents(context);
    case 'sessions':
      return handleSessions(context);
    case 'resume':
      return handleResume(args, context);
    case 'version':
      return { handled: true, output: context.version ?? 'unknown' };
    case 'nap':
      return handleNap(args, context);
    case 'init':
      return handleInit(args, context);
    default: {
      const known = ['status', 'history', 'clear', 'help', 'quit', 'exit', 'agents', 'sessions', 'resume', 'version', 'nap', 'init'];
      const suggestion = known.find(k => k.startsWith(command.slice(0, 2)));
      const hint = suggestion ? ` Did you mean /${suggestion}?` : '';
      return { handled: false, output: `Unknown command: /${command}.${hint} Type /help for commands.` };
    }
  }
}

function handleStatus(context: CommandContext): CommandResult {
  const agents = context.registry.getAll();
  const active = context.registry.getActive();
  const lines = [
    `${BOLD}Squad Status${RESET}`,
    '-----------',
    `Team:     ${agents.length} agent${agents.length !== 1 ? 's' : ''} (${active.length} active)`,
    `Root:     ${DIM}${context.teamRoot}${RESET}`,
    `Messages: ${context.messageHistory.length} this session`,
  ];
  if (active.length > 0) {
    lines.push('', 'Working:');
    for (const a of active) {
      const hint = a.activityHint ? ` - ${a.activityHint}` : '';
      lines.push(`${formatAgentLine(a)}${hint}`);
    }
  }
  return { handled: true, output: lines.join('\n') };
}

function handleHistory(args: string[], context: CommandContext): CommandResult {
  let limit = 10;
  if (args[0]) {
    const parsed = parseInt(args[0], 10);
    if (isNaN(parsed) || parsed <= 0) {
      return { handled: true, output: 'Usage: /history [count]  — count must be a positive number.' };
    }
    limit = parsed;
  }
  const recent = context.messageHistory.slice(-limit);
  if (recent.length === 0) {
    return { handled: true, output: 'No messages yet.' };
  }
  const lines = recent.map(m => {
    const prefix = m.agentName ?? m.role;
    const time = m.timestamp.toLocaleTimeString();
    return `  [${time}] ${prefix}: ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`;
  });
  return { handled: true, output: `Last ${recent.length} message${recent.length !== 1 ? 's' : ''}:\n${lines.join('\n')}` };
}

function handleClear(): CommandResult {
  // Send ANSI escape code to actually clear the terminal screen
  process.stdout.write('\x1B[2J\x1B[H');
  return { handled: true, clear: true };
}

function handleHelp(args: string[]): CommandResult {
  const width = getTerminalWidth();

  if (width < 80) {
    // Single-column compact help for narrow terminals
    return {
      handled: true,
      output: [
        'How it works:',
        '  Just type what you need — Squad routes your message to the right agent.',
        '  @AgentName message — send directly to one agent (case-insensitive).',
        '  @Agent1 @Agent2 message — send to multiple agents in parallel.',
        '  AgentName, message — comma syntax also works for direct dispatch.',
        '',
        'Commands:',
        '/status — Check your team',
        '/history [N] — Recent messages (default 10)',
        '/agents — List team members',
        '/sessions — Past sessions',
        '/resume <id> — Restore session by ID prefix',
        '/init [--roles] [prompt] — Set up your team',
        '/nap [--deep] [--dry-run] — Context hygiene',
        '/version — Show version',
        '/clear — Clear screen',
        '/quit — Exit',
      ].join('\n'),
    };
  }

  return {
    handled: true,
    output: [
      'How it works:',
      '  Just type what you need — Squad routes your message to the right agent.',
      '  @AgentName message — send directly to one agent (case-insensitive).',
      '  @Agent1 @Agent2 message — send to multiple agents in parallel.',
      '  AgentName, message — comma syntax also works for direct dispatch.',
      '',
      'Commands:',
      "  /status             — Check your team & what's happening",
      '  /history [N]        — See recent messages (default 10)',
      '  /agents             — List all team members',
      '  /sessions           — List saved sessions',
      '  /resume <id>        — Restore a past session by ID prefix',
      '  /init [--roles] [p] — Set up your team (add --roles for base role catalog)',
      '  /nap [--deep]       — Context hygiene (compress, prune, archive)',
      '  /version            — Show version',
      '  /clear              — Clear the screen',
      '  /quit               — Exit',
    ].join('\n'),
  };
}

function handleAgents(context: CommandContext): CommandResult {
  const agents = context.registry.getAll();
  if (agents.length === 0) {
    return { handled: true, output: 'No team members yet.' };
  }
  const lines = agents.map(a => formatAgentLine(a));
  return { handled: true, output: `Team Members:\n${lines.join('\n')}` };
}

function handleSessions(context: CommandContext): CommandResult {
  const sessions = listSessions(context.teamRoot);
  if (sessions.length === 0) {
    return { handled: true, output: 'No saved sessions.' };
  }
  const lines = sessions.slice(0, 10).map((s, i) => {
    const date = new Date(s.lastActiveAt).toLocaleString();
    return `  ${i + 1}. ${s.id.slice(0, 8)}  ${date}  (${s.messageCount} messages)`;
  });
  return {
    handled: true,
    output: `${BOLD}Saved Sessions${RESET} (${sessions.length} total)\n${lines.join('\n')}\n\nUse ${DIM}/resume <id-prefix>${RESET} to restore a session.`,
  };
}

function handleResume(args: string[], context: CommandContext): CommandResult {
  if (!args[0]) {
    return { handled: true, output: 'Usage: /resume <session-id-prefix>' };
  }
  const prefix = args[0].toLowerCase();
  const sessions = listSessions(context.teamRoot);
  const match = sessions.find(s => s.id.toLowerCase().startsWith(prefix));
  if (!match) {
    return { handled: true, output: `No session found matching "${prefix}". Try /sessions to list.` };
  }
  const session = loadSessionById(context.teamRoot, match.id);
  if (!session) {
    return { handled: true, output: `Failed to load session data for "${prefix}". The session file may be corrupted. Try /sessions to see available sessions.` };
  }
  if (context.onRestoreSession) {
    context.onRestoreSession(session);
    return { handled: true, output: `✓ Restored session ${match.id.slice(0, 8)} (${session.messages.length} messages)` };
  }
  return { handled: true, output: 'Session restore not available in this context. Try restarting the shell.' };
}

function handleNap(args: string[], context: CommandContext): CommandResult {
  try {
    const squadDir = path.join(context.teamRoot, '.squad');
    const deep = args.includes('--deep');
    const dryRun = args.includes('--dry-run');
    const result = runNapSync({ squadDir, deep, dryRun });
    return { handled: true, output: formatNapReport(result, !!process.env['NO_COLOR']) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { handled: true, output: `Nap failed: ${detail}\nRun \`squad nap\` from the CLI for details.` };
  }
}

function handleInit(args: string[], context: CommandContext): CommandResult {
  // Check for --roles flag
  const useBaseRoles = args.includes('--roles');
  const filteredArgs = args.filter(a => a !== '--roles');
  const prompt = filteredArgs.join(' ').trim();

  if (useBaseRoles) {
    // Write .init-roles marker for the casting flow to pick up
    const rolesMarker = path.join(context.teamRoot, '.squad', '.init-roles');
    try { storage.mkdirSync(path.dirname(rolesMarker), { recursive: true }); } catch { /* ignore */ }
    try { storage.writeSync(rolesMarker, '1'); } catch { /* ignore */ }
  }
  
  if (prompt) {
    return {
      handled: true,
      triggerInitCast: { prompt },
    };
  }
  
  // No prompt: guide the user and enter "awaiting init prompt" mode
  return {
    handled: true,
    awaitInitPrompt: true,
    output: [
      'To cast your Squad team, just type what you want to build.',
      '',
      'The coordinator will analyze your message, propose a team,',
      'create agent files, and route your work — all automatically.',
      '',
      'Example: "Build a React app with a Node.js backend"',
      useBaseRoles ? 'Mode: Using built-in base roles (--roles)' : 'Mode: Fictional universe casting (default)',
      '',
      `Team file: ${context.teamRoot}/.squad/team.md`,
    ].join('\n'),
  };
}
