/**
 * Format impact analysis reports in terminal, JSON, and Markdown formats.
 * Pure functions — no side effects.
 */

import type { ImpactReport } from './index.js';
import { RiskTier } from './risk-scorer.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function tierColor(tier: RiskTier): string {
  switch (tier) {
    case RiskTier.LOW: return GREEN;
    case RiskTier.MEDIUM: return YELLOW;
    case RiskTier.HIGH: return RED;
    case RiskTier.CRITICAL: return `${BOLD}${RED}`;
  }
}

function tierEmoji(tier: RiskTier): string {
  switch (tier) {
    case RiskTier.LOW: return '🟢';
    case RiskTier.MEDIUM: return '🟡';
    case RiskTier.HIGH: return '🟠';
    case RiskTier.CRITICAL: return '🔴';
  }
}

/**
 * Format report for terminal output with ANSI colors.
 */
export function formatTerminal(report: ImpactReport): string {
  const { risk, diff, modules, source } = report;
  const color = tierColor(risk.tier);
  const emoji = tierEmoji(risk.tier);
  const lines: string[] = [];

  // Header box
  lines.push(`${BOLD}┌─────────────────────────────────────────────┐${RESET}`);
  lines.push(`${BOLD}│${RESET}  ${emoji} ${BOLD}Impact Analysis${RESET}${DIM} — ${source}${RESET}`);
  lines.push(`${BOLD}├─────────────────────────────────────────────┤${RESET}`);

  // Risk tier
  lines.push(`${BOLD}│${RESET}  Risk: ${color}${risk.tier}${RESET}`);
  lines.push(`${BOLD}│${RESET}  ${DIM}${risk.reason}${RESET}`);
  lines.push(`${BOLD}├─────────────────────────────────────────────┤${RESET}`);

  // File stats
  const m = risk.metrics;
  lines.push(`${BOLD}│${RESET}  ${CYAN}Files${RESET}  ${m.totalFiles} total`);
  const parts: string[] = [];
  if (m.addedFiles > 0) parts.push(`${GREEN}+${m.addedFiles} added${RESET}`);
  if (m.modifiedFiles > 0) parts.push(`${YELLOW}~${m.modifiedFiles} modified${RESET}`);
  if (m.deletedFiles > 0) parts.push(`${RED}-${m.deletedFiles} deleted${RESET}`);
  if (m.renamedFiles > 0) parts.push(`${DIM}→${m.renamedFiles} renamed${RESET}`);
  if (parts.length > 0) {
    lines.push(`${BOLD}│${RESET}         ${parts.join('  ')}`);
  }
  lines.push(`${BOLD}├─────────────────────────────────────────────┤${RESET}`);

  // Modules
  lines.push(`${BOLD}│${RESET}  ${CYAN}Modules${RESET}  ${m.uniqueModules} module${m.uniqueModules === 1 ? '' : 's'}, ${m.uniquePackages} package${m.uniquePackages === 1 ? '' : 's'}`);

  // Show unique modules with owners
  const seen = new Map<string, { primary: string; secondary: string }>();
  for (const mod of modules) {
    if (!seen.has(mod.module)) {
      seen.set(mod.module, { primary: mod.primary, secondary: mod.secondary });
    }
  }
  for (const [name, owners] of seen) {
    const ownerStr = owners.secondary
      ? `${owners.primary} / ${owners.secondary}`
      : owners.primary;
    lines.push(`${BOLD}│${RESET}    ${DIM}•${RESET} ${name} ${DIM}(${ownerStr})${RESET}`);
  }

  // Cross-package edges
  if (m.crossPackageEdges > 0) {
    lines.push(`${BOLD}│${RESET}  ${YELLOW}⚠ ${m.crossPackageEdges} cross-package edge${m.crossPackageEdges === 1 ? '' : 's'}${RESET}`);
  }

  // Critical files
  if (m.criticalFilesTouched.length > 0) {
    lines.push(`${BOLD}├─────────────────────────────────────────────┤${RESET}`);
    lines.push(`${BOLD}│${RESET}  ${RED}Critical files:${RESET}`);
    for (const f of m.criticalFilesTouched) {
      lines.push(`${BOLD}│${RESET}    ${RED}⚠${RESET} ${f}`);
    }
  }

  lines.push(`${BOLD}└─────────────────────────────────────────────┘${RESET}`);

  // File list
  lines.push('');
  lines.push(`${DIM}Changed files (${diff.files.length}):${RESET}`);
  for (const file of diff.files) {
    const statusIcon = file.status === 'added' ? `${GREEN}A${RESET}`
      : file.status === 'modified' ? `${YELLOW}M${RESET}`
      : file.status === 'deleted' ? `${RED}D${RESET}`
      : file.status === 'renamed' ? `${DIM}R${RESET}`
      : `${DIM}C${RESET}`;
    const oldPathStr = file.oldPath ? ` ${DIM}← ${file.oldPath}${RESET}` : '';
    lines.push(`  ${statusIcon} ${file.path}${oldPathStr}`);
  }

  return lines.join('\n');
}

/**
 * Format report as JSON.
 */
export function formatJson(report: ImpactReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format report as Markdown (for PR comments).
 */
export function formatMarkdown(report: ImpactReport): string {
  const { risk, diff, modules } = report;
  const emoji = tierEmoji(risk.tier);
  const m = risk.metrics;
  const lines: string[] = [];

  lines.push(`## ${emoji} Impact Analysis — ${risk.tier}`);
  lines.push('');
  lines.push(`> ${risk.reason}`);
  lines.push('');

  // Metrics table
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Files changed | ${m.totalFiles} |`);
  lines.push(`| Added | ${m.addedFiles} |`);
  lines.push(`| Modified | ${m.modifiedFiles} |`);
  lines.push(`| Deleted | ${m.deletedFiles} |`);
  lines.push(`| Renamed | ${m.renamedFiles} |`);
  lines.push(`| Modules | ${m.uniqueModules} |`);
  lines.push(`| Packages | ${m.uniquePackages} |`);
  lines.push(`| Cross-package edges | ${m.crossPackageEdges} |`);
  lines.push('');

  // Module ownership
  if (modules.length > 0) {
    lines.push('### Module Ownership');
    lines.push('');
    lines.push('| Module | Primary | Secondary | Package |');
    lines.push('|--------|---------|-----------|---------|');
    const seen = new Set<string>();
    for (const mod of modules) {
      const key = `${mod.module}|${mod.primary}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`| \`${mod.module}\` | ${mod.primary} | ${mod.secondary || '—'} | ${mod.package} |`);
    }
    lines.push('');
  }

  // Critical files
  if (m.criticalFilesTouched.length > 0) {
    lines.push('### ⚠️ Critical Files');
    lines.push('');
    for (const f of m.criticalFilesTouched) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  // Changed files
  lines.push('<details>');
  lines.push(`<summary>Changed files (${diff.files.length})</summary>`);
  lines.push('');
  for (const file of diff.files) {
    const prefix = file.status === 'added' ? '+'
      : file.status === 'deleted' ? '-'
      : file.status === 'renamed' ? '→'
      : '~';
    const oldStr = file.oldPath ? ` ← ${file.oldPath}` : '';
    lines.push(`- \`${prefix}\` ${file.path}${oldStr}`);
  }
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}
