/**
 * Coordinator inline-dispatch gate — regression for the v0.10.0 dispatch drift.
 *
 * Root cause (commit afe78188 / #1035, "context overflow sentinel and
 * coordinator size reduction"): the concrete inline-dispatch GATE and the
 * VS Code `runSubagent` how-to-dispatch mechanics were cut from the always-on
 * coordinator prompt and relocated into lazy-loaded reference files
 * (client-compatibility-reference.md, spawn-reference.md). The motivational
 * guardrails survived, but the hard "when am I allowed to work inline vs. when
 * MUST I dispatch?" rule no longer loads by default. Symptom (reported by
 * Matthew Wan on Teams, worked in v0.9.4): "the main squad agent does a lot of
 * work on its own instead of using his roster of agents."
 *
 * This test pins three always-on elements back into the canonical coordinator
 * template AND asserts byte-level PARITY across all 5 synced copies so a future
 * size-reduction refactor cannot silently relocate them again:
 *   1. An explicit INLINE-DISPATCH GATE in Client Compatibility — inline work is
 *      permitted ONLY in Direct Mode, or when NEITHER `task` NOR `runSubagent`
 *      is available; otherwise the coordinator MUST dispatch.
 *   2. A one-line STOP gate under "How to Spawn an Agent" — about to produce a
 *      domain artifact with no spawn-tool call this turn → dispatch instead
 *      (unless Direct Mode / no spawn tool).
 *   3. An always-on VS Code `runSubagent` micro-playbook so how-to-dispatch is
 *      never lazy-loaded.
 *
 * No subprocess is spawned here (kept deliberately read-only) so the test is
 * deterministic and immune to the parallel-suite `squad init` overwrite flake.
 * Parity is guaranteed because every copy is produced from the canonical source
 * by `scripts/sync-templates.mjs` (run in Phase 2 and by template-sync's own
 * beforeAll during the full suite).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

// Canonical edit-source is .squad-templates/squad.agent.md; the other four are
// produced by sync-templates.mjs. Mirror the list used by template-sync.test.ts.
const CANONICAL = '.squad-templates/squad.agent.md';
const SQUAD_AGENT_LOCATIONS = [
  CANONICAL,
  'templates/squad.agent.md.template',
  '.github/agents/squad.agent.md',
  'packages/squad-cli/templates/squad.agent.md.template',
  'packages/squad-sdk/templates/squad.agent.md.template',
] as const;

/**
 * Stable anchor introduced by the fix. Phrasing of the surrounding sentence may
 * evolve, but this header marker is the contract a future refactor must keep.
 */
const GATE_ANCHOR = /Inline-dispatch gate/i;

/** Assert the semantic body of the gate appears just after the anchor. */
function assertGateBody(content: string, label: string): void {
  const idx = content.search(GATE_ANCHOR);
  expect(idx, `${label}: missing "Inline-dispatch gate" anchor`).toBeGreaterThanOrEqual(0);
  const tail = content.slice(idx, idx + 600);
  // (a) inline is allowed in Direct Mode
  expect(tail, `${label}: gate must name Direct Mode as the inline exemption`).toMatch(/Direct Mode/);
  // (b) inline is allowed only when NEITHER spawn tool exists — both tools named
  expect(tail, `${label}: gate must reference the neither-task-nor-runSubagent fallback`).toMatch(
    /neither[^.]*\btask\b[^.]*\brunSubagent\b|neither[^.]*\brunSubagent\b[^.]*\btask\b/i,
  );
  // (c) otherwise dispatch is mandatory
  expect(tail, `${label}: gate must state dispatch is mandatory otherwise`).toMatch(/MUST dispatch/i);
}

describe('coordinator inline-dispatch gate (regression #1035)', () => {
  describe('canonical template carries all three always-on elements', () => {
    const content = read(CANONICAL);

    it('has an explicit inline-dispatch gate in Client Compatibility', () => {
      assertGateBody(content, CANONICAL);
    });

    it('has a STOP gate under "How to Spawn an Agent"', () => {
      // One-line guard: about to emit a domain artifact with no spawn call →
      // stop and dispatch, unless Direct Mode / no spawn tool.
      const m = content.match(/STOP gate:/i);
      expect(m, 'canonical: missing "STOP gate:" guard under How to Spawn an Agent').not.toBeNull();
      const tail = content.slice(content.search(/STOP gate:/i), content.search(/STOP gate:/i) + 400);
      expect(tail, 'STOP gate must reference dispatching').toMatch(/dispatch/i);
      expect(tail, 'STOP gate must carve out Direct Mode').toMatch(/Direct Mode/);
    });

    it('re-inlines an always-on VS Code runSubagent micro-playbook', () => {
      expect(content, 'canonical: missing VS Code runSubagent micro-playbook').toMatch(
        /runSubagent.{0,80}micro-playbook|micro-playbook.{0,80}runSubagent/is,
      );
    });
  });

  describe('inline-dispatch gate parity across all 5 synced copies', () => {
    for (const loc of SQUAD_AGENT_LOCATIONS) {
      it(`${loc} contains the inline-dispatch gate`, () => {
        const content = read(loc);
        expect(content, `${loc}: missing inline-dispatch gate anchor`).toMatch(GATE_ANCHOR);
        assertGateBody(content, loc);
      });
    }
  });
});
