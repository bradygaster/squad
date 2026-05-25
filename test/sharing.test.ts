/**
 * M5 Sharing tests: export, import, and history splitting
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exportSquadConfig,
  serializeBundle,
  sanitizeContent,
  anonymizeContent,
  type ExportBundle,
  type ExportOptions,
} from '@bradygaster/squad-sdk/sharing';
import {
  importSquadConfig,
  deserializeBundle,
  validateBundle,
} from '@bradygaster/squad-sdk/sharing';
import {
  splitHistory,
  mergeHistory,
  type AgentHistory,
  type HistoryEntry,
} from '@bradygaster/squad-sdk/sharing';

// --- Helpers ---

const TEST_DIR = join(process.cwd(), 'test-fixtures', 'sharing-test');
const IMPORT_DIR = join(process.cwd(), 'test-fixtures', 'sharing-import');

function setupProjectDir(): void {
  mkdirSync(join(TEST_DIR, '.github', 'agents'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.ai-team', 'skills'), { recursive: true });

  writeFileSync(
    join(TEST_DIR, '.ai-team', 'team.md'),
    '# Team Config\n\nA test team.\n',
  );
  writeFileSync(
    join(TEST_DIR, '.github', 'agents', 'fenster.agent.md'),
    '# Fenster\n\nCore developer agent.\n',
  );
  writeFileSync(
    join(TEST_DIR, '.github', 'agents', 'ralph.agent.md'),
    '# Ralph\n\nReview agent.\n',
  );
  writeFileSync(
    join(TEST_DIR, '.ai-team', 'routing.md'),
    '# Routing\n\n- `build/*` → fenster\n- `review/*` → ralph\n',
  );
  writeFileSync(
    join(TEST_DIR, '.ai-team', 'skills', 'typescript.md'),
    '# TypeScript skill\n',
  );
}

function makeBundle(overrides?: Partial<ExportBundle>): ExportBundle {
  return {
    config: { teamFile: 'test config' },
    agents: [
      { name: 'fenster', role: 'fenster', content: '# Fenster\nCore dev.' },
      { name: 'ralph', role: 'ralph', content: '# Ralph\nReviewer.' },
    ],
    skills: ['typescript'],
    routingRules: [{ pattern: 'build/*', agent: 'fenster' }],
    metadata: {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      source: '/test',
    },
    ...overrides,
  };
}

function makeEntry(overrides?: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: 'entry-1',
    timestamp: new Date().toISOString(),
    type: 'decision',
    content: 'Decided to use ESM modules for the build.',
    agent: 'fenster',
    ...overrides,
  };
}

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  rmSync(IMPORT_DIR, { recursive: true, force: true });
  setupProjectDir();
  mkdirSync(IMPORT_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  rmSync(IMPORT_DIR, { recursive: true, force: true });
});

// ========== Export ==========

describe('Export', () => {
  it('should export squad config with agents', () => {
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.agents).toHaveLength(2);
    expect(bundle.agents.some(a => a.name === 'fenster')).toBe(true);
    expect(bundle.agents.some(a => a.name === 'ralph')).toBe(true);
  });

  it('should export routing rules', () => {
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.routingRules.length).toBeGreaterThanOrEqual(1);
    expect(bundle.routingRules.some(r => r.agent === 'fenster')).toBe(true);
  });

  it('should export raw routing file content', () => {
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.routingFile).toBeDefined();
    expect(bundle.routingFile).toContain('build/*');
    expect(bundle.routingFile).toContain('fenster');
  });

  it('should not include routingFile when routing.md is missing', () => {
    rmSync(join(TEST_DIR, '.ai-team', 'routing.md'));
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.routingFile).toBeUndefined();
  });

  it('should anonymize routingFile content when anonymize option is set', () => {
    writeFileSync(
      join(TEST_DIR, '.ai-team', 'routing.md'),
      '# Routing\n\n- `build/*` → fenster\n\nContact: user@example.com\n',
    );
    const bundle = exportSquadConfig(TEST_DIR, { anonymize: true });
    expect(bundle.routingFile).toBeDefined();
    expect(bundle.routingFile).not.toContain('user@example.com');
    expect(bundle.routingFile).toContain('[email]');
  });

  it('should export skills when includeSkills is true', () => {
    const bundle = exportSquadConfig(TEST_DIR, { includeSkills: true });
    expect(bundle.skills).toContain('typescript');
  });

  it('should exclude skills when includeSkills is false', () => {
    const bundle = exportSquadConfig(TEST_DIR, { includeSkills: false });
    expect(bundle.skills).toHaveLength(0);
  });

  it('should include history array when includeHistory is true', () => {
    const bundle = exportSquadConfig(TEST_DIR, { includeHistory: true });
    expect(bundle.history).toBeDefined();
    expect(Array.isArray(bundle.history)).toBe(true);
  });

  it('should not include history by default', () => {
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.history).toBeUndefined();
  });

  it('should populate metadata', () => {
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.metadata.version).toBe('1.0.0');
    expect(bundle.metadata.timestamp).toBeTruthy();
    expect(bundle.metadata.source).toBe(TEST_DIR);
  });

  it('should anonymize source in metadata when anonymize option is set', () => {
    const bundle = exportSquadConfig(TEST_DIR, { anonymize: true });
    expect(bundle.metadata.source).toBe('[anonymized]');
  });

  it('should handle missing agents directory', () => {
    rmSync(join(TEST_DIR, '.github', 'agents'), { recursive: true });
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.agents).toHaveLength(0);
  });

  it('should handle missing routing file', () => {
    rmSync(join(TEST_DIR, '.ai-team', 'routing.md'));
    const bundle = exportSquadConfig(TEST_DIR);
    expect(bundle.routingRules).toHaveLength(0);
  });
});

// ========== Serialization ==========

describe('Serialization', () => {
  it('should serialize bundle to JSON', () => {
    const bundle = makeBundle();
    const json = serializeBundle(bundle, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.agents).toHaveLength(2);
    expect(parsed.metadata.version).toBe('1.0.0');
  });

  it('should serialize bundle to YAML-like format', () => {
    const bundle = makeBundle();
    const yaml = serializeBundle(bundle, 'yaml');
    expect(yaml).toContain('metadata:');
    expect(yaml).toContain('version:');
  });

  it('should default to JSON when no format specified', () => {
    const bundle = makeBundle();
    const result = serializeBundle(bundle);
    expect(() => JSON.parse(result)).not.toThrow();
  });
});

// ========== Sanitization ==========

describe('Sanitization', () => {
  it('should redact GitHub PATs', () => {
    const result = sanitizeContent('token: ghp_abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('ghp_');
  });

  it('should redact secret patterns', () => {
    const result = sanitizeContent('secret= "MySecretValueThatIsLong"');
    expect(result).toContain('[REDACTED]');
  });

  it('should leave normal text unchanged', () => {
    const result = sanitizeContent('This is normal content with no secrets.');
    expect(result).toBe('This is normal content with no secrets.');
  });

  it('should anonymize email addresses', () => {
    const result = anonymizeContent('Contact: user@example.com for help');
    expect(result).toContain('[email]');
    expect(result).not.toContain('user@example.com');
  });

  it('should anonymize absolute paths', () => {
    const result = anonymizeContent('Found at /home/user/projects/squad/file.ts');
    expect(result).toContain('[path]');
  });
});

// ========== Import ==========

describe('Import', () => {
  it('should deserialize a JSON bundle', () => {
    const bundle = makeBundle();
    const json = JSON.stringify(bundle);
    const result = deserializeBundle(json);
    expect(result.agents).toHaveLength(2);
    expect(result.metadata.version).toBe('1.0.0');
  });

  it('should throw on non-JSON input', () => {
    expect(() => deserializeBundle('not json')).toThrow('Only JSON format');
  });

  it('should validate a valid bundle', () => {
    const errors = validateBundle(makeBundle());
    expect(errors).toHaveLength(0);
  });

  it('should detect missing metadata', () => {
    const bundle = makeBundle();
    (bundle as any).metadata = undefined;
    const errors = validateBundle(bundle);
    expect(errors.some(e => e.field === 'metadata')).toBe(true);
  });

  it('should detect missing agents array', () => {
    const bundle = makeBundle();
    (bundle as any).agents = 'not-array';
    const errors = validateBundle(bundle);
    expect(errors.some(e => e.field === 'agents')).toBe(true);
  });

  it('should detect agent without name', () => {
    const bundle = makeBundle();
    bundle.agents[0].name = '';
    const errors = validateBundle(bundle);
    expect(errors.some(e => e.field.includes('agents[0]'))).toBe(true);
  });

  it('should detect missing config', () => {
    const bundle = makeBundle();
    (bundle as any).config = null;
    const errors = validateBundle(bundle);
    expect(errors.some(e => e.field === 'config')).toBe(true);
  });

  it('should import agents into target directory', () => {
    const bundle = makeBundle();
    const bundlePath = join(IMPORT_DIR, 'bundle.json');
    writeFileSync(bundlePath, JSON.stringify(bundle));

    const targetDir = join(IMPORT_DIR, 'target');
    mkdirSync(targetDir, { recursive: true });

    const result = importSquadConfig(bundlePath, targetDir);
    expect(result.success).toBe(true);
    expect(result.changes.some(c => c.type === 'added')).toBe(true);
    expect(existsSync(join(targetDir, '.github', 'agents', 'fenster.agent.md'))).toBe(true);
  });

  it('should import raw routingFile content when present', () => {
    const bundle = makeBundle();
    bundle.routingFile = '# Full Routing\n\n- `build/*` → fenster\n- `review/*` → ralph\n\n## Extra Context\nCustom notes here.\n';
    const bundlePath = join(IMPORT_DIR, 'bundle-routing.json');
    writeFileSync(bundlePath, JSON.stringify(bundle));

    const targetDir = join(IMPORT_DIR, 'target-routing');
    mkdirSync(targetDir, { recursive: true });

    const result = importSquadConfig(bundlePath, targetDir);
    expect(result.success).toBe(true);
    expect(result.changes.some(c => c.path === '.ai-team/routing.md')).toBe(true);
    const routingContent = readFileSync(join(targetDir, '.ai-team', 'routing.md'), 'utf-8');
    expect(routingContent).toContain('## Extra Context');
    expect(routingContent).toContain('Custom notes here.');
  });

  it('should import routing.md even when routingRules is empty but routingFile is present', () => {
    const bundle = makeBundle();
    bundle.routingRules = [];
    bundle.routingFile = '# Routing Rules\n\nNo structured rules, just notes.\n';
    const bundlePath = join(IMPORT_DIR, 'bundle-routing-only.json');
    writeFileSync(bundlePath, JSON.stringify(bundle));

    const targetDir = join(IMPORT_DIR, 'target-routing-only');
    mkdirSync(targetDir, { recursive: true });

    const result = importSquadConfig(bundlePath, targetDir);
    expect(result.success).toBe(true);
    expect(result.changes.some(c => c.path === '.ai-team/routing.md')).toBe(true);
    const routingContent = readFileSync(join(targetDir, '.ai-team', 'routing.md'), 'utf-8');
    expect(routingContent).toContain('No structured rules, just notes.');
  });

  it('should support dry run', () => {
    const bundle = makeBundle();
    const bundlePath = join(IMPORT_DIR, 'bundle.json');
    writeFileSync(bundlePath, JSON.stringify(bundle));

    const targetDir = join(IMPORT_DIR, 'target-dry');
    mkdirSync(targetDir, { recursive: true });

    const result = importSquadConfig(bundlePath, targetDir, { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(existsSync(join(targetDir, '.github', 'agents', 'fenster.agent.md'))).toBe(false);
  });

  it('should return error for missing bundle file', () => {
    const result = importSquadConfig('/nonexistent/bundle.json', IMPORT_DIR);
    expect(result.success).toBe(false);
    expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('should return error for invalid bundle content', () => {
    const bundlePath = join(IMPORT_DIR, 'bad.json');
    writeFileSync(bundlePath, 'not valid json');
    const result = importSquadConfig(bundlePath, IMPORT_DIR);
    expect(result.success).toBe(false);
  });

  it('should return validation errors for invalid bundle', () => {
    const bundlePath = join(IMPORT_DIR, 'invalid-bundle.json');
    writeFileSync(bundlePath, JSON.stringify({ agents: 'bad' }));
    const result = importSquadConfig(bundlePath, IMPORT_DIR);
    expect(result.success).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should skip validation when skipValidation is true', () => {
    const bundle = makeBundle();
    (bundle as any).metadata = undefined;
    const bundlePath = join(IMPORT_DIR, 'skip-val.json');
    writeFileSync(bundlePath, JSON.stringify(bundle));

    const targetDir = join(IMPORT_DIR, 'target-skip');
    mkdirSync(targetDir, { recursive: true });

    const result = importSquadConfig(bundlePath, targetDir, { skipValidation: true });
    // Should not fail on validation
    expect(result.warnings.length).toBe(0);
  });

  it('should skip existing files when merge is false', () => {
    const bundle = makeBundle();
    const bundlePath = join(IMPORT_DIR, 'bundle-nomerge.json');
    writeFileSync(bundlePath, JSON.stringify(bundle));

    const targetDir = join(IMPORT_DIR, 'target-nomerge');
    mkdirSync(join(targetDir, '.github', 'agents'), { recursive: true });
    writeFileSync(join(targetDir, '.github', 'agents', 'fenster.agent.md'), 'existing');

    const result = importSquadConfig(bundlePath, targetDir, { merge: false });
    expect(result.success).toBe(true);
    expect(result.changes.some(c => c.type === 'skipped' && c.path.includes('fenster'))).toBe(true);
    // File should not be overwritten
    expect(readFileSync(join(targetDir, '.github', 'agents', 'fenster.agent.md'), 'utf-8')).toBe('existing');
  });
});

// ========== History Splitting ==========

describe('History Splitting', () => {
  it('should keep decision entries as exportable', () => {
    const history: AgentHistory = {
      entries: [makeEntry({ type: 'decision' })],
    };
    const result = splitHistory(history);
    expect(result.exportable.entries).toHaveLength(1);
    expect(result.private.entries).toHaveLength(0);
  });

  it('should keep pattern entries as exportable', () => {
    const history: AgentHistory = {
      entries: [makeEntry({ type: 'pattern' })],
    };
    const result = splitHistory(history);
    expect(result.exportable.entries).toHaveLength(1);
  });

  it('should move interaction entries to private', () => {
    const history: AgentHistory = {
      entries: [makeEntry({ type: 'interaction' })],
    };
    const result = splitHistory(history);
    expect(result.private.entries).toHaveLength(1);
    expect(result.exportable.entries).toHaveLength(0);
  });

  it('should move error entries to private', () => {
    const history: AgentHistory = {
      entries: [makeEntry({ type: 'error' })],
    };
    const result = splitHistory(history);
    expect(result.private.entries).toHaveLength(1);
  });

  it('should exclude entries matching excludePatterns', () => {
    const history: AgentHistory = {
      entries: [makeEntry({ content: 'contains secret-keyword in text' })],
    };
    const result = splitHistory(history, { excludePatterns: ['secret-keyword'] });
    expect(result.private.entries).toHaveLength(1);
    expect(result.exportable.entries).toHaveLength(0);
  });

  it('should filter expired entries by maxAge', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 400);
    const history: AgentHistory = {
      entries: [makeEntry({ timestamp: oldDate.toISOString() })],
    };
    const result = splitHistory(history, { maxAge: 365 });
    expect(result.private.entries).toHaveLength(1);
    expect(result.exportable.entries).toHaveLength(0);
  });

  it('should anonymize entries when option is set', () => {
    const history: AgentHistory = {
      entries: [makeEntry({ content: 'Contact user@example.com for details' })],
    };
    const result = splitHistory(history, { anonymize: true });
    expect(result.exportable.entries[0].content).toContain('[REDACTED]');
    expect(result.exportable.entries[0].content).not.toContain('user@example.com');
  });

  it('should strip metadata during anonymization', () => {
    const history: AgentHistory = {
      entries: [makeEntry({ metadata: { secret: 'value' } })],
    };
    const result = splitHistory(history, { anonymize: true });
    expect(result.exportable.entries[0].metadata).toBeUndefined();
  });
});

// ========== History Merging ==========

describe('History Merging', () => {
  it('should merge two histories without duplicates', () => {
    const existing: AgentHistory = {
      entries: [makeEntry({ id: 'e1', content: 'First' })],
    };
    const imported: AgentHistory = {
      entries: [
        makeEntry({ id: 'e1', content: 'Duplicate' }),
        makeEntry({ id: 'e2', content: 'Second' }),
      ],
    };
    const merged = mergeHistory(existing, imported);
    expect(merged.entries).toHaveLength(2);
    // Existing entry takes precedence
    expect(merged.entries.find(e => e.id === 'e1')!.content).toBe('First');
  });

  it('should sort merged entries by timestamp', () => {
    const d1 = '2025-01-01T00:00:00Z';
    const d2 = '2025-06-01T00:00:00Z';
    const existing: AgentHistory = {
      entries: [makeEntry({ id: 'late', timestamp: d2 })],
    };
    const imported: AgentHistory = {
      entries: [makeEntry({ id: 'early', timestamp: d1 })],
    };
    const merged = mergeHistory(existing, imported);
    expect(merged.entries[0].id).toBe('early');
    expect(merged.entries[1].id).toBe('late');
  });

  it('should handle empty existing history', () => {
    const existing: AgentHistory = { entries: [] };
    const imported: AgentHistory = {
      entries: [makeEntry({ id: 'new1' })],
    };
    const merged = mergeHistory(existing, imported);
    expect(merged.entries).toHaveLength(1);
  });

  it('should handle empty imported history', () => {
    const existing: AgentHistory = {
      entries: [makeEntry({ id: 'existing1' })],
    };
    const imported: AgentHistory = { entries: [] };
    const merged = mergeHistory(existing, imported);
    expect(merged.entries).toHaveLength(1);
  });

  it('should preserve source from existing history', () => {
    const existing: AgentHistory = { entries: [], source: 'local' };
    const imported: AgentHistory = { entries: [], source: 'remote' };
    const merged = mergeHistory(existing, imported);
    expect(merged.source).toBe('local');
  });

  it('should fall back to imported source if existing has none', () => {
    const existing: AgentHistory = { entries: [] };
    const imported: AgentHistory = { entries: [], source: 'remote' };
    const merged = mergeHistory(existing, imported);
    expect(merged.source).toBe('remote');
  });
});
