import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

describe('gh-aw implement workflows', () => {
  const dispatcher = read('workflows/squad.md');
  const worker = read('workflows/squad-implement-worker.md');
  const guide = read('docs/src/content/docs/guide/gh-aw.md');

  it('keeps repository editing isolated to the dispatch-only worker', () => {
    expect(dispatcher).not.toMatch(/^tools:\r?\n\s+edit:/m);
    expect(worker).toContain('private: false');
    expect(worker).not.toContain('slash_command:');
    expect(worker).toMatch(/^tools:\r?\n\s+edit:/m);
    expect(worker).toContain('protected-files: request_review');
  });

  it('bounds dispatch and serializes workers for the same issue', () => {
    expect(dispatcher).toContain('workflows: [squad-implement-worker]');
    expect(dispatcher).toMatch(/dispatch-workflow:\r?\n\s+workflows: \[squad-implement-worker\]\r?\n\s+max: 3/);
    expect(dispatcher).toContain('Never call the generic `dispatch_workflow` tool');
    expect(dispatcher).toContain('Never emit a dispatch without a');
    expect(worker).toContain(
      'group: "squad-implement-${{ github.event.inputs.issue_number || github.event.pull_request.number }}"',
    );
    expect(worker).toContain('cancel-in-progress: false');
  });

  it('continues epic execution after implementation PRs merge', () => {
    expect(dispatcher).not.toMatch(/pull_request:\r?\n\s+types: \[closed\]/);
    expect(worker).toMatch(/pull_request:\r?\n\s+types: \[closed\]/);
    expect(worker).toContain("startsWith(github.event.pull_request.head.ref, 'squad/implement-')");
    expect(worker).toContain('workflows: [squad]');
    expect(worker).toContain('"command": "implement"');
    expect(worker).toContain('Never call the generic `dispatch_workflow` tool');
    expect(dispatcher).toContain('available-slots = max(0, 3 - active-implementation-count)');
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
