/**
 * Squad Workstreams — Comprehensive Tests
 *
 * Tests cover:
 *   - Workstream types (compile-time, verified via usage)
 *   - Workstream resolution (env var, file, config, fallback)
 *   - Label-based filtering (match, no match, multiple labels, case insensitive)
 *   - Config loading / validation
 *   - CLI activate command (writes .squad-workstream)
 *   - Init with workstreams (generates workstreams.json)
 *   - Edge cases (empty workstreams, invalid JSON, missing env, passthrough)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  loadWorkstreamsConfig,
  resolveWorkstream,
  getWorkstreamLabelFilter,
  filterIssuesByWorkstream,
} from '../packages/squad-sdk/src/streams/index.js';

import type {
  WorkstreamDefinition,
  WorkstreamConfig,
  ResolvedWorkstream,
  WorkstreamIssue,
} from '../packages/squad-sdk/src/streams/index.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-workstreams-test-'));
}

function writeSquadWorkstreamsConfig(root: string, config: WorkstreamConfig): void {
  const squadDir = path.join(root, '.squad');
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(path.join(squadDir, 'workstreams.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function writeSquadWorkstreamFile(root: string, name: string): void {
  fs.writeFileSync(path.join(root, '.squad-workstream'), name + '\n', 'utf-8');
}

const SAMPLE_CONFIG: WorkstreamConfig = {
  workstreams: [
    { name: 'ui-team', labelFilter: 'team:ui', folderScope: ['apps/web'], workflow: 'branch-per-issue', description: 'UI specialists' },
    { name: 'backend-team', labelFilter: 'team:backend', folderScope: ['apps/api'], workflow: 'direct' },
    { name: 'infra-team', labelFilter: 'team:infra' },
  ],
  defaultWorkflow: 'branch-per-issue',
};

const SAMPLE_ISSUES: WorkstreamIssue[] = [
  { number: 1, title: 'Fix button color', labels: [{ name: 'team:ui' }, { name: 'bug' }] },
  { number: 2, title: 'Add REST endpoint', labels: [{ name: 'team:backend' }] },
  { number: 3, title: 'Setup CI', labels: [{ name: 'team:infra' }] },
  { number: 4, title: 'Unscoped issue', labels: [{ name: 'bug' }] },
  { number: 5, title: 'Multi-label', labels: [{ name: 'team:ui' }, { name: 'team:backend' }] },
];

// ============================================================================
// loadStreamsConfig
// ============================================================================

describe('loadWorkstreamsConfig', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns null when .squad/workstreams.json does not exist', () => {
    expect(loadWorkstreamsConfig(tmpDir)).toBeNull();
  });

  it('loads a valid workstreams config', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadWorkstreamsConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.workstreams).toHaveLength(3);
    expect(result!.defaultWorkflow).toBe('branch-per-issue');
  });

  it('returns null for invalid JSON', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'workstreams.json'), '{invalid', 'utf-8');
    expect(loadWorkstreamsConfig(tmpDir)).toBeNull();
  });

  it('returns null when workstreams array is missing', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'workstreams.json'), '{"defaultWorkflow":"direct"}', 'utf-8');
    expect(loadWorkstreamsConfig(tmpDir)).toBeNull();
  });

  it('defaults defaultWorkflow to branch-per-issue when missing', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'workstreams.json'), '{"workstreams":[{"name":"a","labelFilter":"x"}]}', 'utf-8');
    const result = loadWorkstreamsConfig(tmpDir);
    expect(result!.defaultWorkflow).toBe('branch-per-issue');
  });

  it('preserves folderScope arrays', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadWorkstreamsConfig(tmpDir)!;
    expect(result.workstreams[0]!.folderScope).toEqual(['apps/web']);
  });

  it('preserves optional description', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadWorkstreamsConfig(tmpDir)!;
    expect(result.workstreams[0]!.description).toBe('UI specialists');
    expect(result.workstreams[1]!.description).toBeUndefined();
  });
});

// ============================================================================
// resolveStream
// ============================================================================

describe('resolveWorkstream', () => {
  let tmpDir: string;
  const origEnv = process.env.SQUAD_TEAM;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    delete process.env.SQUAD_TEAM;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.SQUAD_TEAM = origEnv;
    } else {
      delete process.env.SQUAD_TEAM;
    }
  });

  // --- Env var resolution ---

  it('resolves from SQUAD_TEAM env var with matching config', () => {
    process.env.SQUAD_TEAM = 'ui-team';
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:ui');
    expect(result!.definition.folderScope).toEqual(['apps/web']);
  });

  it('synthesizes definition from SQUAD_TEAM when no config exists', () => {
    process.env.SQUAD_TEAM = 'custom-team';
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('custom-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:custom-team');
  });

  it('synthesizes definition from SQUAD_TEAM when workstream not in config', () => {
    process.env.SQUAD_TEAM = 'unknown-team';
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('unknown-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:unknown-team');
  });

  // --- File resolution ---

  it('resolves from .squad-workstream file with matching config', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadWorkstreamFile(tmpDir, 'backend-team');
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('backend-team');
    expect(result!.source).toBe('file');
    expect(result!.definition.workflow).toBe('direct');
  });

  it('synthesizes definition from .squad-workstream file when no config', () => {
    writeSquadWorkstreamFile(tmpDir, 'my-workstream');
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-workstream');
    expect(result!.source).toBe('file');
    expect(result!.definition.labelFilter).toBe('team:my-workstream');
  });

  it('ignores empty .squad-workstream file', () => {
    fs.writeFileSync(path.join(tmpDir, '.squad-workstream'), '   \n', 'utf-8');
    expect(resolveWorkstream(tmpDir)).toBeNull();
  });

  it('trims whitespace from .squad-workstream file', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    fs.writeFileSync(path.join(tmpDir, '.squad-workstream'), '  ui-team  \n', 'utf-8');
    const result = resolveWorkstream(tmpDir);
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('file');
  });

  // --- Config resolution (single workstream auto-select) ---

  it('auto-selects single workstream from config', () => {
    const singleConfig: WorkstreamConfig = {
      workstreams: [{ name: 'solo', labelFilter: 'team:solo' }],
      defaultWorkflow: 'direct',
    };
    writeSquadWorkstreamsConfig(tmpDir, singleConfig);
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('solo');
    expect(result!.source).toBe('config');
  });

  // --- Fallback ---

  it('returns null when no workstream context exists', () => {
    expect(resolveWorkstream(tmpDir)).toBeNull();
  });

  it('returns null when config has multiple workstreams but no env/file', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    expect(resolveWorkstream(tmpDir)).toBeNull();
  });

  // --- Priority order ---

  it('env var takes priority over .squad-workstream file', () => {
    process.env.SQUAD_TEAM = 'ui-team';
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadWorkstreamFile(tmpDir, 'backend-team');
    const result = resolveWorkstream(tmpDir);
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('env');
  });

  it('.squad-workstream file takes priority over config auto-select', () => {
    const singleConfig: WorkstreamConfig = {
      workstreams: [
        { name: 'alpha', labelFilter: 'team:alpha' },
      ],
      defaultWorkflow: 'branch-per-issue',
    };
    writeSquadWorkstreamsConfig(tmpDir, singleConfig);
    writeSquadWorkstreamFile(tmpDir, 'alpha');
    const result = resolveWorkstream(tmpDir);
    // file source takes priority
    expect(result!.source).toBe('file');
  });
});

// ============================================================================
// getStreamLabelFilter
// ============================================================================

describe('getWorkstreamLabelFilter', () => {
  it('returns the label filter from definition', () => {
    const workstream: ResolvedWorkstream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(getWorkstreamLabelFilter(workstream)).toBe('team:ui');
  });

  it('returns synthesized label filter', () => {
    const workstream: ResolvedWorkstream = {
      name: 'custom',
      definition: { name: 'custom', labelFilter: 'team:custom' },
      source: 'file',
    };
    expect(getWorkstreamLabelFilter(workstream)).toBe('team:custom');
  });
});

// ============================================================================
// filterIssuesByStream
// ============================================================================

describe('filterIssuesByWorkstream', () => {
  it('filters issues matching the workstream label', () => {
    const workstream: ResolvedWorkstream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    const result = filterIssuesByWorkstream(SAMPLE_ISSUES, workstream);
    expect(result).toHaveLength(2); // issue 1 and 5
    expect(result.map(i => i.number)).toEqual([1, 5]);
  });

  it('returns empty array when no issues match', () => {
    const workstream: ResolvedWorkstream = {
      name: 'qa-team',
      definition: { name: 'qa-team', labelFilter: 'team:qa' },
      source: 'env',
    };
    const result = filterIssuesByWorkstream(SAMPLE_ISSUES, workstream);
    expect(result).toHaveLength(0);
  });

  it('handles case-insensitive matching', () => {
    const workstream: ResolvedWorkstream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'TEAM:UI' },
      source: 'env',
    };
    const result = filterIssuesByWorkstream(SAMPLE_ISSUES, workstream);
    expect(result).toHaveLength(2);
  });

  it('returns all issues when labelFilter is empty', () => {
    const workstream: ResolvedWorkstream = {
      name: 'all',
      definition: { name: 'all', labelFilter: '' },
      source: 'env',
    };
    const result = filterIssuesByWorkstream(SAMPLE_ISSUES, workstream);
    expect(result).toHaveLength(SAMPLE_ISSUES.length);
  });

  it('handles issues with no labels', () => {
    const issues: WorkstreamIssue[] = [
      { number: 10, title: 'No labels', labels: [] },
    ];
    const workstream: ResolvedWorkstream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(filterIssuesByWorkstream(issues, workstream)).toHaveLength(0);
  });

  it('handles empty issues array', () => {
    const workstream: ResolvedWorkstream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(filterIssuesByWorkstream([], workstream)).toHaveLength(0);
  });

  it('filters backend-team correctly', () => {
    const workstream: ResolvedWorkstream = {
      name: 'backend-team',
      definition: { name: 'backend-team', labelFilter: 'team:backend' },
      source: 'config',
    };
    const result = filterIssuesByWorkstream(SAMPLE_ISSUES, workstream);
    expect(result).toHaveLength(2); // issue 2 and 5
    expect(result.map(i => i.number)).toEqual([2, 5]);
  });

  it('filters infra-team correctly (single match)', () => {
    const workstream: ResolvedWorkstream = {
      name: 'infra-team',
      definition: { name: 'infra-team', labelFilter: 'team:infra' },
      source: 'file',
    };
    const result = filterIssuesByWorkstream(SAMPLE_ISSUES, workstream);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(3);
  });
});

// ============================================================================
// Type checks (compile-time — these just verify the types work)
// ============================================================================

describe('Workstream types', () => {
  it('WorkstreamDefinition accepts all fields', () => {
    const def: WorkstreamDefinition = {
      name: 'test',
      labelFilter: 'team:test',
      folderScope: ['src/'],
      workflow: 'branch-per-issue',
      description: 'Test workstream',
    };
    expect(def.name).toBe('test');
    expect(def.workflow).toBe('branch-per-issue');
  });

  it('WorkstreamDefinition works with minimal fields', () => {
    const def: WorkstreamDefinition = {
      name: 'minimal',
      labelFilter: 'team:minimal',
    };
    expect(def.folderScope).toBeUndefined();
    expect(def.workflow).toBeUndefined();
    expect(def.description).toBeUndefined();
  });

  it('WorkstreamConfig has required fields', () => {
    const config: WorkstreamConfig = {
      workstreams: [],
      defaultWorkflow: 'direct',
    };
    expect(config.workstreams).toEqual([]);
    expect(config.defaultWorkflow).toBe('direct');
  });

  it('ResolvedWorkstream has source provenance', () => {
    const resolved: ResolvedWorkstream = {
      name: 'test',
      definition: { name: 'test', labelFilter: 'x' },
      source: 'env',
    };
    expect(resolved.source).toBe('env');
  });
});

// ============================================================================
// Init integration (streams.json generation)
// ============================================================================

describe('initSquad with workstreams', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('generates workstreams.json when streams option is provided', async () => {
    const { initSquad } = await import('../packages/squad-sdk/src/config/init.js');
    const streams: WorkstreamDefinition[] = [
      { name: 'ui-team', labelFilter: 'team:ui', folderScope: ['apps/web'] },
      { name: 'api-team', labelFilter: 'team:api' },
    ];

    await initSquad({
      teamRoot: tmpDir,
      projectName: 'test-workstreams',
      agents: [{ name: 'lead', role: 'lead' }],
      streams,
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const workstreamsPath = path.join(tmpDir, '.squad', 'workstreams.json');
    expect(fs.existsSync(workstreamsPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(workstreamsPath, 'utf-8')) as WorkstreamConfig;
    expect(content.workstreams).toHaveLength(2);
    expect(content.workstreams[0]!.name).toBe('ui-team');
    expect(content.defaultWorkflow).toBe('branch-per-issue');
  });

  it('does not generate workstreams.json when no streams provided', async () => {
    const { initSquad } = await import('../packages/squad-sdk/src/config/init.js');

    await initSquad({
      teamRoot: tmpDir,
      projectName: 'test-no-workstreams',
      agents: [{ name: 'lead', role: 'lead' }],
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const workstreamsPath = path.join(tmpDir, '.squad', 'workstreams.json');
    expect(fs.existsSync(workstreamsPath)).toBe(false);
  });

  it('adds .squad-workstream to .gitignore', async () => {
    const { initSquad } = await import('../packages/squad-sdk/src/config/init.js');

    await initSquad({
      teamRoot: tmpDir,
      projectName: 'test-gitignore',
      agents: [{ name: 'lead', role: 'lead' }],
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const gitignorePath = path.join(tmpDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.squad-workstream');
  });
});

// ============================================================================
// CLI activate (unit test the file-writing behavior)
// ============================================================================

describe('CLI activate behavior', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes .squad-workstream file with the workstream name', () => {
    const filePath = path.join(tmpDir, '.squad-workstream');
    fs.writeFileSync(filePath, 'my-workstream\n', 'utf-8');
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    expect(content).toBe('my-workstream');
  });

  it('resolves after activation', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadWorkstreamFile(tmpDir, 'infra-team');
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('infra-team');
    expect(result!.definition.labelFilter).toBe('team:infra');
  });

  it('overwriting .squad-workstream changes active workstream', () => {
    writeSquadWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadWorkstreamFile(tmpDir, 'ui-team');
    expect(resolveWorkstream(tmpDir)!.name).toBe('ui-team');

    writeSquadWorkstreamFile(tmpDir, 'backend-team');
    expect(resolveWorkstream(tmpDir)!.name).toBe('backend-team');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('Edge cases', () => {
  let tmpDir: string;
  const origEnv = process.env.SQUAD_TEAM;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    delete process.env.SQUAD_TEAM;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.SQUAD_TEAM = origEnv;
    } else {
      delete process.env.SQUAD_TEAM;
    }
  });

  it('handles empty workstreams array in config', () => {
    const emptyConfig: WorkstreamConfig = { workstreams: [], defaultWorkflow: 'direct' };
    writeSquadWorkstreamsConfig(tmpDir, emptyConfig);
    expect(resolveWorkstream(tmpDir)).toBeNull();
  });

  it('handles config with workstreams but non-array type', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'workstreams.json'), '{"workstreams":"not-array"}', 'utf-8');
    expect(loadWorkstreamsConfig(tmpDir)).toBeNull();
  });

  it('handles SQUAD_TEAM set to empty string', () => {
    process.env.SQUAD_TEAM = '';
    expect(resolveWorkstream(tmpDir)).toBeNull();
  });

  it('filterIssuesByWorkstream handles labels with special characters', () => {
    const issues: WorkstreamIssue[] = [
      { number: 1, title: 'Test', labels: [{ name: 'team:front-end/ui' }] },
    ];
    const workstream: ResolvedWorkstream = {
      name: 'fe',
      definition: { name: 'fe', labelFilter: 'team:front-end/ui' },
      source: 'env',
    };
    const result = filterIssuesByWorkstream(issues, workstream);
    expect(result).toHaveLength(1);
  });

  it('resolves workflow from definition over defaultWorkflow', () => {
    const config: WorkstreamConfig = {
      workstreams: [{ name: 'direct-workstream', labelFilter: 'team:direct', workflow: 'direct' }],
      defaultWorkflow: 'branch-per-issue',
    };
    writeSquadWorkstreamsConfig(tmpDir, config);
    const result = resolveWorkstream(tmpDir);
    expect(result!.definition.workflow).toBe('direct');
  });
});
