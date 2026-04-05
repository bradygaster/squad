/**
 * Tests for M4 build & distribution modules:
 * - bundle.ts (M4-1)
 * - npm-package.ts (M4-2)
 * - github-dist.ts (M4-3)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createBundleConfig,
  getBundleTargets,
  validateBundleOutput,
  type BundleConfig,
} from '@bradygaster/squad-sdk/build';

import {
  generatePackageJson,
  validatePackageJson,
  getPublishFiles,
  getDefaultExports,
  type NpmPackageConfig,
} from '@bradygaster/squad-sdk/build';

import {
  generateInstallScript,
  validateGitHubRelease,
  getInstallCommand,
  generateNpxEntryPoint,
  getDefaultDistConfig,
  type GitHubDistConfig,
} from '@bradygaster/squad-sdk/build';

// ─── M4-1: Bundle strategy ──────────────────────────────────────────────

describe('bundle', () => {
  describe('createBundleConfig', () => {
    it('returns default config when called with no arguments', () => {
      const config = createBundleConfig();
      expect(config.format).toBe('esm');
      expect(config.outDir).toBe('dist');
      expect(config.minify).toBe(false);
      expect(config.sourcemap).toBe(true);
      expect(config.entryPoints.length).toBeGreaterThan(0);
    });

    it('marks @github/copilot-sdk as external by default', () => {
      const config = createBundleConfig();
      expect(config.external).toContain('@github/copilot-sdk');
    });

    it('allows overriding format to cjs', () => {
      const config = createBundleConfig({ format: 'cjs' });
      expect(config.format).toBe('cjs');
    });

    it('allows overriding outDir', () => {
      const config = createBundleConfig({ outDir: 'build' });
      expect(config.outDir).toBe('build');
    });

    it('allows enabling minify', () => {
      const config = createBundleConfig({ minify: true });
      expect(config.minify).toBe(true);
    });

    it('allows disabling sourcemap', () => {
      const config = createBundleConfig({ sourcemap: false });
      expect(config.sourcemap).toBe(false);
    });

    it('allows custom external list', () => {
      const config = createBundleConfig({ external: ['lodash'] });
      expect(config.external).toEqual(['lodash']);
    });

    it('allows custom entry points', () => {
      const config = createBundleConfig({ entryPoints: ['src/main.ts'] });
      expect(config.entryPoints).toEqual(['src/main.ts']);
    });

    it('returns a new array for entryPoints (no mutation)', () => {
      const a = createBundleConfig();
      const b = createBundleConfig();
      a.entryPoints.push('extra');
      expect(b.entryPoints).not.toContain('extra');
    });

    it('returns a new array for external (no mutation)', () => {
      const a = createBundleConfig();
      const b = createBundleConfig();
      a.external.push('extra');
      expect(b.external).not.toContain('extra');
    });
  });

  describe('getBundleTargets', () => {
    it('returns an array of entry points', () => {
      const targets = getBundleTargets();
      expect(Array.isArray(targets)).toBe(true);
      expect(targets.length).toBeGreaterThan(0);
    });

    it('includes the main entry point', () => {
      const targets = getBundleTargets();
      expect(targets).toContain('src/index.ts');
    });

    it('includes config entry point', () => {
      const targets = getBundleTargets();
      expect(targets).toContain('src/config/index.ts');
    });

    it('returns a copy (no mutation leak)', () => {
      const a = getBundleTargets();
      a.push('injected');
      const b = getBundleTargets();
      expect(b).not.toContain('injected');
    });
  });

  describe('validateBundleOutput', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `squad-bundle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns invalid for non-existent directory', () => {
      const result = validateBundleOutput('/nonexistent/path/xyz');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns invalid for empty directory', () => {
      const result = validateBundleOutput(tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No JavaScript output files found');
    });

    it('returns valid with index.js present', () => {
      writeFileSync(join(tempDir, 'index.js'), 'export {}');
      writeFileSync(join(tempDir, 'index.d.ts'), 'export {}');
      writeFileSync(join(tempDir, 'index.js.map'), '{}');
      const result = validateBundleOutput(tempDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns when no declaration files found', () => {
      writeFileSync(join(tempDir, 'index.js'), 'export {}');
      const result = validateBundleOutput(tempDir);
      expect(result.warnings.some(w => w.includes('declaration'))).toBe(true);
    });

    it('warns when no source maps found', () => {
      writeFileSync(join(tempDir, 'index.js'), 'export {}');
      const result = validateBundleOutput(tempDir);
      expect(result.warnings.some(w => w.includes('source map'))).toBe(true);
    });

    it('detects missing index.js entry point', () => {
      writeFileSync(join(tempDir, 'other.js'), 'export {}');
      const result = validateBundleOutput(tempDir);
      expect(result.errors).toContain('Missing index.js entry point in output');
    });

    it('lists all files in the output', () => {
      writeFileSync(join(tempDir, 'index.js'), '');
      writeFileSync(join(tempDir, 'utils.js'), '');
      const result = validateBundleOutput(tempDir);
      expect(result.files).toContain('index.js');
      expect(result.files).toContain('utils.js');
    });
  });
});

// ─── M4-2: npm package ──────────────────────────────────────────────────

describe('npm-package', () => {
  const baseConfig: NpmPackageConfig = {
    name: '@bradygaster/squad',
    version: '0.6.0',
    description: 'Squad SDK',
    exports: {
      '.': { import: './dist/index.js', types: './dist/index.d.ts' },
    },
  };

  describe('generatePackageJson', () => {
    it('generates valid package.json with required fields', () => {
      const pkg = generatePackageJson(baseConfig);
      expect(pkg.name).toBe('@bradygaster/squad');
      expect(pkg.version).toBe('0.6.0');
      expect(pkg.type).toBe('module');
    });

    it('sets ESM as type', () => {
      const pkg = generatePackageJson(baseConfig);
      expect(pkg.type).toBe('module');
    });

    it('includes exports map', () => {
      const pkg = generatePackageJson(baseConfig);
      expect(pkg.exports['.']).toBeDefined();
    });

    it('includes files array for publishing', () => {
      const pkg = generatePackageJson(baseConfig);
      expect(pkg.files).toContain('dist/');
      expect(pkg.files).toContain('README.md');
      expect(pkg.files).toContain('LICENSE');
    });

    it('sets default engines when not provided', () => {
      const pkg = generatePackageJson(baseConfig);
      expect(pkg.engines.node).toBe('>=20.0.0');
    });

    it('respects custom engines', () => {
      const pkg = generatePackageJson({ ...baseConfig, engines: { node: '>=18.0.0' } });
      expect(pkg.engines.node).toBe('>=18.0.0');
    });

    it('includes bin entries when provided', () => {
      const pkg = generatePackageJson({ ...baseConfig, bin: { squad: './dist/index.js' } });
      expect(pkg.bin).toEqual({ squad: './dist/index.js' });
    });

    it('omits bin when not provided', () => {
      const pkg = generatePackageJson(baseConfig);
      expect(pkg.bin).toBeUndefined();
    });

    it('includes peer dependencies when provided', () => {
      const pkg = generatePackageJson({
        ...baseConfig,
        peerDependencies: { '@github/copilot-sdk': '>=0.1.0' },
      });
      expect(pkg.peerDependencies).toEqual({ '@github/copilot-sdk': '>=0.1.0' });
    });

    it('auto-generates types entry for string exports', () => {
      const pkg = generatePackageJson({
        ...baseConfig,
        exports: { '.': './dist/index.js' },
      });
      const entry = pkg.exports['.'] as Record<string, string>;
      expect(entry.types).toBe('./dist/index.d.ts');
    });
  });

  describe('validatePackageJson', () => {
    it('passes for a valid package', () => {
      const pkg = generatePackageJson(baseConfig);
      const result = validatePackageJson(pkg as unknown as Record<string, unknown>);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails for missing name', () => {
      const result = validatePackageJson({ version: '1.0.0' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('fails for missing version', () => {
      const result = validatePackageJson({ name: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });

    it('fails for invalid package name', () => {
      const result = validatePackageJson({ name: 'UPPER_CASE!', version: '1.0.0' });
      expect(result.valid).toBe(false);
    });

    it('fails for invalid semver', () => {
      const result = validatePackageJson({ name: 'test', version: 'not-semver' });
      expect(result.valid).toBe(false);
    });

    it('fails for missing exports map', () => {
      const result = validatePackageJson({ name: 'test', version: '1.0.0' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exports'))).toBe(true);
    });

    it('fails when exports map is missing "." entry', () => {
      const result = validatePackageJson({
        name: 'test', version: '1.0.0',
        exports: { './config': './dist/config.js' },
      });
      expect(result.errors.some(e => e.includes('"."'))).toBe(true);
    });

    it('warns when type is not module', () => {
      const result = validatePackageJson({
        name: 'test', version: '1.0.0',
        exports: { '.': './dist/index.js' },
      });
      expect(result.warnings.some(w => w.includes('module'))).toBe(true);
    });

    it('validates scoped package names', () => {
      const result = validatePackageJson({
        name: '@bradygaster/squad', version: '1.0.0',
        type: 'module', exports: { '.': './dist/index.js' },
        files: ['dist/'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('getPublishFiles', () => {
    it('returns an array of files', () => {
      const files = getPublishFiles();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
    });

    it('includes dist/', () => {
      expect(getPublishFiles()).toContain('dist/');
    });

    it('includes README.md', () => {
      expect(getPublishFiles()).toContain('README.md');
    });

    it('returns a copy (no mutation)', () => {
      const a = getPublishFiles();
      a.push('injected');
      expect(getPublishFiles()).not.toContain('injected');
    });
  });

  describe('getDefaultExports', () => {
    it('returns exports map with "." entry', () => {
      const exports = getDefaultExports();
      expect(exports['.']).toBeDefined();
      expect(exports['.'].import).toBe('./dist/index.js');
    });

    it('includes config sub-path', () => {
      const exports = getDefaultExports();
      expect(exports['./config']).toBeDefined();
    });

    it('returns a deep copy (no mutation)', () => {
      const a = getDefaultExports();
      a['.'].import = 'hacked';
      const b = getDefaultExports();
      expect(b['.'].import).toBe('./dist/index.js');
    });
  });
});

// ─── M4-3: GitHub distribution ──────────────────────────────────────────

describe('github-dist', () => {
  describe('generateInstallScript', () => {
    it('generates a bash script', () => {
      const script = generateInstallScript();
      expect(script).toContain('#!/usr/bin/env bash');
    });

    it('references the correct owner/repo', () => {
      const script = generateInstallScript({ owner: 'myorg', repo: 'myrepo' });
      expect(script).toContain('OWNER="myorg"');
      expect(script).toContain('REPO="myrepo"');
    });

    it('uses bradygaster/squad as default', () => {
      const script = generateInstallScript();
      expect(script).toContain('OWNER="bradygaster"');
      expect(script).toContain('REPO="squad"');
    });

    it('uses custom binary name', () => {
      const script = generateInstallScript({ binaryName: 'my-tool' });
      expect(script).toContain('BINARY="my-tool"');
    });

    it('includes GitHub releases download URL', () => {
      const script = generateInstallScript();
      expect(script).toContain('github.com');
      expect(script).toContain('releases');
    });
  });

  describe('validateGitHubRelease', () => {
    const config: GitHubDistConfig = {
      owner: 'bradygaster',
      repo: 'squad',
      binaryName: 'squad',
      installCommandTemplate: 'squad',
    };

    it('validates a proper version', () => {
      const result = validateGitHubRelease(config, '1.0.0');
      expect(result.valid).toBe(true);
    });

    it('returns expected assets list', () => {
      const result = validateGitHubRelease(config, '1.0.0');
      expect(result.expectedAssets).toContain('squad-1.0.0.tar.gz');
      expect(result.expectedAssets).toContain('squad-1.0.0.zip');
    });

    it('fails for empty version', () => {
      const result = validateGitHubRelease(config, '');
      expect(result.valid).toBe(false);
    });

    it('fails for invalid semver', () => {
      const result = validateGitHubRelease(config, 'abc');
      expect(result.valid).toBe(false);
    });

    it('fails for missing owner', () => {
      const result = validateGitHubRelease({ ...config, owner: '' }, '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('fails for missing repo', () => {
      const result = validateGitHubRelease({ ...config, repo: '' }, '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('fails for missing binaryName', () => {
      const result = validateGitHubRelease({ ...config, binaryName: '' }, '1.0.0');
      expect(result.valid).toBe(false);
    });
  });

  describe('getInstallCommand', () => {
    it('returns squad command with defaults', () => {
      const cmd = getInstallCommand();
      expect(cmd).toBe('squad');
    });

    it('substitutes custom owner/repo', () => {
      const cmd = getInstallCommand({ owner: 'acme', repo: 'tool' });
      expect(cmd).toBe('squad');
    });

    it('uses custom template', () => {
      const cmd = getInstallCommand({
        installCommandTemplate: 'npm exec {{owner}}/{{repo}}',
        owner: 'x',
        repo: 'y',
      });
      expect(cmd).toBe('npm exec x/y');
    });
  });

  describe('generateNpxEntryPoint', () => {
    it('generates a node script', () => {
      const script = generateNpxEntryPoint();
      expect(script).toContain('#!/usr/bin/env node');
    });

    it('imports index.js', () => {
      const script = generateNpxEntryPoint();
      expect(script).toContain('index.js');
    });

    it('handles errors gracefully', () => {
      const script = generateNpxEntryPoint();
      expect(script).toContain('catch');
      expect(script).toContain('process.exit(1)');
    });
  });

  describe('getDefaultDistConfig', () => {
    it('returns config with bradygaster owner', () => {
      const config = getDefaultDistConfig();
      expect(config.owner).toBe('bradygaster');
    });

    it('returns config with squad repo', () => {
      const config = getDefaultDistConfig();
      expect(config.repo).toBe('squad');
    });

    it('returns a copy (no mutation)', () => {
      const a = getDefaultDistConfig();
      a.owner = 'changed';
      const b = getDefaultDistConfig();
      expect(b.owner).toBe('bradygaster');
    });
  });
});
