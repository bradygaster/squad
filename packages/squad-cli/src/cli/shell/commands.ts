import { SessionRegistry } from './sessions.js';
import { ShellRenderer } from './render.js';
import { getTerminalWidth } from './terminal.js';
import type { ShellMessage } from './types.js';

export interface CommandContext {
  registry: SessionRegistry;
  renderer: ShellRenderer;
  messageHistory: ShellMessage[];
  teamRoot: string;
}

export interface CommandResult {
  handled: boolean;
  exit?: boolean;
  output?: string;
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
      return handleHelp();
    case 'quit':
    case 'exit':
      return { handled: true, exit: true };
    case 'agents':
      return handleAgents(context);
    default:
      return { handled: false, output: `Hmm, /${command}? Type /help for commands.` };
  }
}

function handleStatus(context: CommandContext): CommandResult {
  const agents = context.registry.getAll();
  const active = context.registry.getActive();
  const lines = [
    `Your Team:`,
    `  Root: ${context.teamRoot}`,
    `  Size: ${agents.length}`,
    `  Active now: ${active.length}`,
    `  In conversation: ${context.messageHistory.length}`,
  ];
  if (active.length > 0) {
    lines.push('', '  Working:');
    for (const a of active) {
      lines.push(`    ${a.name} (${a.role}) — ${a.status}`);
    }
  }
  return { handled: true, output: lines.join('\n') };
}

function handleHistory(args: string[], context: CommandContext): CommandResult {
  const limit = args[0] ? parseInt(args[0], 10) : 10;
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
  // Clear is handled by the shell (clears terminal)
  return { handled: true, output: '\x1Bc' }; // ANSI clear screen
}

function handleHelp(): CommandResult {
  const width = getTerminalWidth();
  if (width < 80) {
    // Single-column compact help for narrow terminals
    return {
      handled: true,
      output: [
        'Commands:',
        '/status — Check your team',
        '/history — Recent messages',
        '/agents — List team members',
        '/clear — Clear screen',
        '/quit — Exit',
        '',
        '@Agent message — Direct',
      ].join('\n'),
    };
  }
  return {
    handled: true,
    output: [
      'Commands:',
      "  /status   — Check your team & what's happening",
      '  /history  — See recent messages',
      '  /agents   — List all team members',
      '  /clear    — Clear the screen',
      '  /quit     — Exit',
      '',
      'Talk to agents:',
      '  @AgentName message',
      '  AgentName, message',
    ].join('\n'),
  };
}

function handleAgents(context: CommandContext): CommandResult {
  const agents = context.registry.getAll();
  if (agents.length === 0) {
    return { handled: true, output: 'No team members yet.' };
  }
  const lines = agents.map(a => {
    const icon = a.status === 'working' ? '🔵' : a.status === 'streaming' ? '🟢' : a.status === 'error' ? '🔴' : '⚪';
    return `  ${icon} ${a.name} (${a.role}) — ${a.status}`;
  });
  return { handled: true, output: `Team Members:\n${lines.join('\n')}` };
}
