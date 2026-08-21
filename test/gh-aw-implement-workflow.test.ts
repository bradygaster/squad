import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

function frontmatter(markdown: string): string {
  return markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

function yamlBlock(yaml: string, key: string): string {
  const lines = yaml.split(/\r?\n/);
  const keyPattern = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*)$`);
  const start = lines.findIndex(line => keyPattern.test(line));
  if (start === -1) return '';

  const match = lines[start].match(keyPattern)!;
  const indent = match[1].length;
  const block = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    block.push(line);
  }
  return block.join('\n');
}

function scalarInBlock(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'm'));
  return match?.[1].trim().replace(/^['"]|['"]$/g, '');
}

function listInBlock(block: string, key: string): string[] {
  const lines = block.split(/\r?\n/);
  const inline = block.match(new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\[(.*)\\]\\s*$`, 'm'));
  if (inline) {
    return inline[1]
      .split(',')
      .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  const keyPattern = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`);
  const start = lines.findIndex(line => keyPattern.test(line));
  if (start === -1) return [];

  const indent = lines[start].match(keyPattern)![1].length;
  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    const item = line.match(/^\s+-\s+(.+)$/)?.[1];
    if (item) items.push(item.trim().replace(/^['"]|['"]$/g, ''));
  }
  return items;
}

function continuationSection(worker: string): string {
  return worker.match(
    /## Continue Parent Epic After Merge([\s\S]*?)The remaining instructions apply only to `workflow_dispatch`/,
  )?.[1] ?? '';
}

describe('gh-aw implement workflows', () => {
  const dispatcher = read('workflows/squad.md');
  const worker = read('workflows/squad-implement-worker.md');
  const guide = read('docs/src/content/docs/guide/gh-aw.md');
  const dispatcherFrontmatter = frontmatter(dispatcher);
  const workerFrontmatter = frontmatter(worker);

  it('keeps repository editing isolated to the dispatch-only worker', () => {
    const protectedFiles = yamlBlock(workerFrontmatter, 'protected-files');
    const excludedFiles = listInBlock(yamlBlock(workerFrontmatter, 'excluded-files'), 'excluded-files');

    expect(dispatcher).not.toMatch(/^tools:\r?\n\s+edit:/m);
    expect(worker).toContain('private: false');
    expect(worker).not.toContain('slash_command:');
    expect(worker).toMatch(/^tools:\r?\n\s+edit:/m);
    expect(protectedFiles, 'worker create-pull-request must declare protected-files policy').not.toBe('');
    expect(scalarInBlock(protectedFiles, 'policy')).toBeDefined();
    expect(scalarInBlock(protectedFiles, 'policy')).not.toBe('request_review');
    expect(excludedFiles).toEqual(
      expect.arrayContaining([
        '.github/workflows/**',
        '**/.github/workflows/**',
        '.github/agents/**',
        '**/.github/agents/**',
        '.github/aw/**',
        '**/.github/aw/**',
        '.squad/**',
        '**/.squad/**',
      ]),
    );
    expect(continuationSection(worker)).toMatch(/Never edit files or create a\s+pull request in this mode/);
  });

  it('bounds dispatch and serializes workers for the same issue', () => {
    const dispatcherDispatch = yamlBlock(dispatcherFrontmatter, 'dispatch-workflow');
    const configuredWorkerTargets = listInBlock(dispatcherDispatch, 'workflows');
    const dispatchMax = Number(scalarInBlock(dispatcherDispatch, 'max'));
    const slotCap = Number(dispatcher.match(/available-slots = max\(0, (\d+) - active-implementation-count\)/)?.[1]);

    expect(dispatcher).toContain('bots: ["github-actions[bot]"]');
    expect(worker).toContain('bots: ["github-actions[bot]"]');
    expect(dispatcher).toContain('aw_context:');
    expect(worker).toContain('aw_context:');
    expect(configuredWorkerTargets).toContain('squad-implement-worker');
    expect(dispatchMax).toBeGreaterThan(0);
    expect(dispatchMax).toBeLessThanOrEqual(slotCap);
    expect(dispatcher).toContain('Never call the generic `dispatch_workflow` tool');
    expect(dispatcher).toContain('Never emit a dispatch without a');
    expect(worker).toContain(
      'group: "squad-implement-${{ github.event.inputs.issue_number || github.event.pull_request.number }}"',
    );
    expect(worker).toContain('cancel-in-progress: false');
  });

  it('continues epic execution after implementation PRs merge', () => {
    const workerDispatch = yamlBlock(workerFrontmatter, 'dispatch-workflow');
    const continuation = continuationSection(worker);
    const payloadBlock = continuation.match(/```json\r?\n([\s\S]*?)\r?\n```/)?.[1];
    expect(payloadBlock, 'continuation dispatch JSON payload should be present').toBeDefined();
    const payload = JSON.parse(payloadBlock!) as {
      workflow_name?: string;
      inputs?: Record<string, string>;
      command?: string;
      issue_number?: string;
    };

    expect(dispatcher).not.toMatch(/pull_request:\r?\n\s+types: \[closed\]/);
    expect(worker).toMatch(/pull_request:\r?\n\s+types: \[closed\]/);
    expect(worker).toContain("startsWith(github.event.pull_request.head.ref, 'squad/implement-')");
    expect(listInBlock(workerDispatch, 'workflows')).toContain('squad');
    expect(scalarInBlock(workerDispatch, 'target-ref')).toContain('github.event.repository.default_branch');
    expect(payload).toMatchObject({
      workflow_name: 'squad',
      inputs: {
        command: 'implement',
        issue_number: '{root-issue-number}',
      },
    });
    expect(payload.command).toBeUndefined();
    expect(payload.issue_number).toBeUndefined();
    expect(continuation).toMatch(/Never edit files or create a\s+pull request in this mode/);
    expect(continuation).toContain('Always leave a visible next step');
    expect(continuation).toContain('Never emit `noop` for a merge continuation');
    expect(dispatcher).toMatch(/available-slots = max\(0, \d+ - active-implementation-count\)/);
    expect(dispatcher).toContain('fills newly available slots');
  });

  it('guards implementation branches, files, dependencies, and duplicate PRs', () => {
    expect(worker).toContain('- "squad/implement-*"');
    expect(worker).not.toMatch(/allowed-files:\r?\n\s+- "\*"/);
    expect(worker).toContain('Do not change `.github/workflows/`, `.github/agents/`, `.github/aw/`, or');
    expect(worker).toContain('blocker comment if any dependency remains open');
    expect(worker).toContain('Check for an existing open pull request');
  });

  it('documents one-command installation in dependency order', () => {
    const workerIndex = guide.indexOf('bradygaster/squad/workflows/squad-implement-worker.md@dev');
    const dispatcherIndex = guide.indexOf('bradygaster/squad/workflows/squad.md@dev');

    expect(workerIndex).toBeGreaterThan(-1);
    expect(dispatcherIndex).toBeGreaterThan(workerIndex);
    expect(guide).toContain('The single command installs the dedicated worker first');
  });
});

// ---------------------------------------------------------------------------
// Cross-sibling refill traversal (#1779)
// ---------------------------------------------------------------------------
// The worker refills a freed dispatch slot by asking `squad`'s implement mode to
// re-scan a sub-tree.  WHICH sub-tree it names is the whole defect: naming the
// completing task's immediate parent epic scopes the refill to that epic, so
// once the epic drains the run exits green while sibling epics still hold
// unstarted leaf tasks (#1779).  Naming the root makes the scan cover every
// sibling epic.
//
// These tests do NOT assert that the prompt contains particular wording -- a
// substring check cannot prove a prompt is obeyed, as #1784 demonstrated
// empirically.  Instead they parse the machine-readable dispatch payload the
// worker ships, bind its `issue_number` placeholder to the traversal it names,
// and RUN that traversal over a fixture tree using `squad.md`'s own leaf-only
// descent and slot budget.  The assertion is on where traversal lands.
//
// Against the pre-fix payload (`{parent-epic-number}`) the traversal returns an
// empty dispatch set for the drained-epic fixture and these tests go red.

interface FixtureIssue {
  number: number;
  parent: number | null;
  state: 'open' | 'closed';
  /** Leaf already has an open implementation PR -- occupies a concurrency slot. */
  active?: boolean;
}

/**
 * Root #100
 *   ├─ Epic A #110            (open)
 *   │    ├─ #111 closed        merged earlier
 *   │    └─ #112 closed        <- the task whose PR just merged; Epic A is now drained
 *   └─ Epic B #120            (open)
 *        ├─ #121 open
 *        └─ #122 open
 */
const TWO_EPIC_TREE: FixtureIssue[] = [
  { number: 100, parent: null, state: 'open' },
  { number: 110, parent: 100, state: 'open' },
  { number: 111, parent: 110, state: 'closed' },
  { number: 112, parent: 110, state: 'closed' },
  { number: 120, parent: 100, state: 'open' },
  { number: 121, parent: 120, state: 'open' },
  { number: 122, parent: 120, state: 'open' },
];

function byNumber(tree: FixtureIssue[], number: number): FixtureIssue {
  const issue = tree.find(candidate => candidate.number === number);
  if (!issue) throw new Error(`fixture has no issue #${number}`);
  return issue;
}

function parentOf(tree: FixtureIssue[], number: number): number | null {
  return byNumber(tree, number).parent;
}

/** Walk the parent chain to the topmost ancestor, guarding against cycles. */
function rootOf(tree: FixtureIssue[], number: number): number {
  const seen = new Set<number>([number]);
  let current = number;
  for (;;) {
    const parent = parentOf(tree, current);
    if (parent === null || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
}

function openChildren(tree: FixtureIssue[], number: number): FixtureIssue[] {
  return tree.filter(issue => issue.parent === number && issue.state === 'open');
}

function anyChildren(tree: FixtureIssue[], number: number): FixtureIssue[] {
  return tree.filter(issue => issue.parent === number);
}

/**
 * `squad.md` Step 1.3/1.4: descend recursively through every level and keep the
 * open descendants that group nothing at all.  Intermediate parents (epics, the
 * root) are never returned -- that is the leaf-only rule from #1758 defect 2,
 * modeled here so a regression in it fails these tests.
 *
 * Leafness is "has no sub-issues at all", not "has no OPEN sub-issues".  A
 * drained epic -- every child implemented and closed, the epic itself still
 * open -- passes the open-children-only test and would be dispatched as if it
 * were implementable.  Root-scoped refill walks straight into exactly that
 * state, so the distinction is load-bearing here rather than academic.
 */
function openLeafDescendants(tree: FixtureIssue[], target: number): number[] {
  const leaves: number[] = [];
  const walk = (number: number): void => {
    for (const child of openChildren(tree, number)) {
      if (anyChildren(tree, child.number).length === 0) leaves.push(child.number);
      else walk(child.number);
    }
  };
  walk(target);
  return leaves.sort((a, b) => a - b);
}

/**
 * Bind the shipped payload's `issue_number` placeholder to the traversal it
 * names.  An unrecognized placeholder is a hard failure rather than a silent
 * pass -- the whole point is that this token determines runtime scope.
 */
function resolveRefillTarget(placeholder: string, tree: FixtureIssue[], mergedIssue: number): number {
  switch (placeholder) {
    case '{root-issue-number}':
      return rootOf(tree, mergedIssue);
    case '{parent-epic-number}':
      return parentOf(tree, mergedIssue) ?? mergedIssue;
    default:
      throw new Error(
        `Unrecognized continuation dispatch placeholder "${placeholder}". ` +
          'Update resolveRefillTarget() to model the traversal it names, ' +
          'and prove the model still reaches sibling-epic leaves.',
      );
  }
}

/** `squad.md` Epic Dispatch: exclude active leaves, then fill available slots in issue order. */
function simulateRefill(
  placeholder: string,
  tree: FixtureIssue[],
  mergedIssue: number,
  slotCap: number,
): { target: number; dispatched: number[] } {
  const target = resolveRefillTarget(placeholder, tree, mergedIssue);
  const leaves = openLeafDescendants(tree, target);
  const activeCount = leaves.filter(number => byNumber(tree, number).active).length;
  const availableSlots = Math.max(0, slotCap - activeCount);
  const ready = leaves.filter(number => !byNumber(tree, number).active);
  return { target, dispatched: ready.slice(0, availableSlots) };
}

describe('gh-aw implement worker: cross-sibling refill traversal (#1779)', () => {
  const dispatcher = read('workflows/squad.md');
  const worker = read('workflows/squad-implement-worker.md');

  const continuation = continuationSection(worker);
  const payloadBlock = continuation.match(/```json\r?\n([\s\S]*?)\r?\n```/)?.[1];
  const placeholder = (JSON.parse(payloadBlock ?? '{}') as { inputs?: { issue_number?: string } }).inputs
    ?.issue_number;
  const slotCap = Number(
    dispatcher.match(/available-slots = max\(0, (\d+) - active-implementation-count\)/)?.[1],
  );

  it('exposes a parseable refill scope and slot budget', () => {
    expect(payloadBlock, 'continuation must ship a JSON dispatch payload').toBeDefined();
    expect(placeholder, 'continuation payload must name the refill target').toBeTruthy();
    expect(Number.isFinite(slotCap) && slotCap > 0, 'squad.md must declare a numeric slot cap').toBe(true);
  });

  // SC-2: after Epic A drains, the refill must reach Epic B's leaves.
  it('reaches a sibling epic once the completing task drains its own epic', () => {
    const { target, dispatched } = simulateRefill(placeholder!, TWO_EPIC_TREE, 112, slotCap);

    expect(
      openLeafDescendants(TWO_EPIC_TREE, 110),
      'fixture precondition: Epic A must be drained so only a wider scan can find work',
    ).toEqual([]);
    expect(target, 'refill must scan from the root, not the drained parent epic').toBe(100);
    expect(
      dispatched,
      'sibling Epic B still holds unstarted leaf tasks; the freed slot must not sit idle',
    ).toContain(121);
    expect(dispatched.length).toBeGreaterThan(0);
  });

  // SC-1 corollary: the traversal is full-subtree, not immediate-children.
  it('never dispatches an epic or the root itself (leaf-only rule, #1758 defect 2)', () => {
    const { dispatched } = simulateRefill(placeholder!, TWO_EPIC_TREE, 112, slotCap);

    for (const number of dispatched) {
      expect(
        openChildren(TWO_EPIC_TREE, number),
        `#${number} has open sub-issues and must never be dispatched as implementable`,
      ).toEqual([]);
    }
    expect(dispatched).not.toContain(100);
    expect(dispatched).not.toContain(110);
    expect(dispatched).not.toContain(120);
  });

  it('never dispatches a drained-but-open epic as if it were implementable', () => {
    // Epic A #110 is open with every child closed. It has no *open* sub-issues,
    // so an open-children-only leaf test reclassifies it as implementable. Root-
    // scoped refill descends straight past it, which is why this case is now
    // reachable and must stay excluded.
    const { dispatched } = simulateRefill(placeholder!, TWO_EPIC_TREE, 112, slotCap);

    expect(openChildren(TWO_EPIC_TREE, 110), 'fixture precondition: #110 has no open children').toEqual([]);
    expect(anyChildren(TWO_EPIC_TREE, 110).length, 'fixture precondition: #110 still groups issues').toBeGreaterThan(0);
    expect(dispatched, 'a drained epic groups issues and is never a leaf task').not.toContain(110);
  });

  it('still refills within the completing epic before it drains', () => {
    // #111 merges while #112 is still open: the near case must not regress.
    const tree = TWO_EPIC_TREE.map(issue =>
      issue.number === 112 ? { ...issue, state: 'open' as const } : issue,
    );
    const { dispatched } = simulateRefill(placeholder!, tree, 111, slotCap);

    expect(dispatched, 'same-epic refill must still happen').toContain(112);
  });

  it('respects the existing slot budget instead of widening it', () => {
    // Epic B's #121 is already in flight, so it occupies one of the slots.
    const tree = TWO_EPIC_TREE.map(issue =>
      issue.number === 121 ? { ...issue, active: true } : issue,
    );
    const { dispatched } = simulateRefill(placeholder!, tree, 112, slotCap);

    expect(dispatched).not.toContain(121);
    expect(dispatched.length).toBeLessThanOrEqual(slotCap - 1);

    const workerDispatch = yamlBlock(frontmatter(worker), 'dispatch-workflow');
    const dispatchMax = Number(scalarInBlock(workerDispatch, 'max'));
    expect(dispatchMax, 'refill scope is the fix; do not paper over it by raising max').toBe(2);
    expect(dispatchMax).toBeLessThanOrEqual(slotCap);
  });

  // Negative control: documents the pre-fix scope and proves the model above is
  // discriminating rather than vacuously green.
  it('control: scoping the refill to the immediate parent epic strands sibling work', () => {
    const { target, dispatched } = simulateRefill('{parent-epic-number}', TWO_EPIC_TREE, 112, slotCap);

    expect(target).toBe(110);
    expect(dispatched, 'this is the #1779 defect: drained epic yields no dispatch').toEqual([]);
    expect(placeholder, 'the shipped payload must not use the stranding scope').not.toBe(
      '{parent-epic-number}',
    );
  });
});
