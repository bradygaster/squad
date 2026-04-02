/**
 * squad impact — PR impact analysis tests (Phase 1, issue #733)
 *
 * Tests for the diff parser, module mapper, risk scorer,
 * report formatter, and end-to-end integration pipeline.
 * Aligned to the actual implementation built by EECOM.
 */

import { describe, it, expect } from 'vitest';

import {
  // Diff parser
  parseDiff,
  type DiffFile,
  // Module mapper
  parseRoutingTable,
  parseWorkspaces,
  mapModules,
  type ModuleMapping,
  type RoutingEntry,
  // Risk scorer
  buildMetrics,
  scoreRisk,
  RiskTier,
  // Report formatter
  formatTerminal,
  formatJson,
  formatMarkdown,
  // Orchestrator
  analyzeImpact,
  formatReport,
  type ImpactReport,
} from '../../packages/squad-sdk/src/impact/index.js';

import { parseUnifiedDiffHeaders } from '../../packages/squad-cli/src/cli/commands/impact.js';

// ---------------------------------------------------------------------------
// 1. Diff Parser
// ---------------------------------------------------------------------------
describe('Diff Parser', () => {
  it('parses added, modified, and deleted files', () => {
    const raw = [
      'A\tpackages/squad-sdk/src/impact/diff-parser.ts',
      'M\tpackages/squad-sdk/src/config/init.ts',
      'D\tpackages/squad-cli/src/cli/commands/old-cmd.ts',
    ].join('\n');

    const result = parseDiff(raw);

    expect(result.files).toHaveLength(3);
    expect(result.files[0]).toMatchObject({ status: 'added', path: 'packages/squad-sdk/src/impact/diff-parser.ts' });
    expect(result.files[1]).toMatchObject({ status: 'modified', path: 'packages/squad-sdk/src/config/init.ts' });
    expect(result.files[2]).toMatchObject({ status: 'deleted', path: 'packages/squad-cli/src/cli/commands/old-cmd.ts' });
  });

  it('handles empty diff (no changes)', () => {
    const result = parseDiff('');
    expect(result.files).toEqual([]);
  });

  it('handles paths with spaces', () => {
    const raw = 'M\tdocs/getting started/readme.md';
    const result = parseDiff(raw);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe('docs/getting started/readme.md');
  });

  it('parses rename with 100% similarity (R100)', () => {
    const raw = 'R100\told/path.ts\tnew/path.ts';
    const result = parseDiff(raw);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      status: 'renamed',
      path: 'new/path.ts',
      oldPath: 'old/path.ts',
    });
  });

  it('parses rename with partial similarity (R085)', () => {
    const raw = 'R085\tsrc/utils/helpers.ts\tsrc/lib/helpers.ts';
    const result = parseDiff(raw);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      status: 'renamed',
      path: 'src/lib/helpers.ts',
      oldPath: 'src/utils/helpers.ts',
    });
  });

  it('handles mixed statuses including renames', () => {
    const raw = [
      'A\tnew-file.ts',
      'R100\told-name.ts\tnew-name.ts',
      'M\texisting.ts',
      'D\tremoved.ts',
    ].join('\n');

    const result = parseDiff(raw);
    expect(result.files).toHaveLength(4);
    expect(result.files.map(f => f.status)).toEqual(['added', 'renamed', 'modified', 'deleted']);
  });
});

// ---------------------------------------------------------------------------
// 2. Module Mapper
// ---------------------------------------------------------------------------
describe('Module Mapper', () => {
  describe('parseRoutingTable', () => {
    it('parses module ownership table from routing.md', () => {
      const routingContent = [
        '## Module Ownership',
        '',
        '| Module | Primary | Secondary |',
        '|--------|---------|-----------|',
        '| `src/impact/` | EECOM 🔧 | CAPCOM 🕵️ |',
        '| `src/config/` | FLIGHT 🚀 | — |',
      ].join('\n');

      const entries = parseRoutingTable(routingContent);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        directory: 'src/impact',
        primary: 'EECOM',
        secondary: 'CAPCOM',
      });
      expect(entries[1]).toMatchObject({
        directory: 'src/config',
        primary: 'FLIGHT',
        secondary: '',
      });
    });
  });

  describe('parseWorkspaces', () => {
    it('extracts workspace patterns from package.json', () => {
      const pkgJson = JSON.stringify({ workspaces: ['packages/*'] });
      expect(parseWorkspaces(pkgJson)).toEqual(['packages/*']);
    });

    it('returns empty array for invalid JSON', () => {
      expect(parseWorkspaces('not json')).toEqual([]);
    });

    it('returns empty array when no workspaces field', () => {
      expect(parseWorkspaces('{}')).toEqual([]);
    });
  });

  describe('mapModules', () => {
    it('maps files using routing entries (longest match wins)', () => {
      const files: DiffFile[] = [
        { path: 'packages/squad-sdk/src/impact/diff-parser.ts', status: 'added' },
      ];
      const routing: RoutingEntry[] = [
        { directory: 'src/impact', primary: 'EECOM', secondary: 'CAPCOM' },
      ];

      const mappings = mapModules(files, routing, ['packages/*']);

      expect(mappings).toHaveLength(1);
      expect(mappings[0]).toMatchObject({
        module: 'src/impact',
        primary: 'EECOM',
        secondary: 'CAPCOM',
        package: 'packages/squad-sdk',
      });
    });

    it('falls back to top-level directory when no routing matches', () => {
      const files: DiffFile[] = [
        { path: 'packages/squad-sdk/src/config/init.ts', status: 'modified' },
      ];

      const mappings = mapModules(files, [], ['packages/*']);

      expect(mappings).toHaveLength(1);
      expect(mappings[0]!.module).toBe('packages');
      expect(mappings[0]!.primary).toBe('unknown');
      expect(mappings[0]!.package).toBe('packages/squad-sdk');
    });

    it('maps root-level files to root module and package', () => {
      const files: DiffFile[] = [{ path: 'README.md', status: 'modified' }];
      const mappings = mapModules(files, [], []);

      expect(mappings).toHaveLength(1);
      expect(mappings[0]!.module).toBe('root');
      expect(mappings[0]!.package).toBe('root');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Risk Scorer
// ---------------------------------------------------------------------------
describe('Risk Scorer', () => {
  function makeFiles(count: number, status: DiffFile['status'] = 'modified'): DiffFile[] {
    return Array.from({ length: count }, (_, i) => ({ path: `src/file${i}.ts`, status }));
  }

  function makeMappings(moduleNames: string[], pkg = 'root'): ModuleMapping[] {
    return moduleNames.map(m => ({ module: m, primary: 'unknown', secondary: '', package: pkg }));
  }

  it('scores LOW for 1 module, 3 files, 0 cross-package edges', () => {
    const files = makeFiles(3);
    const mappings = makeMappings(['config', 'config', 'config']);
    const result = scoreRisk(buildMetrics(files, mappings));

    expect(result.tier).toBe(RiskTier.LOW);
  });

  it('scores MEDIUM for 3 modules', () => {
    const files = makeFiles(3);
    const mappings = makeMappings(['config', 'commands', 'impact']);
    const result = scoreRisk(buildMetrics(files, mappings));

    expect(result.tier).toBe(RiskTier.MEDIUM);
  });

  it('scores HIGH for 6 modules (5–8 range)', () => {
    const names = ['config', 'commands', 'impact', 'runtime', 'hooks', 'casting'];
    const files = makeFiles(6);
    const mappings = makeMappings(names);
    const result = scoreRisk(buildMetrics(files, mappings));

    expect(result.tier).toBe(RiskTier.HIGH);
  });

  it('scores HIGH when critical files are touched', () => {
    const files: DiffFile[] = [{ path: 'package.json', status: 'modified' }];
    const mappings = makeMappings(['root']);
    const result = scoreRisk(buildMetrics(files, mappings));

    expect(result.tier).toBe(RiskTier.HIGH);
  });

  it('scores HIGH for 2+ cross-package edges', () => {
    const files = makeFiles(3);
    const mappings: ModuleMapping[] = [
      { module: 'a', primary: 'X', secondary: '', package: 'pkg-a' },
      { module: 'b', primary: 'Y', secondary: '', package: 'pkg-b' },
      { module: 'c', primary: 'Z', secondary: '', package: 'pkg-c' },
    ];
    const result = scoreRisk(buildMetrics(files, mappings));

    expect(result.tier).toBe(RiskTier.HIGH);
  });

  it('scores CRITICAL for >8 modules', () => {
    const names = Array.from({ length: 10 }, (_, i) => `mod-${i}`);
    const files = makeFiles(10);
    const mappings = makeMappings(names);
    const result = scoreRisk(buildMetrics(files, mappings));

    expect(result.tier).toBe(RiskTier.CRITICAL);
  });

  it('scores CRITICAL for mass deletion (>10 files deleted)', () => {
    const files = makeFiles(15, 'deleted');
    const mappings = makeMappings(Array(15).fill('config'));
    const result = scoreRisk(buildMetrics(files, mappings));

    expect(result.tier).toBe(RiskTier.CRITICAL);
  });

  it('scores LOW when 0 files changed', () => {
    const result = scoreRisk(buildMetrics([], []));
    expect(result.tier).toBe(RiskTier.LOW);
  });
});

// ---------------------------------------------------------------------------
// 4. Report Formatter
// ---------------------------------------------------------------------------
describe('Report Formatter', () => {
  const sampleReport: ImpactReport = {
    source: 'PR #42',
    diff: {
      files: [
        { path: 'packages/squad-sdk/src/config/init.ts', status: 'modified' },
        { path: 'packages/squad-cli/src/cli/commands/doctor.ts', status: 'modified' },
        { path: 'packages/squad-sdk/src/impact/diff-parser.ts', status: 'added' },
      ],
    },
    modules: [
      { module: 'config', primary: 'FLIGHT', secondary: '', package: 'packages/squad-sdk' },
      { module: 'commands', primary: 'FLIGHT', secondary: '', package: 'packages/squad-cli' },
      { module: 'impact', primary: 'EECOM', secondary: 'CAPCOM', package: 'packages/squad-sdk' },
    ],
    risk: {
      tier: RiskTier.MEDIUM,
      reason: 'Touches 3 modules',
      metrics: {
        totalFiles: 3,
        addedFiles: 1,
        modifiedFiles: 2,
        deletedFiles: 0,
        renamedFiles: 0,
        uniqueModules: 3,
        uniquePackages: 2,
        crossPackageEdges: 1,
        criticalFilesTouched: [],
      },
    },
  };

  describe('JSON output', () => {
    it('produces valid JSON with expected fields', () => {
      const json = formatJson(sampleReport);
      const parsed = JSON.parse(json);

      expect(parsed.risk.tier).toBe('MEDIUM');
      expect(parsed.modules).toHaveLength(3);
      expect(parsed.diff.files).toHaveLength(3);
    });

    it('includes the source field', () => {
      const parsed = JSON.parse(formatJson(sampleReport));
      expect(parsed.source).toBe('PR #42');
    });
  });

  describe('Markdown output', () => {
    it('contains impact analysis header with tier', () => {
      const md = formatMarkdown(sampleReport);
      expect(md).toContain('Impact Analysis');
      expect(md).toContain('MEDIUM');
    });

    it('contains a metrics table', () => {
      const md = formatMarkdown(sampleReport);
      expect(md).toContain('| Metric | Value |');
      expect(md).toMatch(/\|[-\s]+\|[-\s]+\|/);
    });

    it('contains module ownership section', () => {
      const md = formatMarkdown(sampleReport);
      expect(md).toContain('### Module Ownership');
    });
  });

  describe('Terminal output', () => {
    it('contains risk tier text', () => {
      const term = formatTerminal(sampleReport);
      expect(term).toContain('MEDIUM');
    });

    it('mentions module count', () => {
      const term = formatTerminal(sampleReport);
      expect(term).toMatch(/3\s*module/i);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Integration test — full pipeline with hardcoded fixture
// ---------------------------------------------------------------------------
describe('Impact Analysis — integration', () => {
  const fixtureDiff = [
    'A\tpackages/squad-sdk/src/impact/diff-parser.ts',
    'A\tpackages/squad-sdk/src/impact/module-mapper.ts',
    'A\tpackages/squad-sdk/src/impact/risk-scorer.ts',
    'A\tpackages/squad-sdk/src/impact/report-formatter.ts',
    'M\tpackages/squad-cli/src/cli/commands/impact.ts',
    'M\tpackages/squad-sdk/src/config/init.ts',
    'D\tpackages/squad-cli/src/cli/commands/old-analyze.ts',
  ].join('\n');

  it('full pipeline: parse → map → score → format via analyzeImpact', () => {
    const report = analyzeImpact({
      nameStatusOutput: fixtureDiff,
      source: 'PR #733',
      packageJsonContent: JSON.stringify({ workspaces: ['packages/*'] }),
    });

    expect(report.diff.files).toHaveLength(7);
    expect(report.modules).toHaveLength(7);
    expect([RiskTier.MEDIUM, RiskTier.HIGH, RiskTier.CRITICAL]).toContain(report.risk.tier);

    // Format as JSON round-trips correctly
    const json = formatReport(report, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.source).toBe('PR #733');
    expect(parsed.risk.tier).toBe(report.risk.tier);
  });

  it('uses routing.md for owner resolution', () => {
    const routingContent = [
      '## Module Ownership',
      '',
      '| Module | Primary | Secondary |',
      '|--------|---------|-----------|',
      '| `src/impact` | EECOM 🔧 | CAPCOM 🕵️ |',
      '| `src/cli/commands` | FLIGHT 🚀 | — |',
    ].join('\n');

    const report = analyzeImpact({
      nameStatusOutput: fixtureDiff,
      source: 'branch feature/impact',
      routingContent,
      packageJsonContent: JSON.stringify({ workspaces: ['packages/*'] }),
    });

    // Files containing 'src/impact' in their path should map to EECOM
    const impactModules = report.modules.filter(m => m.module === 'src/impact');
    expect(impactModules.length).toBeGreaterThan(0);
    expect(impactModules[0]!.primary).toBe('EECOM');

    // Files containing 'src/cli/commands' should map to FLIGHT
    const cmdModules = report.modules.filter(m => m.module === 'src/cli/commands');
    expect(cmdModules.length).toBeGreaterThan(0);
    expect(cmdModules[0]!.primary).toBe('FLIGHT');
  });
});

// ---------------------------------------------------------------------------
// 6. CLI: parseUnifiedDiffHeaders — converts unified diff to name-status
// ---------------------------------------------------------------------------
describe('CLI: parseUnifiedDiffHeaders', () => {
  it('parses added, modified, and deleted files from unified diff headers', () => {
    const diff = [
      'diff --git a/src/new-file.ts b/src/new-file.ts',
      'new file mode 100644',
      'index 0000000..abc1234',
      '--- /dev/null',
      '+++ b/src/new-file.ts',
      '@@ -0,0 +1,10 @@',
      '+console.log("hello");',
      'diff --git a/src/existing.ts b/src/existing.ts',
      'index abc1234..def5678 100644',
      '--- a/src/existing.ts',
      '+++ b/src/existing.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '+line2',
      'diff --git a/src/removed.ts b/src/removed.ts',
      'deleted file mode 100644',
      'index abc1234..0000000',
      '--- a/src/removed.ts',
      '+++ /dev/null',
    ].join('\n');

    const result = parseUnifiedDiffHeaders(diff);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('A\tsrc/new-file.ts');
    expect(lines[1]).toBe('M\tsrc/existing.ts');
    expect(lines[2]).toBe('D\tsrc/removed.ts');
  });

  it('handles renamed files with rename from/to markers', () => {
    const diff = [
      'diff --git a/old/path.ts b/new/path.ts',
      'similarity index 100%',
      'rename from old/path.ts',
      'rename to new/path.ts',
    ].join('\n');

    const result = parseUnifiedDiffHeaders(diff);

    expect(result).toBe('R100\told/path.ts\tnew/path.ts');
  });

  it('returns empty string for empty diff (no headers)', () => {
    expect(parseUnifiedDiffHeaders('')).toBe('');
  });

  it('returns empty string for diff with no diff --git headers', () => {
    const noHeaders = [
      'Some random text',
      'that is not a unified diff',
    ].join('\n');

    expect(parseUnifiedDiffHeaders(noHeaders)).toBe('');
  });

  it('handles binary files (no mode change lines)', () => {
    const diff = [
      'diff --git a/logo.png b/logo.png',
      'index abc1234..def5678 100644',
      'Binary files a/logo.png and b/logo.png differ',
    ].join('\n');

    const result = parseUnifiedDiffHeaders(diff);
    // Binary file with no mode change is treated as modified
    expect(result).toBe('M\tlogo.png');
  });

  it('handles multiple files including renames and copies', () => {
    const diff = [
      'diff --git a/src/alpha.ts b/src/alpha.ts',
      'new file mode 100644',
      'index 0000000..1111111',
      'diff --git a/src/beta.ts b/src/gamma.ts',
      'similarity index 95%',
      'rename from src/beta.ts',
      'rename to src/gamma.ts',
      'diff --git a/src/delta.ts b/src/delta.ts',
      'deleted file mode 100644',
      'index 2222222..0000000',
      'diff --git a/src/base.ts b/src/copy.ts',
      'similarity index 100%',
      'copy from src/base.ts',
      'copy to src/copy.ts',
    ].join('\n');

    const result = parseUnifiedDiffHeaders(diff);
    const lines = result.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('A\tsrc/alpha.ts');
    expect(lines[1]).toBe('R100\tsrc/beta.ts\tsrc/gamma.ts');
    expect(lines[2]).toBe('D\tsrc/delta.ts');
    // Copy uses 'C' status — the function handles copy from/to
    expect(lines[3]).toMatch(/^C\t/);
  });

  it('produces output that parseDiff can consume', () => {
    const diff = [
      'diff --git a/added.ts b/added.ts',
      'new file mode 100644',
      'diff --git a/modified.ts b/modified.ts',
      'index 111..222 100644',
      'diff --git a/old.ts b/new.ts',
      'rename from old.ts',
      'rename to new.ts',
    ].join('\n');

    const nameStatus = parseUnifiedDiffHeaders(diff);
    const parsed = parseDiff(nameStatus);

    expect(parsed.files).toHaveLength(3);
    expect(parsed.files[0]).toMatchObject({ status: 'added', path: 'added.ts' });
    expect(parsed.files[1]).toMatchObject({ status: 'modified', path: 'modified.ts' });
    expect(parsed.files[2]).toMatchObject({ status: 'renamed', path: 'new.ts', oldPath: 'old.ts' });
  });
});
