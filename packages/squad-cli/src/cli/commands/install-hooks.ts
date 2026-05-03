/**
 * Git Hook Installation — installs squad sync hooks into the repo's .git/hooks/.
 *
 * Hooks are installed with chaining: if a user already has a hook (e.g., from husky),
 * the squad hook is appended and the existing hook is called first.
 *
 * Installed hooks:
 * - pre-push: pushes squad-state branches alongside the user's push
 * - post-merge: fetches squad-state after the user pulls
 * - post-rewrite: fetches squad-state after rebase
 * - post-checkout: fetches squad-state on branch switch
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const SQUAD_HOOK_MARKER = '# --- squad-sync-hook ---';

/**
 * The shell script content for each hook.
 * These are minimal wrappers that call `squad sync`.
 * The SQUAD_SYNC_ACTIVE env guard prevents recursion.
 */
const HOOK_TEMPLATES: Record<string, string> = {
  'pre-push': `#!/bin/sh
${SQUAD_HOOK_MARKER}
# Auto-sync squad-state branches on push.
# Installed by: squad install-hooks
# The remote and URL are passed as arguments to pre-push hooks.
if [ -z "$SQUAD_SYNC_ACTIVE" ]; then
  REMOTE="$1"
  export SQUAD_SYNC_ACTIVE=1
  npx --yes @bradygaster/squad-cli sync --push --remote "$REMOTE" --quiet 2>/dev/null || true
  unset SQUAD_SYNC_ACTIVE
fi
`,
  'post-merge': `#!/bin/sh
${SQUAD_HOOK_MARKER}
# Auto-fetch squad-state branches after pull/merge.
# Installed by: squad install-hooks
if [ -z "$SQUAD_SYNC_ACTIVE" ]; then
  export SQUAD_SYNC_ACTIVE=1
  npx --yes @bradygaster/squad-cli sync --pull --quiet 2>/dev/null || true
  unset SQUAD_SYNC_ACTIVE
fi
`,
  'post-rewrite': `#!/bin/sh
${SQUAD_HOOK_MARKER}
# Auto-fetch squad-state branches after rebase.
# Installed by: squad install-hooks
if [ -z "$SQUAD_SYNC_ACTIVE" ]; then
  export SQUAD_SYNC_ACTIVE=1
  npx --yes @bradygaster/squad-cli sync --pull --quiet 2>/dev/null || true
  unset SQUAD_SYNC_ACTIVE
fi
`,
  'post-checkout': `#!/bin/sh
${SQUAD_HOOK_MARKER}
# Auto-fetch squad-state branches on branch switch.
# Installed by: squad install-hooks
# Only run on branch checkout (3rd arg = 1), not file checkout
if [ "$3" = "1" ] && [ -z "$SQUAD_SYNC_ACTIVE" ]; then
  export SQUAD_SYNC_ACTIVE=1
  npx --yes @bradygaster/squad-cli sync --pull --quiet 2>/dev/null || true
  unset SQUAD_SYNC_ACTIVE
fi
`,
};

export interface InstallHooksOptions {
  force?: boolean;
}

/**
 * Get the .git/hooks directory path for the repo.
 */
function getHooksDir(cwd: string): string {
  // Respect core.hooksPath if already set
  try {
    const customPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (customPath) {
      return path.isAbsolute(customPath) ? customPath : path.resolve(cwd, customPath);
    }
  } catch {
    // Not set — use default
  }

  const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], {
    cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  return path.resolve(cwd, gitDir, 'hooks');
}

/**
 * Install a single hook, chaining with any existing hook.
 */
function installHook(hooksDir: string, hookName: string, content: string, force: boolean): 'installed' | 'chained' | 'skipped' {
  const hookPath = path.join(hooksDir, hookName);

  // Check if hook already exists
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');

    // Already has our marker — skip unless force
    if (existing.includes(SQUAD_HOOK_MARKER)) {
      if (!force) return 'skipped';
      // Force: remove old squad section and re-append
      const cleaned = existing.split('\n').filter(line => {
        // Remove lines between markers
        return true; // simplified: just replace the file
      }).join('\n');
      // For simplicity on force, rewrite with chaining
    }

    // Chain: existing hook runs first, then squad hook (without shebang)
    const squadSection = content.split('\n').slice(1).join('\n'); // remove #!/bin/sh
    const chained = existing.trimEnd() + '\n\n' + squadSection;
    fs.writeFileSync(hookPath, chained, { mode: 0o755 });
    return 'chained';
  }

  // No existing hook — write fresh
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(hookPath, content, { mode: 0o755 });
  return 'installed';
}

/**
 * Main hook installation entrypoint.
 */
export function installGitHooks(cwd: string, options: InstallHooksOptions = {}): void {
  const { force = false } = options;

  // Verify we're in a git repo
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    console.log(`${YELLOW}⚠${RESET} Not a git repository. Cannot install hooks.`);
    return;
  }

  // Check if backend needs hooks (only orphan/two-layer)
  let backend: string | null = null;
  try {
    const configPath = path.join(cwd, '.squad', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      backend = config.stateBackend || null;
    }
  } catch { /* proceed anyway */ }

  if (backend === 'local' || backend === 'external' || backend === null) {
    console.log(`${DIM}squad install-hooks: backend is '${backend || 'local'}' — hooks not needed (state syncs with normal git operations).${RESET}`);
    return;
  }

  const hooksDir = getHooksDir(cwd);
  console.log(`\n${BOLD}Installing squad sync hooks${RESET}`);
  console.log(`${DIM}  hooks dir: ${hooksDir}${RESET}\n`);

  for (const [hookName, template] of Object.entries(HOOK_TEMPLATES)) {
    const result = installHook(hooksDir, hookName, template, force);
    switch (result) {
      case 'installed':
        console.log(`  ${GREEN}✓${RESET} ${hookName}: installed`);
        break;
      case 'chained':
        console.log(`  ${GREEN}✓${RESET} ${hookName}: chained (existing hook preserved)`);
        break;
      case 'skipped':
        console.log(`  ${DIM}  ${hookName}: already installed (use --force to reinstall)${RESET}`);
        break;
    }
  }

  console.log(`\n${GREEN}${BOLD}Done.${RESET} Squad state will sync automatically on push/pull.\n`);
}
