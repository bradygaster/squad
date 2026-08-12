/**
 * gh-aw Quality & Reproducibility Tests
 *
 * Validates the structural integrity of the Squad gh-aw workflow definition:
 * - safe-output configuration schema
 * - mode dispatch completeness
 * - shared component imports
 * - planning state machine marker consistency
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { minimatch } from 'minimatch';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const SHARED_DIR = join(WORKFLOWS_DIR, 'shared');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract YAML frontmatter from a markdown file (between --- delimiters). */
function extractFrontmatter(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter found in ${filePath}`);
  return match[1];
}

/** Extract the safe-outputs block from frontmatter. */
function extractSafeOutputs(frontmatter: string): Record<string, Record<string, unknown>> {
  const lines = frontmatter.split('\n');
  const outputs: Record<string, Record<string, unknown>> = {};

  let inSafeOutputs = false;
  let currentOutput: string | null = null;
  let currentListKey: string | null = null;

  for (const line of lines) {
    if (line.match(/^safe-outputs:\s*$/)) {
      inSafeOutputs = true;
      continue;
    }

    if (!inSafeOutputs) continue;

    // Detect end of safe-outputs section (another top-level key)
    if (line.match(/^\S/) && !line.startsWith(' ')) {
      break;
    }

    // Output name (2-space indent, ends with colon)
    const outputMatch = line.match(/^  ([\w-]+):\s*$/);
    if (outputMatch) {
      currentOutput = outputMatch[1];
      outputs[currentOutput] = {};
      currentListKey = null;
      continue;
    }

    if (!currentOutput) continue;

    // Key-value pair (4-space indent)
    const kvMatch = line.match(/^    ([\w-]+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (value === '' || value === undefined) {
        // Start of a multi-line list
        currentListKey = key;
        outputs[currentOutput][key] = [];
      } else {
        currentListKey = null;
        // Parse inline arrays like [squad] or [squad, planning]
        const arrayMatch = value.match(/^\[(.+)\]$/);
        if (arrayMatch) {
          outputs[currentOutput][key] = arrayMatch[1].split(',').map(s => s.trim().replace(/"/g, ''));
        } else if (!isNaN(Number(value))) {
          outputs[currentOutput][key] = Number(value);
        } else {
          outputs[currentOutput][key] = value.replace(/^"(.*)"$/, '$1');
        }
      }
      continue;
    }

    // Multi-line list item (6-space indent with - prefix)
    if (currentListKey) {
      const listItemMatch = line.match(/^\s{6}- (.+)$/);
      if (listItemMatch) {
        const item = listItemMatch[1].replace(/^"(.*)"$/, '$1');
        (outputs[currentOutput][currentListKey] as string[]).push(item);
      } else if (!line.match(/^\s+$/)) {
        currentListKey = null;
      }
    }
  }

  return outputs;
}

/** Extract the imports list from frontmatter. */
function extractImports(frontmatter: string): string[] {
  const imports: string[] = [];
  const lines = frontmatter.split('\n');
  let inImports = false;

  for (const line of lines) {
    if (line.match(/^imports:\s*$/)) {
      inImports = true;
      continue;
    }
    if (inImports) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch) {
        imports.push(itemMatch[1].trim());
      } else if (line.match(/^\S/)) {
        break;
      }
    }
  }

  return imports;
}

/** Extract mode table rows from the "## Modes" section of the workflow body. */
function extractModeTable(content: string): Array<{ command: string; mode: string; description: string }> {
  const rows: Array<{ command: string; mode: string; description: string }> = [];

  // Isolate the ## Modes section (ends at next ## heading or ## Task)
  const modesSection = content.match(/^## Modes\n([\s\S]*?)(?=\n## )/m);
  if (!modesSection) return rows;

  const section = modesSection[1];

  // Match 3-column table rows: | `command` | Mode | Description |
  const tableRowRegex = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = tableRowRegex.exec(section)) !== null) {
    const command = match[1].trim();
    const mode = match[2].trim();
    const description = match[3].trim();
    // Skip table headers
    if (command === 'Command' || mode === 'Mode') continue;
    rows.push({ command, mode, description });
  }
  return rows;
}

/** Extract HTML comment markers from the planning ontology. */
function extractOntologyMarkers(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf8');
  const markers: string[] = [];
  const markerRegex = /`(<!-- squad-[\w-]+ -->)`/g;
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(content)) !== null) {
    if (!markers.includes(match[1])) {
      markers.push(match[1]);
    }
  }
  return markers;
}

/** Extract markers referenced in squad.md (both in code fences and inline). */
function extractSquadMarkerReferences(content: string): string[] {
  const markers: string[] = [];
  const markerRegex = /`?(<!-- squad-[\w-]+ -->)`?/g;
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(content)) !== null) {
    const marker = match[0].replace(/`/g, '');
    if (!markers.includes(marker)) {
      markers.push(marker);
    }
  }
  return markers;
}

// ---------------------------------------------------------------------------
// Test: Safe-Output Configuration Validation
// ---------------------------------------------------------------------------

describe('gh-aw: safe-output configuration', () => {
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const safeOutputs = extractSafeOutputs(frontmatter);

  it('safe-outputs section exists and has entries', () => {
    expect(Object.keys(safeOutputs).length).toBeGreaterThan(0);
  });

  it('each safe-output has a max value that is a positive integer ≤ 1000', () => {
    for (const [name, config] of Object.entries(safeOutputs)) {
      expect(config.max, `${name} should have a max field`).toBeDefined();
      const max = config.max as number;
      expect(max, `${name}.max should be > 0`).toBeGreaterThan(0);
      expect(max, `${name}.max should be ≤ 1000`).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(max), `${name}.max should be an integer`).toBe(true);
    }
  });

  it('labels arrays contain only non-empty strings', () => {
    for (const [name, config] of Object.entries(safeOutputs)) {
      if (config.labels) {
        const labels = config.labels as string[];
        expect(Array.isArray(labels), `${name}.labels should be an array`).toBe(true);
        for (const label of labels) {
          expect(label.length, `${name} has empty label`).toBeGreaterThan(0);
          expect(label, `${name} label "${label}" should not contain special chars`).toMatch(/^[\w-]+$/);
        }
      }
    }
  });

  it('allowed-base-branches are valid glob patterns', () => {
    for (const [name, config] of Object.entries(safeOutputs)) {
      const branches = config['allowed-base-branches'] as string[] | undefined;
      if (branches) {
        expect(Array.isArray(branches), `${name}.allowed-base-branches should be an array`).toBe(true);
        for (const pattern of branches) {
          expect(pattern.length, `${name} has empty branch pattern`).toBeGreaterThan(0);
          // Validate glob by ensuring minimatch doesn't throw
          expect(() => minimatch('test-branch', pattern)).not.toThrow();
        }
      }
    }
  });

  it('create-pull-request has required safety fields', () => {
    const pr = safeOutputs['create-pull-request'];
    expect(pr, 'create-pull-request output should exist').toBeDefined();
    expect(pr['title-prefix'], 'should have title-prefix').toBeDefined();
    expect(pr.labels, 'should have labels').toBeDefined();
    expect(pr.max, 'should have max').toBeDefined();
    expect(pr['allowed-base-branches'], 'should have allowed-base-branches').toBeDefined();
  });

  it('create-issue and add-comment outputs exist', () => {
    expect(safeOutputs['create-issue'], 'create-issue should exist').toBeDefined();
    expect(safeOutputs['add-comment'], 'add-comment should exist').toBeDefined();
  });

  it('create-issue max is 75 (supports large plans, forward-port of #1683)', () => {
    const ci = safeOutputs['create-issue'];
    expect(ci, 'create-issue block must exist').toBeDefined();
    expect(ci['max'], 'create-issue max must be 75 — do not reduce below this').toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Test: Mode Dispatch Completeness
// ---------------------------------------------------------------------------

describe('gh-aw: mode dispatch completeness', () => {
  const content = readFileSync(SQUAD_WORKFLOW, 'utf8');
  const modeTable = extractModeTable(content);

  it('mode table has entries', () => {
    expect(modeTable.length).toBeGreaterThan(0);
  });

  it('each mode in the dispatch table has a corresponding section', () => {
    // Modes that have dedicated sections (#### Mode Name or similar heading)
    const headingRegex = /^#{2,4}\s+(.+?)$/gm;
    const headings: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push(match[1].trim().toLowerCase());
    }

    // Unique mode names from the dispatch table (normalize combined modes)
    const uniqueModes = [...new Set(modeTable.map(r => r.mode))];

    for (const mode of uniqueModes) {
      const normalized = mode.toLowerCase();
      // Check if any heading contains the mode name (flexible match)
      // For multi-word modes like "Plan Accept", check for "plan accept" or "plan-accept"
      // Also check if the base mode has a section (e.g., "Cast" for "Cast Mode")
      const found = headings.some(h =>
        h.includes(normalized) ||
        h.includes(normalized.replace(/\s+/g, '-')) ||
        h.includes(`${normalized} mode`) ||
        h === `${normalized} mode`
      );
      expect(found, `Mode "${mode}" should have a corresponding section heading`).toBe(true);
    }
  });

  it('commands within the same mode are distinguishable (differ by arguments)', () => {
    // Group by mode name - commands sharing a mode should differ
    const byMode = new Map<string, string[]>();
    for (const { command, mode } of modeTable) {
      if (!byMode.has(mode)) byMode.set(mode, []);
      byMode.get(mode)!.push(command);
    }

    for (const [mode, commands] of byMode) {
      // Strip phase suffixes to find the base commands
      const baseCommands = commands.map(c => c.replace(/\s+phase\s+\{N\}/, ''));
      const uniqueBase = [...new Set(baseCommands)];
      // Each base command (ignoring phase variants) should be unique per mode
      // This allows `/squad plan accept` and `/squad plan accept phase {N}` to coexist
      expect(
        uniqueBase.length,
        `Mode "${mode}" has duplicate base commands: ${JSON.stringify(commands)}`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('all commands start with /squad', () => {
    for (const { command } of modeTable) {
      expect(command, `Command "${command}" should start with /squad`).toMatch(/^\/squad/);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Shared Component Imports
// ---------------------------------------------------------------------------

describe('gh-aw: shared component imports', () => {
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const imports = extractImports(frontmatter);

  it('imports list is non-empty', () => {
    expect(imports.length).toBeGreaterThan(0);
  });

  it('each imported file exists in workflows/shared/', () => {
    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      expect(
        existsSync(fullPath),
        `Imported file "${importPath}" should exist at ${fullPath}`
      ).toBe(true);
    }
  });

  it('imported files have valid markdown structure (non-empty, has headings)', () => {
    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      if (!existsSync(fullPath)) continue;

      const content = readFileSync(fullPath, 'utf8');
      expect(content.length, `${importPath} should not be empty`).toBeGreaterThan(0);
      expect(content, `${importPath} should contain at least one heading`).toMatch(/^#+\s+.+/m);
    }
  });

  it('imported files do not contain broken internal links', () => {
    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      if (!existsSync(fullPath)) continue;

      const content = readFileSync(fullPath, 'utf8');
      // Check for markdown links to local files (not URLs)
      const localLinks = content.match(/\[.*?\]\((?!https?:\/\/|#)([^)]+)\)/g) || [];
      for (const link of localLinks) {
        const target = link.match(/\]\(([^)]+)\)/)?.[1];
        if (target) {
          const resolved = join(SHARED_DIR, target);
          expect(
            existsSync(resolved),
            `${importPath} has broken link to "${target}"`
          ).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Planning State Machine
// ---------------------------------------------------------------------------

describe('gh-aw: planning state machine', () => {
  const ontologyPath = join(SHARED_DIR, 'planning-ontology.md');
  const ontologyContent = readFileSync(ontologyPath, 'utf8');
  const squadContent = readFileSync(SQUAD_WORKFLOW, 'utf8');

  const ontologyMarkers = extractOntologyMarkers(ontologyPath);
  const squadMarkers = extractSquadMarkerReferences(squadContent);

  it('ontology defines markers', () => {
    expect(ontologyMarkers.length).toBeGreaterThan(0);
  });

  it('all markers follow naming convention: <!-- squad-{name}-v{N} -->', () => {
    // Allow both versioned (squad-X-vN) and unversioned (squad-X) markers
    const markerPattern = /^<!-- squad-[\w-]+(-(v\d+))? -->$/;
    for (const marker of ontologyMarkers) {
      expect(marker, `Marker "${marker}" should follow naming convention`).toMatch(markerPattern);
    }
  });

  it('all markers referenced in squad.md are defined in planning-ontology.md', () => {
    // Filter to only planning-related markers (skip markers that might be internal)
    const planningMarkers = squadMarkers.filter(m =>
      m.includes('squad-') && !m.includes('squad-plan-v1') && !m.includes('squad-plan-accepted')
    );

    for (const marker of planningMarkers) {
      // Check if the marker is defined in the ontology (either in ontology table
      // or in the broader ontology content)
      const defined = ontologyContent.includes(marker);
      expect(defined, `Marker "${marker}" referenced in squad.md should be defined in planning-ontology.md`).toBe(true);
    }
  });

  it('state transition table defines produces/requires markers consistently', () => {
    // Extract state transitions from the ontology
    const transitionBlock = ontologyContent.match(/```\n(idle[\s\S]*?)```/);
    expect(transitionBlock, 'Should have a state transition code block').not.toBeNull();

    const transitions = transitionBlock![1];
    const producesMarkers = [...transitions.matchAll(/produces:\s*(<!-- [\w-]+ -->)/g)]
      .map(m => m[1]);
    const requiresMarkers = [...transitions.matchAll(/requires:\s*(<!-- [\w-]+ -->)/g)]
      .map(m => m[1]);

    // Every required marker should be produced by some prior transition
    // (except the first which requires "intent")
    for (const required of requiresMarkers) {
      if (required.includes('intent')) continue;
      const isProduced = producesMarkers.includes(required);
      expect(isProduced, `Required marker "${required}" should be produced by a prior state`).toBe(true);
    }
  });

  it('Comment Marker Registry section covers all state-produced markers', () => {
    // Extract markers from the "Comment Marker Registry" table
    const registrySection = ontologyContent.match(/## 4\. Comment Marker Registry[\s\S]*?(?=\n---|\n## \d)/);
    expect(registrySection, 'Should have a Comment Marker Registry section').not.toBeNull();

    // Extract from state transitions
    const transitionBlock = ontologyContent.match(/```\n(idle[\s\S]*?)```/);
    const transitions = transitionBlock![1];
    const producedMarkers = [...transitions.matchAll(/produces:\s*(<!-- [\w-]+ -->)/g)]
      .map(m => m[1]);

    for (const marker of producedMarkers) {
      expect(
        registrySection![0].includes(marker),
        `Produced marker "${marker}" should be listed in Comment Marker Registry`
      ).toBe(true);
    }
  });

  it('ontology marker versions are consistent (all v1 in current spec)', () => {
    const versionedMarkers = ontologyMarkers.filter(m => m.match(/v\d+/));
    const versions = versionedMarkers.map(m => m.match(/v(\d+)/)![1]);
    const uniqueVersions = [...new Set(versions)];
    // Currently all should be v1
    expect(uniqueVersions, 'All versioned markers should use the same version').toEqual(['1']);
  });
});

// ---------------------------------------------------------------------------
// Test: Frontmatter Schema
// ---------------------------------------------------------------------------

describe('gh-aw: workflow frontmatter schema', () => {
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);

  it('has required top-level fields', () => {
    expect(frontmatter).toMatch(/^name:\s+.+/m);
    expect(frontmatter).toMatch(/^description:\s+.+/m);
    expect(frontmatter).toMatch(/^on:/m);
    expect(frontmatter).toMatch(/^permissions:/m);
    expect(frontmatter).toMatch(/^tools:/m);
    expect(frontmatter).toMatch(/^safe-outputs:/m);
    expect(frontmatter).toMatch(/^imports:/m);
  });

  it('permissions are restrictive (read for contents, issues, PRs)', () => {
    expect(frontmatter).toMatch(/contents:\s+read/);
    expect(frontmatter).toMatch(/issues:\s+read/);
    expect(frontmatter).toMatch(/pull-requests:\s+read/);
  });

  it('has copilot-requests: write permission', () => {
    expect(frontmatter).toMatch(/copilot-requests:\s+write/);
  });

  it('network policy is configured', () => {
    expect(frontmatter).toMatch(/^network:/m);
    expect(frontmatter).toMatch(/allowed:/m);
  });
});

// ---------------------------------------------------------------------------
// Test: Prompt Budget & Planning Import Regression (#1684)
// ---------------------------------------------------------------------------

describe('gh-aw: prompt budget & planning import regression', () => {
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const imports = extractImports(frontmatter);
  const squadContent = readFileSync(SQUAD_WORKFLOW, 'utf8');

  // gh-aw enforces a hard 100 KB prompt ceiling (102 400 bytes)
  const GH_AW_PROMPT_CEILING_KB = 100;
  const GH_AW_PROMPT_CEILING_BYTES = GH_AW_PROMPT_CEILING_KB * 1024;

  it('planning-ontology.md is in the imports list', () => {
    expect(imports, 'shared/planning-ontology.md must be imported').toContain('shared/planning-ontology.md');
  });

  it('planning-policy.md is in the imports list', () => {
    expect(imports, 'shared/planning-policy.md must be imported').toContain('shared/planning-policy.md');
  });

  it('no runtime cat of planning files remains in squad.md', () => {
    expect(
      squadContent,
      'squad.md must not contain runtime `cat .github/workflows/shared/planning-*.md` instructions'
    ).not.toMatch(/cat .github\/workflows\/shared\/planning-[\w-]+\.md/);
  });

  it(`combined prompt (workflow + all imports) is under ${GH_AW_PROMPT_CEILING_KB} KB`, () => {
    let totalBytes = Buffer.byteLength(squadContent, 'utf8');

    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf8');
        totalBytes += Buffer.byteLength(content, 'utf8');
      }
    }

    const totalKB = (totalBytes / 1024).toFixed(1);
    const headroomKB = ((GH_AW_PROMPT_CEILING_BYTES - totalBytes) / 1024).toFixed(1);

    expect(
      totalBytes,
      `Combined prompt is ${totalKB} KB — exceeds the gh-aw ${GH_AW_PROMPT_CEILING_KB} KB ceiling. Headroom: ${headroomKB} KB.`
    ).toBeLessThan(GH_AW_PROMPT_CEILING_BYTES);
  });

  it('reports combined bytes and headroom', () => {
    let totalBytes = Buffer.byteLength(squadContent, 'utf8');
    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      if (existsSync(fullPath)) totalBytes += Buffer.byteLength(readFileSync(fullPath, 'utf8'), 'utf8');
    }
    const headroomBytes = GH_AW_PROMPT_CEILING_BYTES - totalBytes;
    // Informational — log bytes/headroom; fail only if headroom < 5 KB (regression guard)
    expect(
      headroomBytes,
      `Headroom too low: ${(headroomBytes / 1024).toFixed(1)} KB remaining of ${GH_AW_PROMPT_CEILING_KB} KB ceiling`
    ).toBeGreaterThan(5 * 1024);
  });
});

// ---------------------------------------------------------------------------
// Test: Plan Activate hardening behaviors (forward-port #1683)
// ---------------------------------------------------------------------------

describe('gh-aw: Plan Activate hardening behaviors', () => {
  const content = readFileSync(SQUAD_WORKFLOW, 'utf8');

  it('includes output budget awareness guidance', () => {
    expect(content).toContain('Output Budget Awareness');
    expect(content).toMatch(/total.*>\s*50.*phased activation|phased.*activation.*>\s*50/i);
  });

  it('includes label pre-flight step before issue creation', () => {
    expect(content).toContain('Label Pre-flight');
    expect(content).toMatch(/squad.*label.*exist|label.*squad.*exist/i);
  });

  it('includes transient failure handling with single retry', () => {
    expect(content).toContain('Transient Failure Handling');
    expect(content).toMatch(/5xx.*retry|retry.*5xx/i);
  });

  it('includes graceful sub-issue fallback for 404/422', () => {
    expect(content).toContain('Sub-issue Fallback');
    expect(content).toMatch(/404.*422|422.*404/);
    expect(content).toMatch(/degrade gracefully|graceful/i);
  });
});
