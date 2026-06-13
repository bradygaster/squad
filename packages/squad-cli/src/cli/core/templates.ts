/**
 * Template system types and manifest for Squad initialization.
 * @module cli/core/templates
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

/** Template file descriptor */
export interface TemplateFile {
  /** Source path relative to templates/ */
  source: string;
  /** Destination path relative to .squad/ directory */
  destination: string;
  /** Whether this file should be overwritten on upgrade */
  overwriteOnUpgrade: boolean;
  /** Description for logging */
  description: string;
}

/**
 * Template manifest — all files that init copies.
 * 
 * Categorization:
 * - Squad-owned (overwriteOnUpgrade: true): squad.agent.md, workflows, template files, casting data
 * - User-owned (overwriteOnUpgrade: false): team.md, routing.md, decisions.md, ceremonies.md, agent history/identity
 */
export const TEMPLATE_MANIFEST: TemplateFile[] = [
  // Core coordinator
  {
    source: 'squad.agent.md.template',
    destination: '../.github/agents/squad.agent.md',
    overwriteOnUpgrade: true,
    description: 'Squad coordinator agent prompt',
  },
  
  // Casting system (squad-owned, overwrite on upgrade)
  // NOTE: These JSON files are read at runtime by the SDK and many agent
  // skills via their flat `.squad/casting-*.json` paths — do NOT route into
  // a subdirectory without coordinated updates across the SDK + skill docs.
  {
    source: 'casting-history.json',
    destination: 'casting-history.json',
    overwriteOnUpgrade: true,
    description: 'Casting history tracking',
  },
  {
    source: 'casting-policy.json',
    destination: 'casting-policy.json',
    overwriteOnUpgrade: true,
    description: 'Casting policy configuration',
  },
  {
    source: 'casting-registry.json',
    destination: 'casting-registry.json',
    overwriteOnUpgrade: true,
    description: 'Universe-based character registry',
  },
  
  // Template files (squad-owned, overwrite on upgrade) — routed to
  // .squad/templates/ so upgrade doesn't dump ~20 generic *.md docs
  // into the .squad/ root.
  {
    source: 'charter.md',
    destination: 'templates/charter.md',
    overwriteOnUpgrade: true,
    description: 'Agent charter template',
  },
  {
    source: 'constraint-tracking.md',
    destination: 'templates/constraint-tracking.md',
    overwriteOnUpgrade: true,
    description: 'Constraint tracking template',
  },
  {
    source: 'copilot-instructions.md',
    destination: 'templates/copilot-instructions.md',
    overwriteOnUpgrade: true,
    description: 'Copilot instructions template',
  },
  {
    source: 'history.md',
    destination: 'templates/history.md',
    overwriteOnUpgrade: true,
    description: 'Agent history template',
  },
  {
    source: 'mcp-config.md',
    destination: 'templates/mcp-config.md',
    overwriteOnUpgrade: true,
    description: 'MCP configuration template',
  },
  {
    source: 'multi-agent-format.md',
    destination: 'templates/multi-agent-format.md',
    overwriteOnUpgrade: true,
    description: 'Multi-agent format specification',
  },
  {
    source: 'orchestration-log.md',
    destination: 'templates/orchestration-log.md',
    overwriteOnUpgrade: true,
    description: 'Orchestration log template',
  },
  {
    source: 'plugin-marketplace.md',
    destination: 'templates/plugin-marketplace.md',
    overwriteOnUpgrade: true,
    description: 'Plugin marketplace template',
  },
  {
    source: 'raw-agent-output.md',
    destination: 'templates/raw-agent-output.md',
    overwriteOnUpgrade: true,
    description: 'Raw agent output template',
  },
  {
    source: 'roster.md',
    destination: 'templates/roster.md',
    overwriteOnUpgrade: true,
    description: 'Team roster template',
  },
  {
    source: 'run-output.md',
    destination: 'templates/run-output.md',
    overwriteOnUpgrade: true,
    description: 'Run output template',
  },
  {
    source: 'scribe-charter.md',
    destination: 'templates/scribe-charter.md',
    overwriteOnUpgrade: true,
    description: 'Scribe charter template',
  },
  {
    source: 'Rai-charter.md',
    destination: 'templates/Rai-charter.md',
    overwriteOnUpgrade: true,
    description: 'Rai RAI reviewer charter template',
  },
  {
    source: 'rai-policy.md',
    destination: 'templates/rai-policy.md',
    overwriteOnUpgrade: true,
    description: 'Default RAI policy template',
  },
  {
    source: 'fact-checker-charter.md',
    destination: 'templates/fact-checker-charter.md',
    overwriteOnUpgrade: true,
    description: 'Fact checker charter template',
  },
  {
    source: 'fact-checker-policy.md',
    destination: 'templates/fact-checker-policy.md',
    overwriteOnUpgrade: true,
    description: 'Fact checker policy template (verification + DA methodology)',
  },
  {
    source: 'skill.md',
    destination: 'templates/skill.md',
    overwriteOnUpgrade: true,
    description: 'Skill definition template',
  },
  
  // User-owned files (never overwrite)
  {
    source: 'ceremonies.md',
    destination: 'ceremonies.md',
    overwriteOnUpgrade: false,
    description: 'Team ceremonies configuration',
  },
  {
    source: 'routing.md',
    destination: 'routing.md',
    overwriteOnUpgrade: false,
    description: 'Agent routing rules',
  },
  
  // Identity subdirectory (user-owned)
  {
    source: 'identity/now.md',
    destination: 'identity/now.md',
    overwriteOnUpgrade: false,
    description: 'Agent current focus',
  },
  {
    source: 'identity/wisdom.md',
    destination: 'identity/wisdom.md',
    overwriteOnUpgrade: false,
    description: 'Agent accumulated wisdom',
  },
  
  // Issue lifecycle (squad-owned)
  {
    source: 'issue-lifecycle.md',
    destination: 'templates/issue-lifecycle.md',
    overwriteOnUpgrade: true,
    description: 'Issue lifecycle process template',
  },

  // Skills subdirectory (squad-owned)
  {
    source: 'skills/squad-conventions/SKILL.md',
    destination: '../.copilot/skills/squad-conventions/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Squad conventions skill definition',
  },
  {
    source: 'skills/error-recovery/SKILL.md',
    destination: '../.copilot/skills/error-recovery/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Graceful error recovery patterns',
  },
  {
    source: 'skills/secret-handling/SKILL.md',
    destination: '../.copilot/skills/secret-handling/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Secrets management and credential safety',
  },
  {
    source: 'skills/git-workflow/SKILL.md',
    destination: '../.copilot/skills/git-workflow/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Git workflow conventions and branch management',
  },
  {
    source: 'skills/session-recovery/SKILL.md',
    destination: '../.copilot/skills/session-recovery/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Session checkpoint and recovery patterns',
  },
  {
    source: 'skills/reviewer-protocol/SKILL.md',
    destination: '../.copilot/skills/reviewer-protocol/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Code review protocol and reviewer gate patterns',
  },
  {
    source: 'skills/test-discipline/SKILL.md',
    destination: '../.copilot/skills/test-discipline/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Test-first discipline and coverage expectations',
  },
  {
    source: 'skills/agent-collaboration/SKILL.md',
    destination: '../.copilot/skills/agent-collaboration/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Multi-agent collaboration and handoff patterns',
  },
  {
    source: 'skills/squad/SKILL.md',
    destination: '../.copilot/skills/squad/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Squad command catalog — invokable via /squad slash command',
  },
  {
    source: 'skills/squad-version-check/SKILL.md',
    destination: '../.copilot/skills/squad-version-check/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Squad CLI internals — version stamping & upgrade mechanics',
  },
  {
    source: 'skills/squad-help/SKILL.md',
    destination: '../.copilot/skills/squad-help/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'How to actually use Squad — agent vs skill vs slash command (#1297 redirect)',
  },

  // Session init reference (squad-owned, coordinator reads at session start)
  {
    source: 'session-init-reference.md',
    destination: 'templates/session-init-reference.md',
    overwriteOnUpgrade: true,
    description: 'Session init reference — coordinator procedures run at session start',
  },
  
  // Workflows (squad-owned, overwrite on upgrade)
  {
    source: 'workflows/squad-ci.yml',
    destination: '../.github/workflows/squad-ci.yml',
    overwriteOnUpgrade: true,
    description: 'Squad CI workflow',
  },
  {
    source: 'workflows/squad-docs.yml',
    destination: '../.github/workflows/squad-docs.yml',
    overwriteOnUpgrade: true,
    description: 'Squad docs workflow',
  },
  {
    source: 'workflows/squad-heartbeat.yml',
    destination: '../.github/workflows/squad-heartbeat.yml',
    overwriteOnUpgrade: true,
    description: 'Squad heartbeat workflow',
  },
  {
    source: 'workflows/squad-insider-release.yml',
    destination: '../.github/workflows/squad-insider-release.yml',
    overwriteOnUpgrade: true,
    description: 'Squad insider release workflow',
  },
  {
    source: 'workflows/squad-issue-assign.yml',
    destination: '../.github/workflows/squad-issue-assign.yml',
    overwriteOnUpgrade: true,
    description: 'Squad issue auto-assignment workflow',
  },
  {
    source: 'workflows/squad-label-enforce.yml',
    destination: '../.github/workflows/squad-label-enforce.yml',
    overwriteOnUpgrade: true,
    description: 'Squad label enforcement workflow',
  },
  {
    source: 'workflows/squad-preview.yml',
    destination: '../.github/workflows/squad-preview.yml',
    overwriteOnUpgrade: true,
    description: 'Squad preview workflow',
  },
  {
    source: 'workflows/squad-promote.yml',
    destination: '../.github/workflows/squad-promote.yml',
    overwriteOnUpgrade: true,
    description: 'Squad promotion workflow',
  },
  {
    source: 'workflows/squad-release.yml',
    destination: '../.github/workflows/squad-release.yml',
    overwriteOnUpgrade: true,
    description: 'Squad release workflow',
  },
  {
    source: 'workflows/squad-triage.yml',
    destination: '../.github/workflows/squad-triage.yml',
    overwriteOnUpgrade: true,
    description: 'Squad issue triage workflow',
  },
  {
    source: 'workflows/sync-squad-labels.yml',
    destination: '../.github/workflows/sync-squad-labels.yml',
    overwriteOnUpgrade: true,
    description: 'Squad label sync workflow',
  },
];

/**
 * Get the templates directory path.
 * Walks up from the current file to find templates/ — works both
 * from compiled dist/cli/core/templates.js and from a bundled cli.js at the root.
 */
export function getTemplatesDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  let dir = dirname(currentFile);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'templates');
    if (storage.existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Templates directory not found — installation may be corrupted');
}
