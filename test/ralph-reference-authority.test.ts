import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RALPH_REFERENCES = [
  '.squad-templates/ralph-reference.md',
  '.squad/templates/ralph-reference.md',
  'templates/ralph-reference.md',
  'packages/squad-cli/templates/ralph-reference.md',
  'packages/squad-sdk/templates/ralph-reference.md',
] as const;

function readReference(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf-8').replace(/\r\n/g, '\n');
}

describe('Ralph reference authority', () => {
  const canonical = readReference(RALPH_REFERENCES[0]);

  for (const path of RALPH_REFERENCES) {
    describe(path, () => {
      const content = readReference(path);

      it('matches the canonical reference', () => {
        expect(content, `${path} must stay synchronized`).toBe(canonical);
      });

      it('keeps Ralph monitor/triage-only and removes merge or issue-closing authority', () => {
        expect(content).toMatch(/Ralph is monitor\/triage-only/i);
        expect(content).not.toMatch(/gh pr merge/i);

        const mergeTrigger = content
          .split(/\r?\n/)
          .find(line => line.includes('"merge PR #N"'));
        expect(mergeTrigger).toMatch(/"merge it".*coordinator/i);
        expect(mergeTrigger).not.toMatch(/merge via|gh pr merge/i);

        const approvedPrRow = content
          .split(/\r?\n/)
          .find(line => /^\|\s*\*\*Approved PRs\*\*/.test(line));
        expect(approvedPrRow).toMatch(/Report readiness.*coordinator.*human/i);
        expect(approvedPrRow).toMatch(/Ralph does not merge or close issues/i);
      });

      it('assigns pre-merge readiness to the coordinator and merge authority to a human', () => {
        expect(content).toMatch(/coordinator owns pre-merge readiness and hand-off/i);
        expect(content).toMatch(/Only a human may merge pull requests/i);
        expect(content).toMatch(/After a human merge, the coordinator follows repository issue-closing policy/i);
        expect(content).toMatch(/Ralph only reports status and never closes the issue/i);
      });
    });
  }
});
