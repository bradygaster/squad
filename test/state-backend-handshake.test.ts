/**
 * Regression tests for bradygaster/squad#1305 — the canonical squad.agent.md
 * template must instruct the coordinator to probe for squad_state and memory
 * tools before mutating state on non-local backends, and must hard-refuse
 * writes when the bridge isn't reachable.
 *
 * Background: Copilot CLI loads MCP server tools lazily — they're not
 * always advertised in the initial function list. The pre-1305 prompt said
 * "when memory tools are available, use them" which models interpreted as
 * "if listed" instead of "after probing". That led to a real incident where
 * a coordinator session against a two-layer backend wrote .squad/decisions.md
 * via raw create/edit tools, hit the pre-commit hook, and treated it as a
 * git problem instead of a contract violation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');

const TEMPLATE_TARGETS = [
  '.squad-templates/squad.agent.md',
  'templates/squad.agent.md.template',
  'packages/squad-cli/templates/squad.agent.md.template',
  'packages/squad-sdk/templates/squad.agent.md.template',
];

describe('squad.agent.md.template — state-backend handshake (#1305)', () => {
  for (const rel of TEMPLATE_TARGETS) {
    describe(rel, () => {
      const fullPath = path.join(REPO_ROOT, rel);
      if (!existsSync(fullPath)) {
        it.skip(`(file does not exist in this checkout: ${rel})`, () => {});
        return;
      }
      const content = readFileSync(fullPath, 'utf-8');

      it('declares the mandatory state-backend handshake section', () => {
        // The handshake must be flagged as MANDATORY and explicitly mention
        // every session and pre-state-mutation timing — soft language was
        // the original failure mode.
        expect(content).toMatch(/State-backend handshake[^\n]*MANDATORY/i);
        expect(content).toMatch(/every session/i);
        expect(content).toMatch(/before any state mutation/i);
      });

      it('instructs the coordinator to PROBE for squad_state_health on non-local backends', () => {
        // The probe is the load-bearing behavioral instruction. The pre-1305
        // prompt said "when memory tools are available" which models read as
        // "if listed in my tool block"; the post-1305 prompt explicitly says
        // to probe via tool-discovery (e.g. tool_search_tool_regex).
        expect(content).toMatch(/squad_state_health/);
        expect(content).toMatch(/tool_search_tool_regex|tool-discovery/i);
      });

      it('instructs the coordinator to HALT when the probe fails', () => {
        // Halt is the load-bearing safety instruction. Without it, models
        // silently fall back to raw file ops and violate the backend contract.
        expect(content).toMatch(/HALT/i);
        // Must tell the user how to fix it — restart Copilot CLI or change
        // stateBackend to local.
        expect(content).toMatch(/Restart Copilot CLI/i);
        expect(content).toMatch(/stateBackend.*local/i);
      });

      it('declares a HARD RULE forbidding raw file writes to runtime-owned paths under non-local backends', () => {
        expect(content).toMatch(/HARD RULE/i);
        // The forbidden-paths list must include the high-traffic state files.
        expect(content).toMatch(/\.squad\/decisions\.md/);
        expect(content).toMatch(/\.squad\/decisions\/inbox/);
        expect(content).toMatch(/\.squad\/agents\/\*\/history\.md/);
        // And must call out the create/edit/write_file tools by name so the
        // model maps the rule to its actual function inventory. Match each
        // tool name with separate assertions so dropping any one of them
        // (e.g. forgetting `write_file`) fails the test — the previous
        // single-regex form had | precedence so the shorter alternative
        // `create\s*/\s*edit` could pass without `write_file`.
        expect(content).toMatch(/\bcreate\b/);
        expect(content).toMatch(/\bedit\b/);
        expect(content).toMatch(/\bwrite_file\b/);
      });

      it('keeps the local/worktree carve-out explicit (file ops valid for local backends)', () => {
        // The rule applies ONLY to non-local backends. Local-backend users
        // must still be able to use create/edit/write_file on .squad/.
        expect(content).toMatch(/local.*worktree|local.*backend.*valid/i);
      });
    });
  }
});
