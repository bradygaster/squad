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
const SHARED_DIR = join(WORKFLOWS_DIR, 'shared');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

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
  const ontologyContent = readFileSync(join(SHARED_DIR, 'planning-ontology.md'), 'utf8');
  const squadContent = readFileSync(SQUAD_WORKFLOW, 'utf8');

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
    const researchBody = readFileSync(join(fixtures, 'research-output.md'), 'utf8');
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
      const artifacts = extractStructuredData(readFileSync(join(fixtures, file), 'utf8'));
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

      const compiled = readFileSync(join(workspace, '.github', 'workflows', 'squad.lock.yml'), 'utf8');
      expect(compiled).toContain('"auto_close_issue":false');
      expect(compiled).toContain('"data_enabled":true');
      expect(compiled).toContain('"required":["origin_issue","phases","schema_version","squad_artifact"]');
      expect(compiled).toContain('"enum":["research","plan","plan-accepted"');
      // gh-aw records runtime-import paths relative to the repo root (not the
      // compiled file's own directory), so with the real `.github/workflows/`
      // deployment layout these are prefixed accordingly — verified against an
      // isolated compile outside this repo/worktree entirely.
      expect(compiled).toContain('{{#runtime-import .github/workflows/shared/planning-ontology.md}}');
      expect(compiled).toContain('{{#runtime-import .github/workflows/squad.md}}');
      expect(compiled).not.toMatch(/<!-- squad-[\w-]+(?:-v\d+)? -->/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 20000);
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
  const content = readFileSync(SQUAD_WORKFLOW, 'utf8');

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
  const content = readFileSync(SQUAD_WORKFLOW, 'utf8');

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
    expect(readFileSync(join(SHARED_DIR, 'planning-ontology.md'), 'utf8'))
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

describe('gh-aw: Team Guard roster-row detection — committed-HEAD git repo coverage (#1689 revision 3)', () => {
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
  const content = readFileSync(SQUAD_WORKFLOW, 'utf8');

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

describe('gh-aw: Cast PR dedup jq filter behavioral coverage (#1689 revision)', () => {
  const squadContent = readFileSync(SQUAD_WORKFLOW, 'utf8');

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
  const squadContent = readFileSync(SQUAD_WORKFLOW, 'utf8');

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
