/**
 * M4-11: Migration for install path changes
 * Detects current install method and generates migration instructions.
 */

export type InstallMethod = 'npx-github' | 'npm-global' | 'npm-local' | 'unknown';

export interface MigrationStep {
  description: string;
  command?: string;
  manual?: boolean;
}

export interface MigrationPlan {
  from: InstallMethod;
  to: InstallMethod;
  steps: MigrationStep[];
}

/**
 * Detect the current install method based on environment heuristics.
 */
export function detectInstallMethod(): InstallMethod {
  // Check for npm global prefix
  const execPath = process.argv[1] ?? '';
  const npmGlobalPrefix = process.env.npm_config_prefix ?? '';

  if (process.env.npm_execpath?.includes('npx') || execPath.includes('_npx')) {
    return 'npx-github';
  }

  if (npmGlobalPrefix && execPath.startsWith(npmGlobalPrefix)) {
    return 'npm-global';
  }

  if (execPath.includes('node_modules')) {
    return 'npm-local';
  }

  return 'unknown';
}

const MIGRATION_STEPS: Record<string, MigrationStep[]> = {
  'npx-github->npm-global': [
    { description: 'Install the squad package globally from npm', command: 'npm install -g @bradygaster/squad' },
    { description: 'Verify the installation', command: 'squad --version' },
    { description: 'Remove any cached npx versions', command: 'npx --yes clear-npx-cache || true' },
  ],
  'npx-github->npm-local': [
    { description: 'Add squad as a local dev dependency', command: 'npm install --save-dev @bradygaster/squad' },
    { description: 'Add a script entry in package.json', manual: true, command: undefined },
    { description: 'Verify the installation', command: 'squad --version' },
  ],
  'npm-global->npm-local': [
    { description: 'Add squad as a local dev dependency', command: 'npm install --save-dev @bradygaster/squad' },
    { description: 'Optionally uninstall the global version', command: 'npm uninstall -g @bradygaster/squad' },
    { description: 'Use squad or add an npm script to run locally' },
  ],
  'npm-local->npm-global': [
    { description: 'Install squad globally', command: 'npm install -g @bradygaster/squad' },
    { description: 'Remove from local devDependencies', command: 'npm uninstall @bradygaster/squad' },
    { description: 'Verify the global installation', command: 'squad --version' },
  ],
  'npm-global->npx-github': [
    { description: 'Uninstall the global npm package', command: 'npm uninstall -g @bradygaster/squad' },
    { description: 'Install squad globally and run directly', command: 'npm install -g @bradygaster/squad-cli && squad' },
  ],
  'npm-local->npx-github': [
    { description: 'Remove squad from local dependencies', command: 'npm uninstall @bradygaster/squad' },
    { description: 'Install squad globally and run directly', command: 'npm install -g @bradygaster/squad-cli && squad' },
  ],
};

/**
 * Generate a migration plan between install methods.
 */
export function migrateInstallPath(from: InstallMethod, to: InstallMethod): MigrationPlan {
  if (from === to) {
    return { from, to, steps: [{ description: 'No migration needed — already using this install method' }] };
  }

  if (from === 'unknown') {
    return { from, to, steps: [{ description: 'Cannot determine current install method; perform a fresh install', manual: true }] };
  }

  const key = `${from}->${to}`;
  const steps = MIGRATION_STEPS[key];

  if (!steps) {
    return {
      from,
      to,
      steps: [{ description: `Direct migration from ${from} to ${to} is not supported; uninstall and reinstall`, manual: true }],
    };
  }

  return { from, to, steps: steps.map(s => ({ ...s })) };
}

/**
 * Generate user-facing markdown migration instructions.
 */
export function generateMigrationInstructions(from: InstallMethod, to: InstallMethod): string {
  const plan = migrateInstallPath(from, to);
  const lines: string[] = [];

  lines.push(`# Migrate from \`${from}\` to \`${to}\``);
  lines.push('');

  if (plan.steps.length === 1 && from === to) {
    lines.push('No migration needed — you are already using this install method.');
    return lines.join('\n') + '\n';
  }

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    lines.push(`${i + 1}. ${step.description}`);
    if (step.command) {
      lines.push('');
      lines.push('   ```bash');
      lines.push(`   ${step.command}`);
      lines.push('   ```');
      lines.push('');
    }
    if (step.manual) {
      lines.push('   *(manual step)*');
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
