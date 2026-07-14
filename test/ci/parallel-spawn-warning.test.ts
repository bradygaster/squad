/**
 * CI tests for the shared-worktree spawn warning (#1014).
 *
 * A real incident showed that parallel background agents on a shared
 * worktree can silently lose untracked files to another stream's global
 * git operations (stash/clean/restore). The coordinator template must
 * warn before launching 2+ background agents without worktree isolation,
 * and the worktree reference must not claim shared-worktree concurrency
 * is safe for untracked files.
 *
 * Canonical source: .squad-templates/
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function readTemplate(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

describe('shared-worktree spawn warning contract (#1014)', () => {
  const squadTemplate = readTemplate('.squad-templates/squad.agent.md');
  const worktreeReference = readTemplate('.squad-templates/worktree-reference.md');

  it('keeps the shared-worktree guard inside the Parallel Fan-Out section', () => {
    const fanOut = squadTemplate.slice(
      squadTemplate.indexOf('### Parallel Fan-Out'),
      squadTemplate.indexOf('### Shared File Architecture'),
    );

    expect(fanOut).toContain('**Shared-worktree guard.**');
    expect(fanOut).toContain('2+ background agents');
    expect(fanOut).toContain('Pre-Spawn: Worktree Setup');
    expect(fanOut).toContain('untracked files');
    expect(fanOut).toContain('a caution, not a gate');
  });

  it('warns about stash/clean/restore specifically', () => {
    expect(squadTemplate).toContain('stash, clean, restore');
  });

  it('worktree reference no longer claims shared-worktree concurrency is safe for untracked files', () => {
    expect(worktreeReference).toContain('Untracked files are still at risk');
  });

  it('all governed copies of the coordinator template carry the guard', () => {
    const copies = [
      '.github/agents/squad.agent.md',
      'templates/squad.agent.md.template',
      'packages/squad-cli/templates/squad.agent.md.template',
      'packages/squad-sdk/templates/squad.agent.md.template',
    ];
    for (const copy of copies) {
      expect(readTemplate(copy), `${copy} is missing the shared-worktree guard`).toContain(
        '**Shared-worktree guard.**',
      );
    }
  });
});
