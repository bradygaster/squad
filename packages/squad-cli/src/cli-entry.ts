#!/usr/bin/env node

/**
 * Squad CLI — entry point for command-line invocation.
 * Separated from src/index.ts so library consumers can import
 * the SDK without triggering CLI argument parsing or process.exit().
 *
 * SDK library exports live in src/index.ts (dist/index.js).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fatal, SquadError } from './cli/core/errors.js';
import { BOLD, RESET, DIM, RED } from './cli/core/output.js';
import { runInit } from './cli/core/init.js';
import { resolveSquad, resolveGlobalSquadPath } from '@bradygaster/squad-sdk';
import { runShell } from './cli/shell/index.js';

// Keep VERSION in index.ts (public API); import it here via re-export
import { VERSION } from '@bradygaster/squad-sdk';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const hasGlobal = args.includes('--global');
  const cmd = args[0];

  // --version / -v
  if (cmd === '--version' || cmd === '-v') {
    console.log(`squad ${VERSION}`);
    return;
  }

  // --help / -h / help
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(`\n${BOLD}squad${RESET} v${VERSION} — Add an AI agent team to any project\n`);
    console.log(`Usage: squad [command] [options]\n`);
    console.log(`Commands:`);
    console.log(`  ${BOLD}(default)${RESET}  Launch interactive shell (no args)`);
    console.log(`             Flags: --global (init in personal squad directory)`);
    console.log(`  ${BOLD}init${RESET}       Initialize Squad (skip files that already exist)`);
    console.log(`             Flags: --global (init in personal squad directory)`);
    console.log(`  ${BOLD}upgrade${RESET}    Update Squad-owned files to latest version`);
    console.log(`             Overwrites: squad.agent.md, templates dir (.squad/templates/)`);
    console.log(`             Never touches: .squad/ or .ai-team/ (your team state)`);
    console.log(`             Flags: --global (upgrade personal squad), --migrate-directory (rename .ai-team/ → .squad/)`);
    console.log(`  ${BOLD}upstream${RESET}   Manage upstream squad inheritance`);
    console.log(`  ${BOLD}status${RESET}     Show which squad is active and why`);
    console.log(`  ${BOLD}triage${RESET}     Scan for work and categorize issues`);
    console.log(`             Usage: triage [--interval <minutes>]`);
    console.log(`             Default: checks every 10 minutes (Ctrl+C to stop)`);
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
    console.log(`             Usage: start [--tunnel] [--port <n>] [--command <cmd>] [copilot flags...]`);
    console.log(`             Examples: start --tunnel --yolo`);
    console.log(`                       start --tunnel --model claude-sonnet-4`);
    console.log(`                       start --tunnel --command "agency copilot"`);
    console.log(`  ${BOLD}nap${RESET}        Context hygiene (compress, prune, archive .squad/ state)`);
    console.log(`             Usage: nap [--deep] [--dry-run]`);
    console.log(`             Flags: --deep (thorough cleanup), --dry-run (preview only)`);
    console.log(`  ${BOLD}doctor${RESET}     Validate squad setup (check files, config, health)`);
    console.log(`  ${BOLD}consult${RESET}    Enter consult mode with your personal squad`);
    console.log(`             Flags: --status, --check`);
    console.log(`  ${BOLD}extract${RESET}    Extract learnings from consult mode session`);
    console.log(`             Flags: --dry-run, --clean, --yes, --accept-risks`);
    console.log(`  ${BOLD}help${RESET}       Show this help message`);
    console.log(`\nFlags:`);
    console.log(`  ${BOLD}--version, -v${RESET}  Print version`);
    console.log(`  ${BOLD}--help, -h${RESET}     Show help`);
    console.log(`  ${BOLD}--global${RESET}       Use personal (global) squad path (for init, upgrade)`);
    console.log(`\nInstallation:`);
    console.log(`  npm install --save-dev @bradygaster/squad-cli`);
    console.log(`\nInsider channel:`);
    console.log(`  npm install --save-dev @bradygaster/squad-cli@insider\n`);
    return;
  }

  // No args → launch interactive shell
  if (!cmd) {
    await runShell();
    return;
  }

  // Route subcommands
  if (cmd === 'init') {
    const dest = hasGlobal ? resolveGlobalSquadPath() : process.cwd();
    runInit(dest).catch(err => {
      fatal(err.message);
    });
    return;
  }

  if (cmd === 'upgrade') {
    const { runUpgrade } = await import('./cli/core/upgrade.js');
    const { migrateDirectory } = await import('./cli/core/migrate-directory.js');
    
    const migrateDir = args.includes('--migrate-directory');
    const selfUpgrade = args.includes('--self');
    const dest = hasGlobal ? resolveGlobalSquadPath() : process.cwd();
    
    // Handle --migrate-directory flag
    if (migrateDir) {
      await migrateDirectory(dest);
      // Continue with regular upgrade after migration
    }
    
    // Run upgrade
    await runUpgrade(dest, { 
      migrateDirectory: migrateDir,
      self: selfUpgrade
    });
    
    return;
  }

  if (cmd === 'triage' || cmd === 'watch') {
    console.log('🕵️ Squad triage — scanning for work... (full implementation pending)');
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
    const repoSquad = resolveSquad(process.cwd());
    const globalPath = resolveGlobalSquadPath();
    const globalSquadDir = path.join(globalPath, '.squad');
    const globalExists = fs.existsSync(globalSquadDir);

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
    const squadRoot = resolveSquad(process.cwd());
    if (!squadRoot) {
      fatal('No squad found. Run "squad init" first.');
    }
    const squadDir = path.join(squadRoot, '.squad');
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

  if (cmd === 'upstream') {
    const { upstreamCommand } = await import('./cli/commands/upstream.js');
    await upstreamCommand(args.slice(1));
    return;
  }

  // Unknown command
  fatal(`Unknown command: ${cmd}\n       Run 'squad help' for usage information.`);
}

main().catch(err => {
  if (err instanceof SquadError) {
    console.error(`${RED}✗${RESET} ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});


