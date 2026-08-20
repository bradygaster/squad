import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
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

  it('keeps repository editing isolated to the dispatch-only worker', () => {
    expect(dispatcher).not.toMatch(/^tools:\r?\n\s+edit:/m);
    expect(worker).toContain('private: false');
    expect(worker).not.toContain('slash_command:');
    expect(worker).toMatch(/^tools:\r?\n\s+edit:/m);
    expect(worker).toContain('protected-files: request_review');
  });

  it('bounds dispatch and serializes workers for the same issue', () => {
    expect(dispatcher).toContain('bots: ["github-actions[bot]"]');
    expect(worker).toContain('bots: ["github-actions[bot]"]');
    expect(dispatcher).toContain('aw_context:');
    expect(worker).toContain('aw_context:');
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
    expect(worker).toContain('workflows: [squad]');
    expect(worker).toContain('target-ref: ${{ github.event.repository.default_branch }}');
    expect(payload).toMatchObject({
      workflow_name: 'squad',
      inputs: {
        command: 'implement',
        issue_number: '{parent-epic-number}',
      },
    });
    expect(payload.command).toBeUndefined();
    expect(payload.issue_number).toBeUndefined();
    expect(continuation).toMatch(/Never edit files or create a\s+pull request in this mode/);
    expect(continuation).toContain('Always leave a visible next step');
    expect(continuation).toContain('Never emit `noop` for a merge continuation');
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
