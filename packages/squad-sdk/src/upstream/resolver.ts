/**
 * Upstream resolver — reads upstream.json and resolves all upstream Squad sources.
 *
 * Implements the resolution logic the coordinator follows at session start:
 * 1. Read upstream.json
 * 2. For each source, resolve its .squad/ directory
 * 3. Read skills, decisions, wisdom, casting policy, routing
 *
 * @module upstream/resolver
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  UpstreamConfig,
  UpstreamResolution,
  ResolvedUpstream,
} from './types.js';

/**
 * Read and parse upstream.json from a squad directory.
 * Returns null if the file doesn't exist or is invalid.
 */
export function readUpstreamConfig(squadDir: string): UpstreamConfig | null {
  const configPath = path.join(squadDir, 'upstream.json');
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as UpstreamConfig;
    if (!parsed.upstreams || !Array.isArray(parsed.upstreams)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Find the .squad/ directory inside a source path.
 * Checks for .squad/ first, falls back to .ai-team/.
 */
function findSquadDir(sourcePath: string): string | null {
  const squadDir = path.join(sourcePath, '.squad');
  if (fs.existsSync(squadDir)) return squadDir;

  const aiTeamDir = path.join(sourcePath, '.ai-team');
  if (fs.existsSync(aiTeamDir)) return aiTeamDir;

  return null;
}

/**
 * Read all skills from a squad directory's skills/ folder.
 */
function readSkills(squadDir: string): Array<{ name: string; content: string }> {
  const projectDir = path.dirname(squadDir);
  const candidateDirs = [
    { dir: path.join(projectDir, '.copilot', 'skills'), layout: 'nested' as const },
    { dir: path.join(squadDir, 'skills'), layout: 'nested' as const },
    { dir: path.join(projectDir, '.ai-team', 'skills'), layout: 'flat' as const },
  ];
  const source = candidateDirs.find(({ dir }) => fs.existsSync(dir));
  if (!source) return [];

  const skills: Array<{ name: string; content: string }> = [];
  try {
    for (const entry of fs.readdirSync(source.dir)) {
      const skillFile = source.layout === 'nested'
        ? path.join(source.dir, entry, 'SKILL.md')
        : path.join(source.dir, entry);
      if (fs.existsSync(skillFile)) {
        const name = source.layout === 'nested' ? entry : path.basename(entry, '.md');
        skills.push({ name, content: fs.readFileSync(skillFile, 'utf8') });
      }
    }
  } catch {
    // Graceful degradation — return what we found
  }
  return skills;
}

/**
 * Read a text file if it exists, otherwise return null.
 */
function readOptionalFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Read and parse a JSON file if it exists, otherwise return null.
 */
function readOptionalJson(filePath: string): Record<string, unknown> | null {
  const raw = readOptionalFile(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Resolve content from a single upstream's .squad/ directory.
 */
function resolveFromSquadDir(name: string, type: 'local' | 'git' | 'export', upstreamSquadDir: string): ResolvedUpstream {
  return {
    name,
    type,
    skills: readSkills(upstreamSquadDir),
    decisions: readOptionalFile(path.join(upstreamSquadDir, 'decisions.md')),
    wisdom: readOptionalFile(path.join(upstreamSquadDir, 'identity', 'wisdom.md')),
    castingPolicy: readOptionalJson(path.join(upstreamSquadDir, 'casting', 'policy.json')),
    routing: readOptionalFile(path.join(upstreamSquadDir, 'routing.md')),
  };
}

/**
 * Resolve content from an export JSON file.
 */
function resolveFromExport(name: string, exportPath: string): ResolvedUpstream {
  const resolved: ResolvedUpstream = {
    name,
    type: 'export',
    skills: [],
    decisions: null,
    wisdom: null,
    castingPolicy: null,
    routing: null,
  };

  try {
    const raw = fs.readFileSync(exportPath, 'utf8');
    const manifest = JSON.parse(raw) as {
      version?: string;
      skills?: string[];
      casting?: { policy?: Record<string, unknown> };
    };

    if (Array.isArray(manifest.skills)) {
      for (const skillContent of manifest.skills) {
        const nameMatch = skillContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
        const skillName = nameMatch ? nameMatch[1]!.trim() : 'unknown';
        resolved.skills.push({ name: skillName, content: skillContent });
      }
    }
    if (manifest.casting?.policy) {
      resolved.castingPolicy = manifest.casting.policy;
    }
  } catch {
    // Graceful degradation
  }

  return resolved;
}

/**
 * Resolve all upstream sources for a squad directory.
 *
 * For each upstream in upstream.json:
 * - Local paths: read directly from the source's .squad/
 * - Git URLs: read from .squad/_upstream_repos/{name}/ (must be cloned first)
 * - Export files: read from the JSON file
 *
 * @param squadDir - The .squad/ directory of the current repo
 * @returns Resolved upstream content, or null if no upstream.json exists
 */
export function resolveUpstreams(squadDir: string): UpstreamResolution | null {
  const config = readUpstreamConfig(squadDir);
  if (!config) return null;

  const results: ResolvedUpstream[] = [];

  for (const upstream of config.upstreams) {
    if (upstream.type === 'local') {
      const upstreamSquadDir = findSquadDir(upstream.source);
      if (upstreamSquadDir) {
        results.push(resolveFromSquadDir(upstream.name, 'local', upstreamSquadDir));
      } else {
        // Source not found — push empty result
        results.push({ name: upstream.name, type: 'local', skills: [], decisions: null, wisdom: null, castingPolicy: null, routing: null });
      }
    } else if (upstream.type === 'git') {
      // Read from cached clone
      const cloneDir = path.join(squadDir, '_upstream_repos', upstream.name);
      const cloneSquadDir = findSquadDir(cloneDir);
      if (cloneSquadDir) {
        results.push(resolveFromSquadDir(upstream.name, 'git', cloneSquadDir));
      } else {
        results.push({ name: upstream.name, type: 'git', skills: [], decisions: null, wisdom: null, castingPolicy: null, routing: null });
      }
    } else if (upstream.type === 'export') {
      results.push(resolveFromExport(upstream.name, upstream.source));
    }
  }

  return { upstreams: results };
}

/**
 * Build the INHERITED CONTEXT block for agent spawn prompts.
 */
export function buildInheritedContextBlock(resolution: UpstreamResolution | null): string {
  if (!resolution || resolution.upstreams.length === 0) return '';

  const lines = ['INHERITED CONTEXT:'];
  for (const u of resolution.upstreams) {
    const parts: string[] = [];
    if (u.skills.length > 0) parts.push(`skills (${u.skills.length})`);
    if (u.decisions) parts.push('decisions ✓');
    if (u.wisdom) parts.push('wisdom ✓');
    if (u.castingPolicy) parts.push('casting ✓');
    if (u.routing) parts.push('routing ✓');
    lines.push(`  ${u.name}: ${parts.join(', ') || '(empty)'}`);
  }
  return lines.join('\n');
}

/**
 * Build user-facing display for session start greeting.
 */
export function buildSessionDisplay(resolution: UpstreamResolution | null): string {
  if (!resolution || resolution.upstreams.length === 0) return '';

  const lines = ['📡 Inherited context:'];
  for (const u of resolution.upstreams) {
    const parts: string[] = [];
    if (u.skills.length > 0) parts.push(`${u.skills.length} skill${u.skills.length > 1 ? 's' : ''}`);
    if (u.decisions) parts.push('decisions');
    if (u.wisdom) parts.push('wisdom');
    if (u.castingPolicy) parts.push('casting');
    if (u.routing) parts.push('routing');

    if (parts.length > 0) {
      lines.push(`  ${u.name} (${u.type}) — ${parts.join(', ')}`);
    } else {
      lines.push(`  ⚠️ ${u.name} (${u.type}) — source not reachable`);
    }
  }
  return lines.join('\n');
}
