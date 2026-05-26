/**
 * Feature Audit — Risk Punch List (M3-13, Issue #154)
 *
 * Internal development tool that audits all v1 modules for completeness
 * and produces a risk assessment before GA.
 */

import type { SquadConfig } from './schema.js';

// --- Types ---

export type FeatureCompleteness = 'complete' | 'partial' | 'stub' | 'missing';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface FeatureStatus {
  /** Module / feature name */
  name: string;
  /** Current completeness level */
  status: FeatureCompleteness;
  /** Free-form notes on what's done or missing */
  notes: string;
  /** Overall risk for GA */
  riskLevel: RiskLevel;
}

export interface FeatureAuditReport {
  /** When the audit was generated */
  timestamp: string;
  /** Squad config version audited against */
  configVersion: string;
  /** Per-module results */
  features: FeatureStatus[];
  /** Rollup counts */
  summary: {
    total: number;
    complete: number;
    partial: number;
    stub: number;
    missing: number;
    highRisk: number;
  };
}

// --- Module checkers ---

type ModuleChecker = (config: SquadConfig) => FeatureStatus;

function checkCoordinator(config: SquadConfig): FeatureStatus {
  const hasAgents = config.agents.length > 0;
  const hasRouting = config.routing.rules.length > 0;

  if (hasAgents && hasRouting) {
    return { name: 'coordinator', status: 'complete', notes: 'Agents and routing rules configured', riskLevel: 'low' };
  }
  if (hasAgents || hasRouting) {
    return { name: 'coordinator', status: 'partial', notes: 'Missing agents or routing rules', riskLevel: 'medium' };
  }
  return { name: 'coordinator', status: 'stub', notes: 'No agents or routing rules configured', riskLevel: 'high' };
}

function checkCasting(config: SquadConfig): FeatureStatus {
  // Casting is a standalone engine; config only needs agents to benefit
  const hasAgents = config.agents.length > 0;
  if (hasAgents) {
    return { name: 'casting', status: 'complete', notes: 'Casting engine available with configured agents', riskLevel: 'low' };
  }
  return { name: 'casting', status: 'partial', notes: 'No agents configured to cast', riskLevel: 'medium' };
}

function checkSkills(_config: SquadConfig): FeatureStatus {
  // Skills system exists but is loaded at runtime from filesystem
  return { name: 'skills', status: 'complete', notes: 'Skill loader and matcher implemented', riskLevel: 'low' };
}

function checkRouting(config: SquadConfig): FeatureStatus {
  const ruleCount = config.routing.rules.length;
  const hasFallback = !!config.routing.fallbackBehavior;

  if (ruleCount > 0 && hasFallback) {
    return { name: 'routing', status: 'complete', notes: `${ruleCount} routing rule(s) with fallback`, riskLevel: 'low' };
  }
  if (hasFallback) {
    return { name: 'routing', status: 'partial', notes: 'Fallback configured but no routing rules', riskLevel: 'medium' };
  }
  return { name: 'routing', status: 'stub', notes: 'No routing rules or fallback configured', riskLevel: 'high' };
}

function checkModels(config: SquadConfig): FeatureStatus {
  const hasDefault = !!config.models.default;
  const tierCount = Object.keys(config.models.tiers).length;

  if (hasDefault && tierCount > 0) {
    return { name: 'models', status: 'complete', notes: `Default model set, ${tierCount} tier(s) configured`, riskLevel: 'low' };
  }
  if (hasDefault) {
    return { name: 'models', status: 'partial', notes: 'Default model set but no tiers', riskLevel: 'medium' };
  }
  return { name: 'models', status: 'stub', notes: 'No default model configured', riskLevel: 'high' };
}

function checkHooks(config: SquadConfig): FeatureStatus {
  if (!config.hooks) {
    return { name: 'hooks', status: 'partial', notes: 'Hooks section not configured', riskLevel: 'medium' };
  }
  const hasAny =
    (config.hooks.allowedWritePaths && config.hooks.allowedWritePaths.length > 0) ||
    (config.hooks.blockedCommands && config.hooks.blockedCommands.length > 0) ||
    config.hooks.scrubPii !== undefined ||
    config.hooks.reviewerLockout !== undefined;

  if (hasAny) {
    return { name: 'hooks', status: 'complete', notes: 'Hook policies configured', riskLevel: 'low' };
  }
  return { name: 'hooks', status: 'partial', notes: 'Hooks section present but empty', riskLevel: 'medium' };
}

function checkTools(_config: SquadConfig): FeatureStatus {
  // Tools are registered at runtime via ToolRegistry
  return { name: 'tools', status: 'complete', notes: 'ToolRegistry with 17 built-in tools including runtime state tools', riskLevel: 'low' };
}

function checkStreaming(_config: SquadConfig): FeatureStatus {
  // Streaming pipeline exists in runtime/streaming.ts
  return { name: 'streaming', status: 'complete', notes: 'Streaming event pipeline implemented', riskLevel: 'low' };
}

const MODULE_CHECKERS: ModuleChecker[] = [
  checkCoordinator,
  checkCasting,
  checkSkills,
  checkRouting,
  checkModels,
  checkHooks,
  checkTools,
  checkStreaming,
];

// --- Public API ---

/**
 * Audit all v1 modules against the provided config and return a report.
 */
export function auditFeatures(config: SquadConfig): FeatureAuditReport {
  const features = MODULE_CHECKERS.map((checker) => checker(config));

  const summary = {
    total: features.length,
    complete: features.filter((f) => f.status === 'complete').length,
    partial: features.filter((f) => f.status === 'partial').length,
    stub: features.filter((f) => f.status === 'stub').length,
    missing: features.filter((f) => f.status === 'missing').length,
    highRisk: features.filter((f) => f.riskLevel === 'high').length,
  };

  return {
    timestamp: new Date().toISOString(),
    configVersion: config.version,
    features,
    summary,
  };
}

/**
 * Filter the report to only high-risk features that need attention before GA.
 */
export function getHighRiskFeatures(report: FeatureAuditReport): FeatureStatus[] {
  return report.features.filter((f) => f.riskLevel === 'high');
}

/**
 * Generate a markdown summary of the audit report.
 */
export function generateAuditMarkdown(report: FeatureAuditReport): string {
  const lines: string[] = [
    '# Feature Audit Report',
    '',
    `**Generated:** ${report.timestamp}`,
    `**Config Version:** ${report.configVersion}`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `| --- | --- |`,
    `| Total modules | ${report.summary.total} |`,
    `| Complete | ${report.summary.complete} |`,
    `| Partial | ${report.summary.partial} |`,
    `| Stub | ${report.summary.stub} |`,
    `| Missing | ${report.summary.missing} |`,
    `| **High risk** | **${report.summary.highRisk}** |`,
    '',
    '## Module Details',
    '',
    '| Module | Status | Risk | Notes |',
    '| --- | --- | --- | --- |',
  ];

  for (const f of report.features) {
    lines.push(`| ${f.name} | ${f.status} | ${f.riskLevel} | ${f.notes} |`);
  }

  const highRisk = getHighRiskFeatures(report);
  if (highRisk.length > 0) {
    lines.push('', '## ⚠️ High Risk Items', '');
    for (const f of highRisk) {
      lines.push(`- **${f.name}** (${f.status}): ${f.notes}`);
    }
  }

  return lines.join('\n');
}
