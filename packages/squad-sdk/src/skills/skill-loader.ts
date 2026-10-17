/**
 * Skill Loader (M3-3, Issue #141)
 *
 * Reads SKILL.md files from a directory and parses them into
 * SkillDefinition objects. Handles missing / malformed files gracefully.
 *
 * SKILL.md format:
 * ```
 * ---
 * name: TypeScript Testing
 * domain: testing
 * triggers: [vitest, jest, test, spec]
 * roles: [tester, developer]
 * ---
 * Markdown body content…
 * ```
 */

import * as path from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

const storage = new FSStorageProvider();
import { normalizeEol } from '../utils/normalize-eol.js';

// --- Types ---

export interface SkillDefinition {
  /** Unique identifier (derived from directory name) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Knowledge domain */
  domain: string;
  /** Markdown content body */
  content: string;
  /** Keyword patterns that trigger this skill */
  triggers: string[];
  /** Agent roles that have affinity for this skill */
  agentRoles: string[];
}

// --- Frontmatter Parser ---

/** Strip one pair of matching surrounding quotes from a scalar. */
function unquote(value: string): string {
  const m = value.match(/^(["'])(.*)\1$/);
  return m ? m[2]! : value;
}

/**
 * Parse simple YAML-like frontmatter from a SKILL.md string.
 * Returns the parsed fields and the remaining body content.
 */
export function parseFrontmatter(
  raw: string,
): { meta: Record<string, string | string[]>; body: string } {
  raw = normalizeEol(raw);
  const meta: Record<string, string | string[]> = {};
  let body = raw;

  const match = raw.match(/^---\s*\n([\s\S]*?)---\s*\n?([\s\S]*)$/);
  if (!match) return { meta, body };

  const frontmatter = match[1]!;
  body = match[2]!.trim();

  const lines = frontmatter.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    // Parse inline arrays: [a, b, c]
    const arrayMatch = value.match(/^\[(.+)\]$/);
    if (arrayMatch) {
      meta[key] = arrayMatch[1]!.split(',').map((s) => unquote(s.trim())).filter(Boolean);
    } else if (value === '' && /^\s*-\s+/.test(lines[i + 1] ?? '')) {
      // Parse block sequences: following "  - item" lines
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1]!)) {
        i++;
        items.push(unquote(lines[i]!.replace(/^\s*-\s+/, '').trim()));
      }
      meta[key] = items.filter(Boolean);
    } else {
      meta[key] = unquote(value);
    }
  }

  return { meta, body };
}

// --- Directory Loader ---

/**
 * Load all skill definitions from a directory.
 *
 * Expected structure:
 *   dir/
 *     skill-a/SKILL.md
 *     skill-b/SKILL.md
 *
 * Malformed or missing files are silently skipped.
 */
export function loadSkillsFromDirectory(dir: string): SkillDefinition[] {
  if (!storage.existsSync(dir)) return [];

  const skills: SkillDefinition[] = [];
  let entries: string[];
  try {
    entries = storage.listSync(dir);
  } catch {
    return [];
  }

  for (const entryName of entries) {
    if (!storage.isDirectorySync(path.join(dir, entryName))) continue;

    const skillFile = path.join(dir, entryName, 'SKILL.md');
    if (!storage.existsSync(skillFile)) continue;

    try {
      const raw = storage.readSync(skillFile) ?? '';
      const skill = parseSkillFile(entryName, raw);
      if (skill) skills.push(skill);
    } catch {
      // Malformed file — skip gracefully
    }
  }

  return skills;
}

/**
 * Parse a single SKILL.md raw string into a SkillDefinition.
 * Returns undefined if required fields are missing.
 */
export function parseSkillFile(id: string, raw: string): SkillDefinition | undefined {
  const { meta, body } = parseFrontmatter(raw);
  if (!body) return undefined;

  const name = typeof meta.name === 'string' ? meta.name : id;
  const domain = typeof meta.domain === 'string' ? meta.domain : 'general';
  const triggers = Array.isArray(meta.triggers) ? meta.triggers : [];
  const agentRoles = Array.isArray(meta.roles) ? meta.roles : [];

  return { id, name, domain, content: body, triggers, agentRoles };
}
