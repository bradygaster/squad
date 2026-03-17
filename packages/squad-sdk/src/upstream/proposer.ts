/**
 * Upstream proposer — packages child squad changes for upstream PR.
 *
 * Phase 2 of bidirectional sync: child → parent proposal.
 * Reads local .squad/ content and packages it for an upstream PR.
 *
 * @module upstream/proposer
 */

import fs from 'node:fs';
import path from 'node:path';
import type { UpstreamSource } from './types.js';
import type {
  UpstreamProposeConfig,
  UpstreamProposeScope,
  ProposePackage,
} from './sync-types.js';
import { DEFAULT_PROPOSE_CONFIG } from './sync-types.js';
import { readUpstreamConfig } from './resolver.js';

/**
 * Parse propose configuration from upstream-config.json, merged with defaults.
 */
export function parseProposeConfig(squadDir: string): UpstreamProposeConfig {
  const configPath = path.join(squadDir, 'upstream-config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_PROPOSE_CONFIG };

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<{
      propose: Partial<UpstreamProposeConfig & { scope: Partial<UpstreamProposeScope> }>;
    }>;
    return {
      scope: {
        skills: raw.propose?.scope?.skills ?? DEFAULT_PROPOSE_CONFIG.scope.skills,
        decisions: raw.propose?.scope?.decisions ?? DEFAULT_PROPOSE_CONFIG.scope.decisions,
        governance: raw.propose?.scope?.governance ?? DEFAULT_PROPOSE_CONFIG.scope.governance,
      },
      targetBranch: raw.propose?.targetBranch ?? DEFAULT_PROPOSE_CONFIG.targetBranch,
      branchPrefix: raw.propose?.branchPrefix ?? DEFAULT_PROPOSE_CONFIG.branchPrefix,
    };
  } catch {
    return { ...DEFAULT_PROPOSE_CONFIG };
  }
}

/**
 * Collect files from the local .squad/ that match the given scope flags.
 */
export function collectProposalFiles(
  squadDir: string,
  scope: { skills: boolean; decisions: boolean; governance: boolean },
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];

  if (scope.skills) {
    const skillsDir = path.join(squadDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          files.push({
            path: `skills/${entry.name}/SKILL.md`,
            content: fs.readFileSync(skillFile, 'utf8'),
          });
        }
      }
    }
  }

  if (scope.decisions) {
    const decisionsPath = path.join(squadDir, 'decisions.md');
    if (fs.existsSync(decisionsPath)) {
      files.push({
        path: 'decisions.md',
        content: fs.readFileSync(decisionsPath, 'utf8'),
      });
    }
  }

  if (scope.governance) {
    const routingPath = path.join(squadDir, 'routing.md');
    if (fs.existsSync(routingPath)) {
      files.push({
        path: 'routing.md',
        content: fs.readFileSync(routingPath, 'utf8'),
      });
    }

    const castingPath = path.join(squadDir, 'casting', 'policy.json');
    if (fs.existsSync(castingPath)) {
      files.push({
        path: 'casting/policy.json',
        content: fs.readFileSync(castingPath, 'utf8'),
      });
    }
  }

  return files;
}

/**
 * Build a human-readable summary of what's being proposed.
 */
export function buildProposalSummary(
  files: Array<{ path: string; content: string }>,
): string {
  const skills = files.filter(f => f.path.startsWith('skills/'));
  const decisions = files.filter(f => f.path === 'decisions.md');
  const governance = files.filter(f => f.path === 'routing.md' || f.path === 'casting/policy.json');

  const parts: string[] = [];
  if (skills.length > 0) {
    parts.push(`${skills.length} skill${skills.length > 1 ? 's' : ''}`);
  }
  if (decisions.length > 0) parts.push('decisions');
  if (governance.length > 0) {
    parts.push(`governance (${governance.map(f => f.path).join(', ')})`);
  }

  return parts.length > 0
    ? `Proposing: ${parts.join(', ')}`
    : 'No files to propose';
}

/**
 * Package a proposal for a specific upstream target.
 *
 * @param squadDir - The local .squad/ directory
 * @param upstreamName - Name of the target upstream
 * @param scope - What content to include
 * @returns The packaged proposal, or null if upstream not found
 */
export function packageProposal(
  squadDir: string,
  upstreamName: string,
  scope: { skills: boolean; decisions: boolean; governance: boolean },
): ProposePackage | null {
  const config = readUpstreamConfig(squadDir);
  if (!config) return null;

  const upstream = config.upstreams.find(u => u.name === upstreamName);
  if (!upstream) return null;

  const proposeConfig = parseProposeConfig(squadDir);
  const files = collectProposalFiles(squadDir, scope);

  if (files.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branchName = `${proposeConfig.branchPrefix}/${timestamp}`;

  return {
    upstreamName,
    branchName,
    files,
    summary: buildProposalSummary(files),
  };
}
