/**
 * Tests for Marketplace module (M4-8, Issue #108)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ManifestCategory,
  validateManifest,
  generateManifest,
  ExtensionAdapter,
  toExtensionConfig,
  fromExtensionEvent,
  registerExtension,
  packageForMarketplace,
  validatePackageContents,
  type MarketplaceManifest,
  type ExtensionEvent,
} from '@bradygaster/squad-sdk/marketplace';
import type { SquadConfig } from '@bradygaster/squad-sdk/config';

// --- Helpers ---

function makeManifest(overrides: Partial<MarketplaceManifest> = {}): MarketplaceManifest {
  return {
    name: overrides.name ?? 'test-extension',
    version: overrides.version ?? '1.0.0',
    description: overrides.description ?? 'A test marketplace extension for Squad',
    author: overrides.author ?? 'test-author',
    repository: overrides.repository ?? 'https://github.com/test/repo',
    categories: overrides.categories ?? [ManifestCategory.Development],
    tags: overrides.tags ?? ['test', 'squad'],
    icon: overrides.icon ?? 'icon.png',
    screenshots: overrides.screenshots ?? ['screenshot1.png'],
    pricing: overrides.pricing ?? { model: 'free' },
  };
}

function makeConfig(overrides: Partial<SquadConfig> = {}): SquadConfig {
  return {
    version: overrides.version ?? '0.6.0',
    team: overrides.team ?? { name: 'Test Squad', description: 'A test squad team' },
    routing: overrides.routing ?? { rules: [], fallbackBehavior: 'coordinator' },
    models: overrides.models ?? {
      default: 'claude-sonnet-4',
      defaultTier: 'standard',
      tiers: { standard: ['claude-sonnet-4'], fast: ['claude-haiku-4.5'] },
    },
    agents: overrides.agents ?? [
      { name: 'coder', role: 'developer', tools: ['edit', 'terminal'] },
      { name: 'reviewer', role: 'reviewer', tools: ['edit'] },
    ],
  };
}

// --- ManifestCategory enum ---

describe('ManifestCategory', () => {
  it('should have all required category values', () => {
    expect(ManifestCategory.Productivity).toBe('productivity');
    expect(ManifestCategory.Development).toBe('development');
    expect(ManifestCategory.Testing).toBe('testing');
    expect(ManifestCategory.DevOps).toBe('devops');
    expect(ManifestCategory.Documentation).toBe('documentation');
    expect(ManifestCategory.Security).toBe('security');
    expect(ManifestCategory.Other).toBe('other');
  });

  it('should have exactly 7 categories', () => {
    const values = Object.values(ManifestCategory);
    expect(values).toHaveLength(7);
  });
});

// --- validateManifest ---

describe('validateManifest', () => {
  it('should pass for a valid manifest', () => {
    const result = validateManifest(makeManifest());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should error on missing name', () => {
    const result = validateManifest(makeManifest({ name: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('should error on invalid name format', () => {
    const result = validateManifest(makeManifest({ name: 'Bad Name!' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('should error on missing version', () => {
    const result = validateManifest(makeManifest({ version: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('should error on invalid semver', () => {
    const result = validateManifest(makeManifest({ version: 'abc' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('semver'))).toBe(true);
  });

  it('should error on missing description', () => {
    const result = validateManifest(makeManifest({ description: '' }));
    expect(result.valid).toBe(false);
  });

  it('should warn on short description', () => {
    const result = validateManifest(makeManifest({ description: 'Short' }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('10 characters'))).toBe(true);
  });

  it('should error on empty categories', () => {
    const result = validateManifest(makeManifest({ categories: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('category'))).toBe(true);
  });

  it('should error on invalid category value', () => {
    const result = validateManifest(makeManifest({ categories: ['invalid' as ManifestCategory] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid category'))).toBe(true);
  });

  it('should warn when tags are empty', () => {
    const result = validateManifest(makeManifest({ tags: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('tags'))).toBe(true);
  });

  it('should error on missing icon', () => {
    const result = validateManifest(makeManifest({ icon: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('icon'))).toBe(true);
  });

  it('should warn when screenshots are empty', () => {
    const result = validateManifest(makeManifest({ screenshots: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('screenshots'))).toBe(true);
  });

  it('should error on invalid pricing model', () => {
    const result = validateManifest(makeManifest({ pricing: { model: 'enterprise' as 'free' } }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pricing'))).toBe(true);
  });
});

// --- generateManifest ---

describe('generateManifest', () => {
  it('should generate a manifest from squad config', () => {
    const config = makeConfig();
    const manifest = generateManifest(config);
    expect(manifest.name).toBe('test-squad');
    expect(manifest.version).toBe('0.6.0');
    expect(manifest.categories).toContain(ManifestCategory.Development);
  });

  it('should use team description when available', () => {
    const config = makeConfig({ team: { name: 'My Team', description: 'Custom desc' } });
    const manifest = generateManifest(config);
    expect(manifest.description).toBe('Custom desc');
  });

  it('should generate fallback description when none provided', () => {
    const config = makeConfig({ team: { name: 'My Team' } });
    const manifest = generateManifest(config);
    expect(manifest.description).toContain('My Team');
  });

  it('should slugify team name for manifest name', () => {
    const config = makeConfig({ team: { name: 'My Great Team!' } });
    const manifest = generateManifest(config);
    expect(manifest.name).toBe('my-great-team');
  });

  it('should extract agent roles as tags', () => {
    const config = makeConfig();
    const manifest = generateManifest(config);
    expect(manifest.tags).toContain('developer');
    expect(manifest.tags).toContain('reviewer');
  });
});

// --- toExtensionConfig ---

describe('toExtensionConfig', () => {
  it('should convert squad config to extension config shape', () => {
    const config = makeConfig();
    const ext = toExtensionConfig(config);
    expect(ext.id).toBe('test-squad');
    expect(ext.name).toBe('Test Squad');
    expect(ext.version).toBe('0.6.0');
    expect(ext.agents).toHaveLength(2);
  });

  it('should de-duplicate tools across agents', () => {
    const config = makeConfig();
    const ext = toExtensionConfig(config);
    // 'edit' appears in both agents but should be listed once
    const editCount = ext.tools.filter((t) => t === 'edit').length;
    expect(editCount).toBe(1);
  });

  it('should include all unique tools', () => {
    const config = makeConfig();
    const ext = toExtensionConfig(config);
    expect(ext.tools).toContain('edit');
    expect(ext.tools).toContain('terminal');
  });
});

// --- fromExtensionEvent ---

describe('fromExtensionEvent', () => {
  it('should map user.message to message', () => {
    const event: ExtensionEvent = {
      type: 'user.message',
      timestamp: new Date().toISOString(),
      payload: { text: 'hello' },
    };
    const result = fromExtensionEvent(event);
    expect(result.type).toBe('message');
    expect(result.data).toEqual({ text: 'hello' });
    expect(result.receivedAt).toBeDefined();
  });

  it('should map tool.invoke to tool_call', () => {
    const event: ExtensionEvent = {
      type: 'tool.invoke',
      timestamp: new Date().toISOString(),
      payload: { tool: 'edit', args: {} },
    };
    const result = fromExtensionEvent(event);
    expect(result.type).toBe('tool_call');
  });

  it('should map session.start to session_init', () => {
    const event: ExtensionEvent = {
      type: 'session.start',
      timestamp: new Date().toISOString(),
      payload: {},
    };
    expect(fromExtensionEvent(event).type).toBe('session_init');
  });

  it('should map session.end to session_close', () => {
    const event: ExtensionEvent = {
      type: 'session.end',
      timestamp: new Date().toISOString(),
      payload: {},
    };
    expect(fromExtensionEvent(event).type).toBe('session_close');
  });
});

// --- registerExtension ---

describe('registerExtension', () => {
  it('should succeed with valid manifest', () => {
    const result = registerExtension(makeManifest());
    expect(result.success).toBe(true);
    expect(result.extensionId).toContain('test-extension');
    expect(result.errors).toHaveLength(0);
  });

  it('should fail with missing name', () => {
    const result = registerExtension(makeManifest({ name: '' }));
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail with missing version', () => {
    const result = registerExtension(makeManifest({ version: '' }));
    expect(result.success).toBe(false);
  });
});

// --- ExtensionAdapter class ---

describe('ExtensionAdapter', () => {
  it('should expose toExtensionConfig as instance method', () => {
    const adapter = new ExtensionAdapter(makeConfig());
    const ext = adapter.toExtensionConfig();
    expect(ext.name).toBe('Test Squad');
  });

  it('should expose fromExtensionEvent as instance method', () => {
    const adapter = new ExtensionAdapter(makeConfig());
    const event: ExtensionEvent = {
      type: 'user.message',
      timestamp: new Date().toISOString(),
      payload: { text: 'hi' },
    };
    expect(adapter.fromExtensionEvent(event).type).toBe('message');
  });

  it('should expose registerExtension as instance method', () => {
    const adapter = new ExtensionAdapter(makeConfig());
    const result = adapter.registerExtension(makeManifest());
    expect(result.success).toBe(true);
  });
});

// --- packageForMarketplace ---

describe('packageForMarketplace', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join('test-fixtures', `pkg-test-${randomUUID()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should throw if project directory does not exist', () => {
    // Use a UUID-based path to guarantee it doesn't exist on any OS
    const fakePath = path.join(tmpDir, `nonexistent-${randomUUID()}`);
    expect(() =>
      packageForMarketplace(fakePath, makeManifest()),
    ).toThrow('not found');
  });

  it('should write manifest.json and return it in files', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test');
    fs.writeFileSync(path.join(tmpDir, 'icon.png'), 'fake');
    fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'dist', 'index.js'), '');

    const result = packageForMarketplace(tmpDir, makeManifest());
    expect(result.files).toContain('manifest.json');
    expect(fs.existsSync(path.join(tmpDir, 'manifest.json'))).toBe(true);
  });

  it('should warn when README.md is missing', () => {
    fs.writeFileSync(path.join(tmpDir, 'icon.png'), 'fake');
    fs.mkdirSync(path.join(tmpDir, 'dist'));
    const result = packageForMarketplace(tmpDir, makeManifest());
    expect(result.warnings.some((w) => w.includes('README'))).toBe(true);
  });

  it('should warn when dist/ is missing', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test');
    fs.writeFileSync(path.join(tmpDir, 'icon.png'), 'fake');
    const result = packageForMarketplace(tmpDir, makeManifest());
    expect(result.warnings.some((w) => w.includes('dist/'))).toBe(true);
  });

  it('should compute output path with name and version', () => {
    fs.mkdirSync(path.join(tmpDir, 'dist'));
    const result = packageForMarketplace(tmpDir, makeManifest());
    expect(result.outputPath).toContain('test-extension-1.0.0.squad-pkg');
  });
});

// --- validatePackageContents ---

describe('validatePackageContents', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join('test-fixtures', `validate-test-${randomUUID()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should fail if path does not exist', () => {
    const result = validatePackageContents('/nonexistent-path');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail when required files are missing', () => {
    const result = validatePackageContents(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles.length).toBeGreaterThan(0);
  });

  it('should pass when all required files are present', () => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme');
    fs.writeFileSync(path.join(tmpDir, 'icon.png'), 'fake');
    fs.mkdirSync(path.join(tmpDir, 'dist'));

    const result = validatePackageContents(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should report missing dist/ directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme');
    fs.writeFileSync(path.join(tmpDir, 'icon.png'), 'fake');

    const result = validatePackageContents(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('dist/');
  });

  it('should report missing icon', () => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme');
    fs.mkdirSync(path.join(tmpDir, 'dist'));

    const result = validatePackageContents(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('icon');
  });
});
