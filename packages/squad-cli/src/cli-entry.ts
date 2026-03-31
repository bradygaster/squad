#!/usr/bin/env node

/**
 * Squad CLI — entry point for command-line invocation.
 * Separated from src/index.ts so library consumers can import
 * the SDK without triggering CLI argument parsing or process.exit().
 *
 * SDK library exports live in src/index.ts (dist/index.js).
 */

process.env.NODE_NO_WARNINGS = '1';

// Suppress ExperimentalWarning (e.g. node:sqlite) from leaking to terminal.
// process.env.NODE_NO_WARNINGS only works when set BEFORE process starts;
// this runtime hook catches warnings emitted during dynamic imports below.
const _origEmit = process.emit;
// @ts-expect-error — narrowing emit signature for warning suppression
process.emit = function (evt: string, ...args: unknown[]) {
  if (evt === 'warning' && (args[0] as { name?: string })?.name === 'ExperimentalWarning') {
    return false;
  }
  return _origEmit.apply(this, [evt, ...args] as Parameters<typeof _origEmit>);
};

// Runtime ESM Import Patcher for @github/copilot-sdk (#265)
// ---------------------------------------------------------
// Patch broken ESM import in @github/copilot-sdk@0.1.32 at runtime before
// Node's module loader attempts resolution.
//
// Root cause: copilot-sdk's session.js imports 'vscode-jsonrpc/node' without
// .js extension, violating Node 24+ strict ESM resolution requirements.
//
// Why runtime patch?: NPX caches packages in ~/.npm/_cacache and skips
// postinstall scripts on cache hits (documented npm behavior). The install-time
// patch in scripts/patch-esm-imports.mjs never runs on npx cache hits, causing
// ERR_MODULE_NOT_FOUND crashes on Node 24+.
//
// This runtime patch intercepts Module._resolveFilename before any imports
// trigger copilot-sdk loading, rewriting the broken import to include .js.
// Works everywhere: npx (cache hit/miss), global install, CI/CD.
//
// Upstream issue: https://github.com/github/copilot-sdk/issues/707
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Module = require('node:module');

const _origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: unknown, isMain: boolean, options?: unknown) {
  // Intercept the broken import: 'vscode-jsonrpc/node' → 'vscode-jsonrpc/node.js'
  if (request === 'vscode-jsonrpc/node') {
    request = 'vscode-jsonrpc/node.js';
  }
  return _origResolveFilename.call(this, request, parent, isMain, options);
};

// Pre-flight: require Node.js ≥22.5.0 for node:sqlite (#214, #502).
// node:sqlite is used by the Copilot SDK for session storage.
// Fail fast with a clear message rather than letting users hit a cryptic
// ERR_UNKNOWN_BUILTIN_MODULE crash when the SDK loads.
{
  const parts = process.versions.node.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  if (major < 22 || (major === 22 && minor < 5)) {
    console.error(
      `✗ Squad requires Node.js ≥22.5.0 (you have v${process.versions.node}).\n` +
      `  node:sqlite (required by the Copilot SDK for session storage) was added in Node 22.5.0.\n` +
      `  Upgrade at: https://nodejs.org/en/download\n`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Top-level signal handlers — safety net for clean exit on Ctrl+C / SIGTERM.
// Individual commands (shell, watch, aspire, rc) register their own handlers
// that run first; these ensure the process never hangs if a command doesn't.
// ---------------------------------------------------------------------------
let _exitingOnSignal = false;
function _handleTopLevelSignal(signal: 'SIGINT' | 'SIGTERM'): void {
  const code = signal === 'SIGINT' ? 130 : 143;
  if (_exitingOnSignal) {
    // Second signal — force exit immediately
    process.exit(code);
  }
  _exitingOnSignal = true;
  // Allow in-flight cleanup handlers a brief window, then force exit
  setTimeout(() => process.exit(code), 3_000).unref();
}
process.on('SIGINT', () => _handleTopLevelSignal('SIGINT'));
process.on('SIGTERM', () => _handleTopLevelSignal('SIGTERM'));

import { FSStorageProvider } from '@bradygaster/squad-sdk';
import path from 'node:path';
import { fatal, SquadError } from './cli/core/errors.js';
import { BOLD, RESET, DIM, RED, GREEN, YELLOW } from './cli/core/output.js';
import { runInit } from './cli/core/init.js';
import { runCost } from './cli/commands/cost.js';
import { getPackageVersion } from './cli/core/version.js';

// Lazy-load squad-sdk to avoid triggering @github/copilot-sdk import on Node 24+
// (Issue: copilot-sdk has broken ESM imports - vscode-jsonrpc/node without .js extension)
const lazySquadSdk = () => import('@bradygaster/squad-sdk');
const lazyRunShell = () => import('./cli/shell/index.js');

// Use local version resolver instead of importing VERSION from squad-sdk
const VERSION = getPackageVersion();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // --team-root flag: override team root for resolution
  const teamRootIdx = args.indexOf('--team-root');
  if (teamRootIdx !== -1 && args[teamRootIdx + 1]) {
    process.env['SQUAD_TEAM_ROOT'] = args[teamRootIdx + 1]!;
    // Remove --team-root and its value from args
    args.splice(teamRootIdx, 2);
  }
  
  const hasGlobal = args.includes('--global');
  // --economy activates economy mode for this session (sets env var for spawner)
  const hasEconomy = args.includes('--economy');
  if (hasEconomy) {
    process.env['SQUAD_ECONOMY_MODE'] = '1';
  }
  const rawCmd = args[0];
  const cmd = rawCmd?.trim() || '';

  // --version / -v / version
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    console.log(VERSION);
    return;
  }

  // --help / -h / help
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(`\n${BOLD}squad${RESET} v${VERSION} — Add an AI agent team to any project\n`);
    console.log(`Usage: squad [command] [options]\n`);
    console.log(`Commands:`);
    console.log(`  ${BOLD}(default)${RESET}  Launch interactive shell (no args)`);
    console.log(`             Flags: --global (init in personal squad directory)`);
    console.log(`  ${BOLD}init${RESET}       Initialize Squad (markdown-only, default)`);
    console.log(`             Flags: --sdk (SDK builder syntax)`);
    console.log(`                    --roles (use base roles)`);
    console.log(`                    --global (personal squad dir)`);
    console.log(`                    --no-workflows (skip CI setup)`);
    console.log(`             Usage: init --mode remote <team-repo-path>`);
    console.log(`             Creates .squad/config.json pointing to an external team root`);
    console.log(`  ${BOLD}upgrade${RESET}    Update Squad-owned files to latest version`);
    console.log(`             Overwrites: squad.agent.md, templates dir (.squad/templates/)`);
    console.log(`             Never touches: .squad/ or .ai-team/ (your team state)`);
    console.log(`             Flags: --global (upgrade personal squad)`);
    console.log(`                    --migrate-directory (rename .ai-team/ → .squad/)`);
    console.log(`  ${BOLD}migrate${RESET}    Convert between markdown and SDK-First squad formats`);
    console.log(`             Flags: --to sdk|markdown, --from ai-team, --dry-run`);
    console.log(`  ${BOLD}status${RESET}     Show which squad is active and why`);
    console.log(`  ${BOLD}roles${RESET}      List built-in Squad roles`);
    console.log(`             Usage: roles [--category <name>] [--search <query>]`);
    console.log(`  ${BOLD}cost${RESET}       Report token usage from orchestration logs`);
    console.log(`             Flags: --all, --agent <name>`);
    console.log(`  ${BOLD}triage${RESET}     Scan for work and categorize issues`);
    console.log(`             Usage: triage [--interval <minutes>] [--execute]`);
    console.log(`             Default: checks every 10 minutes (Ctrl+C to stop)`);
    console.log(`             Flags: --execute (spawn agents to work on issues)`);
    console.log(`                    --copilot-flags "..." (extra copilot CLI flags)`);
    console.log(`                    --max-concurrent N (parallel issue limit, default 1)`);
    console.log(`                    --timeout N (max minutes per issue, default 30)`);
    console.log(`                    --monitor-teams (scan Teams for actionable messages)`);
    console.log(`                    --monitor-email (scan email for actionable items)`);
    console.log(`                    --board (enable project board lifecycle)`);
    console.log(`                    --board-project N (project number, default 1)`);
    console.log(`                    --two-pass (lightweight list then hydrate actionable)`);
    console.log(`                    --wave-dispatch (wave-based parallel sub-task dispatch)`);
    console.log(`                    --retro (enforce retrospective checks)`);
    console.log(`                    --decision-hygiene (auto-merge decision inbox)`);
    console.log(`                    --channel-routing (route to Teams channels)`);
    console.log(`  ${BOLD}loop${RESET}       Continuous work loop (Ralph mode)`);
    console.log(`             Usage: loop [--filter <label>] [--interval <minutes>]`);
    console.log(`             Default: checks every 10 minutes (Ctrl+C to stop)`);
    console.log(`  ${BOLD}hire${RESET}       Team creation wizard`);
    console.log(`             Usage: hire [--name <name>] [--role <role>]`);
    console.log(`  ${BOLD}copilot${RESET}    Add/remove the Copilot coding agent (@copilot)`);
    console.log(`             Usage: copilot [--off] [--auto-assign]`);
    console.log(`  ${BOLD}plugin${RESET}     Manage plugin marketplaces`);
    console.log(`             Usage: plugin marketplace add|remove|list|browse`);
    console.log(`  ${BOLD}export${RESET}     Export squad to a portable JSON snapshot`);
    console.log(`             Default: squad-export.json (use --out <path> to override)`);
    console.log(`  ${BOLD}import${RESET}     Import squad from an export file`);
    console.log(`             Usage: import <file> [--force]`);
    console.log(`  ${BOLD}scrub-emails${RESET}  Remove email addresses from Squad state files`);
    console.log(`             Usage: scrub-emails [directory] (default: .ai-team/)`);
    console.log(`  ${BOLD}start${RESET}      Start Copilot with remote access from phone/browser`);
    console.log(`             Usage: start [--tunnel] [--port <n>] [--command <cmd>]`);
    console.log(`                    [copilot flags...]`);
    console.log(`             Examples: start --tunnel --yolo`);
    console.log(`                       start --tunnel --model claude-sonnet-4`);
    console.log(`                       start --tunnel --command "gh copilot"`);
    console.log(`  ${BOLD}nap${RESET}        Context hygiene (compress, prune, archive .squad/ state)`);
    console.log(`             Usage: nap [--deep] [--dry-run]`);
    console.log(`             Flags: --deep (thorough cleanup), --dry-run (preview only)`);
    console.log(`  ${BOLD}doctor${RESET}     Validate squad setup (check files, config, health)`);
    console.log(`  ${BOLD}consult${RESET}    Enter consult mode with your personal squad`);
    console.log(`             Flags: --status, --check`);
    console.log(`  ${BOLD}extract${RESET}    Extract learnings from consult mode session`);
    console.log(`             Flags: --dry-run, --clean, --yes, --accept-risks`);
    console.log(`  ${BOLD}subsquads${RESET}  Manage Squad SubSquads (multi-Codespace scaling)`);
    console.log(`             Usage: subsquads <list|status|activate <name>>`);
    console.log(`             Aliases: workstreams, streams (deprecated)`);
    console.log(`  ${BOLD}link${RESET}       Link project to a remote team root`);
    console.log(`             Usage: link <team-repo-path>`);
    console.log(`  ${BOLD}build${RESET}      Compile squad.config.ts into .squad/ markdown`);
    console.log(`             Flags: --check (validate only), --dry-run (preview)`);
    console.log(`                    --watch (rebuild on change)`);
    console.log(`  ${BOLD}aspire${RESET}     Launch .NET Aspire dashboard for observability`);
    console.log(`             Flags: --docker (force Docker), --port <n> (dashboard port)`);
    console.log(`  ${BOLD}schedule${RESET}   Manage scheduled tasks`);
    console.log(`             Usage: schedule list | run <id> | init | status`);
    console.log(`  ${BOLD}personal${RESET}   Manage your personal squad (ambient agents)`);
    console.log(`             Usage: personal init | list | add <name>`);
    console.log(`                    --role <role> | remove <name>`);
    console.log(`  ${BOLD}cast${RESET}       Show current session cast (project + personal agents)`);
    console.log(`  ${BOLD}rc${RESET}         Start Remote Control bridge (phone/browser → Copilot)`);
    console.log(`             Usage: rc [--tunnel] [--port <n>] [--path <dir>]`);
    console.log(`  ${BOLD}copilot-bridge${RESET}  Check Copilot ACP stdio compatibility`);
    console.log(`  ${BOLD}init-remote${RESET}    Link project to remote team root (shorthand)`);
    console.log(`             Usage: init-remote <team-repo-path>`);
    console.log(`  ${BOLD}rc-tunnel${RESET}      Check devtunnel CLI availability`);
    console.log(`  ${BOLD}discover${RESET}   List known squads and their capabilities`);
    console.log(`  ${BOLD}delegate${RESET}   Create work in another squad`);
    console.log(`             Usage: delegate <squad-name> <description>`);
    console.log(`  ${BOLD}upstream${RESET}    Manage upstream Squad sources`);
    console.log(`             Usage: upstream add <source> [--name <n>] [--ref <branch>]`);
    console.log(`                    upstream remove <name>`);
    console.log(`                    upstream list`);
    console.log(`                    upstream sync [name]`);
    console.log(`  ${BOLD}economy${RESET}    Toggle economy mode (cost-conscious model selection)`);
    console.log(`             Usage: economy [on|off]`);

    console.log(`  ${BOLD}version${RESET}    Print installed version`);
    console.log(`  ${BOLD}help${RESET}       Show this help message`);
    console.log(`\nFlags:`);
    console.log(`  ${BOLD}--version, -v${RESET}  Print version`);
    console.log(`  ${BOLD}--help, -h${RESET}     Show help`);
    console.log(`  ${BOLD}--global${RESET}       Use personal (global) squad path (for init, upgrade)`);
    console.log(`  ${BOLD}--economy${RESET}      Activate economy mode for this session (cheaper models)`);
    console.log(`  ${BOLD}--team-root${RESET}    Override team root path for resolution`);
    console.log(`\nInstallation:`);
    console.log(`  npm install --save-dev @bradygaster/squad-cli`);
    console.log(`\nInsider channel:`);
    console.log(`  npm install --save-dev @bradygaster/squad-cli@insider\n`);
    return;
  }

  // No args → launch interactive shell; whitespace-only arg → show help
  if (rawCmd === undefined) {
    // Fire-and-forget update check — non-blocking, never delays shell startup
    import('./cli/self-update.js').then(m => m.notifyIfUpdateAvailable(VERSION)).catch(() => {});
    const { runShell } = await lazyRunShell();
    await runShell();
    return;
  }
  if (!cmd) {
    // Whitespace-only arg — show help and exit cleanly
    console.log(`\n${BOLD}squad${RESET} v${VERSION} — Add an AI agent team to any project\n`);
    console.log(`Usage: squad [command] [options]`);
    console.log(`Run 'squad help' for the full command list.\n`);
    return;
  }

  // Route subcommands
  if (cmd === 'init') {
    const modeIdx = args.indexOf('--mode');
    const mode = (modeIdx !== -1 && args[modeIdx + 1]) ? args[modeIdx + 1] : undefined;

    if (mode === 'remote') {
      const teamPath = args[modeIdx + 2];
      if (!teamPath) {
        fatal('Usage: squad init --mode remote <team-repo-path>');
      }
      const { writeRemoteConfig } = await import('./cli/commands/init-remote.js');
      const dest = process.cwd();
      writeRemoteConfig(dest, teamPath);
      await runInit(dest);
      return;
    }

    const sdkMod = hasGlobal ? await lazySquadSdk() : null;
    const dest = hasGlobal ? sdkMod!.resolveGlobalSquadPath() : process.cwd();
    const noWorkflows = args.includes('--no-workflows');
    const sdk = args.includes('--sdk');
    const roles = args.includes('--roles');
    // Global init: suppress workflows (no GitHub CI in ~/.config/squad/) and bootstrap personal squad
    runInit(dest, { includeWorkflows: !noWorkflows && !hasGlobal, sdk, roles, isGlobal: hasGlobal }).catch(err => {
      fatal(err.message);
    });
    return;
  }

  if (cmd === 'upgrade') {
    const { runUpgrade } = await import('./cli/core/upgrade.js');
    const { migrateDirectory } = await import('./cli/core/migrate-directory.js');
    
    const migrateDir = args.includes('--migrate-directory');
    const selfUpgrade = args.includes('--self');
    const forceUpgrade = args.includes('--force');
    const dest = hasGlobal ? (await lazySquadSdk()).resolveGlobalSquadPath() : process.cwd();
    
    // Handle --migrate-directory flag
    if (migrateDir) {
      await migrateDirectory(dest);
      // Continue with regular upgrade after migration
    }
    
    // Run upgrade
    await runUpgrade(dest, { 
      migrateDirectory: migrateDir,
      self: selfUpgrade,
      force: forceUpgrade
    });
    
    return;
  }

  if (cmd === 'migrate') {
    const { runMigrate } = await import('./cli/commands/migrate.js');
    const toIdx = args.indexOf('--to');
    const to = (toIdx !== -1 && args[toIdx + 1]) ? args[toIdx + 1] as 'sdk' | 'markdown' : undefined;
    const fromIdx = args.indexOf('--from');
    const from = (fromIdx !== -1 && args[fromIdx + 1]) ? args[fromIdx + 1] : undefined;
    const dryRun = args.includes('--dry-run');
    await runMigrate(process.cwd(), { to, from: from as 'ai-team' | undefined, dryRun });
    return;
  }

  if (cmd === 'triage' || cmd === 'watch') {
    const { runWatch } = await import('./cli/commands/watch.js');
    const intervalIdx = args.indexOf('--interval');
    const intervalMinutes = (intervalIdx !== -1 && args[intervalIdx + 1])
      ? parseInt(args[intervalIdx + 1]!, 10)
      : 10;

    const execute = args.includes('--execute');

    const copilotFlagsIdx = args.indexOf('--copilot-flags');
    const copilotFlags = (copilotFlagsIdx !== -1 && args[copilotFlagsIdx + 1])
      ? args[copilotFlagsIdx + 1]
      : undefined;

    // Hidden flag — not shown in help text
    const agentCmdIdx = args.indexOf('--agent-cmd');
    const agentCmd = (agentCmdIdx !== -1 && args[agentCmdIdx + 1])
      ? args[agentCmdIdx + 1]
      : undefined;

    const maxConcurrentIdx = args.indexOf('--max-concurrent');
    const maxConcurrent = (maxConcurrentIdx !== -1 && args[maxConcurrentIdx + 1])
      ? parseInt(args[maxConcurrentIdx + 1]!, 10)
      : 1;

    const timeoutIdx = args.indexOf('--timeout');
    const issueTimeoutMinutes = (timeoutIdx !== -1 && args[timeoutIdx + 1])
      ? parseInt(args[timeoutIdx + 1]!, 10)
      : 30;

    // Opt-in feature flags (#708)
    const monitorTeams = args.includes('--monitor-teams');
    const monitorEmail = args.includes('--monitor-email');
    const board = args.includes('--board');

    const boardProjectIdx = args.indexOf('--board-project');
    const boardProject = (boardProjectIdx !== -1 && args[boardProjectIdx + 1])
      ? parseInt(args[boardProjectIdx + 1]!, 10)
      : 1;

    const twoPass = args.includes('--two-pass');
    const waveDispatchFlag = args.includes('--wave-dispatch');
    const retro = args.includes('--retro');
    const decisionHygiene = args.includes('--decision-hygiene');
    const channelRouting = args.includes('--channel-routing');

    await runWatch(process.cwd(), {
      intervalMinutes,
      execute,
      copilotFlags,
      agentCmd,
      maxConcurrent,
      issueTimeoutMinutes,
      monitorTeams,
      monitorEmail,
      board,
      boardProject,
      twoPass,
      waveDispatch: waveDispatchFlag,
      retro,
      decisionHygiene,
      channelRouting,
    });
    return;
  }

  if (cmd === 'loop') {
    const filterIdx = args.indexOf('--filter');
    const filter = (filterIdx !== -1 && args[filterIdx + 1]) ? args[filterIdx + 1] : undefined;
    const intervalIdx = args.indexOf('--interval');
    const intervalMinutes = (intervalIdx !== -1 && args[intervalIdx + 1])
      ? parseInt(args[intervalIdx + 1]!, 10)
      : 10;
    console.log(`🔄 Squad loop starting... (full implementation pending)`);
    if (filter) {
      console.log(`   Filter: ${filter}`);
    }
    console.log(`   Interval: ${intervalMinutes} minutes`);
    return;
  }

  if (cmd === 'hire') {
    const nameIdx = args.indexOf('--name');
    const name = (nameIdx !== -1 && args[nameIdx + 1]) ? args[nameIdx + 1] : undefined;
    const roleIdx = args.indexOf('--role');
    const role = (roleIdx !== -1 && args[roleIdx + 1]) ? args[roleIdx + 1] : undefined;
    console.log('👋 Squad hire — team creation wizard starting... (full implementation pending)');
    if (name) {
      console.log(`   Name: ${name}`);
    }
    if (role) {
      console.log(`   Role: ${role}`);
    }
    return;
  }

  if (cmd === 'export') {
    const { runExport } = await import('./cli/commands/export.js');
    const outIdx = args.indexOf('--out');
    const outPath = (outIdx !== -1 && args[outIdx + 1]) ? args[outIdx + 1] : undefined;
    await runExport(process.cwd(), outPath);
    return;
  }

  if (cmd === 'import') {
    const { runImport } = await import('./cli/commands/import.js');
    const importFile = args[1];
    if (!importFile) {
      fatal('Usage: squad import <file> [--force]');
    }
    const hasForce = args.includes('--force');
    await runImport(process.cwd(), importFile, hasForce);
    return;
  }

  if (cmd === 'plugin') {
    const { runPlugin } = await import('./cli/commands/plugin.js');
    await runPlugin(process.cwd(), args.slice(1));
    return;
  }

  if (cmd === 'copilot') {
    const { runCopilot } = await import('./cli/commands/copilot.js');
    const isOff = args.includes('--off');
    const autoAssign = args.includes('--auto-assign');
    await runCopilot(process.cwd(), { off: isOff, autoAssign });
    return;
  }

  if (cmd === 'scrub-emails') {
    const { scrubEmails } = await import('./cli/core/email-scrub.js');
    const targetDir = args[1] || '.ai-team';
    const count = await scrubEmails(targetDir);
    if (count > 0) {
      console.log(`Scrubbed ${count} email address(es).`);
    } else {
      console.log('No email addresses found.');
    }
    return;
  }

  if (cmd === 'status') {
    const sdk = await lazySquadSdk();
    const repoSquad = sdk.resolveSquad(process.cwd());
    const globalPath = sdk.resolveGlobalSquadPath();
    const globalSquadDir = path.join(globalPath, '.squad');
    const storage = new FSStorageProvider();
    const globalExists = await storage.exists(globalSquadDir);

    console.log(`\n${BOLD}Squad Status${RESET}\n`);

    if (repoSquad) {
      console.log(`  Active squad: ${BOLD}repo${RESET}`);
      console.log(`  Path:         ${repoSquad}`);
      console.log(`  Reason:       Found .squad/ in repository tree`);
    } else if (globalExists) {
      console.log(`  Active squad: ${BOLD}personal (global)${RESET}`);
      console.log(`  Path:         ${globalSquadDir}`);
      console.log(`  Reason:       No repo .squad/ found; personal squad exists at global path`);
    } else {
      console.log(`  Active squad: ${DIM}none${RESET}`);
      console.log(`  Reason:       No .squad/ found in repo tree or at global path`);
    }

    console.log();
    console.log(`  ${DIM}Repo resolution:   ${repoSquad ?? 'not found'}${RESET}`);
    console.log(`  ${DIM}Global path:       ${globalPath}${RESET}`);
    console.log(`  ${DIM}Global squad:      ${globalExists ? globalSquadDir : 'not initialized'}${RESET}`);
    console.log();

    return;
  }

  if (cmd === 'roles') {
    const { runRoles } = await import('./cli/commands/roles.js');
    await runRoles(args.slice(1));
    return;
  }

  if (cmd === 'cost') {
    const sdk = await lazySquadSdk();
    const localSquad = sdk.resolveSquad(process.cwd());
    const globalPath = sdk.resolveGlobalSquadPath();
    const globalSquadDir = path.join(globalPath, '.squad');
    const storage = new FSStorageProvider();
    const teamRoot = localSquad
      ? path.resolve(localSquad, '..')
      : (await storage.exists(globalSquadDir) ? globalPath : null);

    if (!teamRoot) {
      fatal('No squad found. Run "squad init" first.');
    }

    await runCost(args.slice(1), teamRoot);
    return;
  }

  if (cmd === 'build') {
    const { runBuild } = await import('./cli/commands/build.js');
    const hasCheck = args.includes('--check');
    const hasDryRun = args.includes('--dry-run');
    const hasWatch = args.includes('--watch');
    await runBuild(process.cwd(), { check: hasCheck, dryRun: hasDryRun, watch: hasWatch });
    return;
  }

  if (cmd === 'subsquads' || cmd === 'workstreams' || cmd === 'streams') {
    const { runSubSquads } = await import('./cli/commands/streams.js');
    await runSubSquads(process.cwd(), args.slice(1));
    return;
  }

  if (cmd === 'start') {
    const { runStart } = await import('./cli/commands/start.js');
    const hasTunnel = args.includes('--tunnel');
    const portIdx = args.indexOf('--port');
    const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]!, 10) : 0;
    // Collect all remaining args to pass through to copilot
    const cmdIdx = args.indexOf('--command');
    const customCmd = (cmdIdx !== -1 && args[cmdIdx + 1]) ? args[cmdIdx + 1] : undefined;
    const squadFlags = ['start', '--tunnel', '--port', port.toString(), '--command', customCmd || ''].filter(Boolean);
    const copilotArgs = args.slice(1).filter(a => !squadFlags.includes(a));
    await runStart(process.cwd(), { tunnel: hasTunnel, port, copilotArgs, command: customCmd });
    return;
  }

  if (cmd === 'nap') {
    const { runNap, formatNapReport } = await import('./cli/core/nap.js');
    const sdk = await lazySquadSdk();
    // resolveSquad() returns the .squad/ directory itself — use it directly (#207)
    const squadDir = sdk.resolveSquad(process.cwd());
    if (!squadDir) {
      fatal('No squad found. Run "squad init" first.');
    }
    const deep = args.includes('--deep');
    const dryRun = args.includes('--dry-run');
    const result = await runNap({ squadDir, deep, dryRun });
    console.log(formatNapReport(result, !!process.env['NO_COLOR']));
    return;
  }

  if (cmd === 'doctor') {
    const { doctorCommand } = await import('./cli/commands/doctor.js');
    await doctorCommand();
    return;
  }

  if (cmd === 'consult') {
    const { runConsult } = await import('./cli/commands/consult.js');
    await runConsult(process.cwd(), args.slice(1));
    return;
  }

  if (cmd === 'extract') {
    const { runExtract } = await import('./cli/commands/extract.js');
    await runExtract(process.cwd(), args.slice(1));
    return;
  }

  if (cmd === 'aspire') {
    const { runAspire } = await import('./cli/commands/aspire.js');
    const useDocker = args.includes('--docker');
    const portIdx = args.indexOf('--port');
    const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]!, 10) : undefined;
    await runAspire({ docker: useDocker, port });
    return;
  }

  if (cmd === 'link') {
    const { runLink } = await import('./cli/commands/link.js');
    const teamPath = args[1];
    if (!teamPath) {
      fatal('Usage: squad link <team-repo-path>');
    }
    runLink(process.cwd(), teamPath);
    return;
  }

  if (cmd === 'rc' || cmd === 'remote-control') {
    const { runRC } = await import('./cli/commands/rc.js');
    const hasTunnel = args.includes('--tunnel');
    const portIdx = args.indexOf('--port');
    const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]!, 10) : 0;
    const pathIdx = args.indexOf('--path');
    const rcPath = (pathIdx !== -1 && args[pathIdx + 1]) ? args[pathIdx + 1] : undefined;
    await runRC(rcPath || process.cwd(), { tunnel: hasTunnel, port });
    return;
  }

  if (cmd === 'copilot-bridge') {
    const { CopilotBridge } = await import('./cli/commands/copilot-bridge.js');
    const result = await CopilotBridge.checkCompatibility();
    if (result.compatible) {
      console.log(`${GREEN}✓${RESET} ${result.message}`);
    } else {
      console.log(`${YELLOW}⚠${RESET} ${result.message}`);
    }
    return;
  }

  if (cmd === 'init-remote') {
    const { writeRemoteConfig } = await import('./cli/commands/init-remote.js');
    const teamPath = args[1];
    if (!teamPath) {
      fatal('Usage: squad init-remote <team-repo-path>');
    }
    const dest = process.cwd();
    writeRemoteConfig(dest, teamPath);
    await runInit(dest);
    return;
  }

  if (cmd === 'rc-tunnel') {
    const { isDevtunnelAvailable } = await import('./cli/commands/rc-tunnel.js');
    if (isDevtunnelAvailable()) {
      console.log(`${GREEN}✓${RESET} devtunnel CLI is available`);
    } else {
      console.log(`${YELLOW}⚠${RESET} devtunnel CLI not found. Install with: winget install Microsoft.devtunnel`);
    }
    return;
  }

  if (cmd === 'schedule') {
    const { runSchedule } = await import('./cli/commands/schedule.js');
    const subcommand = args[1] || 'list';
    await runSchedule(process.cwd(), subcommand, args.slice(2));
    return;
  }

  if (cmd === 'personal') {
    const { runPersonal } = await import('./cli/commands/personal.js');
    const subcommand = args[1] || 'list';
    await runPersonal(process.cwd(), subcommand, args.slice(2));
    return;
  }

  if (cmd === 'cast') {
    const { runCast } = await import('./cli/commands/cast.js');
    await runCast(process.cwd());
    return;
  }

  if (cmd === 'upstream') {
    const { upstreamCommand } = await import('./cli/commands/upstream.js');
    await upstreamCommand(args.slice(1));
    return;
  }

  if (cmd === 'discover') {
    const { discoverCommand } = await import('./cli/commands/cross-squad.js');
    await discoverCommand();
    return;
  }

  if (cmd === 'delegate') {
    const { delegateCommand } = await import('./cli/commands/cross-squad.js');
    await delegateCommand(args.slice(1));
    return;
  }

  if (cmd === 'economy') {
    const { runEconomy } = await import('./cli/commands/economy.js');
    await runEconomy(process.cwd(), args.slice(1));
    return;
  }

  if (cmd === 'config') {
    const { runConfig } = await import('./cli/commands/config.js');
    await runConfig(process.cwd(), args.slice(1));
    return;
  }

  // Unknown command
  fatal(`Unknown command: ${cmd}\n       Run 'squad doctor' to check your setup, or 'squad help' for usage information.`);
}

main().catch(err => {
  if (err instanceof SquadError) {
    console.error(`${RED}✗${RESET} ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});



