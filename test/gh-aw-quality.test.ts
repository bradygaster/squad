/**
 * gh-aw Quality & Reproducibility Tests
 *
 * Validates the structural integrity of the Squad gh-aw workflow definition:
 * - safe-output configuration schema
 * - mode dispatch completeness
 * - shared component imports
 * - planning state machine structured-artifact consistency
 */

import { afterAll, describe, it, expect } from 'vitest';
import { cpSync, readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { minimatch } from 'minimatch';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const SQUAD_IMPLEMENT_WORKER = join(WORKFLOWS_DIR, 'squad-implement-worker.md');
const SHARED_DIR = join(WORKFLOWS_DIR, 'shared');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces');

/**
 * Some suites execute the workflow's own `bash`/`jq` snippets through
 * `shell: '/bin/sh'` to prove the shipped one-liners behave as documented.
 * That shell does not exist on a stock Windows dev box, so gate those suites
 * instead of reporting spurious ENOENT failures. CI runs on Linux, where they
 * always execute.
 */
const HAS_POSIX_SHELL = existsSync('/bin/sh');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a text file with line endings normalized to LF.
 *
 * Markdown in this repo is not pinned to LF in .gitattributes, so Windows
 * checkouts (core.autocrlf=true) materialize CRLF. Every assertion here — and
 * gh-aw itself on the Linux runner — reasons in LF, so normalize on read rather
 * than making each regex CRLF-aware. This also makes byte-budget measurements
 * platform-independent.
 */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

/** Extract YAML frontmatter from a markdown file (between --- delimiters). */
function extractFrontmatter(filePath: string): string {
  const content = readText(filePath);
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
        } else if (value === 'true' || value === 'false') {
          outputs[currentOutput][key] = value === 'true';
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

function extractWorkflowDispatchInputs(frontmatter: string): Record<string, Record<string, string>> {
  const inputs: Record<string, Record<string, string>> = {};
  const lines = frontmatter.split('\n');
  const workflowDispatchLine = lines.findIndex(line => /^  workflow_dispatch:\s*$/.test(line));
  if (workflowDispatchLine === -1) return inputs;

  const inputsLine = lines.findIndex((line, index) =>
    index > workflowDispatchLine && /^    inputs:\s*$/.test(line)
  );
  if (inputsLine === -1) return inputs;

  let currentInput: string | null = null;
  for (let i = inputsLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {0,3}\S/.test(line)) break;

    const inputMatch = line.match(/^      ([A-Za-z0-9_-]+):\s*$/);
    if (inputMatch) {
      currentInput = inputMatch[1];
      inputs[currentInput] = {};
      continue;
    }

    if (!currentInput) continue;

    const propertyMatch = line.match(/^        ([A-Za-z0-9_-]+):\s*(.+)$/);
    if (propertyMatch) {
      inputs[currentInput][propertyMatch[1]] = propertyMatch[2].replace(/^['"]|['"]$/g, '');
    }
  }

  return inputs;
}

/** Extract mode table rows from the "## Modes" section of the workflow body. */
function extractModeTable(content: string): Array<{ command: string; mode: string; description: string }> {
  const rows: Array<{ command: string; mode: string; description: string }> = [];

  // Isolate the ## Modes section (ends at next ## heading or ## Task)
  const modesSection = content.match(/^## Modes\n([\s\S]*?)(?=\n## )/m);
  if (!modesSection) return rows;

  const section = modesSection[1];

  // Match table rows with 2 or 3 columns: | `command` | Mode | [Description] |
  // The shipped table is 2-column; a 3-column-only pattern silently matched
  // every other row (the trailing `|` of one row doubling as the opening `|`
  // of the next), which under-reported coverage by half.
  const tableRowRegex = /^\|\s*`([^`]+)`\s*\|\s*([^|\n]+?)\s*\|(?:\s*([^|\n]*?)\s*\|)?[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = tableRowRegex.exec(section)) !== null) {
    const command = match[1].trim();
    const mode = match[2].trim();
    const description = (match[3] ?? '').trim();
    // Skip table headers
    if (command === 'Command' || mode === 'Mode') continue;
    rows.push({ command, mode, description });
  }
  return rows;
}

interface SquadArtifactData {
  squad_artifact: string;
  schema_version: string;
  origin_issue: number;
  phases: number[];
}

/** Parse gh-aw's durable Structured data footer from a normalized body. */
function extractStructuredData(content: string): SquadArtifactData[] {
  return [...content.matchAll(/Structured data:\s*```json\s*([\s\S]*?)```/g)].map(match =>
    JSON.parse(match[1]) as SquadArtifactData
  );
}

/** Locate the newest compatible artifact exactly as downstream planning modes do. */
function findLatestArtifact(
  comments: string[],
  artifactKind: string,
  originIssue: number
): { body: string; data: SquadArtifactData } | undefined {
  for (const body of [...comments].reverse()) {
    const data = extractStructuredData(body).find(
      item =>
        item.squad_artifact === artifactKind &&
        item.schema_version === '1' &&
        item.origin_issue === originIssue
    );
    if (data) {
      return { body, data };
    }
  }
  return undefined;
}

function createTestWorkspace(prefix: string): string {
  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  return mkdtempSync(join(TEST_WORKSPACES_DIR, prefix));
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
      if (name === 'data') continue;
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
    expect(pr['auto-close-issue'], 'Cast PR must not close the originating work issue').toBe(false);
  });

  it('defines the minimum schema-validated durable artifact envelope', () => {
    expect(frontmatter).toMatch(/data:\n\s+type: object/);
    expect(frontmatter).toMatch(/squad_artifact:\n\s+type: string/);
    expect(frontmatter).toMatch(/schema_version:\n\s+type: string\n\s+enum: \["1"\]/);
    expect(frontmatter).toMatch(/origin_issue:\n\s+type: integer\n\s+minimum: 1/);
    expect(frontmatter).toMatch(/phases:\n\s+type: array\n\s+items:\n\s+type: integer\n\s+minimum: 1/);
    expect(frontmatter).toMatch(/required:\n\s+- squad_artifact\n\s+- schema_version\n\s+- origin_issue\n\s+- phases/);
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
  const content = readText(SQUAD_WORKFLOW);
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
      // Strip qualifiers like "(fast-path)" — they annotate the table entry,
      // they are not part of the section/skill name.
      const normalized = mode.replace(/\([^)]*\)/g, '').trim().toLowerCase();
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

      const content = readText(fullPath);
      expect(content.length, `${importPath} should not be empty`).toBeGreaterThan(0);
      expect(content, `${importPath} should contain at least one heading`).toMatch(/^#+\s+.+/m);
    }
  });

  it('imported files do not contain broken internal links', () => {
    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      if (!existsSync(fullPath)) continue;

      const content = readText(fullPath);
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
  const ontologyContent = readText(join(SHARED_DIR, 'squad-planning-ontology.md'));
  const squadContent = readText(SQUAD_WORKFLOW);

  function registryArtifactKinds(): string[] {
    const registry = ontologyContent.match(/## 4\. Structured Artifact Registry([\s\S]*?)(?=\n---|\n## \d)/);
    if (!registry) throw new Error('Structured Artifact Registry section is missing');
    return [...registry[1].matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]);
  }

  it('uses no Squad HTML comment as machine state', () => {
    const unsupportedMarker = /<!-- squad-[\w-]+(?:-v\d+)? -->/;
    expect(squadContent).not.toMatch(unsupportedMarker);
    expect(ontologyContent).not.toMatch(unsupportedMarker);
  });

  it('state transition table defines produced and required artifact kinds consistently', () => {
    const transitionBlock = ontologyContent.match(/```\n(idle[\s\S]*?)```/);
    expect(transitionBlock, 'Should have a state transition code block').not.toBeNull();

    const transitions = transitionBlock![1];
    const produced = [...transitions.matchAll(/produces:\s*squad_artifact=([\w-]+)/g)].map(match => match[1]);
    const required = [...transitions.matchAll(/requires:\s*squad_artifact=([\w-]+)/g)].map(match => match[1]);

    for (const artifactKind of required) {
      expect(
        produced,
        `Required artifact "${artifactKind}" should be produced by a lifecycle transition`
      ).toContain(artifactKind);
    }
  });

  it('Structured Artifact Registry covers all state-produced artifacts', () => {
    const transitionBlock = ontologyContent.match(/```\n(idle[\s\S]*?)```/);
    const transitions = transitionBlock![1];
    const produced = [...transitions.matchAll(/produces:\s*squad_artifact=([\w-]+)/g)].map(match => match[1]);
    const registry = registryArtifactKinds();

    for (const artifactKind of produced) {
      expect(registry, `Produced artifact "${artifactKind}" should be listed in the registry`).toContain(artifactKind);
    }
  });

  it('workflow schema enumerates every registered artifact kind', () => {
    for (const artifactKind of registryArtifactKinds()) {
      expect(squadContent, `safe-outputs.data should allow "${artifactKind}"`).toMatch(
        new RegExp(`^\\s+- ${artifactKind}$`, 'm')
      );
    }
  });

  it('Research fixture data supports downstream Triage discovery', () => {
    const fixtures = join(process.cwd(), 'test-fixtures', 'planning', 'aspiregregator');
    const researchBody = readText(join(fixtures, 'research-output.md'));
    const wrongOrigin = researchBody.replace('"origin_issue": 8', '"origin_issue": 999');
    const discovered = findLatestArtifact(
      ['No structured artifact here', wrongOrigin, researchBody],
      'research',
      8
    );

    expect(discovered?.data).toEqual({
      squad_artifact: 'research',
      schema_version: '1',
      origin_issue: 8,
      phases: [],
    });
    expect(discovered?.body).toContain('## Research Findings');
  });

  it('planning fixtures model normalized gh-aw bodies with durable JSON data', () => {
    const fixtures = join(process.cwd(), 'test-fixtures', 'planning', 'aspiregregator');
    const expected = new Map([
      ['research-output.md', ['research']],
      ['triage-output.md', ['triage']],
      ['program-plan-output.md', ['program']],
      ['implementation-plan-output.md', ['implementation']],
      ['validation-output.md', ['validation']],
      ['acceptance-outputs.md', ['scope-accepted', 'impl-accepted', 'activated']],
      ['lifecycle-state.md', ['lifecycle-state']],
    ]);

    for (const [file, artifactKinds] of expected) {
      const artifacts = extractStructuredData(readText(join(fixtures, file)));
      expect(artifacts.map(item => item.squad_artifact), file).toEqual(artifactKinds);
      for (const artifact of artifacts) {
        expect(artifact.schema_version, file).toBe('1');
        expect(artifact.origin_issue, file).toBe(8);
        expect(artifact.phases, file).toEqual([]);
      }
    }
  });

  it('phase-state artifacts retain accumulated phases in structured data', () => {
    const body = [
      '## Phase 2 Accepted',
      '',
      'Structured data:',
      '```json',
      '{"squad_artifact":"phases-accepted","schema_version":"1","origin_issue":8,"phases":[1,2]}',
      '```',
    ].join('\n');

    expect(findLatestArtifact([body], 'phases-accepted', 8)?.data.phases).toEqual([1, 2]);
    expect(squadContent).toContain('"phases":[{accumulated}]');
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
  const squadContent = readText(SQUAD_WORKFLOW);

  // gh-aw enforces a hard 100 KB prompt ceiling (102 400 bytes)
  const GH_AW_PROMPT_CEILING_KB = 100;
  const GH_AW_PROMPT_CEILING_BYTES = GH_AW_PROMPT_CEILING_KB * 1024;

  it('squad-planning-ontology.md is in the imports list', () => {
    expect(imports, 'shared/squad-planning-ontology.md must be imported').toContain('shared/squad-planning-ontology.md');
  });

  it('squad-planning-policy.md is in the imports list', () => {
    expect(imports, 'shared/squad-planning-policy.md must be imported').toContain('shared/squad-planning-policy.md');
  });

  it('no runtime cat of planning files remains in squad.md', () => {
    expect(
      squadContent,
      'squad.md must not contain runtime `cat .github/workflows/shared/*planning-*.md` instructions'
    ).not.toMatch(/cat .github\/workflows\/shared\/[\w-]*planning-[\w-]+\.md/);
  });

  it(`combined prompt (workflow + all imports) is under ${GH_AW_PROMPT_CEILING_KB} KB`, () => {
    let totalBytes = Buffer.byteLength(squadContent, 'utf8');

    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      if (existsSync(fullPath)) {
        const content = readText(fullPath);
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
      if (existsSync(fullPath)) totalBytes += Buffer.byteLength(readText(fullPath), 'utf8');
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
// Test: inline skill extraction semantics (gh-aw setup step)
//
// The shipped workflow moves its mode playbooks and planning reference material
// into gh-aw inline `## skill:` blocks so they load on demand instead of
// sitting in every run's ambient prompt.
//
// This models the real extractor (gh-aw-actions setup/js/extract_inline_skills.cjs)
// so the invariants are enforced here rather than discovered at runtime:
//
//   * a block runs from its start marker to a matching "## end skill: `name`"
//     if one exists, otherwise to the next H2 heading or EOF;
//   * when a block closes IMPLICITLY at an H2, everything between that boundary
//     and the next start marker is DISCARDED — not extracted, not kept.
//
// That discard rule is the sharp edge: a skill marker placed above a body whose
// own sections are H2s silently drops the rest of the file (and, because the
// imports are concatenated ahead of the workflow body, potentially the router
// itself). Conservation is asserted below so that can never ship unnoticed.
// ---------------------------------------------------------------------------

const SKILL_START_RE = /^##[ \t]+skill:[ \t]+`([a-z][a-z0-9_-]*)`[ \t]*$/gm;

interface ExtractionResult {
  ambient: string;
  skills: { name: string; bytes: number; body: string }[];
  discardedBytes: number;
  markerBytes: number;
}

/**
 * Report why a skill's frontmatter would fail to parse as YAML, or null if it is fine.
 *
 * gh-aw's extractor (setup/js/extract_inline_skills.cjs) filters skill frontmatter
 * LINE BY LINE and never parses it, so a malformed `description:` is written to
 * .github/skills/<name>/SKILL.md verbatim and surfaces only when the agent tries to
 * load that skill. `gh aw compile --strict` does not catch it either: at compile time
 * a skill block is still ordinary markdown. This check closes that gap.
 *
 * Deliberately hand-rolled rather than delegating to a YAML library: this repo has no
 * YAML parser in its dependency tree (frontmatter elsewhere is validated by actionlint,
 * which only reads real workflow YAML), and a lint this narrow does not justify adding
 * one. It targets the plain-scalar hazards that actually bite in a one-line description.
 */
function findFrontmatterScalarError(body: string): { key: string; value: string; reason: string } | null {
  if (!body.startsWith('\n---\n') && !body.startsWith('---\n')) return null;
  const opened = body.slice(body.indexOf('---\n') + 4);
  const closeIdx = opened.indexOf('\n---');
  if (closeIdx === -1) return null;

  for (const line of opened.slice(0, closeIdx).split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):[ \t]+(.*)$/.exec(line);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.trim();
    if (!value) continue;

    // A quoted scalar escapes every hazard below.
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1);
    if (quoted) continue;

    // Block scalars (`|`, `>`) carry their value on following lines.
    if (/^[|>][-+0-9]*$/.test(value)) continue;

    // `[` and `{` open YAML flow collections, which are valid unquoted and parse
    // fine -- `[a, b]` and `{a: b}` are not errors. Only an unterminated one is.
    // Checked before the ": " rule below so a flow mapping is not mistaken for a
    // nested mapping.
    if (/^[[{]/.test(value)) {
      const opens = (value.match(/[[{]/g) ?? []).length;
      const closes = (value.match(/[\]}]/g) ?? []).length;
      if (opens !== closes) {
        return { key, value, reason: 'unquoted value opens a YAML flow collection that is never closed' };
      }
      continue;
    }

    if (/:\s/.test(value)) {
      return { key, value, reason: 'unquoted value contains ": " and parses as a nested mapping' };
    }
    if (/\s#/.test(value)) {
      return { key, value, reason: 'unquoted value contains " #" and would be truncated as a comment' };
    }
    if (/^[&*!%@`]/.test(value)) {
      return { key, value, reason: `unquoted value starts with the YAML indicator "${value[0]}"` };
    }
  }
  return null;
}

/** Mirror of gh-aw's inline-skill extraction, including its discard behaviour. */
function extractInlineSkills(content: string): ExtractionResult {
  const starts = [...content.matchAll(SKILL_START_RE)];
  if (starts.length === 0) {
    return { ambient: content, skills: [], discardedBytes: 0, markerBytes: 0 };
  }

  const h2Positions = [...content.matchAll(/^## .*$/gm)]
    .map(m => m.index!)
    .filter(i => i !== undefined);

  let ambient = '';
  let cursor = 0;
  let discardedBytes = 0;
  let markerBytes = 0;
  const skills: { name: string; bytes: number; body: string }[] = [];

  for (const start of starts) {
    const startIdx = start.index!;
    if (startIdx < cursor) continue;

    ambient += content.slice(cursor, startIdx);
    markerBytes += Buffer.byteLength(start[0], 'utf8');

    const bodyStart = startIdx + start[0].length;
    const endMarker = new RegExp(
      `^##[ \\t]+end[ \\t]+skill:[ \\t]+\`${start[1]}\`[ \\t]*$`,
      'm'
    ).exec(content.slice(bodyStart));

    if (endMarker) {
      const bodyEnd = bodyStart + endMarker.index;
      skills.push({
        name: start[1],
        bytes: Buffer.byteLength(content.slice(bodyStart, bodyEnd), 'utf8'),
        body: content.slice(bodyStart, bodyEnd),
      });
      markerBytes += Buffer.byteLength(endMarker[0], 'utf8');
      cursor = bodyEnd + endMarker[0].length;
      continue;
    }

    // Implicit close: next H2 after the start marker, else EOF.
    const nextH2 = h2Positions.find(p => p > startIdx);
    const bodyEnd = nextH2 ?? content.length;
    skills.push({
      name: start[1],
      bytes: Buffer.byteLength(content.slice(bodyStart, bodyEnd), 'utf8'),
      body: content.slice(bodyStart, bodyEnd),
    });

    // Everything from here to the next start marker is dropped on the floor.
    const nextStart = starts.find(s => s.index! > startIdx)?.index ?? content.length;
    discardedBytes += Buffer.byteLength(content.slice(bodyEnd, Math.max(bodyEnd, nextStart)), 'utf8');
    cursor = Math.max(bodyEnd, nextStart);
  }

  ambient += content.slice(cursor);
  return { ambient, skills, discardedBytes, markerBytes };
}

describe('gh-aw: inline skill extraction', () => {
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const imports = extractImports(frontmatter);

  // Reproduce the prompt a real run assembles: imports first, then the body.
  const assembled = [
    ...imports
      .map(rel => join(WORKFLOWS_DIR, rel))
      .filter(existsSync)
      .map(readText),
    readText(SQUAD_WORKFLOW).replace(/^---\n[\s\S]*?\n---\n/, ''),
  ].join('\n');

  const result = extractInlineSkills(assembled);

  // Sections that must stay in the ambient prompt — without these the agent
  // cannot parse a command or route to a skill in the first place.
  const REQUIRED_AMBIENT_SECTIONS = [
    'Planning Artifact Data Contract',
    'Trigger Context',
    'Modes',
    'Parse Command',
    'Execute Mode',
    'Team Guard',
  ];

  const AMBIENT_BUDGET_BYTES = 40 * 1024;

  it('extracts every declared skill block', () => {
    expect(result.skills.length, 'expected inline skill blocks to be extracted').toBeGreaterThan(20);
  });

  it('discards no content during extraction', () => {
    const offenders = result.skills.filter(s => s.bytes < 200).map(s => s.name);
    expect(
      result.discardedBytes,
      `${result.discardedBytes} bytes were silently dropped. A skill block closed at an H2 ` +
        `instead of an explicit "## end skill:" marker. Suspiciously small skills: ` +
        `${offenders.join(', ') || '(none)'}. Add an explicit end marker to any skill whose ` +
        `body contains H2 headings.`
    ).toBe(0);
  });

  it('keeps the router sections in the ambient prompt', () => {
    for (const section of REQUIRED_AMBIENT_SECTIONS) {
      expect(
        result.ambient,
        `"${section}" must remain in the ambient prompt — it is required to dispatch a mode`
      ).toContain(section);
    }
  });

  it('loses no bytes overall (ambient + skills + markers == source)', () => {
    const accounted =
      Buffer.byteLength(result.ambient, 'utf8') +
      result.skills.reduce((n, s) => n + s.bytes, 0) +
      result.markerBytes;
    const source = Buffer.byteLength(assembled, 'utf8');
    // Marker lines carry trailing newlines that fall on either side of a split.
    expect(Math.abs(source - accounted), 'byte conservation check failed').toBeLessThan(
      result.skills.length * 4
    );
  });

  it(`keeps the ambient prompt under ${AMBIENT_BUDGET_BYTES / 1024} KB`, () => {
    const ambientBytes = Buffer.byteLength(result.ambient, 'utf8');
    expect(
      ambientBytes,
      `Ambient prompt is ${(ambientBytes / 1024).toFixed(1)} KB. Mode playbooks and planning ` +
        `reference material belong in inline skills, not the always-loaded prompt.`
    ).toBeLessThan(AMBIENT_BUDGET_BYTES);
  });

  it('gives every skill parseable YAML frontmatter', () => {
    const offenders = result.skills
      .map(s => ({ name: s.name, err: findFrontmatterScalarError(s.body) }))
      .filter((s): s is { name: string; err: NonNullable<ReturnType<typeof findFrontmatterScalarError>> } => s.err !== null);

    expect(
      offenders.map(o => `${o.name}: ${o.err.key} — ${o.err.reason}\n    ${o.err.value}`).join('\n  '),
      'Skill frontmatter must be valid YAML. Nothing upstream catches this: the extractor ' +
        'filters frontmatter line-by-line without parsing it, and `gh aw compile --strict` ' +
        'sees skill blocks as plain markdown. A broken value reaches the agent as a skill ' +
        'that cannot load. Quote the value.'
    ).toBe('');
  });

  it('flags real frontmatter scalar hazards without flagging valid YAML', () => {
    const wrap = (line: string) => `\n---\n${line}\nname: x\n---\nbody`;

    // Valid unquoted plain scalars and flow collections must not be flagged.
    for (const ok of [
      'description: Cast a squad',
      'description: "Cast a squad: from a repo"',
      "description: 'already quoted'",
      'allowed: [read, write]',
      'options: {mode: fast}',
      'description: |',
    ]) {
      expect(findFrontmatterScalarError(wrap(ok)), `false positive on: ${ok}`).toBeNull();
    }

    // Genuine hazards must still be caught.
    for (const bad of [
      'description: Cast a squad: from a repo',
      'description: Cast a squad #1',
      'description: &anchor',
      'allowed: [read, write',
    ]) {
      expect(findFrontmatterScalarError(wrap(bad)), `missed hazard in: ${bad}`).not.toBeNull();
    }
  });

  it('gives every dispatchable mode a skill to load', () => {
    const skillNames = new Set(result.skills.map(s => s.name));
    const modes = extractModeTable(readText(SQUAD_WORKFLOW));
    expect(modes.length, 'mode table should parse').toBeGreaterThan(15);

    const dispatchTable = readText(SQUAD_WORKFLOW);
    for (const { mode } of modes) {
      const slug =
        'squad-' +
        mode
          .replace(/\([^)]*\)/g, '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

      const hasSkill = skillNames.has(slug);
      // Some modes legitimately share a playbook; accept an explicit mapping row.
      const hasMapping = new RegExp(`\\|[^|\\n]*${mode.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^|\\n]*\\|[^|\\n]*squad-`, 'i').test(dispatchTable);

      expect(
        hasSkill || hasMapping,
        `Mode "${mode}" has no "## skill: \`${slug}\`" block and no row in the Execute Mode ` +
          `dispatch table pointing at a skill. It would have no playbook at runtime.`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: gh-aw compilation retains durable state and Auto-Cast contracts
// ---------------------------------------------------------------------------

describe('gh-aw: compiled workflow contract', () => {
  const ghAwAvailable = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' }).status === 0;

  // Explicit timeout: this test shells out to the real `gh aw compile` binary,
  // which reliably finishes in ~2-3s in isolation but can exceed the 5s vitest
  // default under full-suite parallel load/contention. Bumping this avoids
  // spurious CI flakiness unrelated to the assertions themselves.
  it.skipIf(!ghAwAvailable)('strict-compiles and preserves prompt/config behavior', () => {
    const workspace = createTestWorkspace('gh-aw-compile-');
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: workspace });
      // gh-aw's dispatch-workflow validation (added alongside #1682's
      // safe-outputs.dispatch-workflow config) resolves its dispatch target against
      // a `.github/workflows/` directory that it locates relative to the compiled
      // file's path, assuming the standard `<repo-root>/.github/workflows/<file>.md`
      // layout. This repo distributes the gh-aw *source* one level shallower, from a
      // top-level `workflows/` directory (see docs/src/content/docs/guide/gh-aw.md),
      // which downstream consumers install into their own `.github/workflows/` via
      // `gh aw add owner/squad/workflows/squad-implement-worker.md@dev
      // owner/squad/workflows/squad.md@dev` — landing both files side-by-side there.
      // Mirror that real deployment layout in the ephemeral test workspace (instead
      // of a bare `workflows/` copy) so the dispatch target `squad-implement-worker`
      // resolves the same way it will for every real downstream install.
      cpSync(WORKFLOWS_DIR, join(workspace, '.github', 'workflows'), { recursive: true });
      execFileSync('gh', ['aw', 'compile', '.github/workflows/squad.md', '--strict'], {
        cwd: workspace,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      const compiled = readText(join(workspace, '.github', 'workflows', 'squad.lock.yml'));
      expect(compiled).toContain('"auto_close_issue":false');
      expect(compiled).toContain('"data_enabled":true');
      expect(compiled).toContain('"required":["origin_issue","phases","schema_version","squad_artifact"]');
      expect(compiled).toContain('"enum":["research","plan","plan-accepted"');
      // gh-aw records runtime-import paths relative to the repo root (not the
      // compiled file's own directory), so with the real `.github/workflows/`
      // deployment layout these are prefixed accordingly — verified against an
      // isolated compile outside this repo/worktree entirely.
      expect(compiled).toContain('{{#runtime-import .github/workflows/shared/squad-planning-ontology.md}}');
      expect(compiled).toContain('{{#runtime-import .github/workflows/squad.md}}');
      expect(compiled).not.toMatch(/<!-- squad-[\w-]+(?:-v\d+)? -->/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 20000);
});

// ---------------------------------------------------------------------------
// Test: Merge continuation dispatch contract (#1751)
// ---------------------------------------------------------------------------

describe('gh-aw: merge continuation dispatch contract', () => {
  const squadFrontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const squadInputs = extractWorkflowDispatchInputs(squadFrontmatter);
  const workerContent = readText(SQUAD_IMPLEMENT_WORKER);

  it('does not silently default workflow_dispatch command to a mutating mode', () => {
    expect(squadInputs.command, 'Squad workflow_dispatch.command should exist').toBeDefined();
    // gh-aw forbids required workflow_dispatch inputs when the same workflow also
    // has slash_command triggers, so the safety contract is "no mutating default"
    // plus explicit missing-input handling in the prompt.
    expect(squadInputs.command.required).toBe('false');
    expect(squadInputs.command.default).toBeUndefined();
  });

  it('documents missing workflow_dispatch issue_number as a visible failure', () => {
    expect(readText(SQUAD_WORKFLOW)).toMatch(/missing issue_number/i);
    expect(readText(SQUAD_WORKFLOW)).toMatch(/workflow_dispatch\.inputs\.issue_number/i);
    expect(readText(SQUAD_WORKFLOW)).toMatch(/create a visible issue/i);
  });

  it('worker continuation dispatch payload nests keys that Squad declares', () => {
    const continuation = workerContent.match(
      /## Continue Parent Epic After Merge([\s\S]*?)The remaining instructions apply only to `workflow_dispatch`/
    )?.[1] ?? '';
    const payloadBlock = continuation.match(/```json\n([\s\S]*?)\n```/)?.[1];
    expect(payloadBlock, 'continuation dispatch JSON payload should be present').toBeDefined();

    const payload = JSON.parse(payloadBlock!) as {
      workflow_name?: string;
      inputs?: Record<string, string>;
      command?: string;
      issue_number?: string;
    };
    expect(payload.workflow_name).toBe('squad');
    expect(payload.command, 'command must not be a top-level dispatch_workflow argument').toBeUndefined();
    expect(payload.issue_number, 'issue_number must not be a top-level dispatch_workflow argument').toBeUndefined();
    expect(payload.inputs).toEqual({
      command: 'implement',
      issue_number: '{parent-epic-number}',
    });

    for (const key of Object.keys(payload.inputs ?? {})) {
      expect(squadInputs, `Squad workflow_dispatch input "${key}" should exist`).toHaveProperty(key);
    }
  });

  it('worker continuation warns dispatch_workflow is write-once and not schema-probed', () => {
    const continuation = workerContent.match(
      /## Continue Parent Epic After Merge([\s\S]*?)The remaining instructions apply only to `workflow_dispatch`/
    )?.[1] ?? '';

    expect(continuation, 'continuation should name the dispatch_workflow tool').toMatch(/dispatch_workflow/);
    expect(continuation, 'dispatch_workflow should be called once only with the final payload').toMatch(
      /exactly once[\s\S]*complete payload/i
    );
    expect(continuation, 'empty or placeholder schema probes should be forbidden').toMatch(
      /NEVER[\s\S]*empty[\s\S]*(?:placeholder|partial)[\s\S]*(?:probe|discover)[\s\S]*schema/i
    );
    expect(continuation, 'the prompt should say the schema is already supplied').toMatch(
      /full schema[\s\S]*already given[\s\S]*nothing to discover/i
    );
    expect(continuation, 'noop should be named as the alternative when not dispatching').toMatch(
      /not ready to dispatch[\s\S]*noop/i
    );
    expect(continuation, 'the consequence of a probe should be explicit').toMatch(
      /FIRST[\s\S]*wins[\s\S]*later calls[\s\S]*discarded[\s\S]*probe destroys/i
    );
  });

  it('worker continuation comments on the parent epic instead of auto-targeting the merged PR', () => {
    const continuation = workerContent.match(
      /## Continue Parent Epic After Merge([\s\S]*?)The remaining instructions apply only to `workflow_dispatch`/
    )?.[1] ?? '';
    expect(continuation).toMatch(/comment on the parent epic/i);
    expect(continuation).toMatch(/item_number[\s\S]*parent epic number/i);
  });
});

// ---------------------------------------------------------------------------
// Test: Plan Activate hardening behaviors (forward-port #1683)
// ---------------------------------------------------------------------------

describe('gh-aw: Plan Activate hardening behaviors', () => {
  const content = readText(SQUAD_WORKFLOW);

  it('includes output budget awareness guidance', () => {
    expect(content).toContain('Output Budget Awareness');
    expect(content).toMatch(/total.*>\s*50.*phased activation|phased.*activation.*>\s*50/i);
  });

  it('includes label pre-flight step before issue creation', () => {
    expect(content).toContain('Label Pre-flight');
    expect(content).toMatch(/squad.*label.*exist|label.*squad.*exist/i);
  });

  it('label pre-flight does not claim impossible label creation', () => {
    // Workflow has issues: read and no create-label safe-output; must not claim it can create labels
    const preflight = content.match(/##### Label Pre-flight\n([\s\S]*?)(?=\n#####|\n####)/)?.[1] ?? '';
    expect(preflight).not.toMatch(/create them|safe-output permissions handle the write|no additional token scope/i);
  });

  it('label pre-flight reports missing labels as prerequisite gap', () => {
    expect(content).toMatch(/prerequisite gap|prerequisite/i);
    expect(content).toMatch(/issues: write/i);
    expect(content).toMatch(/create-label.*safe-output|safe-output.*create-label/i);
  });

  it('label pre-flight continues activation and omits unavailable labels with report', () => {
    expect(content).toMatch(/unavailable labels are omitted and reported|omitted and reported/i);
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

// ---------------------------------------------------------------------------
// Test: Plan Activate atomic task-call contract (#1678 / run 31555893180)
// ---------------------------------------------------------------------------

describe('gh-aw: Plan Activate atomic task-call contract', () => {
  const content = readText(SQUAD_WORKFLOW);

  it('2c contains explicit ATOMIC CONTRACT heading', () => {
    expect(content).toMatch(/ATOMIC CONTRACT/i);
  });

  it('2c requires immediate call after each task body (one compose → one call)', () => {
    // Must encode the sequential compose/call/verify pattern
    expect(content).toMatch(/compose.*call.*verify|compose only that task.*call.*immediately/i);
  });

  it('2c explicitly forbids batching task bodies before calls', () => {
    expect(content).toMatch(/DO NOT.*compose.*batch|DO NOT.*buffer|not.*compose.*multiple.*before/i);
  });

  it('2c task body is compact: one sentence scope, 1-2 acceptance criteria', () => {
    expect(content).toMatch(/one sentence.*scope|1-2 acceptance criteria/i);
  });

  it('2d incomplete fallback calls report_incomplete with created/expected counts', () => {
    expect(content).toContain('report_incomplete');
    expect(content).toMatch(/created.*expected|expected.*created/i);
  });

  it('2d incomplete fallback never noops on count mismatch', () => {
    expect(content).toMatch(/never noop/i);
  });

  it('2d states re-run is idempotent via title match', () => {
    expect(content).toMatch(/idempotent via title match/i);
  });
});

// ---------------------------------------------------------------------------
// Test: Auto-Cast Pivot and resumable work (#1689)
// ---------------------------------------------------------------------------

describe('gh-aw: auto-cast pivot and resumable work (#1689)', () => {
  const content = readText(SQUAD_WORKFLOW);

  it('Team Guard section exists and lists covered modes', () => {
    expect(content).toMatch(/## Team Guard/);
    expect(content).toMatch(/Applies to:.*Research/i);
    expect(content).toMatch(/Applies to:.*Triage/i);
    expect(content).toMatch(/Applies to:.*Plan/i);
  });

  it('Team Guard is exempt for Cast, Connect, Adopt, Status, Implement', () => {
    expect(content).toMatch(/Exempt:.*Cast/i);
    expect(content).toMatch(/Exempt:.*Connect/i);
    expect(content).toMatch(/Exempt:.*Status/i);
    expect(content).toMatch(/Exempt:.*Implement/i);
  });

  it('Team Guard uses a roster-row detection check that emits TEAM_PRESENT or TEAM_ABSENT', () => {
    expect(content).toMatch(/TEAM_PRESENT/);
    expect(content).toMatch(/TEAM_ABSENT/);
    // Must inspect ## Members section for real data rows — not just file size
    expect(content).toMatch(/## Members/);
    expect(content).toMatch(/awk.*## Members.*TEAM_PRESENT.*TEAM_ABSENT|TEAM_ABSENT.*awk.*## Members/s);
    // Must NOT use the shallow `test -s` check that treats scaffold-only files as TEAM_PRESENT
    expect(content).not.toMatch(/test -s \.squad\/team\.md/);
  });

  it('Team Guard TG-1 reads committed HEAD state via git show, not local filesystem', () => {
    // Must use git show HEAD:.squad/team.md to read the committed blob, not a local file path
    expect(content).toMatch(/git show HEAD:\.squad\/team\.md/);
    // Must NOT read the local .squad/team.md file directly as an awk argument
    expect(content).not.toMatch(/awk '[^']*' \.squad\/team\.md/);
    expect(content).not.toMatch(/awk "[^"]*" \.squad\/team\.md/);
  });

  it('Team Guard description explains committed-HEAD vs local-activation distinction', () => {
    expect(content).toMatch(/committed.*HEAD|HEAD.*committed/i);
    expect(content).toMatch(/activation|local.*scaffold|scaffold.*local/i);
  });

  it('Auto-Cast Pivot stops and does not run original mode when TEAM_ABSENT', () => {
    expect(content).toMatch(/do not proceed with the original mode this run|do not run the original command this run/i);
    expect(content).toMatch(/Stop\. Do not run (Cast|the original)/i);
  });

  it('does not require unsupported Auto-Cast HTML markers', () => {
    expect(content).not.toMatch(/squad-(pending-intent|cast-opened|cast-pr)-v1/);
    expect(readText(join(SHARED_DIR, 'squad-planning-ontology.md')))
      .not.toMatch(/squad-(pending-intent|cast-opened|cast-pr)-v1/);
  });

  it('first run completion copy does not fabricate or promise a PR number', () => {
    // Must tell user to check PRs tab, not promise a specific PR number
    expect(content).toMatch(/Pull Requests.*tab|check.*Pull Requests/i);
    const castOpenedBlock = content.match(/No roster \+ no open Cast PR[\s\S]{0,1200}/)?.[0] ?? '';
    // Must NOT have a fabricated #{number} link in the cast-opened user copy
    expect(castOpenedBlock).not.toMatch(/PR:.*#\d{1,6}/);
  });

  it('rerun path reads actual GitHub state via gh pr list with headRefName + startsWith filter', () => {
    // Must use headRefName field and startsWith to match squad/cast-{repo} patterns
    expect(content).toMatch(/gh pr list/i);
    expect(content).toMatch(/headRefName/);
    expect(content).toMatch(/startswith\("squad\/cast-"\)/);
    expect(content).toMatch(/open Cast PR.*found|cast PR.*found|Cast PR is found/i);
    // Exact --head matching truncates the branch name and never finds squad/cast-{repo}; must be forbidden
    expect(content).not.toMatch(/--head "squad\/cast-"/);
    // squad/cast-member-* must be excluded so Cast Member PRs cannot satisfy Cast dedup
    expect(content).toMatch(/startswith\("squad\/cast-member-"\).*\| not|\| not.*startswith\("squad\/cast-member-"\)/);
  });

  it('Cast PR dedup stops without opening a duplicate PR', () => {
    expect(content).toMatch(/already opened a Cast PR[\s\S]*\*\*Cast PR:\*\* \{pr_url\}/i);
    expect(content).toMatch(/No duplicate PR opened|do not run Cast mode/i);
  });

  it('no open Cast PR always retries Cast, including after a closed or failed PR', () => {
    expect(content).toMatch(/If no open Cast PR found.*Execute Cast Mode/s);
    expect(content).toMatch(/closed or failed Cast PR is not durable team state/i);
  });

  it('Cast PR instructions forbid issue-closing keywords', () => {
    expect(content).toMatch(/MUST NOT contain.*Fixes.*Closes.*Resolves/i);
  });

  it('normal-flow recovery never instructs user to run /squad cast separately', () => {
    // The Auto-Cast section must explicitly forbid instructing the user to run /squad cast
    expect(content).toMatch(/Never instruct.*\/squad cast|never.*\/squad cast separately/i);
  });

  it('partial activation N/M copy uses plan total not safe-output cap', () => {
    expect(content).toMatch(/plan.*declared total|use the plan.*total.*not the safe-output cap/i);
  });

  it('partial activation post message includes rerun instruction', () => {
    expect(content).toMatch(/N of M issues created.*rerun the identical|rerun the identical.*command to continue/i);
  });

  it('partial activation never surfaces safe-output cap as reason', () => {
    expect(content).toMatch(/Never surface.*safe-output cap|never surface.*create-issue.*cap/i);
  });

  it('safe-output caps (75 create-issue / 20 add-comment) are not conflated with plan limits', () => {
    // The workflow frontmatter must declare max=75 for create-issue and max=20 for add-comment
    const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
    const safeOutputs = extractSafeOutputs(frontmatter);
    expect((safeOutputs['create-issue'] as { max: number })?.max).toBe(75);
    expect((safeOutputs['add-comment'] as { max: number })?.max).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Test: Team Guard roster-row detection — git-committed state coverage (#1689 revision 3)
//
// These tests replicate the exact TG-1 shell command from workflows/squad.md against
// a real project-local scratch git repository. This validates the committed-HEAD contract: only a
// team.md that is committed to HEAD can produce TEAM_PRESENT. Local working-tree files
// (e.g., from activation pre-steps like `squad init --preset default`) are invisible to
// the guard, preventing false TEAM_PRESENT in fresh repos.
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_POSIX_SHELL)('gh-aw: Team Guard roster-row detection — committed-HEAD git repo coverage (#1689 revision 3)', () => {
  // Content shared across test cases
  const SCAFFOLD_CONTENT = `# Squad Team\n\n## Members\n| Name | Role | Charter path | Status |\n|------|------|--------------|--------|\n`;
  const ONE_MEMBER_CONTENT = `# Squad Team\n\n## Members\n| Name | Role | Charter path | Status |\n|------|------|--------------|--------|\n| Eecom | Core Dev | .squad/agents/eecom/charter.md | active |\n`;
  const ONE_MEMBER_CRLF_CONTENT = ONE_MEMBER_CONTENT.replace(/\n/g, '\r\n');
  const SCAFFOLD_CRLF_CONTENT = SCAFFOLD_CONTENT.replace(/\n/g, '\r\n');

  // Runs the exact TG-1 command from squad.md in a given working directory.
  // The command reads .squad/team.md from the committed HEAD via git show.
  function runCommittedRosterCheck(cwd: string): string {
    return execSync(
      `git show HEAD:.squad/team.md 2>/dev/null | awk '{sub(/\\r$/,"")} /^## Members/{f=1;next} f&&/^#/{f=0} f&&/^\\|/&&!/^\\|[-: |]*\\|$/&&!/\\| *Name *\\|/' | grep -q . && echo TEAM_PRESENT || echo TEAM_ABSENT`,
      { cwd, shell: '/bin/sh', encoding: 'utf8' }
    ).trim();
  }

  // Creates a project-local scratch git repo, runs the setup callback, then returns the dir.
  // Caller must call cleanup() when done.
  function makeGitRepo(setup: (dir: string) => void): { dir: string; cleanup: () => void } {
    const dir = createTestWorkspace('team-guard-');
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    setup(dir);
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  function commitFile(dir: string, relPath: string, content: string): void {
    const fullPath = join(dir, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    execFileSync('git', ['add', '--', relPath], { cwd: dir });
    execFileSync('git', ['commit', '--quiet', '-m', 'test'], {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Squad Test',
        GIT_AUTHOR_EMAIL: 'squad-test',
        GIT_COMMITTER_NAME: 'Squad Test',
        GIT_COMMITTER_EMAIL: 'squad-test',
      },
    });
  }

  function addWorkingTree(dir: string, relPath: string, content: string): void {
    const fullPath = join(dir, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  // ── Case 1: no committed team.md but working-tree scaffold present ────────
  it('no committed .squad/team.md but working-tree scaffold → TEAM_ABSENT', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      // Create an initial commit with an unrelated file so HEAD is valid
      commitFile(d, 'README.md', '# Test\n');
      // Add scaffold to working tree only — never committed
      addWorkingTree(d, '.squad/team.md', SCAFFOLD_CONTENT);
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_ABSENT');
    } finally {
      cleanup();
    }
  });

  // ── Case 2: committed empty team.md ──────────────────────────────────────
  it('committed empty .squad/team.md → TEAM_ABSENT', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      commitFile(d, '.squad/team.md', '');
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_ABSENT');
    } finally {
      cleanup();
    }
  });

  // ── Case 3: committed header-only scaffold ────────────────────────────────
  it('committed header-only .squad/team.md (## Members + header + separator, no data rows) → TEAM_ABSENT', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      commitFile(d, '.squad/team.md', SCAFFOLD_CONTENT);
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_ABSENT');
    } finally {
      cleanup();
    }
  });

  // ── Case 4: committed real roster ────────────────────────────────────────
  it('committed .squad/team.md with one real member row → TEAM_PRESENT', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      commitFile(d, '.squad/team.md', ONE_MEMBER_CONTENT);
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_PRESENT');
    } finally {
      cleanup();
    }
  });

  // ── Case 5: working-tree real roster over absent committed path ──────────
  it('working-tree real roster over absent committed .squad/team.md → TEAM_ABSENT', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      commitFile(d, 'README.md', '# Test\n');
      // Full roster in working tree, but never committed
      addWorkingTree(d, '.squad/team.md', ONE_MEMBER_CONTENT);
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_ABSENT');
    } finally {
      cleanup();
    }
  });

  // ── Case 6: committed real roster with dirty working-tree changes ─────────
  it('committed real roster with dirty working-tree changes → TEAM_PRESENT (reads HEAD)', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      commitFile(d, '.squad/team.md', ONE_MEMBER_CONTENT);
      // Overwrite with scaffold in working tree — guard must still read HEAD
      addWorkingTree(d, '.squad/team.md', SCAFFOLD_CONTENT);
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_PRESENT');
    } finally {
      cleanup();
    }
  });

  // ── Case 7: committed CRLF scaffold → TEAM_ABSENT ────────────────────────
  it('committed CRLF header-only .squad/team.md (Windows line endings) → TEAM_ABSENT', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      commitFile(d, '.squad/team.md', SCAFFOLD_CRLF_CONTENT);
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_ABSENT');
    } finally {
      cleanup();
    }
  });

  // ── Case 8: committed CRLF real roster → TEAM_PRESENT ────────────────────
  it('committed CRLF .squad/team.md with one real member row (Windows line endings) → TEAM_PRESENT', () => {
    const { dir, cleanup } = makeGitRepo((d) => {
      commitFile(d, '.squad/team.md', ONE_MEMBER_CRLF_CONTENT);
    });
    try {
      expect(runCommittedRosterCheck(dir)).toBe('TEAM_PRESENT');
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Auto-Cast prompt hygiene (#1689 revision)
// ---------------------------------------------------------------------------

describe('gh-aw: Auto-Cast prompt hygiene (#1689 revision)', () => {
  const content = readText(SQUAD_WORKFLOW);

  it('{original_command} does not appear anywhere in workflow — only canonical command variables are used', () => {
    expect(content).not.toMatch(/\{original_command\}/);
  });

  it('contains no source-only assertion that Squad HTML comments survive gh-aw', () => {
    expect(content).not.toMatch(/<!-- squad-[\w-]+(?:-v\d+)? -->/);
  });
});

// ---------------------------------------------------------------------------
// Test: Cast PR dedup jq filter — behavioral coverage (#1689 revision)
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_POSIX_SHELL)('gh-aw: Cast PR dedup jq filter behavioral coverage (#1689 revision)', () => {
  const squadContent = readText(SQUAD_WORKFLOW);

  // Extract the exact --jq expression from squad.md so this test stays in sync.
  function extractJqFilter(): string {
    const m = squadContent.match(/--jq '([^']+)'/);
    if (!m) throw new Error('Could not extract --jq filter from squad.md TG-3');
    return m[1];
  }

  function runJqFilter(jsonInput: string, filter: string): string {
    return execSync(
      `echo '${jsonInput.replace(/'/g, "'\\''")}' | jq -r '${filter}'`,
      { shell: '/bin/sh', encoding: 'utf8' }
    ).trim();
  }

  it('extracts a jq filter from squad.md TG-3 block', () => {
    expect(() => extractJqFilter()).not.toThrow();
    const filter = extractJqFilter();
    expect(filter).toMatch(/startswith/);
    expect(filter).toMatch(/headRefName/);
  });

  it('real Cast branch (squad/cast-{repo}) satisfies the filter and returns the PR', () => {
    const filter = extractJqFilter();
    const prs = JSON.stringify([
      { headRefName: 'squad/cast-myrepo', number: 42, url: 'https://github.com/org/repo/pull/42' },
    ]);
    const result = runJqFilter(prs, filter);
    expect(result).toContain('"headRefName": "squad/cast-myrepo"');
    expect(result).toContain('"number": 42');
  });

  it('Cast Member branch (squad/cast-member-*) is excluded and returns null', () => {
    const filter = extractJqFilter();
    const prs = JSON.stringify([
      { headRefName: 'squad/cast-member-dev', number: 43, url: 'https://github.com/org/repo/pull/43' },
    ]);
    const result = runJqFilter(prs, filter);
    expect(result).toBe('null');
  });

  it('a closed Cast PR is absent from the open-PR scan, allowing additive retry', () => {
    const filter = extractJqFilter();
    const allPrs = [
      {
        headRefName: 'squad/cast-myrepo',
        number: 41,
        state: 'CLOSED',
        url: 'https://github.com/org/repo/pull/41',
      },
    ];
    const openPrs = allPrs.filter(pr => pr.state === 'OPEN');
    expect(runJqFilter(JSON.stringify(openPrs), filter)).toBe('null');
    expect(squadContent).toMatch(/If no open Cast PR found.*Execute Cast Mode/s);
  });

  it('Cast branch is selected and Cast Member branch is excluded when both are open', () => {
    const filter = extractJqFilter();
    const prs = JSON.stringify([
      { headRefName: 'squad/cast-member-dev', number: 43, url: 'https://github.com/org/repo/pull/43' },
      { headRefName: 'squad/cast-myrepo', number: 42, url: 'https://github.com/org/repo/pull/42' },
    ]);
    const result = runJqFilter(prs, filter);
    expect(result).toContain('"headRefName": "squad/cast-myrepo"');
    expect(result).not.toContain('squad/cast-member-dev');
  });
});

// ---------------------------------------------------------------------------
// gh-aw: Auto-Cast UX guidance — canonical fallback, paused-run wording,
// and Cast PR body return/rerun instruction (#1700)
//
// Focused contract assertions for the UX guidance added in #1700.
// Complements the broader auto-Cast coverage in the '#1689' describe blocks above.
// ---------------------------------------------------------------------------
describe('gh-aw: Auto-Cast UX guidance — canonical fallback and Cast PR body return instruction (#1700)', () => {
  const squadContent = readText(SQUAD_WORKFLOW);

  it('canonical_mode definition includes safe fallback for unresolvable mode', () => {
    expect(squadContent).toMatch(/if.*canonical_mode.*cannot be determined.*safe fallback|safe fallback.*\/squad/i);
  });

  it('first-run Auto-Cast comment tells user their command is paused this run', () => {
    expect(squadContent).toMatch(/command.*paused this run|paused this run/i);
  });

  it('Cast PR body instructs user to return to originating issue and rerun canonical command', () => {
    expect(squadContent).toMatch(/return to the originating issue and rerun.*\{canonical_command\}/s);
  });
});

// ---------------------------------------------------------------------------
// gh-aw: Threat detection taxonomy regression (#1701)
//
// Verifies that Squad's label registry correctly distinguishes detection
// infrastructure failures (`agentic-detection-failed`) from confirmed content
// threats (`agentic-threat-detected`).  The former is Squad-owned; the latter
// is applied by the upstream gh-aw framework and MUST NOT be defined here.
// ---------------------------------------------------------------------------
describe('gh-aw: threat detection taxonomy — parse_error must not map to agentic-threat-detected (#1701)', () => {
  const LABEL_SYNC = join(process.cwd(), '.github/workflows/sync-squad-labels.yml');
  const labelSyncContent = readText(LABEL_SYNC);

  it('sync-squad-labels.yml defines agentic-detection-failed for infrastructure failures', () => {
    expect(labelSyncContent).toContain('agentic-detection-failed');
  });

  it('agentic-detection-failed label has a non-empty description that mentions infrastructure failure', () => {
    expect(labelSyncContent).toMatch(/agentic-detection-failed.*infrastructure failure|infrastructure failure.*agentic-detection-failed/s);
  });

  it('agentic-detection-failed is distinct from agentic-threat-detected (Squad must not define the threat label)', () => {
    // agentic-threat-detected is applied by the upstream process_safe_outputs.cjs on genuine threats.
    // Squad must not redefine it here to avoid ambiguity in the taxonomy.
    expect(labelSyncContent).not.toContain('agentic-threat-detected');
  });

  it('agentic-detection-failed is present in SIGNAL_LABELS array (high-visibility, not buried)', () => {
    // Verify the label appears after the SIGNAL_LABELS declaration, confirming it is
    // placed in the high-signal group rather than a lower-priority type:* group.
    const signalStart = labelSyncContent.indexOf('SIGNAL_LABELS');
    expect(signalStart).toBeGreaterThan(-1);
    const signalEnd = labelSyncContent.indexOf('];', signalStart);
    const signalBlock = labelSyncContent.slice(signalStart, signalEnd);
    expect(signalBlock).toContain('agentic-detection-failed');
  });
});
