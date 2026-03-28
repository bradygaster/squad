/**
 * Template sync tests — ensures all template directories stay in sync.
 *
 * Canonical source: .squad-templates/
 * Mirror targets:   templates/, packages/squad-cli/templates/, packages/squad-sdk/templates/
 * Special target:   .github/agents/ (squad.agent.md only)
 *
 * Coverage strategy:
 *   1. Dynamic enumeration — every file in .squad-templates/ must be byte-for-byte
 *      identical across all mirror targets (and .github/agents/ for squad.agent.md).
 *   2. Script execution — `node scripts/sync-templates.mjs` must exit 0.
 *   3. Negative guard — .github/agents/ must not contain stray synced files.
 *   4. Semantic checks — universe counts, casting-policy internal consistency.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

function readFileBytes(relPath: string): Buffer {
  return readFileSync(resolve(ROOT, relPath));
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(ROOT, relPath));
}

/** Recursively collect all file paths relative to `dir`. */
function collectFiles(dir: string, base = ''): string[] {
  const entries = readdirSync(resolve(ROOT, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = base ? join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

/** Extract the universe count from a squad.agent.md file (anchored to list item). */
function extractUniverseCount(content: string): number | null {
  const m = content.match(/^-\s+(\d+)\s+universes?\s+available/im);
  return m ? Number(m[1]) : null;
}

/** Parse casting-policy.json and return universe names from the allowlist. */
function parsePolicyUniverses(relPath: string): string[] {
  const json = JSON.parse(readFile(relPath));
  return json.allowlist_universes as string[];
}

/** Parse casting-policy.json and return the capacity map. */
function parsePolicyCapacity(relPath: string): Record<string, number> {
  const json = JSON.parse(readFile(relPath));
  return json.universe_capacity as Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_DIR = '.squad-templates';

const MIRROR_TARGETS = [
  'templates',
  'packages/squad-cli/templates',
  'packages/squad-sdk/templates',
] as const;

const AGENT_MD_FILE = 'squad.agent.md';
const AGENT_MD_EXTRA_TARGET = '.github/agents';

const SQUAD_AGENT_LOCATIONS = [
  `${SOURCE_DIR}/${AGENT_MD_FILE}`,
  'templates/squad.agent.md.template',
  '.github/agents/squad.agent.md',
  'packages/squad-cli/templates/squad.agent.md.template',
  'packages/squad-sdk/templates/squad.agent.md.template',
] as const;

const CASTING_POLICY_LOCATIONS = [
  `${SOURCE_DIR}/casting-policy.json`,
  'templates/casting-policy.json',
  'packages/squad-cli/templates/casting-policy.json',
  'packages/squad-sdk/templates/casting-policy.json',
] as const;

// ---------------------------------------------------------------------------
// 1. Dynamic enumeration — byte-for-byte parity for ALL synced files
// ---------------------------------------------------------------------------

describe('dynamic template enumeration (all synced files)', () => {
  const sourceFiles = collectFiles(SOURCE_DIR);

  it('.squad-templates/ contains files to sync', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const relFile of sourceFiles) {
    const canonicalPath = `${SOURCE_DIR}/${relFile}`;

    for (const target of MIRROR_TARGETS) {
      // squad.agent.md is renamed to .template in mirror targets
      // to prevent Copilot CLI from discovering template copies
      const destName = relFile === AGENT_MD_FILE ? `${AGENT_MD_FILE}.template` : relFile;
      const targetPath = `${target}/${destName}`;

      it(`${targetPath} is byte-for-byte identical to ${canonicalPath}`, () => {
        expect(fileExists(targetPath), `${targetPath} should exist`).toBe(true);
        const src = readFileBytes(canonicalPath);
        const dst = readFileBytes(targetPath);
        expect(Buffer.compare(src, dst), `${targetPath} content mismatch`).toBe(0);
      });
    }

    // squad.agent.md also lives in .github/agents/
    if (relFile === AGENT_MD_FILE) {
      const agentPath = `${AGENT_MD_EXTRA_TARGET}/${AGENT_MD_FILE}`;

      it(`${agentPath} is byte-for-byte identical to ${canonicalPath}`, () => {
        expect(fileExists(agentPath), `${agentPath} should exist`).toBe(true);
        const src = readFileBytes(canonicalPath);
        const dst = readFileBytes(agentPath);
        expect(Buffer.compare(src, dst), `${agentPath} content mismatch`).toBe(0);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Script execution — sync-templates.mjs must exit cleanly
// ---------------------------------------------------------------------------

describe('sync-templates.mjs script execution', () => {
  it('exits with code 0 (no syntax errors, no crashes)', () => {
    // execSync throws on non-zero exit codes
    const output = execSync('node scripts/sync-templates.mjs', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    expect(output).toContain('Synced');
  });
});

// ---------------------------------------------------------------------------
// 3. Negative guard — .github/agents/ should only have squad.agent.md
// ---------------------------------------------------------------------------

describe('.github/agents/ contains only squad.agent.md', () => {
  it('has no files beyond squad.agent.md from the sync', () => {
    const agentDir = resolve(ROOT, AGENT_MD_EXTRA_TARGET);
    expect(existsSync(agentDir), '.github/agents/ should exist').toBe(true);
    const files = readdirSync(agentDir);
    expect(files).toEqual([AGENT_MD_FILE]);
  });
});

// ---------------------------------------------------------------------------
// 4. squad.agent.md — universe count consistency
// ---------------------------------------------------------------------------

describe('squad.agent.md universe count', () => {
  const canonicalPath = SQUAD_AGENT_LOCATIONS[0];
  const canonicalContent = readFile(canonicalPath);
  const expectedCount = extractUniverseCount(canonicalContent);

  it('canonical file has a parseable universe count', () => {
    expect(expectedCount).not.toBeNull();
    expect(expectedCount).toBeGreaterThan(0);
  });

  for (const loc of SQUAD_AGENT_LOCATIONS) {
    it(`${loc} matches canonical universe count (${expectedCount})`, () => {
      const content = readFile(loc);
      const count = extractUniverseCount(content);
      expect(count).toBe(expectedCount);
    });
  }

  it('universe count matches casting-policy allowlist length', () => {
    const policyUniverses = parsePolicyUniverses(CASTING_POLICY_LOCATIONS[0]);
    expect(expectedCount).toBe(policyUniverses.length);
  });
});

// ---------------------------------------------------------------------------
// 5. casting-policy.json — content parity & internal consistency
// ---------------------------------------------------------------------------

describe('casting-policy.json content parity', () => {
  const canonicalContent = readFile(CASTING_POLICY_LOCATIONS[0]);

  for (const loc of CASTING_POLICY_LOCATIONS) {
    it(`${loc} matches canonical casting-policy.json`, () => {
      const content = readFile(loc);
      expect(content).toBe(canonicalContent);
    });
  }

  it('allowlist and capacity map have the same universes', () => {
    const allowlist = parsePolicyUniverses(CASTING_POLICY_LOCATIONS[0]);
    const capacity = parsePolicyCapacity(CASTING_POLICY_LOCATIONS[0]);
    const capacityNames = Object.keys(capacity);

    expect(allowlist.sort()).toEqual(capacityNames.sort());
  });

  it('all capacities are positive integers', () => {
    const capacity = parsePolicyCapacity(CASTING_POLICY_LOCATIONS[0]);
    for (const [name, cap] of Object.entries(capacity)) {
      expect(cap, `${name} capacity`).toBeGreaterThan(0);
      expect(Number.isInteger(cap), `${name} capacity is integer`).toBe(true);
    }
  });
});
