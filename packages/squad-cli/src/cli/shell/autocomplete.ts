/**
 * Autocomplete for the Squad interactive shell.
 * Provides @agent name completion and /slash command completion.
 */

/** Known slash commands for autocomplete */
const SLASH_COMMANDS = [
  '/status',
  '/history',
  '/agents',
  '/sessions',
  '/resume',
  '/init',
  '/nap',
  '/version',
  '/clear',
  '/help',
  '/quit',
  '/exit',
];

export type CompleterResult = [string[], string];
export type CompleterFunction = (line: string) => CompleterResult;

/**
 * Create a readline-compatible completer function.
 * Completes @AgentName and /command prefixes.
 */
export function createCompleter(agentNames: string[]): CompleterFunction {
  return (line: string): CompleterResult => {
    const trimmed = line.trimStart();

    // @Agent completion
    if (trimmed.startsWith('@')) {
      const partial = trimmed.slice(1).toLowerCase();
      const matches = agentNames
        .filter(name => name.toLowerCase().startsWith(partial))
        .map(name => `@${name} `);
      return [matches, trimmed];
    }

    // /command completion
    if (trimmed.startsWith('/')) {
      const partial = trimmed.toLowerCase();
      const matches = SLASH_COMMANDS.filter(cmd => cmd.startsWith(partial));
      return [matches, trimmed];
    }

    return [[], line];
  };
}
