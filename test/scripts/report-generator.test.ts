import { describe, it, expect } from 'vitest';
import { generateReport } from '../../scripts/impact-utils/report-generator.mjs';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    prNumber: 42,
    risk: { tier: 'LOW', factors: ['1 file changed'] },
    modules: { root: ['README.md'] },
    files: { all: ['README.md'], added: [], modified: ['README.md'], deleted: [] },
    criticalFiles: [] as string[],
    ...overrides,
  };
}

// ── Risk tier emoji & header ────────────────────────────────────────────

describe('risk tier emoji and header', () => {
  it.each([
    ['LOW', '🟢'],
    ['MEDIUM', '🟡'],
    ['HIGH', '🟠'],
    ['CRITICAL', '🔴'],
  ])('tier %s produces emoji %s', (tier, emoji) => {
    const report = generateReport(makeInput({ risk: { tier, factors: ['test'] } }));
    expect(report).toContain(`## ${emoji} Impact Analysis`);
    expect(report).toContain(`**Risk tier:** ${emoji} **${tier}**`);
  });

  it('uses fallback emoji for unknown tier', () => {
    const report = generateReport(makeInput({ risk: { tier: 'UNKNOWN', factors: [] } }));
    expect(report).toContain('## ⚪ Impact Analysis');
  });
});

// ── Critical files section ──────────────────────────────────────────────

describe('critical files section', () => {
  it('renders critical files section when critical files exist', () => {
    const report = generateReport(
      makeInput({ criticalFiles: ['package.json', 'tsconfig.json'] }),
    );
    expect(report).toContain('### ⚠️ Critical Files');
    expect(report).toContain('`package.json`');
    expect(report).toContain('`tsconfig.json`');
  });

  it('omits critical files section when none exist', () => {
    const report = generateReport(makeInput({ criticalFiles: [] }));
    expect(report).not.toContain('### ⚠️ Critical Files');
  });

  it('includes critical file count in summary table when present', () => {
    const report = generateReport(makeInput({ criticalFiles: ['index.ts'] }));
    expect(report).toContain('| Critical files | 1 |');
  });

  it('omits critical file count row from summary table when none', () => {
    const report = generateReport(makeInput({ criticalFiles: [] }));
    expect(report).not.toContain('Critical files');
  });
});

// ── Empty / null inputs ─────────────────────────────────────────────────

describe('empty and edge-case inputs', () => {
  it('handles zero files gracefully', () => {
    const report = generateReport(
      makeInput({
        modules: {},
        files: { all: [], added: [], modified: [], deleted: [] },
        criticalFiles: [],
      }),
    );
    expect(report).toContain('| Files changed | 0 |');
    expect(report).toContain('| Modules touched | 0 |');
  });

  it('handles empty risk factors array', () => {
    const report = generateReport(makeInput({ risk: { tier: 'LOW', factors: [] } }));
    expect(report).toContain('### 🎯 Risk Factors');
    expect(report).not.toContain('- undefined');
  });
});

// ── Module breakdown ────────────────────────────────────────────────────

describe('module breakdown', () => {
  it('renders each module as a collapsible details block', () => {
    const report = generateReport(
      makeInput({
        modules: {
          'squad-sdk': ['packages/squad-sdk/index.ts', 'packages/squad-sdk/lib.ts'],
          scripts: ['scripts/foo.mjs'],
        },
      }),
    );
    expect(report).toContain('<details><summary><strong>scripts</strong>');
    expect(report).toContain('<details><summary><strong>squad-sdk</strong>');
    expect(report).toContain('`scripts/foo.mjs`');
  });

  it('sorts modules alphabetically', () => {
    const report = generateReport(
      makeInput({
        modules: {
          zeta: ['z.ts'],
          alpha: ['a.ts'],
          mid: ['m.ts'],
        },
      }),
    );
    const alphaIdx = report.indexOf('alpha');
    const midIdx = report.indexOf('mid');
    const zetaIdx = report.indexOf('zeta');
    expect(alphaIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(zetaIdx);
  });
});

// ── File count pluralization ────────────────────────────────────────────

describe('file count pluralization', () => {
  it('uses singular "file" for 1 file', () => {
    const report = generateReport(
      makeInput({ modules: { root: ['one.ts'] } }),
    );
    expect(report).toContain('(1 file)');
    expect(report).not.toContain('(1 files)');
  });

  it('uses plural "files" for multiple files', () => {
    const report = generateReport(
      makeInput({ modules: { root: ['a.ts', 'b.ts'] } }),
    );
    expect(report).toContain('(2 files)');
  });

  it('uses plural "files" for zero files', () => {
    const report = generateReport(makeInput({ modules: { empty: [] } }));
    expect(report).toContain('(0 files)');
  });
});
