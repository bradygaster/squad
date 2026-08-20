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

    expect(dispatcher).not.toMatch(/pull_request:\r?\n\s+types: \[closed\]/);
    expect(worker).toMatch(/pull_request:\r?\n\s+types: \[closed\]/);
    expect(worker).toContain("startsWith(github.event.pull_request.head.ref, 'squad/implement-')");
    expect(listInBlock(workerDispatch, 'workflows')).toContain('squad');
    expect(scalarInBlock(workerDispatch, 'target-ref')).toContain('github.event.repository.default_branch');
    expect(worker).toContain('"command": "implement"');
    expect(worker).toContain('Never call the generic `dispatch_workflow` tool');
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
