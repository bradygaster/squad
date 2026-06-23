/**
 * Packaging utilities — prepare Squad projects for marketplace distribution
 * Issue #108 (M4-8)
 */

import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import * as path from 'node:path';
import type { MarketplaceManifest } from './index.js';

const storage = new FSStorageProvider();

// --- PackageResult ---

export interface PackageResult {
  outputPath: string;
  size: number;
  files: string[];
  warnings: string[];
}

// --- Package validation ---

export interface MarketplacePackageValidationResult {
  valid: boolean;
  errors: string[];
  missingFiles: string[];
}

const REQUIRED_FILES = ['manifest.json', 'README.md'];
const REQUIRED_PATHS = ['icon', 'dist/'];

/**
 * Package a project directory for marketplace distribution.
 */
export function packageForMarketplace(
  projectDir: string,
  manifest: MarketplaceManifest,
): PackageResult {
  const warnings: string[] = [];
  const files: string[] = [];

  if (!storage.existsSync(projectDir)) {
    throw new Error(`Project directory not found: ${projectDir}`);
  }

  // Write manifest.json
  const manifestPath = path.join(projectDir, 'manifest.json');
  storage.writeSync(manifestPath, JSON.stringify(manifest, null, 2));
  files.push('manifest.json');

  // Collect README
  const readmePath = path.join(projectDir, 'README.md');
  if (storage.existsSync(readmePath)) {
    files.push('README.md');
  } else {
    warnings.push('README.md not found — marketplace listings require a README');
  }

  // Collect icon
  const iconPath = path.join(projectDir, manifest.icon);
  if (storage.existsSync(iconPath)) {
    files.push(manifest.icon);
  } else {
    warnings.push(`Icon file not found: ${manifest.icon}`);
  }

  // Collect dist/
  const distDir = path.join(projectDir, 'dist');
  if (storage.existsSync(distDir) && storage.isDirectorySync(distDir)) {
    const distFiles = collectFiles(distDir, 'dist');
    files.push(...distFiles);
  } else {
    warnings.push('dist/ directory not found — run build before packaging');
  }

  // Calculate total size
  let totalSize = 0;
  for (const file of files) {
    const fullPath = path.join(projectDir, file);
    const st = storage.statSync(fullPath);
    if (st && !st.isDirectory) {
      totalSize += st.size;
    }
  }

  const outputPath = path.join(projectDir, `${manifest.name}-${manifest.version}.squad-pkg`);

  return {
    outputPath,
    size: totalSize,
    files,
    warnings,
  };
}

/**
 * Validate that a package directory contains all required files.
 */
export function validatePackageContents(packagePath: string): MarketplacePackageValidationResult {
  const errors: string[] = [];
  const missingFiles: string[] = [];

  if (!storage.existsSync(packagePath)) {
    return {
      valid: false,
      errors: [`Package path not found: ${packagePath}`],
      missingFiles: [],
    };
  }

  for (const file of REQUIRED_FILES) {
    const filePath = path.join(packagePath, file);
    if (!storage.existsSync(filePath)) {
      missingFiles.push(file);
      errors.push(`Required file missing: ${file}`);
    }
  }

  // Check dist/ directory exists
  const distDir = path.join(packagePath, 'dist');
  if (!storage.existsSync(distDir) || !storage.isDirectorySync(distDir)) {
    missingFiles.push('dist/');
    errors.push('Required directory missing: dist/');
  }

  // Check icon — look for any common image file
  const iconCandidates = ['icon.png', 'icon.svg', 'icon.jpg'];
  const hasIcon = iconCandidates.some((ic) =>
    storage.existsSync(path.join(packagePath, ic)),
  );
  if (!hasIcon) {
    missingFiles.push('icon');
    errors.push('Required file missing: icon (icon.png, icon.svg, or icon.jpg)');
  }

  return {
    valid: errors.length === 0,
    errors,
    missingFiles,
  };
}

// --- Internal helpers ---

function collectFiles(dir: string, prefix: string): string[] {
  const results: string[] = [];
  const entries = storage.listSync(dir);
  for (const entry of entries) {
    const rel = path.join(prefix, entry);
    if (storage.isDirectorySync(path.join(dir, entry))) {
      results.push(...collectFiles(path.join(dir, entry), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}
