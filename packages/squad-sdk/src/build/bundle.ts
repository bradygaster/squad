/**
 * M4-1: Bundle strategy & esbuild configuration
 * Defines bundling strategy for the SDK: ESM output, tree-shakeable
 */

// TODO: readdirSync/statSync still use raw fs — StorageProvider needs sync list() and isDirectory() methods
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StorageProvider } from '../storage/storage-provider.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

export type BundleFormat = 'esm' | 'cjs';

export interface BundleConfig {
  entryPoints: string[];
  outDir: string;
  format: BundleFormat;
  minify: boolean;
  sourcemap: boolean;
  external: string[];
}

const DEFAULT_ENTRY_POINTS = [
  'src/index.ts',
  'src/config/index.ts',
  'src/agents/onboarding.ts',
  'src/casting/index.ts',
  'src/skills/index.ts',
  'src/runtime/config.ts',
  'src/runtime/streaming.ts',
  'src/runtime/cost-tracker.ts',
  'src/coordinator/response-tiers.ts',
];

const DEFAULT_EXTERNAL = [
  '@github/copilot-sdk',
];

const DEFAULT_CONFIG: BundleConfig = {
  entryPoints: DEFAULT_ENTRY_POINTS,
  outDir: 'dist',
  format: 'esm',
  minify: false,
  sourcemap: true,
  external: DEFAULT_EXTERNAL,
};

/**
 * Create a full BundleConfig with sensible defaults, optionally overriding fields.
 */
export function createBundleConfig(options?: Partial<BundleConfig>): BundleConfig {
  if (!options) {
    return { ...DEFAULT_CONFIG, entryPoints: [...DEFAULT_CONFIG.entryPoints], external: [...DEFAULT_CONFIG.external] };
  }
  return {
    entryPoints: options.entryPoints ? [...options.entryPoints] : [...DEFAULT_CONFIG.entryPoints],
    outDir: options.outDir ?? DEFAULT_CONFIG.outDir,
    format: options.format ?? DEFAULT_CONFIG.format,
    minify: options.minify ?? DEFAULT_CONFIG.minify,
    sourcemap: options.sourcemap ?? DEFAULT_CONFIG.sourcemap,
    external: options.external ? [...options.external] : [...DEFAULT_CONFIG.external],
  };
}

/**
 * Returns the list of entry points for the SDK build.
 */
export function getBundleTargets(): string[] {
  return [...DEFAULT_ENTRY_POINTS];
}

export interface BundleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  files: string[];
}

/**
 * Check that the output directory contains expected build artifacts.
 */
export function validateBundleOutput(outDir: string, storage: StorageProvider = new FSStorageProvider()): BundleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: string[] = [];

  const resolvedDir = resolve(outDir);

  if (!storage.existsSync(resolvedDir)) {
    return { valid: false, errors: [`Output directory does not exist: ${resolvedDir}`], warnings, files };
  }

  const stat = statSync(resolvedDir);
  if (!stat.isDirectory()) {
    return { valid: false, errors: [`Path is not a directory: ${resolvedDir}`], warnings, files };
  }

  collectFiles(resolvedDir, resolvedDir, files);

  const jsFiles = files.filter(f => f.endsWith('.js'));
  const dtsFiles = files.filter(f => f.endsWith('.d.ts'));
  const mapFiles = files.filter(f => f.endsWith('.js.map') || f.endsWith('.d.ts.map'));

  if (jsFiles.length === 0) {
    errors.push('No JavaScript output files found');
  }

  if (dtsFiles.length === 0) {
    warnings.push('No TypeScript declaration files found');
  }

  if (mapFiles.length === 0) {
    warnings.push('No source map files found');
  }

  const hasIndex = jsFiles.some(f => f === 'index.js' || f.endsWith('/index.js') || f.endsWith('\\index.js'));
  if (!hasIndex) {
    errors.push('Missing index.js entry point in output');
  }

  return { valid: errors.length === 0, errors, warnings, files };
}

function collectFiles(baseDir: string, dir: string, result: string[]): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relativePath = fullPath.slice(baseDir.length + 1).replace(/\\/g, '/');
    if (statSync(fullPath).isDirectory()) {
      collectFiles(baseDir, fullPath, result);
    } else {
      result.push(relativePath);
    }
  }
}
