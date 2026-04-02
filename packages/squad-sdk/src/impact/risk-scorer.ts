/**
 * Calculate risk tier for a PR based on diff metrics.
 * Pure function — deterministic output from input metrics.
 */

import type { DiffFile } from './diff-parser.js';
import type { ModuleMapping } from './module-mapper.js';

export enum RiskTier {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface RiskMetrics {
  totalFiles: number;
  addedFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  renamedFiles: number;
  uniqueModules: number;
  uniquePackages: number;
  crossPackageEdges: number;
  criticalFilesTouched: string[];
}

export interface RiskScore {
  tier: RiskTier;
  reason: string;
  metrics: RiskMetrics;
}

/** Files that elevate risk when modified */
const CRITICAL_PATTERNS = [
  'package.json',
  'tsconfig.json',
  'package-lock.json',
  '.squad/config.json',
  '.squad/team.md',
  '.squad/routing.md',
  'eslint.config',
  '.github/workflows/',
  'squad.config',
];

function isCriticalFile(filePath: string): boolean {
  return CRITICAL_PATTERNS.some(pattern => filePath.includes(pattern));
}

/**
 * Count cross-package edges: how many distinct (packageA, packageB) pairs exist
 * where files from both packages are modified.
 */
function countCrossPackageEdges(mappings: ModuleMapping[]): number {
  const packages = new Set(mappings.map(m => m.package));
  if (packages.size <= 1) return 0;

  // Each pair of distinct packages with changes is an edge
  const pkgArray = [...packages];
  let edges = 0;
  for (let i = 0; i < pkgArray.length; i++) {
    for (let j = i + 1; j < pkgArray.length; j++) {
      edges++;
    }
  }
  return edges;
}

/**
 * Build risk metrics from diff files and module mappings.
 */
export function buildMetrics(files: DiffFile[], mappings: ModuleMapping[]): RiskMetrics {
  const uniqueModules = new Set(mappings.map(m => m.module));
  const uniquePackages = new Set(mappings.map(m => m.package));
  const criticalFilesTouched = files
    .filter(f => isCriticalFile(f.path))
    .map(f => f.path);

  return {
    totalFiles: files.length,
    addedFiles: files.filter(f => f.status === 'added').length,
    modifiedFiles: files.filter(f => f.status === 'modified').length,
    deletedFiles: files.filter(f => f.status === 'deleted').length,
    renamedFiles: files.filter(f => f.status === 'renamed').length,
    uniqueModules: uniqueModules.size,
    uniquePackages: uniquePackages.size,
    crossPackageEdges: countCrossPackageEdges(mappings),
    criticalFilesTouched,
  };
}

/**
 * Score risk based on metrics.
 */
export function scoreRisk(metrics: RiskMetrics): RiskScore {
  // CRITICAL: >8 modules, >50 files, cross-package with new edges, or mass deletion
  if (metrics.uniqueModules > 8) {
    return { tier: RiskTier.CRITICAL, reason: `Touches ${metrics.uniqueModules} modules (>8)`, metrics };
  }
  if (metrics.totalFiles > 50) {
    return { tier: RiskTier.CRITICAL, reason: `${metrics.totalFiles} files changed (>50)`, metrics };
  }
  if (metrics.crossPackageEdges > 0 && metrics.uniqueModules > 4) {
    return { tier: RiskTier.CRITICAL, reason: `Cross-package changes across ${metrics.uniqueModules} modules with ${metrics.crossPackageEdges} package edges`, metrics };
  }
  if (metrics.deletedFiles > 10) {
    return { tier: RiskTier.CRITICAL, reason: `Mass deletion: ${metrics.deletedFiles} files deleted`, metrics };
  }

  // HIGH: 5–8 modules, 2+ new edges, or any critical file touched
  if (metrics.uniqueModules >= 5 && metrics.uniqueModules <= 8) {
    return { tier: RiskTier.HIGH, reason: `Touches ${metrics.uniqueModules} modules (5–8 range)`, metrics };
  }
  if (metrics.crossPackageEdges >= 2) {
    return { tier: RiskTier.HIGH, reason: `${metrics.crossPackageEdges} cross-package edges`, metrics };
  }
  if (metrics.criticalFilesTouched.length > 0) {
    return { tier: RiskTier.HIGH, reason: `Critical files touched: ${metrics.criticalFilesTouched.join(', ')}`, metrics };
  }

  // MEDIUM: 2–4 modules, ≤1 new edge, ≤20 files
  if (metrics.uniqueModules >= 2 && metrics.uniqueModules <= 4) {
    return { tier: RiskTier.MEDIUM, reason: `Touches ${metrics.uniqueModules} modules`, metrics };
  }
  if (metrics.totalFiles > 5 && metrics.totalFiles <= 20) {
    return { tier: RiskTier.MEDIUM, reason: `${metrics.totalFiles} files changed`, metrics };
  }

  // LOW: ≤1 module, 0 new edges, ≤5 files, no critical files
  return { tier: RiskTier.LOW, reason: 'Contained change — single module, few files', metrics };
}
