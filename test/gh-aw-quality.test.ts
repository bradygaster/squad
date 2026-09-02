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
import { tmpdir } from 'node:os';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { minimatch } from 'minimatch';
import { POSIX_SHELL, NO_POSIX_SHELL_MESSAGE, requirePosixShell } from './posix-shell';
import {
  extractRunBlocks,
  scanRunBlocks,
  extractBodyHandlingShell,
  scanShellLines,
  formatViolations,
  type ContractToken,
} from './gh-aw-shell-contract';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const SQUAD_IMPLEMENT_WORKER = join(WORKFLOWS_DIR, 'squad-implement-worker.md');
const SHARED_DIR = join(WORKFLOWS_DIR, 'shared');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces');

/**
 * Some suites execute the workflow's own `bash`/`jq` snippets through a POSIX
 * shell to prove the shipped one-liners behave as documented.
 *
 * These suites used to gate on `existsSync('/bin/sh')`, which is absent on a
 * stock Windows dev box — so 13 tests (28 assertions) silently skipped while the
 * suite still reported green (#1833). Git for Windows ships a POSIX shell, so
 * resolve that instead of skipping, and fail loudly when none can be found.
 */

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

/** Extract the resources list from frontmatter. */
function extractResources(frontmatter: string): string[] {
  const resources: string[] = [];
  const lines = frontmatter.split('\n');
  let inResources = false;

  for (const line of lines) {
    if (line.match(/^resources:\s*$/)) {
      inResources = true;
      continue;
    }

    if (inResources) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch) {
        resources.push(itemMatch[1].trim());
      } else if (line.match(/^\S/)) {
        break;
      }
    }
  }

  return resources;
}

function extractNamedStepScript(frontmatter: string, stepName: string): string {
  const escapedName = stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = frontmatter.match(
    new RegExp(`^  - name: ${escapedName}\\n    shell: bash\\n    run: \\|\\n([\\s\\S]*?)(?=^  - name:|\\n\\S)`, 'm'),
  );
  if (!match) throw new Error(`No bash step named "${stepName}" found`);
  return match[1].split('\n').map(line => line.replace(/^ {6}/, '')).join('\n').trim();
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
function extractConcurrency(frontmatter: string): Record<string, string> | undefined {
  const lines = frontmatter.split('\n');
  const concurrencyLine = lines.findIndex(line => /^concurrency:\s*$/.test(line));
  if (concurrencyLine === -1) return undefined;

  const block: Record<string, string> = {};
  for (let i = concurrencyLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;

    const propertyMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*(.+)$/);
    if (propertyMatch) {
      block[propertyMatch[1]] = propertyMatch[2];
    }
  }

  return Object.keys(block).length > 0 ? block : undefined;
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
  const workflow = readText(SQUAD_WORKFLOW);
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const safeOutputs = extractSafeOutputs(frontmatter);

  it('safe-outputs section exists and has entries', () => {
    expect(Object.keys(safeOutputs).length).toBeGreaterThan(0);
  });

  it('each safe-output has a max value that is a positive integer ≤ 1000', () => {
    for (const [name, config] of Object.entries(safeOutputs)) {
      if (name === 'data' || name === 'messages' || name === 'jobs') continue;
      expect(config.max, `${name} should have a max field`).toBeDefined();
      const max = config.max as number;
      expect(max, `${name}.max should be > 0`).toBeGreaterThan(0);
      expect(max, `${name}.max should be ≤ 1000`).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(max), `${name}.max should be an integer`).toBe(true);
    }
  });

  it('each custom safe-output job has a bounded max value', () => {
    const jobsBlock = frontmatter.match(
      /^  jobs:\n([\s\S]*?)(?=^  [\w-]+:)/m,
    )?.[1] ?? '';
    const jobs = [...jobsBlock.matchAll(
      /^    ([\w-]+):\n([\s\S]*?)(?=^    [\w-]+:|(?![\s\S]))/gm,
    )];
    expect(jobs.length).toBeGreaterThan(0);
    for (const [, name, config] of jobs) {
      const max = Number(config.match(/^      max:\s*(\d+)\s*$/m)?.[1]);
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
    expect(pr['allowed-files'], 'Cast PR must allow generated agent definitions').toContain(
      '.github/agents/*.agent.md',
    );
    expect(pr['auto-close-issue'], 'Cast PR must not close the originating work issue').toBe(false);
  });

  it('reports the verified pull request after safe-output creation', () => {
    const cast = workflow.slice(
      workflow.indexOf('## skill: `squad-cast`'),
      workflow.indexOf('## skill: `squad-review-relay`'),
    );

    expect(frontmatter).toContain(
      'pull-request-created: "🤖 Squad created [PR #{item_number}]({item_url}) for review.',
    );
    expect(safeOutputs.messages['append-only-comments']).toBe(true);
    expect(cast).toContain(
      '`safe-outputs.messages.pull-request-created` notification runs after PR creation',
    );
    expect(cast).not.toContain('**PR:** #{pr_number}');
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

  it('keeps built-in comment targets explicit (#1916)', () => {
    expect(safeOutputs['add-comment'].target).toBe('*');
    expect(safeOutputs['add-comment']['allows-comment-ids']).toBeUndefined();
  });

  it('create-issue max is 75 (supports large plans, forward-port of #1683)', () => {
    const ci = safeOutputs['create-issue'];
    expect(ci, 'create-issue block must exist').toBeDefined();
    expect(ci['max'], 'create-issue max must be 75 — do not reduce below this').toBe(75);
  });

  it('add-labels exists and can auto-provision squad labels on a fresh repo (#1955)', () => {
    const al = safeOutputs['add-labels'];
    expect(al, 'add-labels block must exist').toBeDefined();
    expect(al['create-if-missing'], 'add-labels must set create-if-missing so a fresh repo with no squad labels does not silently drop them').toBe(true);
    expect(al['allowed']).toEqual(['squad', 'squad:*']);
    expect(al['issues'], 'add-labels must be allowed to target issues').toBe(true);
    expect(al['target'], 'add-labels must target created issues, not only the triggering one').toBe('*');
    // One add_labels call per created issue; must cover the largest possible
    // create-issue run (max 75) with headroom, never less.
    expect(al['max'] as number).toBeGreaterThanOrEqual(safeOutputs['create-issue']['max'] as number);
  });
});

describe('#1916: lifecycle comment updates use a deterministic safe-output job', () => {
  const workflow = readText(SQUAD_WORKFLOW);
  const shared = readText(join(SHARED_DIR, 'squad.md'));

  it('defines a bounded, permission-scoped lifecycle upsert', () => {
    expect(shared).toContain('upsert-lifecycle-state:');
    expect(shared).toContain('needs: safe_outputs');
    expect(shared).toContain('issues: write');
    expect(shared).toContain('pull-requests: write');
    expect(shared).toContain('max: 1');
  });

  it('selects only bot-authored lifecycle artifacts and chooses the newest', () => {
    expect(shared).toContain('comment.user?.login === "github-actions[bot]"');
    expect(shared).toContain('includes(marker)');
    expect(shared).toContain('.sort((left, right)');
    expect(shared).toContain('const current = matches.at(-1);');
  });

  it('updates in place or creates the first lifecycle comment', () => {
    expect(shared).toContain('github.rest.issues.updateComment');
    expect(shared).toContain('comment_id: current.id');
    expect(shared).toContain('github.rest.issues.createComment');
  });

  it('requires one lifecycle upsert with a complete body', () => {
    expect(workflow).toContain('call `upsert_lifecycle_state` once');
    expect(workflow).toContain('updates the newest trusted tracker or creates the first one');
  });

  it('repairs terminal state deterministically when an idempotent rerun omits the upsert', () => {
    expect(shared).toContain('repair_activated_lifecycle:');
    expect(shared).toContain(
      "!contains(needs.agent.outputs.output_types, 'upsert_lifecycle_state')",
    );
    expect(shared).toContain("github.event.comment.body == '/squad activate'");
    expect(shared).toContain('envelope?.squad_artifact === "plan-accepted"');
    expect(shared).toContain('name: Repair terminal lifecycle after idempotent activation');
  });
});

describe('gh-aw: router concurrency guard (#1730)', () => {
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const concurrency = extractConcurrency(frontmatter);

  it('lets the router post explicit mode-specific authorization refusals', () => {
    expect(frontmatter).toMatch(/^  roles: all$/m);
  });

  it('declares issue-scoped concurrency without cancel-in-progress', () => {
    expect(concurrency, 'squad.md should declare a concurrency block').toBeDefined();
    expect(concurrency?.group).toBe(
      '"squad-${{ github.event.inputs.issue_number || github.event.issue.number || github.event.pull_request.number || github.run_id }}"'
    );
    expect(concurrency?.['cancel-in-progress']).toBe('false');
    expect(concurrency?.group, 'group must resolve the manual-dispatch issue number').toContain(
      'github.event.inputs.issue_number'
    );
    expect(concurrency?.group, 'group must resolve issue and issue_comment events').toContain(
      'github.event.issue.number'
    );
    expect(concurrency?.group, 'group must resolve pull_request_review_comment events').toContain(
      'github.event.pull_request.number'
    );
    expect(concurrency?.group, 'group must not collapse to a static/global lock').toContain('github.run_id');
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

  describe('#1982: experimental gh-aw resource delivery probe', () => {
    const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
    const probeResource = 'shared/squad-gh-aw-resource-probe.txt';
    const probePath = join(WORKFLOWS_DIR, probeResource);
    const expectedDigest = 'dba0c331c0b0fda06539bd9245dda72bd9c36cca6962726147b03168c1d97a73';
    const stepName = 'Assert experimental gh-aw resource delivery';

    it('declares the plaintext probe on the top-level direct-install workflow only', () => {
      expect(extractResources(frontmatter)).toEqual([probeResource]);
      expect(existsSync(probePath)).toBe(true);
      expect(readText(probePath)).toContain('Experiment: bradygaster/squad#1982');
      expect(readText(probePath)).toContain('no executable or runtime behavior');

      for (const sharedFile of [
        'squad.md',
        'squad-cast-validator.md',
        'squad-planning-ontology.md',
        'squad-planning-policy.md',
      ]) {
        expect(readText(join(SHARED_DIR, sharedFile))).not.toMatch(/^resources:/m);
      }
    });

    it('pins the exact plaintext bytes and checks missing, unreadable, and mismatched resources', () => {
      const actualDigest = createHash('sha256').update(readFileSync(probePath)).digest('hex');
      const script = extractNamedStepScript(frontmatter, stepName);

      expect(actualDigest).toBe(expectedDigest);
      expect(script).toContain(`expected_sha256="${expectedDigest}"`);
      expect(script).toContain('if [ ! -f "$probe" ]');
      expect(script).toContain('if [ ! -r "$probe" ]');
      expect(script).toContain('Experimental gh-aw resource probe SHA-256 mismatch');
    });

    it('fails closed before the agent for a missing or modified installed probe', () => {
      const script = extractNamedStepScript(frontmatter, stepName);
      const shell = requirePosixShell();
      const workspace = createTestWorkspace('gh-aw-resource-probe-');
      const installedProbe = join(workspace, '.github', 'workflows', probeResource);
      mkdirSync(dirname(installedProbe), { recursive: true });

      const missing = spawnSync(shell, ['-c', script], {
        cwd: workspace,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_WORKSPACE: workspace, RUNNER_TEMP: workspace },
      });
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain('Experimental gh-aw resource probe is missing');

      writeFileSync(installedProbe, 'tampered\n');
      const modified = spawnSync(shell, ['-c', script], {
        cwd: workspace,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_WORKSPACE: workspace, RUNNER_TEMP: workspace },
      });
      expect(modified.status).not.toBe(0);
      expect(modified.stderr).toContain('Experimental gh-aw resource probe SHA-256 mismatch');

      cpSync(probePath, installedProbe);
      const verified = spawnSync(shell, ['-c', script], {
        cwd: workspace,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_WORKSPACE: workspace, RUNNER_TEMP: workspace },
      });
      expect(verified.status).toBe(0);
      expect(verified.stdout).toContain('Experimental gh-aw resource delivery verified');
    });
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
// Test: Validation schema must not ship its own verdict (#1801)
// ---------------------------------------------------------------------------

/**
 * The planning ontology's Validation Result schema (§3.6) once listed five named
 * checks, each pre-filled with a literal `✅`. The model was therefore not asked
 * to determine a verdict — it was handed a table whose verdict was already PASS
 * and asked to reproduce it. It did, including on a run where every agent binding
 * was invalid: `| Agent assignments valid | ✅ (lead, lead, devrel) |`. The check
 * passed on precisely the input it exists to reject.
 *
 * That is #1784's mechanism aimed at the verdict instead of the value — a concrete
 * literal in the prompt gets copied verbatim, and here the salient literal was the
 * pass mark. The ontology's own convention already said how to avoid it: angle
 * brackets mean "you fill this in", which §3.6's final row obeyed while the five
 * above it did not.
 *
 * Scope note: this deliberately targets the *validation* schema rather than every
 * status literal in the file. §5's Lifecycle Summary legitimately ships a worked
 * snapshot with mixed `✅ Done` / `⬚ Pending` rows plus an icon legend — that is
 * bookkeeping recorded from which command ran, not a judgment determined from
 * evidence, and a blanket rule would fail it for no benefit. A precise gate that
 * provably catches the real defect beats a general one that misfires.
 */
describe('gh-aw: validation schema ships no pre-filled verdict (#1801)', () => {
  const ontology = readText(join(SHARED_DIR, 'squad-planning-ontology.md'));

  /** The fenced `## Plan Validation` template from ontology §3.6. */
  function validationSchema(): string {
    const match = ontology.match(/```markdown\n(## Plan Validation[\s\S]*?)```/);
    if (!match) {
      throw new Error(
        'Could not locate the fenced `## Plan Validation` schema in ' +
          'squad-planning-ontology.md. If §3.6 was renamed, update this test — ' +
          'do not delete it.',
      );
    }
    return match[1];
  }

  /** Rows of a markdown table, minus header and separator. */
  function dataRows(block: string): string[][] {
    return block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|') && !/^\|[\s\-:|]+\|$/.test(l))
      .map((l) =>
        l
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim()),
      )
      .filter((cells) => cells[0] !== 'Check');
  }

  it('locates the validation schema', () => {
    // Guards the assertions below against silently evaluating an empty set —
    // the same vacuous-pass failure this suite exists to prevent.
    expect(dataRows(validationSchema()).length).toBeGreaterThan(0);
  });

  it('supplies no literal verdict in a cell the model must determine', () => {
    const offenders = dataRows(validationSchema())
      .filter((cells) => cells.slice(1).some((c) => /^(✅|❌)/.test(c)))
      .map((cells) => `| ${cells.join(' | ')} |`);

    expect(
      offenders,
      'A named check paired with a literal verdict hands the model its answer, ' +
        'and it will be copied verbatim (#1784). Use <placeholder> syntax for ' +
        `every cell the model must determine:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('defers to one check vocabulary instead of naming its own', () => {
    // Three surfaces once disagreed on what the checks were: this schema listed
    // five names, `squad-plan-validate` Step 2 numbered ten different ones, and
    // the implementation plan specified none at all. The ambiguity resolved
    // toward the pre-filled template. One vocabulary, named in one place.
    expect(
      validationSchema(),
      'The Validation Result schema must point at squad-plan-validate Step 2 ' +
        'as the sole check vocabulary rather than restating check names.',
    ).toMatch(/Step 2/);
  });

  it('does not restate a pass threshold that Step 2 owns', () => {
    // The removed rows carried `Sizing within bounds (no >XL)` while Step 2
    // Check 5 fails a task `> L`. Two surfaces, two thresholds, one silent
    // contradiction — duplication is how they drifted apart.
    expect(validationSchema()).not.toMatch(/>\s*XL/);
  });

  it('keeps the self-assessed pre-check out of the implementation plan', () => {
    // Surface 1: the implementation plan named a `Validation Pre-check` section
    // with zero rows specified, so the model reached for the pre-cleared
    // template in §3.6. A pass claimed by the skill that authored the plan is
    // not evidence.
    expect(
      readText(SQUAD_WORKFLOW),
      'squad.md must not reintroduce a self-assessed Validation Pre-check; ' +
        'validation is /squad plan validate\'s artifact.',
    ).not.toMatch(/→\s*Validation Pre-check/);
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

  // There is no hard gh-aw prompt ceiling, and this block used to assert one (#1842).
  //
  // The 102 400 figure previously cited here as "gh-aw enforces a hard 100 KB prompt
  // ceiling" is `defaultRepoMemoryMaxFileSize` in gh-aw's pkg/workflow/repo_memory.go —
  // a cap on repo-MEMORY files, unrelated to prompts. gh-aw's own guidance
  // (.github/aw/token-optimization.md) treats prompt size as a cost/quality concern
  // ("strip redundant instructions"), never as a byte limit.
  //
  // It also measured the wrong quantity. What reaches the model is the AMBIENT prompt:
  // gh-aw strips every inline `## skill:` block during the setup/interpolation step
  // (.github/aw/skills.md), and ~2/3 of this workflow plus two entire imports are such
  // blocks. Summing raw source therefore counted ~65 KB that never enters the initial
  // request, while ignoring the boilerplate gh-aw injects (xpia.md, markdown.md,
  // safe_outputs_*.md). Both sides of the comparison were wrong, which left the gate
  // reporting ~26 bytes of headroom and failing correct changes on byte count alone.
  //
  // The real budget is asserted canonically in "gh-aw: inline skill extraction" →
  // "keeps the ambient prompt under 40 KB". The check below is only a source-GROWTH
  // regression guard: it keeps unbounded authoring growth visible without pretending
  // authored bytes are delivered bytes.
  //
  // Raised 160 → 170 KB by #1959. The fast-path label-provisioning contract it adds
  // lives entirely inside the `squad-plan-accept` inline `## skill:` block, so gh-aw
  // strips it from the ambient prompt — "keeps the ambient prompt under 40 KB" is
  // unaffected and still passing, which is exactly the condition the comment above
  // names as making a raise legitimate. #1962's follow-up trims bought some room back
  // but not enough: combined source measures 164.8 KB after both changes, still over
  // 160, so the raise stays. 170 KB leaves a usable margin without removing the signal.
  //
  // Raised 170 -> 173 KB by #1963, which makes both activation paths report actual
  // accepted label-operation outcomes and fixes the `Activation bindings:` JSON to carry
  // quoted temporary-ID references. Nearly all of that prose lands inside the
  // `squad-plan-activate` and `squad-plan-accept` inline skill blocks; only the shared
  // ontology's binding contract is ambient, and "keeps the ambient prompt under 40 KB"
  // still passes at ~32 KB - the condition above that makes a raise legitimate.
  //
  // Raised 173 -> 177 KB by #1961, which bounds activation label capacity and makes
  // truncation explicit. #1963 deliberately did not pre-raise for this branch and
  // projected it would land at ~180 002 B; measured on the actual merge of #1961 into
  // dev (with #1963 already merged) the combined authored source is 180 036 B = 175.8 KB,
  // within 34 bytes of that projection.
  //
  // 176 KB would pass by only 188 bytes, which reproduces the near-zero-margin failure
  // mode this guard already hit once: before the 160 -> 170 raise it sat 21-28 bytes from
  // its ceiling, so two independently compliant PRs could not coexist and correct changes
  // failed on byte count alone. 177 KB leaves 1 212 bytes, so the guard still bites on
  // genuine growth without re-creating a threshold the next change trips by accident.
  // All of #1961's growth is inside the `squad-plan-activate` inline skill, which the
  // extractor strips from the ambient prompt and loads on demand; ambient re-measured at
  // 32 KB against 40 KB on the merged tree.
  // Raised 177 -> 181 KB by the online-research capability (web-fetch in
  // `/squad research`). The growth is the squad-research skill's online-doc
  // consultation guidance, the required "Online sources" disclosure, and its
  // Step 5 checklist item — all inside the `squad-research` inline `## skill:`
  // block, which the extractor closes at the next `## skill:` H2 and strips from
  // the ambient prompt. Only a ~300 B "Online sources" line added to the shared
  // ontology's §3.2 template is ambient. "keeps the ambient prompt under 40 KB"
  // still passes on this tree — the condition above that makes a raise
  // legitimate. Combined authored source measured 183 626 B = 179.3 KB
  // (Buffer.byteLength over squad.md + all imports, same sum this test performs);
  // 181 KB leaves 1 718 bytes of margin, comparable to the 1 212 the 177 raise
  // left, so the guard still bites on genuine growth.
  //
  // Raised 181 -> 183 KB by the Cast validator's deterministic disk-extraction and
  // SHA-256 authentication command. That command is authored between marker comments
  // inside the `squad-cast` inline skill in workflows/squad.md; gh-aw strips the full
  // skill from the ambient prompt and loads it on demand.
  // Raised 183 -> 189 KB by the truthful Cast terminal contract and its typed
  // post-agent failure job. The ambient 40 KB guard still passes; the behavioral
  // detail is confined to the on-demand `squad-cast` skill, while the safe job is
  // required executable policy rather than ambient model guidance.
  // Raised 189 -> 194 KB when the authenticated extraction and validation sequence
  // moved from agent-transcribed prompt text into a deterministic pre-agent runner.
  // The runner also emits a machine-readable factual failure record. The Cast skill
  // shrank, and the ambient prompt remains below its independently enforced 40 KB cap.
  // Raised 194 -> 196 KB by #1982's gh-aw-only resource assertion. The deterministic
  // step runs before the agent and does not enter its prompt; the separate ambient
  // prompt budget remains the authoritative delivered-context guard.
  const SOURCE_GROWTH_BUDGET_KB = 196;
  const SOURCE_GROWTH_BUDGET_BYTES = SOURCE_GROWTH_BUDGET_KB * 1024;

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

  it(`combined source (workflow + all imports) stays under ${SOURCE_GROWTH_BUDGET_KB} KB`, () => {
    let totalBytes = Buffer.byteLength(squadContent, 'utf8');

    for (const importPath of imports) {
      const fullPath = join(WORKFLOWS_DIR, importPath);
      if (existsSync(fullPath)) {
        const content = readText(fullPath);
        totalBytes += Buffer.byteLength(content, 'utf8');
      }
    }

    const totalKB = (totalBytes / 1024).toFixed(1);

    expect(
      totalBytes,
      `Combined authored source is ${totalKB} KB, over the ${SOURCE_GROWTH_BUDGET_KB} KB growth guard. ` +
        `This is NOT a gh-aw limit — it flags unbounded growth of the workflow and its imports. ` +
        `Check "keeps the ambient prompt under 40 KB" first: if ambient is healthy, the growth is ` +
        `in inline skills (loaded on demand) and raising this guard is legitimate.`
    ).toBeLessThan(SOURCE_GROWTH_BUDGET_BYTES);
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
      .map(path => readText(path).replace(/^---\n[\s\S]*?\n---\n/, '')),
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
      const normalizedMode = mode.replace(/\([^)]*\)/g, '').trim();
      const slug =
        'squad-' +
        normalizedMode
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

      const hasSkill = skillNames.has(slug);
      // Some modes legitimately share a playbook; accept an explicit mapping row.
      const hasMapping = new RegExp(`\\|[^|\\n]*${normalizedMode.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^|\\n]*\\|[^|\\n]*squad-`, 'i').test(dispatchTable);

      expect(
        hasSkill || hasMapping,
        `Mode "${mode}" has no "## skill: \`${slug}\`" block and no row in the Execute Mode ` +
          `dispatch table pointing at a skill. It would have no playbook at runtime.`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: gh-aw compilation retains durable state, Auto-Cast contracts, AND the
// shell input security contract over compiled output (#1834).
// ---------------------------------------------------------------------------
//
// workflows/squad.md §"Shell input security contract [MANDATORY]" declares that
// attacker-controlled GitHub event text may reach the shell only through named
// env: vars read via quoted expansion, and names four greppable anti-patterns.
// That contract was declared but unenforced. This suite is the gate.
//
// The gate FAILS CLOSED. It used to gate on `it.skipIf(!ghAwAvailable)`, which is
// the exact "silently skipped while the suite reports green" defect this file's
// header (see #1833) complains about: a check that never runs is indistinguishable
// from no check. So `gh aw` missing, a lock that fails to compile, an absent lock,
// or zero inspected surfaces are all FAILURES, never skips. CI installs gh aw for
// exactly this reason (.github/workflows/squad-ci.yml, #1732/#1834).

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install github/gh-aw` (matches .github/workflows/squad-ci.yml). This ' +
  'gate fails closed rather than skipping: an unmeasured contract is indistinguishable ' +
  'from a violated one (#1834).';

const CONTRACT_FIXTURE = join(
  process.cwd(),
  'test',
  'fixtures',
  'gh-aw-shell-contract',
  'violating.lock.yml'
);

describe('gh-aw: compiled workflow shell input security contract', () => {
  // Compile the real workflow once and memoize. The top-level afterAll wipes
  // TEST_WORKSPACES_DIR, so the ephemeral workspace is cleaned globally.
  let compiledLock: string | null = null;

  function lockText(): string {
    if (compiledLock !== null) return compiledLock;

    const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) {
      throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    }

    const workspace = createTestWorkspace('gh-aw-contract-');
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    // gh-aw's dispatch-workflow validation resolves its dispatch target against a
    // `.github/workflows/` directory located relative to the compiled file. This
    // repo ships the gh-aw *source* from a top-level `workflows/` dir; downstream
    // consumers install it into `.github/workflows/` via `gh aw add`. Mirror that
    // real deployment layout so `squad-implement-worker` resolves as it will in
    // every real install.
    cpSync(WORKFLOWS_DIR, join(workspace, '.github', 'workflows'), { recursive: true });
    // CI compiles with --approve after review. The newly approved action is
    // SHA-pinned to this repository and only downloads checksum-verified release
    // assets; it receives no secret input.
    execFileSync('gh', ['aw', 'compile', '.github/workflows/squad.md', '--strict', '--approve'], {
      cwd: workspace,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const lockPath = join(workspace, '.github', 'workflows', 'squad.lock.yml');
    if (!existsSync(lockPath)) {
      throw new Error(
        `gh aw compile produced no squad.lock.yml — the compiled artifact this gate ` +
          `inspects is absent, so the contract is unmeasured. ${GH_AW_INSTALL_HINT}`
      );
    }
    compiledLock = readText(lockPath);
    return compiledLock;
  }

  // Explicit timeout: shells out to the real `gh aw compile`, ~2-3s in isolation
  // but can exceed the 5s vitest default under full-suite parallel contention.
  it('strict-compiles and preserves prompt/config behavior', () => {
    const compiled = lockText();
    // gh-aw v0.87.x (bumped from v0.86.2 for #1955's add-labels/create-if-missing
    // support) now emits this JSON config only embedded inside a double-quoted YAML
    // env var value, so every `"` is backslash-escaped (`\"key\":value`) rather than
    // appearing as bare JSON. De-escape before matching so this assertion holds
    // regardless of which quoting style a given compiler version chooses.
    const unescaped = compiled.replace(/\\"/g, '"');
    expect(unescaped).toContain('"auto_close_issue":false');
    expect(unescaped).toContain('"data_enabled":true');
    expect(unescaped).toContain('"required":["origin_issue","phases","schema_version","squad_artifact"]');
    expect(unescaped).toContain('"enum":["research","plan","plan-accepted"');
    // gh-aw records runtime-import paths relative to the repo root, so with the
    // real `.github/workflows/` deployment layout these are prefixed accordingly.
    expect(compiled).toContain('{{#runtime-import .github/workflows/shared/squad-planning-ontology.md}}');
    expect(compiled).toContain('{{#runtime-import .github/workflows/squad.md}}');
    expect(compiled).not.toMatch(/<!-- squad-[\w-]+(?:-v\d+)? -->/);
  }, 20000);

  it('compiles the lifecycle upsert as a post-safe-output job (#1916)', () => {
    const compiled = lockText();
    expect(compiled).toContain('  upsert_lifecycle_state:');
    expect(compiled).toMatch(
      /upsert_lifecycle_state:[\s\S]*?needs:[\s\S]*?- safe_outputs/,
    );
    expect(compiled).toContain('name: Upsert Squad lifecycle state');
    expect(compiled).toContain('comment_id: current.id');
  }, 20000);

  it('compiles the deterministic terminal lifecycle repair job (#1928)', () => {
    const compiled = lockText();
    expect(compiled).toContain('  repair_activated_lifecycle:');
    expect(compiled).toMatch(
      /repair_activated_lifecycle:[\s\S]*?needs:[\s\S]*?- safe_outputs/,
    );
    expect(compiled).toContain('name: Repair terminal lifecycle after idempotent activation');
    expect(compiled).toContain(
      "!contains(needs.agent.outputs.output_types, 'upsert_lifecycle_state')",
    );
  }, 20000);

  it('compiles Cast failure into a queryable post-agent job that fails the run', () => {
    const compiled = lockText();
    const failureJob = compiled.match(
      /^  cast_failure:\n[\s\S]*?(?=^  conclusion:)/m,
    )?.[0] ?? '';
    const conclusionNeeds = compiled.match(
      /^  conclusion:\n    needs:\n([\s\S]*?)(?=    if:)/m,
    )?.[1] ?? '';
    expect(failureJob).toContain('name: Fail incomplete Cast');
    expect(failureJob).toContain('runs-on: ubuntu-slim');
    expect(failureJob).toContain("contains(needs.agent.outputs.output_types, 'cast_failure')");
    expect(failureJob).toContain("item.type === 'cast_failure'");
    expect(failureJob).toContain("item.type === 'create_pull_request'");
    expect(failureJob).toContain('process.env.GH_AW_AGENT_OUTPUT');
    expect(failureJob).toContain('Cast did not complete.');
    expect(failureJob).toContain('core.setFailed');
    expect(conclusionNeeds).toContain('- cast_failure');
  }, 20000);

  it('prepares the materialized Cast validator runner outside the agent prompt', () => {
    const compiled = lockText();
    const runnerStep = compiled.match(
      /      - name: Prepare deterministic Cast validator runner\n[\s\S]*?(?=\n      - (?:continue-on-error:|name:))/,
    )?.[0] ?? '';
    const normalizedRunnerStep = runnerStep.replace(/\\"/g, '"');
    expect(normalizedRunnerStep).toContain('cat > "$validator_runner"');
    expect(normalizedRunnerStep).toContain('validator_expected_sha256="82aa5620d81e26513658fbde210b0f8d2ac3bc7572e672b421aaa17a2832e8cc"');
    expect(normalizedRunnerStep).toContain("outcome: 'cast_failure'");
    expect(normalizedRunnerStep).toContain('chmod 500 "$validator_runner"');
    expect(compiled.indexOf('name: Prepare deterministic Cast validator runner')).toBeLessThan(
      compiled.indexOf('name: Restore inline skills from activation artifact'),
    );
  }, 20000);

  it('keeps the v0.87.10 completion hook neutral when a custom safe job fails', () => {
    const compiled = lockText();
    const completionStep = compiled.match(
      /      - name: Update reaction comment with completion status\n[\s\S]*?(?=\n  detection:)/,
    )?.[0] ?? '';
    expect(completionStep).toContain('GH_AW_AGENT_CONCLUSION: ${{ needs.agent.result }}');
    expect(completionStep).toContain('GH_AW_SAFE_OUTPUTS_RESULT: ${{ needs.safe_outputs.result }}');
    expect(completionStep).not.toContain('needs.cast_failure.result');
    expect(completionStep).toContain(
      'This completion message does not indicate Cast success. For Cast, only a linked Cast pull request indicates success.',
    );
    expect(completionStep).not.toMatch(/runSuccess[^\\n]*completed successfully/i);
  }, 20000);

  it('preserves the standalone release selection in the compiled install step (#1884)', () => {
    const compiled = lockText();
    const pin = readText(join(SHARED_DIR, 'squad.md')).match(
      /SQUAD_CLI_VERSION:\s*\$\{\{\s*vars\.SQUAD_CLI_VERSION\s*\|\|\s*'([^']+)'/,
    )?.[1];

    expect(pin, 'could not locate the source Squad CLI fallback').toBeDefined();
    expect(compiled).toMatch(
      new RegExp(
        String.raw`name: Resolve Squad standalone release[\s\S]*SQUAD_CLI_VERSION:\s*\$\{\{\s*vars\.SQUAD_CLI_VERSION\s*\|\|\s*'${pin}'\s*\}\}`,
      ),
    );
    expect(compiled).toContain(
      'uses: bradygaster/squad/.github/actions/squad-init@d8d7ef2d6da93460fecbfd56f8de20f9d10fd377',
    );
    expect(compiled).toContain('version: ${{ steps.squad-release.outputs.tag }}');
    expect(compiled).toContain('skip-init: "true"');
    expect(compiled).not.toContain('npm install --global');
    expect(compiled).not.toContain('npx --yes "@bradygaster/squad-cli@');
  }, 20000);

  it('emits no attacker-controlled event text in any compiled run: block', () => {
    const compiled = lockText();
    const blocks = extractRunBlocks(compiled);

    // Fail closed: a scanner with nothing to scan is a permanently green gate. The
    // real lock has dozens of run: blocks; zero means compilation changed shape and
    // the extractor no longer sees them.
    expect(
      blocks.length,
      'No run: blocks found in compiled squad.lock.yml. A scanner that finds nothing ' +
        'to scan is a permanently green gate (#1834). Re-check extractRunBlocks against ' +
        'the current `gh aw compile` output shape.'
    ).toBeGreaterThan(0);

    const violations = scanRunBlocks(blocks, '.github/workflows/squad.lock.yml');
    expect(
      violations,
      `Compiled run: blocks violate the shell input security contract ` +
        `(workflows/squad.md §"Shell input security contract [MANDATORY]"). Actions ` +
        `expands \${{ … }} before the shell starts, so event text in a run: block is ` +
        `unsafe even inside quotes. Each entry names the anti-pattern token, file, and ` +
        `line:\n${formatViolations(violations)}\n\n` +
        `Reproduce the finding directly against compiled output:\n` +
        `  gh aw compile .github/workflows/squad.md --strict\n` +
        `  grep -nE '\\$\\{\\{[^}]*github\\.event\\.[a-z_]+\\.(body|title)' ` +
        `.github/workflows/squad.lock.yml`
    ).toEqual([]);
  }, 20000);

  it('routes the /squad parser body only through contract-safe shell', () => {
    // The printf/eval/awk hops live in the parser one-liners of workflows/squad.md,
    // which gh-aw pulls in verbatim at runtime via {{#runtime-import … squad.md}} —
    // never inlined into the lock. This is the only surface on which those hops can
    // be observed, so it is scanned directly (see gh-aw-shell-contract.ts header).
    const source = readText(SQUAD_WORKFLOW);
    const shell = extractBodyHandlingShell(source);

    expect(
      shell.length,
      'No body-handling shell found in workflows/squad.md. The /squad parser reads ' +
        'SQUAD_TRIGGER_BODY through fenced bash; zero matches means the extractor lost ' +
        'the parser code and the printf/eval/awk hops are unmeasured (#1834).'
    ).toBeGreaterThan(0);

    const violations = scanShellLines(shell, 'workflows/squad.md');
    expect(
      violations,
      `The /squad parser passes attacker body text into a forbidden shell construct ` +
        `(workflows/squad.md §"Shell input security contract [MANDATORY]"). Each entry ` +
        `names the anti-pattern token, file, and line:\n${formatViolations(violations)}\n\n` +
        `Reproduce: inspect the parser one-liners that read the body variable:\n` +
        `  grep -nE 'printf +"?\\$|awk +-v|eval|bash +-c' workflows/squad.md`
    ).toEqual([]);
  });

  it('positive control: turns red on a known-violating compiled fixture, naming token, file, and line', () => {
    // RETRO's acceptance bar (#1834): "A gate that cannot turn red on a fixture
    // containing `run: printf '%s\n' "${{ github.event.issue.body }}"` is not a valid
    // gate." This proves the gate CAN fail, using the same extractor/scanner the real
    // lock goes through. It needs no gh aw, so it runs everywhere — the "can it turn
    // red" proof must never itself be skippable.
    expect(existsSync(CONTRACT_FIXTURE), `positive-control fixture missing: ${CONTRACT_FIXTURE}`).toBe(true);

    const fixture = readText(CONTRACT_FIXTURE);
    const violations = scanRunBlocks(extractRunBlocks(fixture), 'violating.lock.yml');

    const tokens = new Set<ContractToken>(violations.map(v => v.token));
    for (const expected of [
      'UNTRUSTED_TEMPLATE_IN_RUN',
      'UNTRUSTED_PRINTF_FORMAT',
      'UNTRUSTED_COMMAND_STRING',
      'UNTRUSTED_AWK_PROGRAM_OR_VAR',
    ] as ContractToken[]) {
      expect(
        tokens.has(expected),
        `Positive-control fixture did not trip ${expected}. The gate cannot observe ` +
          `that anti-pattern, so it is a status-only gate for it (#1834). Found tokens: ` +
          `${[...tokens].join(', ') || '(none)'}`
      ).toBe(true);
    }

    // The diagnostic must name token AND file AND line — a status-only failure passes
    // a generic-shaped assertion clean (#1832 mutation-testing finding).
    const mandated = violations.find(v => v.token === 'UNTRUSTED_TEMPLATE_IN_RUN');
    expect(mandated, 'the mandated RETRO line must trip UNTRUSTED_TEMPLATE_IN_RUN').toBeDefined();
    expect(mandated!.file).toBe('violating.lock.yml');
    expect(mandated!.line, 'the violation must carry a concrete 1-based line number').toBeGreaterThan(0);
    expect(mandated!.evidence).toContain('github.event.issue.body');

    // And the rendered diagnostic actually contains token, file, and line together.
    expect(formatViolations(violations)).toMatch(
      /UNTRUSTED_TEMPLATE_IN_RUN\s+violating\.lock\.yml:\d+/
    );
  });

  it('does not flag the sanctioned body-handling forms (guards against a permanent red)', () => {
    // The contract's own correct forms must stay green, or the gate is a permanent
    // red — equally worthless per the 2026-08-20 test bar. Runner-owned expansions
    // ($PATH, ${RUNNER_TEMP}) are not attacker text and must not trip the gate.
    const safe = [
      `printf '%s\\n' "$SQUAD_TRIGGER_BODY" | awk '{sub(/\\r$/,"")}' | grep -F -- '/squad'`,
      `body="\${SQUAD_TRIGGER_BODY-}"`,
      `printf '%s\\n' "$body" | tr -d '\\r' | grep -n -i -m 3 -F -- '/squad'`,
      // `--` ends printf's option parsing; the format slot is still the literal that
      // follows it, so the body remains an argument. The `--` handling added for the
      // bypass below must not turn this sanctioned form red.
      `printf -- '%s\\n' "$body"`,
      `printf -- '%s\\n' "$GITHUB_EVENT_ISSUE_BODY"`,
      `bash -c 'set +o histexpand; export PATH="$PATH"'`,
      `source "\${RUNNER_TEMP}/gh-aw/actions/resolve_docker_socket_gid.sh"`,
      `awk -v n=3 'BEGIN { print n }'`,
    ].map((text, i) => ({ line: i + 1, text }));

    expect(
      scanShellLines(safe, 'sanctioned-forms'),
      'The scanner flagged a contract-COMPLIANT form. A gate that is always red is as ' +
        'worthless as one that is always green (2026-08-20 test bar). Tighten the ' +
        'detectors in gh-aw-shell-contract.ts.'
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test: scanner-level regressions in the shell contract gate (#1834)
// ---------------------------------------------------------------------------
//
// The gate above proves the CONTRACT holds against the real workflow. These tests
// prove the DETECTOR holds — that the scanner actually observes what its own doc
// comments claim it observes. Three bypasses were found by review after the gate
// landed; each is a case where the gate reported green because the detector never
// looked, which is the same "unmeasured is indistinguishable from clean" failure
// mode the gate itself exists to eliminate.
//
// These are pure unit tests over the exported scanner: no `gh aw`, no compile, so
// the proof that the detector can see each bypass is never skippable.

describe('gh-aw: shell contract detector regressions (#1834)', () => {
  const scan = (text: string) => scanShellLines([{ line: 1, text }], 'regression');
  const tokensFor = (text: string) => scan(text).map(v => v.token);

  describe('BODY_VAR matches multi-segment carrier names', () => {
    // The doc comment promised "any `*_BODY` / `*_TITLE` variable", but the pattern
    // allowed only ONE `[A-Za-z0-9]+` segment before the suffix. Event-carrier env
    // vars are conventionally multi-segment SCREAMING_SNAKE, so the *unenforced*
    // shape was the idiomatic one — every detector went blind on it.
    const multiSegment = [
      'SQUAD_EVENT_BODY',
      'GITHUB_EVENT_ISSUE_BODY',
      'GITHUB_EVENT_COMMENT_BODY',
      'SQUAD_EVENT_ISSUE_TITLE',
      'GITHUB_EVENT_PULL_REQUEST_TITLE',
    ];

    for (const name of multiSegment) {
      it(`taints $${name} in printf's format slot`, () => {
        expect(
          tokensFor(`printf "$${name}"`),
          `$${name} is a *_BODY/*_TITLE carrier the scanner claims to taint, but a ` +
            `single-segment-only pattern let it reach printf's format slot unflagged.`
        ).toContain('UNTRUSTED_PRINTF_FORMAT');
      });

      it(`taints $${name} in a command string`, () => {
        expect(tokensFor(`eval "\${${name}-}"`)).toContain('UNTRUSTED_COMMAND_STRING');
      });

      it(`taints $${name} passed through awk -v`, () => {
        expect(tokensFor(`awk -v v="$${name}" 'BEGIN { print v }'`)).toContain(
          'UNTRUSTED_AWK_PROGRAM_OR_VAR'
        );
      });
    }

    it('still taints the single-segment and sanctioned carrier names', () => {
      // Widening the prefix must not lose the names that already worked.
      for (const text of [
        'printf "$SQUAD_TRIGGER_BODY"',
        'printf "$ISSUE_BODY"',
        'printf "$PR_TITLE"',
        'printf "$body"',
      ]) {
        expect(tokensFor(text), `${text} must stay tainted`).toContain(
          'UNTRUSTED_PRINTF_FORMAT'
        );
      }
    });

    it('does not taint runner-owned variables that merely contain the segments', () => {
      // A widened prefix must not start flagging runner-owned values, or the gate
      // goes permanently red — as worthless as permanently green.
      for (const text of [
        'printf "$RUNNER_TEMP"',
        'bash -c "export PATH=$PATH"',
        'source "${GITHUB_WORKSPACE}/setup.sh"',
        'printf "$BODYGUARD_HOME"',
      ]) {
        expect(tokensFor(text), `${text} carries no attacker text and must stay green`).toEqual(
          []
        );
      }
    });
  });

  describe("printf's -- end-of-options separator does not shield the format slot", () => {
    // `printf -- "$body"` is the idiom used precisely when a body might begin with
    // `-`. The arg reader treated `--` as the format operand and returned it, so the
    // body — sitting in the real format slot — was never inspected.
    for (const name of ['body', 'SQUAD_TRIGGER_BODY', 'GITHUB_EVENT_ISSUE_BODY']) {
      it(`flags printf -- "$${name}"`, () => {
        expect(
          tokensFor(`printf -- "$${name}"`),
          `\`--\` ends option parsing; the body after it IS the format string. ` +
            `Reading \`--\` as the first argument bypasses UNTRUSTED_PRINTF_FORMAT.`
        ).toContain('UNTRUSTED_PRINTF_FORMAT');
      });
    }

    it('flags -- combined with other option forms', () => {
      expect(tokensFor('printf -v out -- "$body"')).toContain('UNTRUSTED_PRINTF_FORMAT');
    });

    it('leaves the format slot green when -- is followed by a literal format', () => {
      expect(tokensFor(`printf -- '%s\\n' "$body"`)).toEqual([]);
      expect(tokensFor(`printf -- "%s\\n" "$SQUAD_TRIGGER_BODY"`)).toEqual([]);
    });

    it('still flags a body glued to -- as one word', () => {
      // `--"$body"` is a single word, so it is the format string, not a separator.
      expect(tokensFor('printf --"$body"')).toContain('UNTRUSTED_PRINTF_FORMAT');
    });
  });

  describe('extractRunBlocks does not re-read block scalar content as workflow keys', () => {
    // A `run:` line inside a heredoc or echoed YAML is shell text, not a key. The
    // outer cursor never advanced past a consumed scalar, so that line re-entered
    // the header branch: a phantom block appeared, its lines were already owned by
    // the real block, and every violation inside it was reported twice.
    const NESTED = [
      'jobs:', //                                  1
      '  a:', //                                   2
      '    steps:', //                             3
      '      - name: writes a workflow', //        4
      '        run: |', //                         5
      "          cat <<'YAML' > generated.yml", // 6
      '          run: |', //                       7
      '            printf "$SQUAD_EVENT_BODY"', // 8
      '          YAML', //                         9
      '          echo done', //                   10
      '      - name: tail', //                    11
      '        run: echo tail', //                12
    ].join('\n');

    it('opens no phantom block for a run: line nested in a heredoc', () => {
      const blocks = extractRunBlocks(NESTED);
      expect(
        blocks.map(b => b.headerLine),
        'Line 7 is heredoc payload owned by the block scalar opened on line 5, not a ' +
          'workflow key. A header at line 7 means scalar content was misparsed.'
      ).toEqual([5, 12]);
    });

    it('keeps the whole heredoc inside the enclosing block', () => {
      const outer = extractRunBlocks(NESTED).find(b => b.headerLine === 5);
      expect(outer, 'the real run: block on line 5 must be extracted').toBeDefined();
      expect(
        outer!.lines.map(l => l.line),
        'the enclosing block owns every deeper-indented line, heredoc payload included'
      ).toEqual([6, 7, 8, 9, 10]);
    });

    it('reports a violation inside nested YAML exactly once', () => {
      const violations = scanRunBlocks(extractRunBlocks(NESTED), 'nested.yml');
      expect(
        violations.map(v => `${v.token}@${v.line}`),
        'Duplicate blocks produce duplicate findings, so the same defect is counted ' +
          'twice in the diagnostic and in any violation total.'
      ).toEqual(['UNTRUSTED_PRINTF_FORMAT@8']);
    });

    it('does not skip a sibling run: that terminates the previous block', () => {
      // Guards the off-by-one in the cursor advance: the line that ENDS a scalar is
      // not part of it and must still be examined as a header.
      const siblings = [
        'steps:', //           1
        '  run: |', //         2
        '    printf "$A_BODY"', // 3
        '  run: |', //         4
        '    printf "$B_BODY"', // 5
      ].join('\n');

      const blocks = extractRunBlocks(siblings);
      expect(
        blocks.map(b => b.headerLine),
        'Advancing the cursor past a scalar must not swallow the line that ended it.'
      ).toEqual([2, 4]);
      expect(scanRunBlocks(blocks, 'siblings.yml').map(v => v.line)).toEqual([3, 5]);
    });

    it('still extracts the real compiled lock shape (inline and block runs)', () => {
      // Non-regression: the shapes the gate depends on are unchanged by the advance.
      const mixed = [
        'steps:', //                  1
        '  - name: inline', //        2
        '    run: echo hi', //        3
        '  - name: block', //         4
        '    run: |', //              5
        '      echo one', //          6
        '', //                        7
        '      echo two', //          8
        '  - name: after', //         9
        '    run: echo bye', //      10
      ].join('\n');

      const blocks = extractRunBlocks(mixed);
      expect(blocks.map(b => b.headerLine)).toEqual([3, 5, 10]);
      expect(blocks[1].lines.map(l => l.line)).toEqual([6, 7, 8]);
    });
  });
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

  it('documents missing workflow_dispatch issue_number as a guarded halt, not a junk issue', () => {
    const squadText = readText(SQUAD_WORKFLOW);
    expect(squadText).toMatch(/missing issue_number/i);
    // The activation guard halts the run with a visible log annotation instead of
    // minting a junk issue for an empty/malformed dispatch probe (see PR #1777).
    expect(squadText).toMatch(/::warning::/);
    expect(squadText).toMatch(/halting with no side effects/i);
    expect(squadText).not.toMatch(/Squad workflow dispatch missing issue_number/);
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
      issue_number: '{root-issue-number}',
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
    expect(continuation, 'empty or placeholder schema probes should be forbidden').toMatch(
      /NEVER[\s\S]*empty[\s\S]*(?:placeholder|partial)[\s\S]*(?:probe|discover)[\s\S]*schema/i
    );
    expect(continuation, 'noop should be named as the alternative when there is nothing to dispatch').toMatch(
      /(?:nothing|no next wave)[\s\S]{0,200}dispatch[\s\S]{0,200}`?noop`?|`?noop`?[\s\S]{0,200}(?:nothing|no next wave)[\s\S]{0,200}dispatch/i
    );
  });

  it('worker continuation comments on the parent epic instead of auto-targeting the merged PR', () => {
    const continuation = workerContent.match(
      /## Continue Parent Epic After Merge([\s\S]*?)The remaining instructions apply only to `workflow_dispatch`/
    )?.[1] ?? '';
    expect(continuation).toMatch(/comment on the parent epic/i);
    expect(continuation).toMatch(/item_number[\s\S]*parent epic number/i);
  });

  // -------------------------------------------------------------------------
  // Structural gate: max >= 2 (#1772)
  // -------------------------------------------------------------------------
  // The `dispatch-workflow: max: 1` constraint means the FIRST safe-output entry
  // wins and all later entries are silently discarded.  When the LLM emits an empty
  // probe first, `max: 1` causes it to consume the only slot and the real dispatch
  // never fires -- confirmed across three aspiregregator-squad-e2e runs
  // (32324473906, 32394811753, 32316227601).
  //
  // Raising max to 2 gives the real dispatch a second slot even when the LLM
  // probes first, breaking the silent-discard failure mode without requiring any
  // change to gh-aw itself.
  //
  // This test FAILS against the pre-fix state (max: 1) and PASSES after the fix
  // (max: 2).  It is the structural test that the wording-only approach (#1766)
  // lacked: prompt text can be present and the live run still broken; this test
  // directly asserts the frontmatter value that governs runtime behavior.
  it('worker dispatch-workflow max is at least 2 to survive a probe + real dispatch', () => {
    const safeOutputs = extractSafeOutputs(extractFrontmatter(SQUAD_IMPLEMENT_WORKER));
    const dispatchWorkflow = safeOutputs['dispatch-workflow'];
    expect(dispatchWorkflow, 'squad-implement-worker.md must declare dispatch-workflow safe-output').toBeDefined();
    const max = dispatchWorkflow?.max as number | undefined;
    expect(max, 'dispatch-workflow max must be >= 2 so a probe does not silently discard the real dispatch').toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Test: Dispatch workflow schema static gate (#1772)
// ---------------------------------------------------------------------------
// The static gate (scripts/check-workflow-input-interpolation.mjs) now validates
// dispatch_workflow JSON examples in workflow prompts.  A malformed example --
// missing `workflow_name`, missing `inputs`, or top-level `command`/`issue_number` --
// causes gh-aw to run the wrong workflow or dispatch with no inputs.
//
// This suite:
//   (a) verifies the gate passes against current workflow files
//   (b) verifies the gate FAILS against a fixture with a malformed dispatch schema
//       (the broken state that caused aspiregregator-squad-e2e failures)

describe('gh-aw: dispatch_workflow schema static gate (#1772)', () => {
  const scriptPath = join(process.cwd(), 'scripts', 'check-workflow-input-interpolation.mjs');
  const fixturesDir = join(TEST_WORKSPACES_DIR, 'dispatch-schema-gate');

  function writeFixture(name: string, content: string): string {
    mkdirSync(fixturesDir, { recursive: true });
    const path = join(fixturesDir, name);
    writeFileSync(path, content, 'utf8');
    return path;
  }

  it('passes against current workflow files (regression guard)', () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status, `Gate should exit 0; stderr: ${result.stderr}`).toBe(0);
  });

  it('fails when dispatch_workflow example is missing workflow_name', () => {
    // This is failure shape (3) confirmed in run 32316227601: dispatch schema
    // without workflow_name caused the squad workflow to run the wrong skill.
    const fixture = writeFixture('missing-workflow-name.md', `---
safe-outputs:
  dispatch-workflow:
    workflows: [squad]
    max: 2
---

# Test Worker

Dispatch workflow using the dispatch_workflow safe-output tool:

\`\`\`json
{
  "inputs": {
    "command": "implement",
    "issue_number": "42"
  }
}
\`\`\`
`);

    const result = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, SQUAD_GATE_SCAN_OVERRIDE: fixturesDir },
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status, 'Gate must exit 1 when dispatch_workflow JSON lacks workflow_name').toBe(1);
    expect(result.stderr).toMatch(/dispatch-schema|workflow_name/i);
    // Cleanup
    rmSync(fixture);
  });

  it('fails when dispatch_workflow example has top-level command instead of inputs object', () => {
    // This is failure shape (1) confirmed in runs 32324473906, 32394811753:
    // top-level command/issue_number are silently dropped by gh-aw; the receiving
    // workflow runs with no inputs and creates junk issues.
    const fixture = writeFixture('top-level-inputs.md', `---
safe-outputs:
  dispatch-workflow:
    workflows: [squad]
    max: 2
---

# Test Worker

Call dispatch_workflow to continue the relay:

\`\`\`json
{
  "workflow_name": "squad",
  "command": "implement",
  "issue_number": "42"
}
\`\`\`
`);

    const result = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, SQUAD_GATE_SCAN_OVERRIDE: fixturesDir },
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status, 'Gate must exit 1 when dispatch_workflow JSON has top-level command').toBe(1);
    expect(result.stderr).toMatch(/dispatch-schema|top-level/i);
    rmSync(fixture);
  });

  it('fails when dispatch_workflow example is missing inputs.issue_number', () => {
    const fixture = writeFixture('missing-issue-number.md', `---
safe-outputs:
  dispatch-workflow:
    workflows: [squad]
    max: 2
---

# Test Worker

Use dispatch_workflow to queue the next wave:

\`\`\`json
{
  "workflow_name": "squad",
  "inputs": {
    "command": "implement"
  }
}
\`\`\`
`);

    const result = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, SQUAD_GATE_SCAN_OVERRIDE: fixturesDir },
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status, 'Gate must exit 1 when dispatch_workflow JSON inputs lacks issue_number').toBe(1);
    expect(result.stderr).toMatch(/dispatch-schema|issue_number/i);
    rmSync(fixture);
  });

  it('passes for a well-formed dispatch_workflow example', () => {
    const fixture = writeFixture('valid-dispatch.md', `---
safe-outputs:
  dispatch-workflow:
    workflows: [squad]
    max: 2
---

# Test Worker

Use dispatch_workflow to continue the relay:

\`\`\`json
{
  "workflow_name": "squad",
  "inputs": {
    "command": "implement",
    "issue_number": "{parent-epic-number}"
  }
}
\`\`\`
`);

    const result = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, SQUAD_GATE_SCAN_OVERRIDE: fixturesDir },
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status, `Gate should exit 0 for valid schema; stderr: ${result.stderr}`).toBe(0);
    rmSync(fixture);
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
    const preflight = (content.match(/##### Label Pre-flight\n([\s\S]*?)(?=\n#####|\n####)/)?.[1] ?? '').replace(
      /\s+/g,
      ' '
    );
    expect(preflight).toMatch(/squad.*label.*exist|label.*squad.*exist/i);
  });

  it('label pre-flight grounds any label-creation claim in the add-labels safe output (#1955)', () => {
    // Forward-port note (#1955): the workflow used to have no way to create a missing
    // label at all, so any claim of "it creates labels" would have been a hallucinated
    // capability. That gap is now closed by a real `add-labels` safe output with
    // `create-if-missing: true` — the claim is legitimate, but it must be attributed to
    // that declared mechanism, not to bare `issues: write` permission or vague
    // "safe-output permissions handle the write" hand-waving with no named mechanism.
    const preflight = content.match(/##### Label Pre-flight\n([\s\S]*?)(?=\n#####|\n####)/)?.[1] ?? '';
    expect(preflight, 'Label Pre-flight section must exist').not.toBe('');
    expect(preflight).not.toMatch(/safe-output permissions handle the write|no additional token scope/i);
    expect(preflight).toMatch(/add-labels|add_labels/);
    expect(preflight).toMatch(/create-if-missing/);
  });

  it('label pre-flight declares add-labels/create-if-missing instead of an unconfigured gap (#1955)', () => {
    // Forward-port note (#1955): this used to assert the OPPOSITE — that missing labels
    // were reported as an unconfigured "prerequisite gap" requiring a nonexistent
    // `create-label` safe-output. That was the defect #1955 fixes: gh-aw's real
    // mechanism is `add-labels` with `create-if-missing: true`, declared in frontmatter.
    expect(content).toContain('add-labels:');
    expect(content).toContain('create-if-missing: true');
    expect(content).not.toContain('create-label:');
    expect(content).not.toMatch(/create-label.*safe-output|safe-output.*create-label/i);
  });

  it('label pre-flight auto-provisions missing labels instead of omitting them (#1955)', () => {
    // Forward-port note (#1955): this used to assert labels that don't yet exist are
    // "omitted and reported, not silently applied" — the exact fresh-repo defect #1955
    // reports. The fix auto-creates them via create-if-missing instead of omitting them.
    expect(content).not.toMatch(/unavailable labels are omitted and reported/i);
    expect(content).toMatch(/auto-creates|auto-provision/i);
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

describe('gh-aw: Team Guard roster-row detection — committed-HEAD git repo coverage (#1689 revision 3)', () => {
  // A skipped behavioral suite is a permanently-green gate (#1833). Fail loudly
  // instead of quietly reporting a pass for assertions that never executed.
  it('resolves a POSIX shell, so the behavioral cases below actually run', () => {
    expect(POSIX_SHELL, NO_POSIX_SHELL_MESSAGE).not.toBeNull();
  });


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
      { cwd, shell: requirePosixShell(), encoding: 'utf8' }
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

describe('gh-aw: Cast PR dedup jq filter behavioral coverage (#1689 revision)', () => {
  // See #1833 — this suite skipped silently on Windows and still reported green.
  it('resolves a POSIX shell, so the behavioral cases below actually run', () => {
    expect(POSIX_SHELL, NO_POSIX_SHELL_MESSAGE).not.toBeNull();
  });


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
      { shell: requirePosixShell(), encoding: 'utf8' }
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

  it('Cast emits routing state that standalone health can parse', () => {
    expect(squadContent).toContain('section heading `## Routing Table`');
    expect(squadContent).toContain('headers `Work Type | Route To | Examples`');
    expect(squadContent).toContain('exact active casting-registry `persistent_name`');
    expect(squadContent).toContain('multiple names comma-separated and no prose or annotations');
    expect(squadContent).toContain('Do not route to inactive/support roles');
  });
});

describe('gh-aw: Cast naming-mode contract (#1907)', () => {
  const squadContent = readText(SQUAD_WORKFLOW);
  const cast = squadContent.match(
    /## skill: `squad-cast`\n[\s\S]*?(?=\n## skill:|$)/,
  )?.[0] ?? '';

  it('defaults an unqualified Cast request to descriptive role-based names', () => {
    expect(cast).toMatch(/No themed naming request.*descriptive mode/s);
    expect(cast).toContain('short, unique functional names derived from roles');
    expect(cast).toMatch(/every registry entry.*`universe`.*`"descriptive"`/s);
    expect(cast).toMatch(/descriptive naming.*never invent.*fictional universe/s);
    expect(cast).not.toContain('assign character names from a fictional universe');
  });

  it('uses an explicitly requested built-in or custom universe', () => {
    expect(cast).toMatch(/Explicit built-in or custom universe request.*requested universe/s);
    expect(cast).toMatch(/custom universe.*spoiler-safety rules/s);
  });

  it('auto-selects a built-in universe only for themed names with no universe', () => {
    expect(cast).toMatch(
      /Themed names requested without a universe.*auto-select.*built-in universe/s,
    );
    expect(cast).toMatch(/capacity.*shape.*fit table/s);
  });
});

describe('gh-aw: Cast replaces disposable bootstrap state (#1909)', () => {
  const squadContent = readText(SQUAD_WORKFLOW);
  const cast = squadContent.match(
    /## skill: `squad-cast`\n[\s\S]*?(?=\n## skill:|$)/,
  )?.[0] ?? '';
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);

  function assertTruthfulCastTerminalContract(workflow: string): void {
    const candidateCast = workflow.match(
      /## skill: `squad-cast`\n[\s\S]*?(?=\n## skill:|$)/,
    )?.[0] ?? '';
    const failureBranch = candidateCast.match(
      /For outcomes 2 or 3[\s\S]*?(?=\n##### Step 8:)/,
    )?.[0] ?? '';

    expect(candidateCast).toMatch(
      /only exit status zero with stdout exactly\s+`Cast validation passed\.` authorizes exactly one `create-pull-request`/s,
    );
    expect(candidateCast).toContain('"${RUNNER_TEMP:?}/run-squad-cast-validator"');
    expect(candidateCast).toContain('Do not transcribe validator bytes or extraction commands');
    expect(candidateCast).toContain('emits one JSON\nrecord on stdout');
    expect(candidateCast.match(
      /<!-- SQUAD:CAST-VALIDATOR-COMMAND:BEGIN -->[\s\S]*?<!-- SQUAD:CAST-VALIDATOR-COMMAND:END -->/,
    )?.[0]).not.toMatch(/base64|gzip|awk|validator_expected_sha256/);
    expect(failureBranch).toContain('## ❌ Cast did not complete');
    expect(failureBranch).toContain('No team or Cast pull request was delivered.');
    expect(failureBranch).toContain('complete stderr exactly as observed');
    expect(failureBranch).toContain('One `add-comment`');
    expect(failureBranch).toContain('One `cast_failure`');
    expect(failureBranch).toContain('identical `stage`, `command_category`,');
    expect(failureBranch).toContain('Never call `noop` or `report_incomplete`');
    expect(failureBranch).toContain('never\ncall `create-pull-request`');
    expect(failureBranch).toContain('rerun `/squad cast`');
    expect(failureBranch).toContain('Do not suggest re-materializing, reinstalling, or');
    expect(failureBranch).toContain('runs only when this output is emitted');
    expect(failureBranch).toContain('cannot detect that omission');
    expect(failureBranch).toContain('or independently\ngate `create-pull-request`');
    expect(failureBranch).toContain('cannot prevent a pull\nrequest that is materialized concurrently');
    expect(failureBranch).not.toMatch(/failure signal is independently enforced/i);
    expect(failureBranch).not.toMatch(/(?:fail-closed|independent(?:ly)? fail-closed) gate/i);
    expect(failureBranch).not.toMatch(/call `noop` and stop/i);
    expect(failureBranch).not.toMatch(/re-?materialize the (?:committed )?(?:validator )?payload/i);

    for (const [stage, category] of [
      ['discovery', 'validator skill discovery'],
      ['uniqueness', 'validator skill uniqueness'],
      ['extraction', 'validator payload extraction'],
      ['integrity', 'SHA-256 authentication'],
      ['syntax', 'node --check'],
      ['validation', 'validator execution'],
    ]) {
      expect(candidateCast).toContain(`\`${stage}\``);
      expect(candidateCast).toContain(`\`${category}\``);
    }
  }

  it('uses an explicit fresh-artifact payload allowlist instead of staging .squad wholesale', () => {
    expect(cast).toContain('Never stage `.squad/` wholesale');
    for (const artifact of [
      '`.squad/team.md`',
      '`.squad/routing.md`',
      '`.squad/casting/registry.json`',
      '`.squad/casting/history.json`',
      '`.squad/casting/policy.json`',
      '`.github/agents/squad.agent.md`',
      '`meet-the-squad.md`',
    ]) {
      expect(cast).toContain(artifact);
    }
    expect(cast).toContain('only the concrete `.squad/agents/{selected-id}/charter.md`');
  });

  it('explicitly excludes activation-bootstrap templates, automation, and default agents', () => {
    for (const excluded of [
      '`.squad/templates/**`',
      '`.squad/skills/**`',
      '`.squad/scripts/**`',
      '`.squad/workflows/**`',
      '`lead`',
      '`reviewer`',
      '`security`',
      '`docs`',
      '`devrel`',
    ]) {
      expect(cast).toContain(excluded);
    }
  });

  it('validates the complete routing file as one exact registry-backed section', () => {
    expect(cast).toMatch(/validator deterministically parses.*routing/s);
    expect(cast).toContain('exactly one `## Routing Table` section');
    expect(cast).toContain('exact headers `Work Type | Route To | Examples`');
    expect(cast).toContain('No `## Work Type → Agent` section');
    expect(cast).toMatch(/every `Route To` value.*active casting-registry `persistent_name`/s);
  });

  it('synchronizes the generated agent capabilities from final Cast state', () => {
    expect(cast).toContain('Completely replace the disposable bootstrap coordinator');
    expect(cast).toContain('Do not reuse, patch, summarize, or retain any bootstrap body text');
    expect(cast).toContain('<!-- SQUAD:TEAM-CAPABILITIES:BEGIN -->');
    expect(cast).toContain('<!-- SQUAD:TEAM-CAPABILITIES:END -->');
    expect(cast).toMatch(/specialists.*active registry count/s);
    expect(cast).toMatch(/taskTypes.*hints.*routing-row count/s);
    expect(cast).toContain('must be self-contained for the final Cast tree');
  });

  it('enforces mutually exclusive factual Cast terminal outcomes', () => {
    expect(cast).toContain('Deterministic final-tree validation');
    expect(cast).toContain('$RUNNER_TEMP/squad-cast-payload.json');
    expect(cast).toContain('squad-cast-validator');
    assertTruthfulCastTerminalContract(squadContent);
  });

  it('configures one bounded durable Cast failure output that calls core.setFailed', () => {
    const castFailureJob = frontmatter.match(
      /^  jobs:\n    cast-failure:[\s\S]*?(?=^  data:)/m,
    )?.[0] ?? '';
    expect(castFailureJob).not.toBe('');
    expect(castFailureJob).toContain('max: 1');
    expect(castFailureJob).toContain('runs-on: ubuntu-slim');
    expect(castFailureJob).toContain("item.type === 'cast_failure'");
    expect(castFailureJob).toContain("item.type === 'create_pull_request'");
    expect(castFailureJob).toContain('cannot prevent a concurrently materialized pull request');
    expect(castFailureJob).toContain('process.env.GH_AW_AGENT_OUTPUT');
    expect(castFailureJob).toContain('core.setFailed');
    expect(castFailureJob).toContain('Cast did not complete.');
    expect(castFailureJob).toContain('failure.stderr');
    expect(castFailureJob).toContain("['validation', 'validator execution']");
    expect(castFailureJob).toContain("['syntax', 'node --check']");
  });

  it('does not treat gh-aw run conclusion or report_incomplete as proof of Cast success', () => {
    expect(frontmatter).toContain(
      'run-success: "🤖 [{workflow_name}]({run_url}) finished processing. This completion message does not indicate Cast success. For Cast, only a linked Cast pull request indicates success."',
    );
    expect(cast).toContain('Built-in `report_incomplete` only warns');
    expect(cast).toContain('it does not fail the run');
    expect(cast).toContain('Only a linked Cast PR is the success signal');
    expect(cast).toContain('A red `cast_failure` job can therefore still select this\nneutral hook; it does not select `run-failure`');
  });

  it('kills claims that the post-agent job independently enforces failure or PR authorization', () => {
    const overclaimMutation = squadContent
      .replace(
        /When the agent emits `cast_failure`, the typed job[\s\S]*?gate `create-pull-request`\./,
        'The failure signal is independently enforced after the agent and fail-closed for create-pull-request.',
      );
    expect(() => assertTruthfulCastTerminalContract(overclaimMutation)).toThrow();
  });

  it('kills restoration of the old add-comment plus noop success-shaped path', () => {
    const oldPathMutation = squadContent
      .replace(
        /- One `cast_failure` with the identical[\s\S]*?complete `stderr`\./,
        '- Call `noop` and stop.',
      )
      .replace('Never call `noop` or `report_incomplete`', 'Call `noop`');
    expect(() => assertTruthfulCastTerminalContract(oldPathMutation)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// gh-aw: Cast PR closes its originating issue on merge (#1974)
//
// A direct `/squad cast` command opens a PR that scaffolds the team. Prior to
// this change, that PR never referenced the invoking issue with a closing
// keyword, so merging it left the issue open. The Auto-Cast Pivot (TG-3) is a
// different code path that opens a Cast PR as a *side effect* of another
// command (e.g. `/squad plan`) finding no team yet -- that PR must NOT close
// the underlying work issue, since only the team was cast, not the requested
// work. Step 8 must therefore add the closing keyword only for the direct
// invocation, while TG-3's existing prohibition (tested above) stays intact.
// ---------------------------------------------------------------------------
describe('gh-aw: Cast PR closes its originating issue on merge (#1974)', () => {
  const squadContent = readText(SQUAD_WORKFLOW);
  const cast = squadContent.match(
    /## skill: `squad-cast`\n[\s\S]*?(?=\n## skill:|$)/,
  )?.[0] ?? '';
  const step8 = cast.match(/##### Step 8: Open PR\n[\s\S]*?(?=\n##### Step 9)/)?.[0] ?? '';

  it('Step 8 exists and configures the branch/title used by direct Cast', () => {
    expect(step8.length, 'Step 8: Open PR section should be found in the cast skill').toBeGreaterThan(0);
    expect(step8).toContain('`create-pull-request`');
    expect(step8).toContain('branch `squad/cast-{repo}`');
    expect(step8).toContain('title `[squad] Cast your Squad — {description}`');
  });

  it('Step 8 templates a closing line with the resolved issue number for a direct Cast invocation', () => {
    expect(step8).toMatch(/append a standalone final body line in the form `Closes #\{issue_number\}`/);
    expect(step8).toMatch(/merging this PR automatically closes the issue that invoked `\/squad cast`/);
    expect(step8).toMatch(/Replace `\{issue_number\}` with the resolved numeric target issue number/);
  });

  it('the closing keyword is scoped to the resolved target issue, never a different issue', () => {
    expect(step8).toMatch(/resolved numeric target issue number from Trigger Context/i);
    expect(step8).toMatch(/never .*reference a different issue/i);
  });

  it('explicitly excludes the Auto-Cast Pivot (TG-3), which forbids closing keywords', () => {
    expect(step8).toMatch(/not the Auto-Cast Pivot in TG-3, which forbids closing keywords/i);
    // TG-3's own prohibition (asserted elsewhere) must still be present and unweakened.
    expect(squadContent).toMatch(
      /MUST NOT contain.*Fixes.*Closes.*Resolves/i,
    );
  });

  it('instructs omitting placeholder braces and documentation backticks from the real PR body', () => {
    expect(step8).toMatch(/never emit the braces/i);
    expect(step8).toMatch(/omit the documentation backticks from the actual PR body/i);
  });

  it('preserves existing Step 8 PR content: team summary and the post-merge rerun instruction', () => {
    expect(step8).toContain('body with team summary');
    expect(step8).toMatch(
      /return to the originating issue and rerun `\{canonical_command\}` to resume your work/,
    );
  });

  it('preserves the Step 6 payload allowlist enumeration instruction', () => {
    expect(step8).toMatch(
      /Enumerate every concrete path from the validated Step 6 payload allowlist as the file request/,
    );
    expect(step8).toMatch(/do not add any other path/);
  });

  it('does not weaken auto-close-issue: false, which still guards Connect/Adopt/Cast-Member/Auto-Pivot', () => {
    // The literal Closes # line (not gh-aw's built-in auto-close-issue) is what closes the
    // issue for direct Cast, so the shared safe-output config can stay false for every other
    // create-pull-request call in this workflow (Connect, Adopt, Cast-Member, Auto-Cast Pivot).
    const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
    const safeOutputs = extractSafeOutputs(frontmatter);
    const pr = safeOutputs['create-pull-request'] as Record<string, unknown>;
    expect(pr['auto-close-issue']).toBe(false);
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

// ---------------------------------------------------------------------------
// Test: Shared bootstrap health-before-dispatch contract (#1605)
//
// The shared squad.md bootstrap must invoke `squad health --json` after init
// and before any artifact upload or dispatch. Health failure must stop the
// dispatch path visibly — no continue-on-error on the health step.
// ---------------------------------------------------------------------------

describe('gh-aw: shared bootstrap health-before-dispatch contract (#1605)', () => {
  const sharedContent = readText(join(SHARED_DIR, 'squad.md'));

  it('squad health --json appears in the shared bootstrap', () => {
    expect(sharedContent).toMatch(/\bsquad\s+health\s+--json/);
  });

  it('health uses --json flag for structured CI output', () => {
    expect(sharedContent).toMatch(/health --json/);
  });

  it('gates health on command capability until the published pin includes it (#1884)', () => {
    expect(sharedContent).toContain(
      "squad help | grep -Fq 'Validate team state for CI'",
    );
    expect(sharedContent).toContain(
      'predates the health command; the readiness gate will activate after the next published CLI pin',
    );
  });

  it('squad health --json appears after squad init (command ordering)', () => {
    const initIdx = sharedContent.indexOf('init --preset default');
    const healthIdx = sharedContent.indexOf('health --json');
    expect(initIdx, 'squad init must appear in the shared bootstrap').toBeGreaterThan(-1);
    expect(healthIdx, 'squad health --json must appear in the shared bootstrap').toBeGreaterThan(-1);
    expect(healthIdx, 'health must come after init').toBeGreaterThan(initIdx);
  });

  it('squad health --json appears before upload-artifact (before dispatch)', () => {
    const healthIdx = sharedContent.indexOf('health --json');
    const uploadIdx = sharedContent.indexOf('upload-artifact');
    expect(healthIdx, 'squad health --json must appear in the shared bootstrap').toBeGreaterThan(-1);
    expect(uploadIdx, 'upload-artifact must appear in the shared bootstrap').toBeGreaterThan(-1);
    expect(healthIdx, 'health must come before artifact upload').toBeLessThan(uploadIdx);
  });

  it('health step has no continue-on-error (fail-fast contract)', () => {
    const lines = sharedContent.split('\n');
    const healthLineIdx = lines.findIndex(l => l.includes('health --json'));
    expect(healthLineIdx, 'health command must appear in the shared bootstrap').toBeGreaterThan(-1);

    // Walk back to the "- name:" that opens this step.
    let stepStart = healthLineIdx;
    while (stepStart > 0 && !lines[stepStart].match(/^\s+-\s+name:/)) {
      stepStart--;
    }
    // Walk forward to the next "- name:" or end of the activation steps block.
    let stepEnd = healthLineIdx + 1;
    while (stepEnd < lines.length && !lines[stepEnd].match(/^\s+-\s+name:/) && !lines[stepEnd].match(/^steps:/)) {
      stepEnd++;
    }
    const stepBlock = lines.slice(stepStart, stepEnd).join('\n');

    expect(stepBlock, 'health step must contain the health command').toContain('health --json');
    expect(
      stepBlock,
      'health step must NOT have continue-on-error: true — health failure must stop dispatch',
    ).not.toMatch(/continue-on-error:\s*true/);
  });

  it('step ordering after activation checkout: init → health → upload', () => {
    const activationStepsStart = sharedContent.search(/^  activation:\s*\n\s+steps:/m);
    expect(
      activationStepsStart,
      'jobs.activation.steps must exist in the shared bootstrap',
    ).toBeGreaterThan(-1);
    const activationStepsSection = sharedContent.slice(activationStepsStart);

    const initStepIdx = activationStepsSection.indexOf('Initialize Squad team');
    const healthStepIdx = activationStepsSection.indexOf('Run Squad health check');
    const uploadStepIdx = activationStepsSection.indexOf('Upload Squad state artifact');

    expect(initStepIdx, '"Initialize Squad team" step must exist').toBeGreaterThan(-1);
    expect(healthStepIdx, '"Run Squad health check" step must exist').toBeGreaterThan(-1);
    expect(uploadStepIdx, '"Upload Squad state artifact" step must exist').toBeGreaterThan(-1);

    expect(healthStepIdx, 'health check must follow init').toBeGreaterThan(initStepIdx);
    expect(healthStepIdx, 'health check must precede upload').toBeLessThan(uploadStepIdx);
  });

  it('health and init use the standalone CLI selected before both steps', () => {
    const lines = sharedContent.split('\n');
    const healthLineIdx = lines.findIndex(l => l.includes('health --json'));
    expect(healthLineIdx).toBeGreaterThan(-1);

    const healthLine = lines[healthLineIdx];
    expect(healthLine, 'health must invoke the installed squad binary').toMatch(/\bsquad health --json/);
    expect(sharedContent).toContain(
      'uses: bradygaster/squad/.github/actions/squad-init@d8d7ef2d6da93460fecbfd56f8de20f9d10fd377',
    );
    expect(sharedContent).toContain('version: ${{ steps.squad-release.outputs.tag }}');
    expect(sharedContent).not.toContain('npm install --global');
    expect(sharedContent).not.toContain('npx --yes "@bradygaster/squad-cli@');
  });

  it('continue-on-error on the restore step does not shield health failure from stopping dispatch', () => {
    // The agent-job restore step may carry continue-on-error: true — that is deliberate
    // (it lets the agent-job body explain a missing artifact). The HEALTH step in the
    // activation job must NOT carry it: activation-job failure blocks the agent job.
    const lines = sharedContent.split('\n');
    const restoreLineIdx = lines.findIndex(l => l.includes('Restore Squad state from activation artifact'));
    expect(restoreLineIdx, 'restore step must exist').toBeGreaterThan(-1);

    // Examine only the activation-job section (before the restore step).
    const activationSection = lines.slice(0, restoreLineIdx).join('\n');
    const healthStepStart = activationSection.lastIndexOf('Run Squad health check');
    expect(healthStepStart, '"Run Squad health check" step must appear before the restore step').toBeGreaterThan(-1);

    const healthStepBlock = activationSection.slice(healthStepStart);
    expect(
      healthStepBlock,
      'health step in the activation job must not carry continue-on-error: true',
    ).not.toMatch(/continue-on-error:\s*true/);
  });
});

// ---------------------------------------------------------------------------
// Test: Uncast scaffolds must still initialize before the health gate (#1605)
//
// The activation job skips `squad init` when `.squad/team.md` already lists
// roster entries. A scaffolded team.md carries only the table header and the
// separator row, and counting those as a roster skips init — which, now that
// readiness runs before dispatch, fails the activation job and blocks every
// agent instead of casting the team.
// ---------------------------------------------------------------------------

describe('gh-aw: activation roster guard counts only data rows (#1605)', () => {
  const sharedContent = readText(join(SHARED_DIR, 'squad.md'));

  it('runs initialization after gh-aw checks out the activation context', () => {
    expect(
      sharedContent,
      'the generated activation checkout must include committed Squad state',
    ).toMatch(/ambient-folders:\s*\n\s+- \.squad/);
    expect(
      sharedContent,
      'jobs.activation.steps runs after the generated activation checkout',
    ).toMatch(/^  activation:\s*\n\s+steps:/m);
    expect(
      sharedContent,
      'pre-steps run before the generated activation checkout and cannot inspect committed state',
    ).not.toMatch(/^  activation:\s*\n\s+pre-steps:/m);
  });

  function initStepScript(): string {
    const lines = sharedContent.split('\n');
    const start = lines.findIndex((l) => l.includes('Initialize Squad team'));
    expect(start, '"Initialize Squad team" step must exist').toBeGreaterThan(-1);
    let end = start + 1;
    while (end < lines.length && !/^\s+-\s+name:/.test(lines[end])) end++;
    return lines.slice(start, end).join('\n');
  }

  /** Runs the step's roster guard against a team.md fixture. */
  function skipsInit(teamContent: string): boolean {
    const dir = mkdtempSync(join(tmpdir(), 'squad-roster-guard-'));
    try {
      const teamPath = join(dir, 'team.md');
      writeFileSync(teamPath, teamContent);
      const script = initStepScript();
      const guard = script.match(/if \[ -f "\.squad\/team\.md" \] && ([\s\S]*?); then/)?.[1];
      expect(
        guard,
        'roster guard must remain extractable from the "Initialize Squad team" step',
      ).toBeDefined();

      const result = spawnSync(
        requirePosixShell(),
        ['-c', (guard as string).replace(/\.squad\/team\.md/g, 'team.md')],
        { cwd: dir, encoding: 'utf8' },
      );
      return result.status === 0;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const HEADER = '## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n';

  it('keeps the roster guard runnable in a plain POSIX shell', () => {
    // The fixtures below execute the guard through `requirePosixShell()`, which is
    // `/bin/sh` on Linux. Process substitution is a bash extension, so a guard that
    // used it would fail there for the wrong reason and make the fixtures below
    // report on shell support instead of roster semantics.
    expect(
      initStepScript(),
      'roster guard must not use bash-only process substitution',
    ).not.toContain('<(');
  });

  it('runs init for a scaffolded team.md that has no cast members', () => {
    expect(
      skipsInit(`${HEADER}\n## Project Context\n`),
      'header and separator rows are not roster entries — skipping init here leaves ' +
        'an uncast team that fails readiness and blocks every dispatch',
    ).toBe(false);
  });

  it('preserves a committed cast rather than re-running init', () => {
    expect(
      skipsInit(`${HEADER}| Flight | Lead | \`.squad/agents/flight/charter.md\` | ✅ Active |\n\n## Project Context\n`),
      'a team.md with real roster rows must still skip init (#1657)',
    ).toBe(true);
  });

  it('ignores roster-shaped rows outside the Members section', () => {
    expect(
      skipsInit(`## Coordinator\n\n| Name | Role | Notes |\n|------|------|-------|\n| Squad | Coordinator | Routes work. |\n\n${HEADER}\n`),
      'only the Members table describes the cast; the Coordinator table is always present',
    ).toBe(false);
  });
});
