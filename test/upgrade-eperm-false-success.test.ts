/**
 * Regression test for UPGRADE-EPERM-FALSE-SUCCESS.
 *
 * Before the fix: when `npm install -g @bradygaster/squad-cli` failed (EPERM /
 * EACCES / EBUSY), `selfUpgradeCli` swallowed the error and returned normally,
 * causing the caller in cli-entry.ts to unconditionally print
 * `✅ Upgraded. Please restart your terminal...` and exit 0 — contradicting
 * the `⚠️ Upgrade failed` warning printed moments earlier.
 *
 * Expected after fix: `selfUpgradeCli` throws on package-manager failure so the
 * caller can exit non-zero and only the failure message is shown.
 *
 * Evidence: .squad/files/validation/TWOLAYER-BASELINE-INSIDER3-CONSOLIDATED.md
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('UPGRADE-EPERM-FALSE-SUCCESS: selfUpgradeCli surfaces install failures', () => {
  it('throws when the package-manager install command fails with EPERM', async () => {
    // Stub child_process.execSync to simulate an EPERM from npm install -g.
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      return {
        ...actual,
        execSync: vi.fn(() => {
          const e = new Error('EPERM: operation not permitted, copyfile ... squad.cmd');
          (e as NodeJS.ErrnoException).code = 'EPERM';
          throw e;
        }),
      };
    });

    const { selfUpgradeCli } = await import('../packages/squad-cli/src/cli/core/upgrade.js');
    await expect(selfUpgradeCli({ insider: false })).rejects.toThrow(/Self-upgrade failed/);
  });

  it('throws with EACCES hint when the install command fails with EACCES', async () => {
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      return {
        ...actual,
        execSync: vi.fn(() => {
          const e = new Error('EACCES: permission denied');
          (e as NodeJS.ErrnoException).code = 'EACCES';
          throw e;
        }),
      };
    });

    const { selfUpgradeCli } = await import('../packages/squad-cli/src/cli/core/upgrade.js');
    await expect(selfUpgradeCli({ insider: false })).rejects.toThrow(/Self-upgrade failed/);
  });

  it('cli-entry exits non-zero when selfUpgradeCli throws (no "✅ Upgraded" printed)', async () => {
    // Static source-level check: the upgrade-self branch in cli-entry.ts must
    // wrap selfUpgradeCli in a try/catch that calls process.exit(1) on failure,
    // and must NOT print "✅ Upgraded" before the call. This prevents the
    // baseline-observed contradictory output.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli-entry.ts'),
      'utf-8',
    );
    // Match the self-upgrade block heuristically.
    const block = src.match(/if \(selfUpgrade\) \{[\s\S]*?return;\s*\}/);
    expect(block, 'self-upgrade block should exist in cli-entry.ts').toBeTruthy();
    const blockSrc = block![0];
    expect(blockSrc).toMatch(/try\s*\{[\s\S]*?selfUpgradeCli/);
    expect(blockSrc).toMatch(/catch\s*\([\s\S]*?\)\s*\{[\s\S]*?process\.exit\(1\)/);
    // And the success log must appear AFTER the catch block (only reached if no throw).
    const successIdx = blockSrc.indexOf('✅ Upgraded');
    const catchIdx = blockSrc.indexOf('catch');
    expect(successIdx).toBeGreaterThan(catchIdx);
  });
});
