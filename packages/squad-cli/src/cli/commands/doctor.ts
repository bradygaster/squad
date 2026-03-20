/**
 * squad doctor — setup validation diagnostic command.
 *
 * Inspects the .squad/ directory (or hub layout) and reports
 * the health of every expected file / convention. Always exits 0
 * because this is a diagnostic tool, not a gate.
 *
 * Inspired by @spboyer (Shayne Boyer)'s doctor command in PR bradygaster/squad#131.
 *
 * @module cli/commands/doctor
 */

import fs from 'node:fs';
import path from 'node:path';

/** Result of a single diagnostic check. */
export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

/** Detected squad layout mode. */
export type DoctorMode = 'local' | 'remote' | 'hub';

/** Resolved mode + base directory for the squad. */
interface ModeInfo {
  mode: DoctorMode;
  squadDir: string;
  /** Only set when mode === 'remote' */
  teamRoot?: string;
}

// ── helpers ─────────────────────────────────────────────────────────

function fileExists(p: string): boolean {
  return fs.existsSync(p);
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function tryReadJson(p: string): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}

// ── mode detection ──────────────────────────────────────────────────

function detectMode(cwd: string): ModeInfo {
  const squadDir = path.join(cwd, '.squad');
  const configPath = path.join(squadDir, 'config.json');

  // Remote mode: config.json exists with teamRoot
  if (fileExists(configPath)) {
    const cfg = tryReadJson(configPath);
    if (cfg && typeof cfg === 'object' && 'teamRoot' in cfg) {
      const raw = (cfg as Record<string, unknown>)['teamRoot'];
      if (typeof raw === 'string' && raw.length > 0) {
        return { mode: 'remote', squadDir, teamRoot: raw };
      }
    }
  }

  // Hub mode: squad-hub.json in cwd
  if (fileExists(path.join(cwd, 'squad-hub.json'))) {
    return { mode: 'hub', squadDir };
  }

  // Default: local
  return { mode: 'local', squadDir };
}

// ── individual checks ───────────────────────────────────────────────

function checkSquadDir(squadDir: string): DoctorCheck {
  const exists = isDirectory(squadDir);
  return {
    name: '.squad/ directory exists',
    status: exists ? 'pass' : 'fail',
    message: exists ? 'directory present' : 'directory not found',
  };
}

function checkConfigJson(squadDir: string): DoctorCheck | undefined {
  const configPath = path.join(squadDir, 'config.json');
  if (!fileExists(configPath)) return undefined; // optional file — skip

  const data = tryReadJson(configPath);
  if (data === undefined) {
    return {
      name: 'config.json valid',
      status: 'fail',
      message: 'file exists but is not valid JSON',
    };
  }

  if (
    typeof data === 'object' &&
    data !== null &&
    'teamRoot' in data &&
    typeof (data as Record<string, unknown>)['teamRoot'] !== 'string'
  ) {
    return {
      name: 'config.json valid',
      status: 'fail',
      message: 'teamRoot must be a string',
    };
  }

  return {
    name: 'config.json valid',
    status: 'pass',
    message: 'parses as JSON, schema OK',
  };
}

function checkAbsoluteTeamRoot(squadDir: string): DoctorCheck | undefined {
  const configPath = path.join(squadDir, 'config.json');
  if (!fileExists(configPath)) return undefined;

  const data = tryReadJson(configPath) as Record<string, unknown> | undefined;
  if (!data || typeof data['teamRoot'] !== 'string') return undefined;

  const teamRoot = data['teamRoot'] as string;
  if (path.isAbsolute(teamRoot)) {
    return {
      name: 'absolute path warning',
      status: 'warn',
      message: `teamRoot is absolute (${teamRoot}) — prefer relative paths for portability`,
    };
  }
  return undefined;
}

function checkTeamRootResolves(squadDir: string, teamRoot: string): DoctorCheck {
  const resolved = path.isAbsolute(teamRoot)
    ? teamRoot
    : path.resolve(path.dirname(squadDir), teamRoot);
  const exists = isDirectory(resolved);
  return {
    name: 'team root resolves',
    status: exists ? 'pass' : 'fail',
    message: exists ? `resolved to ${resolved}` : `directory not found: ${resolved}`,
  };
}

function checkTeamMd(squadDir: string): DoctorCheck {
  const teamPath = path.join(squadDir, 'team.md');
  if (!fileExists(teamPath)) {
    return { name: 'team.md found with ## Members header', status: 'fail', message: 'file not found' };
  }
  const content = fs.readFileSync(teamPath, 'utf8');
  if (!content.includes('## Members')) {
    return { name: 'team.md found with ## Members header', status: 'warn', message: 'file exists but missing ## Members header' };
  }
  return { name: 'team.md found with ## Members header', status: 'pass', message: 'file present, header found' };
}

function checkRoutingMd(squadDir: string): DoctorCheck {
  const exists = fileExists(path.join(squadDir, 'routing.md'));
  return {
    name: 'routing.md found',
    status: exists ? 'pass' : 'fail',
    message: exists ? 'file present' : 'file not found',
  };
}

function checkAgentsDir(squadDir: string): DoctorCheck {
  const agentsDir = path.join(squadDir, 'agents');
  if (!isDirectory(agentsDir)) {
    return { name: 'agents/ directory exists', status: 'fail', message: 'directory not found' };
  }
  let count = 0;
  try {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) count++;
    }
  } catch { /* empty */ }
  return {
    name: 'agents/ directory exists',
    status: 'pass',
    message: `directory present (${count} agent${count === 1 ? '' : 's'})`,
  };
}

function checkCastingRegistry(squadDir: string): DoctorCheck {
  const registryPath = path.join(squadDir, 'casting', 'registry.json');
  if (!fileExists(registryPath)) {
    return { name: 'casting/registry.json exists', status: 'fail', message: 'file not found' };
  }
  const data = tryReadJson(registryPath);
  if (data === undefined) {
    return { name: 'casting/registry.json exists', status: 'fail', message: 'file exists but is not valid JSON' };
  }
  return { name: 'casting/registry.json exists', status: 'pass', message: 'file present, valid JSON' };
}

function checkDecisionsMd(squadDir: string): DoctorCheck {
  const exists = fileExists(path.join(squadDir, 'decisions.md'));
  return {
    name: 'decisions.md exists',
    status: exists ? 'pass' : 'fail',
    message: exists ? 'file present' : 'file not found',
  };
}

// ── ESM compatibility checks ────────────────────────────────────────

/**
 * Check that vscode-jsonrpc has the `exports` field needed for Node 22/24+
 * strict ESM subpath resolution. Without it, `import('vscode-jsonrpc/node')`
 * fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
function checkVscodeJsonrpcExports(cwd: string): DoctorCheck {
  const possiblePaths = [
    path.join(cwd, 'node_modules', 'vscode-jsonrpc', 'package.json'),
    path.join(cwd, 'packages', 'squad-cli', 'node_modules', 'vscode-jsonrpc', 'package.json'),
  ];

  for (const pkgPath of possiblePaths) {
    if (!fileExists(pkgPath)) continue;

    const pkg = tryReadJson(pkgPath) as Record<string, unknown> | undefined;
    if (!pkg) {
      return {
        name: 'vscode-jsonrpc exports field',
        status: 'fail',
        message: 'package.json found but not valid JSON',
      };
    }

    if (pkg['exports'] && typeof pkg['exports'] === 'object') {
      const exports = pkg['exports'] as Record<string, unknown>;
      if (exports['./node']) {
        return {
          name: 'vscode-jsonrpc exports field',
          status: 'pass',
          message: 'exports field present with ./node subpath',
        };
      }
    }

    return {
      name: 'vscode-jsonrpc exports field',
      status: 'fail',
      message: 'missing exports field — run postinstall or reinstall (see #449)',
    };
  }

  return {
    name: 'vscode-jsonrpc exports field',
    status: 'warn',
    message: 'vscode-jsonrpc not found in node_modules',
  };
}

/**
 * Check that @github/copilot-sdk session.js has the .js extension fix
 * on its vscode-jsonrpc/node import (defense-in-depth behind the exports patch).
 */
function checkCopilotSdkSessionPatch(cwd: string): DoctorCheck {
  const possiblePaths = [
    path.join(cwd, 'node_modules', '@github', 'copilot-sdk', 'dist', 'session.js'),
    path.join(cwd, 'packages', 'squad-cli', 'node_modules', '@github', 'copilot-sdk', 'dist', 'session.js'),
  ];

  for (const sessionPath of possiblePaths) {
    if (!fileExists(sessionPath)) continue;

    try {
      const content = fs.readFileSync(sessionPath, 'utf8');

      if (/from\s+["']vscode-jsonrpc\/node["']/.test(content)) {
        return {
          name: 'copilot-sdk session.js ESM patch',
          status: 'fail',
          message: 'session.js has extensionless vscode-jsonrpc/node import — run postinstall (see #449)',
        };
      }

      return {
        name: 'copilot-sdk session.js ESM patch',
        status: 'pass',
        message: 'session.js imports use .js extension',
      };
    } catch {
      return {
        name: 'copilot-sdk session.js ESM patch',
        status: 'warn',
        message: 'could not read session.js',
      };
    }
  }

  return {
    name: 'copilot-sdk session.js ESM patch',
    status: 'warn',
    message: '@github/copilot-sdk not found in node_modules',
  };
}

// ── public API ──────────────────────────────────────────────────────

/**
 * Run all doctor checks for the given working directory.
 * Returns an array of check results — never throws for check failures.
 */
export async function runDoctor(cwd?: string): Promise<DoctorCheck[]> {
  const resolvedCwd = cwd ?? process.cwd();
  const { mode, squadDir, teamRoot } = detectMode(resolvedCwd);
  const checks: DoctorCheck[] = [];

  // 1. .squad/ directory
  checks.push(checkSquadDir(squadDir));

  // 2. config.json (if present)
  const configCheck = checkConfigJson(squadDir);
  if (configCheck) checks.push(configCheck);

  // 3. Absolute path warning
  const absWarn = checkAbsoluteTeamRoot(squadDir);
  if (absWarn) checks.push(absWarn);

  // 4. Remote team root resolution
  if (mode === 'remote' && teamRoot) {
    checks.push(checkTeamRootResolves(squadDir, teamRoot));
  }

  // 5–9 standard files (only if .squad/ exists)
  if (isDirectory(squadDir)) {
    checks.push(checkTeamMd(squadDir));
    checks.push(checkRoutingMd(squadDir));
    checks.push(checkAgentsDir(squadDir));
    checks.push(checkCastingRegistry(squadDir));
    checks.push(checkDecisionsMd(squadDir));
  }

  // 10–11 ESM compatibility (Node 22/24+)
  checks.push(checkVscodeJsonrpcExports(resolvedCwd));
  checks.push(checkCopilotSdkSessionPatch(resolvedCwd));

  return checks;
}

/**
 * Detect the squad mode for the given working directory.
 * Exported for tests and display.
 */
export function getDoctorMode(cwd?: string): DoctorMode {
  return detectMode(cwd ?? process.cwd()).mode;
}

// ── CLI output ──────────────────────────────────────────────────────

const STATUS_ICON: Record<DoctorCheck['status'], string> = {
  pass: '✅',
  fail: '❌',
  warn: '⚠️',
};

/**
 * Print doctor results to stdout. Intended for CLI use.
 */
export function printDoctorReport(checks: DoctorCheck[], mode: DoctorMode): void {
  console.log('\n🩺 Squad Doctor');
  console.log('═══════════════\n');
  console.log(`Mode: ${mode}\n`);

  for (const c of checks) {
    console.log(`${STATUS_ICON[c.status]}  ${c.name} — ${c.message}`);
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;

  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${warned} warnings\n`);
}

/**
 * CLI entry point — run doctor and print results.
 */
export async function doctorCommand(cwd?: string): Promise<void> {
  const resolvedCwd = cwd ?? process.cwd();
  const mode = getDoctorMode(resolvedCwd);
  const checks = await runDoctor(resolvedCwd);
  printDoctorReport(checks, mode);
}
