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

import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { FSStorageProvider, resolveStateBackend, type StateBackendType } from '@bradygaster/squad-sdk';
import { resolveStateDir } from '../core/effective-squad-dir.js';

const storage = new FSStorageProvider();

/** Result of a single diagnostic check. */
export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  /** Optional severity hint for display; keeps the status union stable. */
  severity?: 'info';
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
  return storage.existsSync(p);
}

function isDirectory(p: string): boolean {
  return storage.isDirectorySync(p);
}

function tryReadJson(p: string): unknown | undefined {
  try {
    const raw = storage.readSync(p);
    if (!raw) return undefined;
    return JSON.parse(raw);
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
      message: `teamRoot is absolute (${teamRoot}) — prefer relative paths for portability. Edit .squad/config.json to use a relative path.`,
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
  const content = storage.readSync(teamPath) ?? '';
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
    for (const entry of storage.listSync(agentsDir)) {
      if (storage.isDirectorySync(path.join(agentsDir, entry))) count++;
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

function configuredStateBackend(squadDir: string): StateBackendType | undefined {
  const configPath = path.join(squadDir, 'config.json');
  if (!fileExists(configPath)) return undefined;

  const config = tryReadJson(configPath) as Record<string, unknown> | undefined;
  const backend = config?.['stateBackend'];
  if (backend === 'worktree') return 'local';
  if (backend === 'git-notes') return 'two-layer';
  if (backend === 'external') return 'external-stub';
  if (backend === 'local' || backend === 'external-stub' || backend === 'orphan' || backend === 'two-layer') {
    return backend;
  }
  return undefined;
}

function checkBackendDecisionsMd(cwd: string, squadDir: string, stateBackend: 'orphan' | 'two-layer'): DoctorCheck {
  try {
    const backend = resolveStateBackend(squadDir, cwd, stateBackend);
    if (backend.name !== stateBackend) {
      return {
        name: 'decisions.md exists',
        status: 'fail',
        message: `configured '${stateBackend}' backend was not available; resolved '${backend.name}' instead and could not inspect squad-state`,
      };
    }

    const exists = backend.exists('decisions.md');
    return {
      name: 'decisions.md exists',
      status: exists ? 'pass' : 'fail',
      message: exists
        ? `file present in squad-state (${stateBackend} backend)`
        : `file not found in squad-state (${stateBackend} backend)`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: 'decisions.md exists',
      status: 'fail',
      message: `could not inspect squad-state for '${stateBackend}' backend: ${msg}`,
    };
  }
}

function checkDecisionsMd(cwd: string, squadDir: string, stateDir: string): DoctorCheck {
  const stateBackend = configuredStateBackend(squadDir);
  if (stateBackend === 'orphan' || stateBackend === 'two-layer') {
    return checkBackendDecisionsMd(cwd, squadDir, stateBackend);
  }

  const exists = fileExists(path.join(stateDir, 'decisions.md'));
  return {
    name: 'decisions.md exists',
    status: exists ? 'pass' : 'fail',
    message: exists ? 'file present' : 'file not found',
  };
}

/**
 * Report the last detected rate limit, if any, by reading the status file
 * written by the shell when a rate limit error is caught.
 */
function checkRateLimitStatus(squadDir: string): DoctorCheck | undefined {
  const statusPath = path.join(squadDir, 'rate-limit-status.json');
  if (!fileExists(statusPath)) return undefined;

  const data = tryReadJson(statusPath) as Record<string, unknown> | undefined;
  if (!data) {
    return {
      name: 'rate limit status',
      status: 'warn',
      message: 'rate-limit-status.json exists but could not be parsed',
    };
  }

  const ts = typeof data['timestamp'] === 'string' ? new Date(data['timestamp']) : null;
  const retryAfter = typeof data['retryAfter'] === 'number' ? data['retryAfter'] : null;
  const model = typeof data['model'] === 'string' ? data['model'] : null;

  const age = ts ? Math.floor((Date.now() - ts.getTime()) / 1000) : null;
  const ageStr = age !== null ? ` (${formatAge(age)} ago)` : '';
  const modelStr = model ? ` on model: ${model}` : '';
  const retryStr = retryAfter ? ` — retry after ${retryAfter}s` : '';

  // If last rate limit was more than 4 hours ago, treat as stale info (pass)
  const stale = age !== null && age > 4 * 3600;

  return {
    name: 'rate limit status',
    status: stale ? 'pass' : 'warn',
    message: stale
      ? `Last rate limit${ageStr}${modelStr} — appears resolved. Run \`squad economy on\` to reduce future risk.`
      : `Rate limit detected${ageStr}${modelStr}${retryStr}. Run \`squad economy on\` to switch to cheaper models.`,
  };
}

function formatAge(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    return `${h}h`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    return `${m}m`;
  }
  return `${seconds}s`;
}

// ── ESM compatibility checks ────────────────────────────────────────

// ── environment checks ─────────────────────────────────────────────

/**
 * Check that Node.js is ≥22.5.0 for node:sqlite availability.
 * Accepts an optional version string for testing.
 */
export function checkNodeVersion(nodeVersion?: string): DoctorCheck {
  const version = nodeVersion ?? process.versions.node;
  const parts = version.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const ok = major > 22 || (major === 22 && minor >= 5);
  return {
    name: 'Node.js ≥22.5.0 (node:sqlite)',
    status: ok ? 'pass' : 'fail',
    message: ok
      ? `v${version} — node:sqlite available`
      : `v${version} — node:sqlite requires ≥22.5.0. Upgrade at https://nodejs.org/en/download`,
  };
}

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

  // Detect whether we're in a local dev context (node_modules exists) or global install
  const hasNodeModules = isDirectory(path.join(cwd, 'node_modules'));
  if (hasNodeModules) {
    return {
      name: 'vscode-jsonrpc exports field',
      status: 'warn',
      message: 'not found in node_modules — run npm install or check dependencies',
    };
  }

  return {
    name: 'vscode-jsonrpc exports field',
    status: 'warn',
    severity: 'info',
    message: 'not found in node_modules (expected for global installs)',
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
      const content = storage.readSync(sessionPath) ?? '';

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

  // Detect whether we're in a local dev context (node_modules exists) or global install
  const hasNodeModules = isDirectory(path.join(cwd, 'node_modules'));
  if (hasNodeModules) {
    return {
      name: 'copilot-sdk session.js ESM patch',
      status: 'warn',
      message: 'not found in node_modules — run npm install or check dependencies',
    };
  }

  return {
    name: 'copilot-sdk session.js ESM patch',
    status: 'warn',
    severity: 'info',
    message: 'not found in node_modules (expected for global installs)',
  };
}

function checkSquadAgentMd(cwd: string): DoctorCheck {
  const agentMdPath = path.join(cwd, '.github', 'agents', 'squad.agent.md');
  if (!fileExists(agentMdPath)) {
    return {
      name: '.github/agents/squad.agent.md',
      status: 'fail',
      message: "file not found — run 'squad upgrade' to restore it",
    };
  }
  try {
    const content = storage.readSync(agentMdPath) ?? '';
    if (content.trim().length === 0) {
      return {
        name: '.github/agents/squad.agent.md',
        status: 'warn',
        message: "file is empty — run 'squad upgrade' to restore it",
      };
    }
  } catch {
    return {
      name: '.github/agents/squad.agent.md',
      status: 'warn',
      message: "file is empty — run 'squad upgrade' to restore it",
    };
  }
  return {
    name: '.github/agents/squad.agent.md',
    status: 'pass',
    message: 'file present (Copilot agent discovery file)',
  };
}

// ── copilot CLI check ───────────────────────────────────────────────

/**
 * Check that the Copilot CLI is reachable (needed by watch capabilities).
 * Tests `copilot --version` with shell:true for Windows compatibility.
 */
function checkCopilotCli(): Promise<DoctorCheck> {
  return new Promise((resolve) => {
    execFile('copilot', ['--version'], { shell: true, timeout: 5000 }, (err) => {
      if (err) {
        resolve({
          name: 'Copilot CLI available',
          status: 'warn',
          message:
            "'copilot --version' failed — watch capabilities (monitor-teams, monitor-email, retro, decision-hygiene) require the Copilot CLI. " +
            "If you installed the GitHub CLI extension, ensure 'copilot' is also available on your PATH, or set --agent-cmd to override.",
        });
      } else {
        resolve({
          name: 'Copilot CLI available',
          status: 'pass',
          message: 'copilot CLI reachable',
        });
      }
    });
  });
}

// ── git sync hooks check ─────────────────────────────────────────────

const SQUAD_SYNC_HOOK_MARKER = '# --- squad-sync-hook ---';
// Must match the full set installed by install-hooks.ts: the four sync hooks
// plus pre-commit/post-commit, which guard and flush two-layer state (#1190).
const REQUIRED_SYNC_HOOKS = ['pre-push', 'post-merge', 'post-rewrite', 'post-checkout', 'pre-commit', 'post-commit'] as const;

/**
 * Check that squad git sync hooks are installed when the state backend requires them.
 * Only runs for 'two-layer' and 'orphan' backends (which need hooks to push state branches).
 * Returns undefined when the check is not applicable.
 */
export function checkGitSyncHooks(cwd: string, squadDir: string): DoctorCheck | undefined {
  const stateBackend = configuredStateBackend(squadDir);
  if (stateBackend !== 'two-layer' && stateBackend !== 'orphan') return undefined;

  // Resolve the git hooks directory (respects core.hooksPath when configured)
  let hooksDir: string;
  try {
    const customPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (customPath) {
      hooksDir = path.isAbsolute(customPath) ? customPath : path.resolve(cwd, customPath);
    } else {
      throw new Error('empty hooksPath');
    }
  } catch {
    // core.hooksPath not configured — resolve via git rev-parse --git-dir
    // This handles git worktrees correctly (unlike hardcoding .git/hooks)
    try {
      const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      hooksDir = path.resolve(cwd, gitDir, 'hooks');
    } catch {
      hooksDir = path.join(cwd, '.git', 'hooks');
    }
  }

  const missingHooks: string[] = [];
  for (const hookName of REQUIRED_SYNC_HOOKS) {
    const hookPath = path.join(hooksDir, hookName);
    if (!fileExists(hookPath)) {
      missingHooks.push(hookName);
      continue;
    }
    try {
      const content = storage.readSync(hookPath) ?? '';
      if (!content.includes(SQUAD_SYNC_HOOK_MARKER)) {
        missingHooks.push(hookName);
      }
    } catch {
      missingHooks.push(hookName);
    }
  }

  if (missingHooks.length > 0) {
    return {
      name: 'git sync hooks installed',
      status: 'fail',
      message:
        `Missing squad sync hooks for '${stateBackend}' backend: ${missingHooks.join(', ')}. ` +
        `Run 'squad install-hooks' to install them.`,
    };
  }

  return {
    name: 'git sync hooks installed',
    status: 'pass',
    message: `squad sync hooks present for '${stateBackend}' backend`,
  };
}

// ── working-tree EOL check ───────────────────────────────────────────

/** Repair command surfaced to the developer when the check fails. */
const CRLF_FIX_COMMAND = 'npm run fix:crlf';

/**
 * Parse one `git ls-files --eol -z` record.
 *
 * Shape is `i/<eol>` `w/<eol>` `attr/<value>` TAB `<path>`. The first three
 * fields are space-padded to fixed columns and the attr value itself contains
 * a space ("text eol=lf"), so the path is everything after the first TAB and
 * the field block is split on whitespace runs rather than by column.
 */
function parseEolRecord(record: string): { worktree: string; attr: string; file: string } | undefined {
  const tab = record.indexOf('\t');
  if (tab === -1) return undefined;
  const match = /^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*)$/.exec(record.slice(0, tab));
  if (!match) return undefined;
  return { worktree: match[2] ?? '', attr: (match[3] ?? '').trim(), file: record.slice(tab + 1) };
}

/**
 * Check that every LF-pinned file is actually LF *on disk*.
 *
 * `.gitattributes` governs checkout, not files already on disk: git only
 * re-smudges a working file when the pull also changes that file's index
 * content. So adding an `eol=lf` rule leaves every already-LF-in-index path
 * still CRLF on disk in existing Windows checkouts, indefinitely (#1793).
 * The symptom is not an error — a CRLF shebang survives Vite's shebang
 * stripping as a bare `#`, the module fails to parse, and the vitest suite
 * importing it reports "no tests". A green-looking zero (#1788).
 *
 * DELIBERATELY A SEPARATE IMPLEMENTATION FROM scripts/check-shebang-eol.mjs,
 * which owns the same invariant family for repo tooling. That script is a repo
 * script and is not published inside this package, so `dist/` cannot import it
 * without breaking every installed copy of the CLI. Do not "deduplicate" these
 * by adding an import across that boundary. What they must keep in sync is the
 * record-parsing shape above, which is pinned by tests on both sides.
 *
 * Returns undefined when the check does not apply (not a git repo, git absent,
 * or no LF-pinned files at all), matching the other conditional checks.
 */
export function checkWorktreeEol(cwd: string): DoctorCheck | undefined {
  let records: string[];
  try {
    records = execFileSync('git', ['ls-files', '--eol', '-z'], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return undefined; // not a git repo, or git unavailable — not applicable
  }

  const stale: string[] = [];
  let pinned = 0;
  for (const record of records) {
    const parsed = parseEolRecord(record);
    if (!parsed) continue;
    if (!/(^|\s)eol=lf(\s|$)/.test(parsed.attr)) continue;
    pinned += 1;
    // `mixed` is the same defect partially applied: under an eol=lf pin any CR
    // in the working file is wrong.
    if (parsed.worktree === 'crlf' || parsed.worktree === 'mixed') stale.push(parsed.file);
  }

  if (pinned === 0) return undefined; // no eol=lf rules — nothing to assert

  if (stale.length > 0) {
    const sample = stale.slice(0, 5).join(', ');
    const more = stale.length > 5 ? `, +${stale.length - 5} more` : '';
    return {
      name: 'working tree line endings',
      status: 'fail',
      message:
        `${stale.length} of ${pinned} LF-pinned file(s) still have CRLF on disk (${sample}${more}). ` +
        `A .gitattributes eol=lf rule does not rewrite files that were already checked out, so pulling the ` +
        `fix does not repair an existing checkout. A CRLF shebang makes a vitest suite silently load zero ` +
        `tests. Run '${CRLF_FIX_COMMAND}' to repair, then re-run 'squad doctor' to confirm. To inspect ` +
        `the raw state: 'git ls-files --eol' — every entry whose attr includes eol=lf should read w/lf ` +
        `(the pin is not limited to *.mjs, and neither is this check).`,
    };
  }

  return {
    name: 'working tree line endings',
    status: 'pass',
    message: `${pinned} LF-pinned file(s) all LF on disk`,
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
    // Resolve effective state dir for externalized files
    const stateDir = resolveStateDir(squadDir);
    checks.push(checkTeamMd(stateDir));
    checks.push(checkRoutingMd(stateDir));
    checks.push(checkAgentsDir(stateDir));
    checks.push(checkCastingRegistry(stateDir));
    checks.push(checkDecisionsMd(resolvedCwd, squadDir, stateDir));
    const rateLimitCheck = checkRateLimitStatus(squadDir);
    if (rateLimitCheck) checks.push(rateLimitCheck);

    // Hook presence check (only for two-layer / orphan backends)
    const hookCheck = checkGitSyncHooks(resolvedCwd, squadDir);
    if (hookCheck) checks.push(hookCheck);
  }

  // 10. Copilot agent discovery file (relative to cwd, not squadDir)
  checks.push(checkSquadAgentMd(resolvedCwd));

  // 11. Node.js version (node:sqlite availability)
  checks.push(checkNodeVersion());

  // 11-12. ESM compatibility (Node 22/24+)
  checks.push(checkVscodeJsonrpcExports(resolvedCwd));
  checks.push(checkCopilotSdkSessionPatch(resolvedCwd));

  // 13. Copilot CLI availability (needed by watch capabilities)
  checks.push(await checkCopilotCli());

  // 14. Working-tree line endings (#1793) — an eol=lf rule does not repair a
  //     checkout that predates it, and the failure mode is a silent zero-test run.
  const worktreeEol = checkWorktreeEol(resolvedCwd);
  if (worktreeEol) checks.push(worktreeEol);

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
    const icon = c.severity === 'info' ? 'ℹ️' : STATUS_ICON[c.status];
    console.log(`${icon}  ${c.name} — ${c.message}`);
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn' && c.severity !== 'info').length;
  const infos = checks.filter(c => c.severity === 'info').length;

  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${warned} warnings, ${infos} info\n`);
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
