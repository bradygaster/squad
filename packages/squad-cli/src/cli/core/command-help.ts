/**
 * Per-command help text for `squad <cmd> --help` / `-h`.
 *
 * Fixes #1201: previously `--help` after a subcommand was silently dropped
 * by the CLI router and the command would execute for real, sometimes with
 * destructive side effects (`squad init --help` would scaffold files into
 * the cwd, `squad triage --help` / `watch --help` would start a polling
 * loop, etc.).
 *
 * The entry point in `cli-entry.ts` intercepts `--help`/`-h` whenever it
 * appears on a subcommand and calls `printCommandHelp(cmd, version)`. If
 * the command has a dedicated help block, it is printed and `true` is
 * returned. Otherwise `false` is returned so the caller can show a generic
 * fallback that points users at the top-level `squad help`.
 */

/* eslint-disable no-console -- help printers stream to stdout via console.log,
   matching the style of the top-level help block in cli-entry.ts. */

import { BOLD, DIM, RESET } from './output.js';

type HelpPrinter = (version: string) => void;

function header(cmd: string, version: string, tagline: string): void {
  console.log(`\n${BOLD}squad ${cmd}${RESET} v${version} — ${tagline}\n`);
}

/**
 * Registry of per-command help printers. Adding a new command here is the
 * one place that needs updating when a new subcommand is added to the CLI.
 */
const COMMAND_HELP: Record<string, HelpPrinter> = {
  init: (version) => {
    header('init', version, 'Initialize Squad in the current project');
    console.log(`Usage: squad init [options]`);
    console.log(`       squad init --mode remote <team-repo-path>\n`);
    console.log(`Creates a markdown-based squad layout under .squad/ plus default agent`);
    console.log(`workflows under .github/. Safe to re-run — existing files are preserved.\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--sdk${RESET}                       Use SDK builder syntax (squad.config.ts)`);
    console.log(`  ${BOLD}--roles${RESET}                     Seed the team with built-in base roles`);
    console.log(`  ${BOLD}--global${RESET}                    Initialize in the personal (global) squad directory`);
    console.log(`  ${BOLD}--no-workflows${RESET}              Skip writing GitHub Actions workflows`);
    console.log(`  ${BOLD}--preset <name>${RESET}             Apply a curated preset after init`);
    console.log(`  ${BOLD}--state-backend <type>${RESET}      State backend (local|orphan|two-layer)`);
    console.log(`  ${BOLD}--mode remote <path>${RESET}        Point at an external team root (creates .squad/config.json)\n`);
  },

  upgrade: (version) => {
    header('upgrade', version, 'Update Squad-owned files to the latest version');
    console.log(`Usage: squad upgrade [options]\n`);
    console.log(`Overwrites Squad-owned files (squad.agent.md, .squad/templates/) while`);
    console.log(`leaving your team state under .squad/ and .ai-team/ untouched.\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--global${RESET}                    Upgrade the personal (global) squad`);
    console.log(`  ${BOLD}--migrate-directory${RESET}         Rename legacy .ai-team/ to .squad/`);
    console.log(`  ${BOLD}--state-backend <type>${RESET}      Migrate to a new backend (orphan|two-layer)`);
    console.log(`  ${BOLD}--self${RESET}                      Upgrade the squad CLI package itself`);
    console.log(`  ${BOLD}--insider${RESET}                   With --self, install the @insider tag`);
    console.log(`  ${BOLD}--force${RESET}                     Overwrite files without prompting\n`);
  },

  migrate: (version) => {
    header('migrate', version, 'Convert between markdown and SDK-First squad formats');
    console.log(`Usage: squad migrate --to sdk|markdown [options]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--to sdk|markdown${RESET}           Target format`);
    console.log(`  ${BOLD}--from ai-team${RESET}              Source format (defaults to current)`);
    console.log(`  ${BOLD}--dry-run${RESET}                   Show planned changes without writing\n`);
  },

  status: (version) => {
    header('status', version, 'Show which squad is active and why');
    console.log(`Usage: squad status\n`);
    console.log(`Reports the resolved squad directory, the resolution reason (repo vs.`);
    console.log(`global), and the state of the personal squad path.\n`);
  },

  projects: (version) => {
    header('projects', version, 'List all Squad projects on this machine');
    console.log(`Usage: squad projects [--open [name]] [--print-path]\n`);
    console.log(`Lists every project where 'squad init' has run, newest first,`);
    console.log(`showing its name, path, and when it was first registered.\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--open${RESET}, ${BOLD}-o${RESET} [name]   Open a project from the list in Copilot. With no name`);
    console.log(`                      and a TTY, shows a numbered picker; with a name, opens`);
    console.log(`                      the matching project directly.`);
    console.log(`  ${BOLD}--print-path${RESET}        With --open, print the resolved path instead of launching.\n`);
  },

  open: (version) => {
    header('open', version, 'Open a registered project in Copilot');
    console.log(`Usage: squad open [name] [--print-path]\n`);
    console.log(`Looks up a registered project by name (or partial name) and launches`);
    console.log(`Copilot in that directory. When no name is given and stdout is a TTY,`);
    console.log(`a numbered picker is shown. Pass --print-path to print the resolved`);
    console.log(`path instead of launching Copilot (useful for shell cd integrations).\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--print-path${RESET}, ${BOLD}-p${RESET}            Print the project path and exit`);
    console.log(`\nExamples:`);
    console.log(`  squad open my-repo`);
    console.log(`  squad open my-repo --print-path`);
    console.log(`  squad open\n`);
  },

  roles: (version) => {
    header('roles', version, 'List built-in Squad roles');
    console.log(`Usage: squad roles [--category <name>] [--search <query>]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--category <name>${RESET}           Filter to a single category`);
    console.log(`  ${BOLD}--search <query>${RESET}            Match role name or description\n`);
  },

  cost: (version) => {
    header('cost', version, 'Report token usage from orchestration logs');
    console.log(`Usage: squad cost [options]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--all${RESET}                       Include all logged sessions, not just recent`);
    console.log(`  ${BOLD}--agent <name>${RESET}              Filter to a single agent\n`);
  },

  triage: (version) => printWatchHelp('triage', version),
  watch: (version) => printWatchHelp('watch', version),

  loop: (version) => {
    header('loop', version, 'Prompt-driven continuous work loop');
    console.log(`Usage: squad loop [options]\n`);
    console.log(`Reads loop.md and runs it as a continuous work loop.\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--init${RESET}                Generate a boilerplate loop.md`);
    console.log(`  ${BOLD}--file <path>${RESET}         Path to loop file (default: loop.md)`);
    console.log(`  ${BOLD}--interval <min>${RESET}      Override loop interval in minutes`);
    console.log(`  ${BOLD}--timeout <min>${RESET}       Override max minutes per cycle`);
    console.log(`  ${BOLD}--copilot-flags "..."${RESET} Extra flags for Copilot CLI`);
    console.log(`  ${BOLD}--agent-cmd <cmd>${RESET}     Override the agent command`);
    console.log(`\nCapabilities (composable with the loop):`);
    console.log(`  ${BOLD}--self-pull${RESET}           git fetch/pull at round start`);
    console.log(`  ${BOLD}--monitor-email${RESET}       Scan email for actionable items`);
    console.log(`  ${BOLD}--monitor-teams${RESET}       Scan Teams for actionable messages`);
    console.log(`  ${BOLD}--decision-hygiene${RESET}    Auto-merge decision inbox`);
    console.log(`  ${BOLD}--retro${RESET}               Enforce retrospective checks`);
    console.log(`\nFrontmatter (in loop.md):`);
    console.log(`  configured: true     ${DIM}(required — confirms intentional setup)${RESET}`);
    console.log(`  interval: 10         ${DIM}(minutes between cycles)${RESET}`);
    console.log(`  timeout: 30          ${DIM}(max minutes per cycle)${RESET}`);
    console.log(`  description: "..."   ${DIM}(shown in status output)${RESET}`);
    console.log(`\nExamples:`);
    console.log(`  squad loop                          ${DIM}# run loop.md${RESET}`);
    console.log(`  squad loop --init                   ${DIM}# generate boilerplate${RESET}`);
    console.log(`  squad loop --file ops/loop.md       ${DIM}# custom loop file${RESET}`);
    console.log(`  squad loop --monitor-email          ${DIM}# with email monitoring${RESET}`);
  },

  hire: (version) => {
    header('hire', version, 'Team creation wizard');
    console.log(`Usage: squad hire [--name <name>] [--role <role>]\n`);
    console.log(`Interactive wizard that walks you through adding a new agent to the team.\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--name <name>${RESET}               Pre-fill the agent name`);
    console.log(`  ${BOLD}--role <role>${RESET}               Pre-select a built-in role (see 'squad roles')\n`);
  },

  copilot: (version) => {
    header('copilot', version, 'Add or remove the Copilot coding agent (@copilot)');
    console.log(`Usage: squad copilot [--off] [--auto-assign]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--off${RESET}                       Remove the @copilot agent from the team`);
    console.log(`  ${BOLD}--auto-assign${RESET}               Configure auto-assignment of issues to @copilot\n`);
  },

  plugin: (version) => {
    header('plugin', version, 'Manage plugin marketplaces');
    console.log(`Usage: squad plugin marketplace add|remove|list|browse\n`);
    console.log(`Subcommands:`);
    console.log(`  ${BOLD}marketplace add <url>${RESET}       Register a plugin marketplace`);
    console.log(`  ${BOLD}marketplace remove <name>${RESET}   Unregister a marketplace`);
    console.log(`  ${BOLD}marketplace list${RESET}            List registered marketplaces`);
    console.log(`  ${BOLD}marketplace browse${RESET}          Browse available plugins\n`);
  },

  export: (version) => {
    header('export', version, 'Export squad to a portable JSON snapshot');
    console.log(`Usage: squad export [--out <path>]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--out <path>${RESET}                Output file (default: squad-export.json)\n`);
  },

  import: (version) => {
    header('import', version, 'Import squad from an export file');
    console.log(`Usage: squad import <file> [--force]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--force${RESET}                     Overwrite existing files in target\n`);
  },

  'scrub-emails': (version) => {
    header('scrub-emails', version, 'Remove email addresses from Squad state files');
    console.log(`Usage: squad scrub-emails [directory]\n`);
    console.log(`Defaults to scrubbing .ai-team/ (or .squad/) in the current directory.\n`);
  },

  start: (version) => {
    header('start', version, 'Start Copilot with remote access from phone / browser');
    console.log(`Usage: squad start [--tunnel] [--port <n>] [--command <cmd>] [copilot flags...]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--tunnel${RESET}                    Expose the session over a public devtunnel`);
    console.log(`  ${BOLD}--port <n>${RESET}                  Bind to a specific local port`);
    console.log(`  ${BOLD}--command <cmd>${RESET}             Override the agent command (default: copilot)\n`);
    console.log(`Examples:`);
    console.log(`  squad start --tunnel --yolo`);
    console.log(`  squad start --tunnel --model claude-sonnet-4`);
    console.log(`  squad start --tunnel --command "gh copilot"\n`);
  },

  nap: (version) => {
    header('nap', version, 'Context hygiene — compress, prune, archive .squad/ state');
    console.log(`Usage: squad nap [--deep] [--dry-run]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--deep${RESET}                      Thorough cleanup, including older history`);
    console.log(`  ${BOLD}--dry-run${RESET}                   Preview changes without writing\n`);
  },

  memory: (version) => {
    header('memory', version, 'Governed memory operations');
    console.log(`Usage: squad memory <subcommand> [options]\n`);
    console.log(`Common subcommands:`);
    console.log(`  ${BOLD}write --content "..." --class LOCAL${RESET}  Write a memory entry`);
    console.log(`  ${BOLD}list${RESET}                                 List memory entries`);
    console.log(`  ${BOLD}read <id>${RESET}                            Read a single entry\n`);
    console.log(`Diagnostics:`);
    console.log(`  ${BOLD}--log-level info|debug${RESET}      Increase log verbosity`);
    console.log(`  ${BOLD}--verbose${RESET}                   Shortcut for --log-level debug\n`);
  },

  'state-mcp': (version) => {
    header('state-mcp', version, 'MCP bridge exposing Squad runtime state tools');
    console.log(`Usage: squad state-mcp\n`);
    console.log(`Starts a Model Context Protocol server over stdio that exposes Squad`);
    console.log(`state read/write tools to MCP-compatible hosts.\n`);
  },

  doctor: (version) => {
    header('doctor', version, 'Validate squad setup');
    console.log(`Usage: squad doctor\n`);
    console.log(`Checks for required files, valid config, and a reachable Copilot CLI.`);
    console.log(`Exits non-zero if any required check fails.\n`);
  },

  consult: (version) => {
    header('consult', version, 'Enter consult mode with your personal squad');
    console.log(`Usage: squad consult [--status] [--check]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--status${RESET}                    Show consult session status`);
    console.log(`  ${BOLD}--check${RESET}                     Run consult-mode prerequisites check\n`);
  },

  extract: (version) => {
    header('extract', version, 'Extract learnings from a consult-mode session');
    console.log(`Usage: squad extract [options]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--dry-run${RESET}                   Preview the extracted learnings`);
    console.log(`  ${BOLD}--clean${RESET}                     Remove transient session files after extract`);
    console.log(`  ${BOLD}--yes${RESET}                       Skip interactive confirmations`);
    console.log(`  ${BOLD}--accept-risks${RESET}              Acknowledge data-handling implications\n`);
  },

  subsquads: (version) => {
    header('subsquads', version, 'Manage Squad SubSquads (multi-Codespace scaling)');
    console.log(`Usage: squad subsquads <list|status|activate <name>>\n`);
    console.log(`Aliases (deprecated): ${BOLD}workstreams${RESET}, ${BOLD}streams${RESET}\n`);
  },

  link: (version) => {
    header('link', version, 'Link this project to a remote team root');
    console.log(`Usage: squad link <team-repo-path>\n`);
  },

  build: (version) => {
    header('build', version, 'Compile squad.config.ts into .squad/ markdown');
    console.log(`Usage: squad build [options]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--check${RESET}                     Validate only, do not write files`);
    console.log(`  ${BOLD}--dry-run${RESET}                   Preview the generated markdown`);
    console.log(`  ${BOLD}--watch${RESET}                     Rebuild on changes to squad.config.ts\n`);
  },

  aspire: (version) => {
    header('aspire', version, 'Launch the .NET Aspire dashboard for observability');
    console.log(`Usage: squad aspire [options]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--docker${RESET}                    Force the Docker launch path`);
    console.log(`  ${BOLD}--port <n>${RESET}                  Bind the dashboard to a specific port\n`);
  },

  schedule: (version) => {
    header('schedule', version, 'Manage scheduled Squad tasks');
    console.log(`Usage: squad schedule <list|run <id>|init|status>\n`);
  },

  personal: (version) => {
    header('personal', version, 'Manage your personal squad (ambient agents)');
    console.log(`Usage: squad personal <init|list|add <name>|remove <name>> [options]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--role <role>${RESET}               Built-in role to attach (see 'squad roles')\n`);
  },

  preset: (version) => {
    header('preset', version, 'Manage squad presets (curated agent collections)');
    console.log(`Usage: squad preset <list|show <name>|apply <name>|save <name>|init> [options]\n`);
    console.log(`Options:`);
    console.log(`  ${BOLD}--force${RESET}                     Overwrite existing agents on apply`);
    console.log(`  ${BOLD}--remote${RESET}                    init: back presets with a GitHub repo\n`);
  },

  cast: (version) => {
    header('cast', version, 'Show the current session cast (project + personal agents)');
    console.log(`Usage: squad cast\n`);
  },

  rc: (version) => printRcHelp('rc', version),
  'remote-control': (version) => printRcHelp('remote-control', version),

  'copilot-bridge': (version) => {
    header('copilot-bridge', version, 'Check Copilot ACP stdio compatibility');
    console.log(`Usage: squad copilot-bridge\n`);
  },

  'init-remote': (version) => {
    header('init-remote', version, 'Link project to a remote team root (shorthand)');
    console.log(`Usage: squad init-remote <team-repo-path>\n`);
  },

  'rc-tunnel': (version) => {
    header('rc-tunnel', version, 'Check devtunnel CLI availability');
    console.log(`Usage: squad rc-tunnel\n`);
  },

  discover: (version) => {
    header('discover', version, 'List known squads and their capabilities');
    console.log(`Usage: squad discover\n`);
  },

  delegate: (version) => {
    header('delegate', version, 'Create work in another squad');
    console.log(`Usage: squad delegate <squad-name> <description>\n`);
  },

  upstream: (version) => {
    header('upstream', version, 'Manage upstream Squad sources');
    console.log(`Usage: squad upstream <add|remove|list|sync> [options]\n`);
    console.log(`Examples:`);
    console.log(`  squad upstream add <source> [--name <n>] [--ref <branch>]`);
    console.log(`  squad upstream remove <name>`);
    console.log(`  squad upstream list`);
    console.log(`  squad upstream sync [name]\n`);
  },

  economy: (version) => {
    header('economy', version, 'Toggle economy mode (cost-conscious model selection)');
    console.log(`Usage: squad economy [on|off]\n`);
  },

  externalize: (version) => {
    header('externalize', version, 'Move local squad state to an external team root');
    console.log(`Usage: squad externalize\n`);
  },

  internalize: (version) => {
    header('internalize', version, 'Pull an external team root back into the project');
    console.log(`Usage: squad internalize\n`);
  },

  config: (version) => {
    header('config', version, 'Manage Squad configuration');
    console.log(`Usage: squad config <subcommand> [options]\n`);
  },
};

function printWatchHelp(name: 'triage' | 'watch', version: string): void {
  header(name, version, 'Scan for work and categorize issues');
  console.log(`Usage: squad ${name} [--interval <minutes>] [--execute] [options]\n`);
  console.log(`Default: checks every 10 minutes (Ctrl+C to stop).\n`);
  console.log(`Core flags:`);
  console.log(`  ${BOLD}--execute${RESET}                   Spawn agents to work on issues`);
  console.log(`  ${BOLD}--copilot-flags "..."${RESET}       Extra flags for Copilot CLI`);
  console.log(`  ${BOLD}--max-concurrent N${RESET}          Parallel issue limit (default 1)`);
  console.log(`  ${BOLD}--timeout N${RESET}                 Max minutes per issue (default 30)`);
  console.log(`  ${BOLD}--interval <minutes>${RESET}        Polling interval (default 10)`);
  console.log(`  ${BOLD}--health${RESET}                    (watch only) print watch instance status\n`);
  console.log(`Capabilities (opt-in via --<name> or .squad/config.json):`);
  console.log(`  ${BOLD}--self-pull${RESET}                 git fetch/pull at round start`);
  console.log(`  ${BOLD}--board${RESET}                     Project board lifecycle + reconciliation`);
  console.log(`  ${BOLD}--board-project N${RESET}           Project board number (default 1)`);
  console.log(`  ${BOLD}--monitor-teams${RESET}             Scan Teams for actionable messages`);
  console.log(`  ${BOLD}--monitor-email${RESET}             Scan email for actionable items`);
  console.log(`  ${BOLD}--two-pass${RESET}                  Lightweight list then hydrate actionable`);
  console.log(`  ${BOLD}--wave-dispatch${RESET}             Wave-based parallel sub-task dispatch`);
  console.log(`  ${BOLD}--retro${RESET}                     Enforce retrospective checks`);
  console.log(`  ${BOLD}--decision-hygiene${RESET}          Auto-merge decision inbox\n`);
  console.log(`Disable any capability with ${BOLD}--no-<capability>${RESET}.`);
  console.log(`Logging: ${BOLD}--log-file <path>${RESET}  Tee output to file with timestamps\n`);
}

function printRcHelp(name: 'rc' | 'remote-control', version: string): void {
  header(name, version, 'Start the Remote Control bridge (phone / browser → Copilot)');
  console.log(`Usage: squad ${name} [--tunnel] [--port <n>] [--path <dir>]\n`);
  console.log(`Options:`);
  console.log(`  ${BOLD}--tunnel${RESET}                    Expose the bridge over a public devtunnel`);
  console.log(`  ${BOLD}--port <n>${RESET}                  Bind to a specific local port`);
  console.log(`  ${BOLD}--path <dir>${RESET}                Squad path to expose (default: cwd)\n`);
  console.log(`${DIM}Note: this command is deprecated; prefer "gh copilot".${RESET}\n`);
}

/**
 * Map of command aliases to their canonical name in the help registry.
 *
 * The CLI router in `cli-entry.ts` accepts several aliases for the same
 * command (e.g. `streams` / `workstreams` both route to `subsquads`). The
 * help registry is keyed by the canonical name only, so alias lookups must
 * be normalized before the registry lookup — otherwise `squad streams --help`
 * falls through to the generic fallback instead of showing the dedicated
 * subsquads help block.
 *
 * Keep this in sync with the alias `||` chains in `cli-entry.ts` (search
 * for `cmd === '<alias>'`). Canonical commands that already have a
 * dedicated entry in `COMMAND_HELP` (e.g. `rc` and `remote-control` both
 * have explicit help blocks) do NOT need an entry here.
 */
const COMMAND_ALIASES: Readonly<Record<string, string>> = {
  streams: 'subsquads',
  workstreams: 'subsquads',
};

/**
 * Normalize a CLI command alias to its canonical name for help-registry
 * lookup. Returns the input unchanged when no alias mapping applies.
 *
 * Exported for testing. The runtime caller (`printCommandHelp`) applies
 * this automatically.
 */
export function normalizeCommandAlias(cmd: string): string {
  return COMMAND_ALIASES[cmd] ?? cmd;
}

/**
 * Print help for `cmd` if a dedicated help block exists.
 * Returns `true` when help was printed, `false` otherwise so the caller can
 * fall back to a generic "see `squad help`" message.
 *
 * Aliases (see `COMMAND_ALIASES`) are normalized to their canonical command
 * before the registry lookup, so `printCommandHelp('streams', v)` prints
 * the `subsquads` help block.
 */
export function printCommandHelp(cmd: string, version: string): boolean {
  const canonical = normalizeCommandAlias(cmd);
  const printer = COMMAND_HELP[canonical];
  if (!printer) {
    return false;
  }
  printer(version);
  return true;
}

/**
 * Print a friendly generic fallback for commands that don't have a dedicated
 * help block yet. Always exits without side effects.
 */
export function printGenericCommandHelp(cmd: string): void {
  console.log(`\n${BOLD}squad ${cmd}${RESET}\n`);
  console.log(`No detailed help is available for '${cmd}'.`);
  console.log(`Run '${BOLD}squad help${RESET}' for the full command list and usage.\n`);
}

/**
 * Test helper: list the commands that have dedicated help blocks. Used by
 * unit tests to guard against regression when new commands are added.
 */
export function commandsWithHelp(): readonly string[] {
  return Object.keys(COMMAND_HELP).sort();
}
