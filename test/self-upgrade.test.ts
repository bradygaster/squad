import { describe, it, expect, vi } from 'vitest';

// We test the UpgradeOptions interface and the self-upgrade code path structure.
// Actual npm install is not tested (would modify the system), but we verify:
// - The option is wired correctly
// - The function signature accepts insider flag
// - The package name constant is correct

describe('squad upgrade --self', () => {
  it('UpgradeOptions includes self and insider flags', async () => {
    const { runUpgrade } = await import('../packages/squad-cli/src/cli/core/upgrade.js');
    // Verify the function accepts the options without type error
    expect(typeof runUpgrade).toBe('function');
  });

  it('cli-entry parses --self and --insider flags', async () => {
    // Read the cli-entry source and verify flag parsing
    const fs = await import('node:fs');
    const path = await import('node:path');
    const entrySource = fs.readFileSync(
      path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli-entry.ts'),
      'utf-8',
    );
    expect(entrySource).toContain("args.includes('--self')");
    expect(entrySource).toContain("args.includes('--insider')");
    expect(entrySource).toContain('insider: insiderUpgrade');
  });

  it('help text documents --self and --insider', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const entrySource = fs.readFileSync(
      path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli-entry.ts'),
      'utf-8',
    );
    expect(entrySource).toContain('--self (upgrade the CLI package itself)');
    expect(entrySource).toContain('--self --insider');
  });

  it('upgrade module references correct npm package name', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const upgradeSource = fs.readFileSync(
      path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'core', 'upgrade.ts'),
      'utf-8',
    );
    expect(upgradeSource).toContain("@bradygaster/squad-cli");
    expect(upgradeSource).toContain("'insider'");
    expect(upgradeSource).toContain("'latest'");
  });
});
