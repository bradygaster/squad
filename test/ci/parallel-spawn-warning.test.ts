/**
 * CI tests for the shared-worktree spawn warning (#1014).
 *
 * A real incident showed that parallel background agents on a shared
 * worktree can silently lose untracked files to another stream's global
 * git operations (stash/clean/restore). The coordinator template must
 * constrain parallel work to independently deliverable outcomes, warn before
 * launching 2+ background agents without worktree isolation, and avoid
 * claiming shared-worktree concurrency is safe for untracked files.
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

describe('bounded collaboration and shared-worktree warning contracts', () => {
  const squadTemplate = readTemplate('.squad-templates/squad.agent.md');
  const worktreeReference = readTemplate('.squad-templates/worktree-reference.md');

  it('keeps the shared-worktree guard inside the Bounded Collaboration section', () => {
    const collaboration = squadTemplate.slice(
      squadTemplate.indexOf('### Bounded Collaboration'),
      squadTemplate.indexOf('### Shared Decision Architecture'),
    );

    expect(collaboration).toContain('exactly one accountable specialist');
    expect(collaboration).toContain('independently deliverable outcomes');
    expect(collaboration).toContain('concrete, bounded subproblem');
    expect(collaboration).toContain('Do not launch speculative, anticipatory');
    expect(collaboration).toContain('**Shared-worktree guard.**');
    expect(collaboration).toContain('2+ background agents');
    expect(collaboration).toContain('Pre-Spawn: Worktree Setup');
    expect(collaboration).toContain('untracked files');
    expect(collaboration).toContain('warning is a caution');
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
      const content = readTemplate(copy);
      expect(content, `${copy} is missing bounded ownership`).toContain(
        'exactly one accountable specialist',
      );
      expect(content, `${copy} still enables eager fan-out`).not.toContain(
        'launch aggressively, collect results later',
      );
      expect(content, `${copy} is missing the shared-worktree guard`).toContain(
        '**Shared-worktree guard.**',
      );
      for (const id of ['scribe', 'ralph', 'rai', 'fact-checker']) {
        expect(content, `${copy} is missing the ${id} Cast source`).toContain(
          `.squad/agents/${id}/charter.md`,
        );
      }
    }
  });
});
