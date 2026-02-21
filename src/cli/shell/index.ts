/**
 * Squad Interactive Shell — entry point
 *
 * Provides header chrome, readline input loop, and clean exit handling.
 * Ink-based UI will be wired in a follow-up (#242+).
 */

import { createRequire } from 'node:module';
import * as readline from 'node:readline/promises';
import { createCompleter } from './autocomplete.js';

export { SessionRegistry } from './sessions.js';
export { StreamBridge } from './stream-bridge.js';
export type { StreamBridgeOptions } from './stream-bridge.js';
export { ShellRenderer } from './render.js';
export { ShellLifecycle } from './lifecycle.js';
export type { LifecycleOptions, DiscoveredAgent } from './lifecycle.js';
export { spawnAgent, loadAgentCharter, buildAgentPrompt } from './spawn.js';
export type { SpawnOptions, SpawnResult, ToolDefinition } from './spawn.js';
export { buildCoordinatorPrompt, parseCoordinatorResponse, formatConversationContext } from './coordinator.js';
export type { CoordinatorConfig, RoutingDecision } from './coordinator.js';
export { parseInput } from './router.js';
export type { MessageType, ParsedInput } from './router.js';
export { executeCommand } from './commands.js';
export type { CommandContext, CommandResult } from './commands.js';
export { MemoryManager, DEFAULT_LIMITS } from './memory.js';
export type { MemoryLimits } from './memory.js';
export { detectTerminal, safeChar, boxChars } from './terminal.js';
export type { TerminalCapabilities } from './terminal.js';
export { createCompleter } from './autocomplete.js';
export type { CompleterFunction, CompleterResult } from './autocomplete.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { version: string };

function printHeader(): void {
  const version = `Squad v${pkg.version}`;
  const help = 'Type /help for commands';
  const width = Math.max(version.length, help.length) + 4;
  const pad = (text: string): string => `│  ${text.padEnd(width - 4)}│`;

  console.log(`╭${'─'.repeat(width - 1)}╮`);
  console.log(pad(version));
  console.log(pad(help));
  console.log(`╰${'─'.repeat(width - 1)}╯`);
}

const EXIT_COMMANDS = new Set(['exit', '/quit']);

export async function runShell(): Promise<void> {
  // Graceful Ctrl+C handling
  process.on('SIGINT', () => {
    console.log('\n👋 Squad out.');
    process.exit(0);
  });

  printHeader();

  // Agent names will be populated from team discovery; empty for now
  const agentNames: string[] = [];
  const completer = createCompleter(agentNames);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (EXIT_COMMANDS.has(trimmed)) {
        console.log('👋 Squad out.');
        break;
      }
      // Placeholder — command handling comes with future issues
      if (trimmed.length > 0) {
        console.log(`[echo] ${trimmed}`);
      }
    }
  } finally {
    rl.close();
  }
}
