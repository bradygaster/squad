/**
 * Generate markdown impact report from analysis results.
 * Uses only Node.js built-ins.
 *
 * Issue: #733
 */

const TIER_EMOJI = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

/**
 * Generate a markdown impact report.
 *
 * @param {{ prNumber: number|string, risk: {tier: string, factors: string[]}, modules: Record<string, string[]>, files: {added: string[], modified: string[], deleted: string[], all: string[]}, criticalFiles: string[] }} params
 * @returns {string} Markdown report body
 */
export function generateReport({ prNumber, risk, modules, files, criticalFiles }) {
  const emoji = TIER_EMOJI[risk.tier] || '⚪';
  const lines = [];

  lines.push(`## ${emoji} Impact Analysis — PR #${prNumber}`);
  lines.push('');
  lines.push(`**Risk tier:** ${emoji} **${risk.tier}**`);
  lines.push('');

  // Summary table
  lines.push('### 📊 Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Files changed | ${files.all.length} |`);
  lines.push(`| Files added | ${files.added.length} |`);
  lines.push(`| Files modified | ${files.modified.length} |`);
  lines.push(`| Files deleted | ${files.deleted.length} |`);
  lines.push(`| Modules touched | ${Object.keys(modules).length} |`);
  if (criticalFiles.length > 0) {
    lines.push(`| Critical files | ${criticalFiles.length} |`);
  }
  lines.push('');

  // Risk factors
  lines.push('### 🎯 Risk Factors');
  lines.push('');
  for (const factor of risk.factors) {
    lines.push(`- ${factor}`);
  }
  lines.push('');

  // Module breakdown
  lines.push('### 📦 Modules Affected');
  lines.push('');
  const moduleNames = Object.keys(modules).sort();
  for (const mod of moduleNames) {
    const modFiles = modules[mod];
    lines.push(
      `<details><summary><strong>${mod}</strong> (${modFiles.length} file${modFiles.length === 1 ? '' : 's'})</summary>`,
    );
    lines.push('');
    for (const f of modFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Critical files
  if (criticalFiles.length > 0) {
    lines.push('### ⚠️ Critical Files');
    lines.push('');
    for (const f of criticalFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(
    '*This report is generated automatically for every PR. See [#733](https://github.com/bradygaster/squad/issues/733) for details.*',
  );

  return lines.join('\n');
}
