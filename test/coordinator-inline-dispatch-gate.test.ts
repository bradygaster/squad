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
 * This test pins the always-on dispatch contract into the canonical coordinator
 * template and asserts semantic parity across its synced copies and the
 * compatibility references so a future size-reduction refactor cannot silently
 * relocate or contradict it again:
 *   1. An explicit INLINE-DISPATCH GATE in Client Compatibility — inline work is
 *      permitted ONLY in Direct Mode; missing spawn tools require refusal.
 *   2. A one-line STOP gate under "How to Spawn an Agent" — about to produce a
 *      domain artifact with no spawn-tool call this turn → dispatch instead.
 *   3. An always-on VS Code `runSubagent` micro-playbook so how-to-dispatch is
 *      never lazy-loaded.
 *   4. A mandatory first-turn Scribe bootstrap independent of domain dispatch.
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
const ROUTING_LOCATIONS = [
  '.squad-templates/routing.md',
  'templates/routing.md',
  'packages/squad-cli/templates/routing.md',
  'packages/squad-sdk/templates/routing.md',
] as const;
const CLIENT_COMPATIBILITY_LOCATIONS = [
  '.squad-templates/client-compatibility-reference.md',
  'templates/client-compatibility-reference.md',
  'packages/squad-cli/templates/client-compatibility-reference.md',
  'packages/squad-sdk/templates/client-compatibility-reference.md',
] as const;
const SPAWN_REFERENCE_LOCATIONS = [
  '.squad-templates/spawn-reference.md',
  'templates/spawn-reference.md',
  'packages/squad-cli/templates/spawn-reference.md',
  'packages/squad-sdk/templates/spawn-reference.md',
] as const;
const CLIENT_COMPATIBILITY_SKILL_LOCATIONS = [
  '.copilot/skills/client-compatibility/SKILL.md',
  '.squad-templates/skills/client-compatibility/SKILL.md',
  'templates/skills/client-compatibility/SKILL.md',
  'packages/squad-cli/templates/skills/client-compatibility/SKILL.md',
  'packages/squad-sdk/templates/skills/client-compatibility/SKILL.md',
] as const;
const CLIENT_COMPATIBILITY_DOC =
  'docs/src/content/docs/scenarios/client-compatibility.md';

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
  // (b) all supported dispatch tools are named
  expect(tail, `${label}: gate must reference create_session`).toMatch(/\bcreate_session\b/);
  expect(tail, `${label}: gate must reference task`).toMatch(/\btask\b/);
  expect(tail, `${label}: gate must reference runSubagent`).toMatch(/\brunSubagent\b/);
  // (c) otherwise dispatch is mandatory
  expect(tail, `${label}: gate must state dispatch is mandatory otherwise`).toMatch(/MUST dispatch/i);
  expect(tail, `${label}: missing spawn tools must require refusal`).toMatch(/none is available, refuse/i);
}

function assertMandatoryContract(content: string, label: string): void {
  const idx = content.search(/Mandatory dispatch contract:/i);
  expect(idx, `${label}: missing mandatory dispatch contract`).toBeGreaterThanOrEqual(0);
  const tail = content.slice(idx, idx + 700);
  expect(tail, `${label}: Direct Mode boundary must be narrow`).toMatch(/already present in context/i);
  expect(tail, `${label}: domain work must be enumerated`).toMatch(/code, test, investigation, analysis/i);
  expect(tail, `${label}: small tasks must still dispatch`).toMatch(/Small scope is not an exemption/i);
}

function assertScribeBootstrap(content: string, label: string): void {
  const idx = content.search(/Session Init — Scribe Bootstrap/i);
  expect(idx, `${label}: missing first-turn Scribe bootstrap`).toBeGreaterThanOrEqual(0);
  const tail = content.slice(idx, idx + 1000);
  expect(tail, `${label}: bootstrap must run on the first Team Mode turn`).toMatch(/first Team Mode turn/i);
  expect(tail, `${label}: bootstrap must not depend on prior agent work`).toMatch(
    /must not depend on another agent having run/i,
  );
  expect(tail, `${label}: CLI/App bootstrap must be background`).toMatch(/mode: "background"/i);
  expect(tail, `${label}: VS Code bootstrap must use runSubagent`).toMatch(/\brunSubagent\b/i);
}

function assertCompatibilityDispatchContract(content: string, label: string): void {
  expect(content, `${label}: Copilot App must use create_session`).toMatch(
    /Copilot App mode.{0,100}\bcreate_session\b/is,
  );
  expect(content, `${label}: missing dispatch tools must require refusal`).toMatch(
    /(?:No dispatch tool available|None available).{0,250}refuse domain work/is,
  );
  expect(content, `${label}: stale inline fallback guidance remains`).not.toMatch(
    /Fallback mode.{0,200}work inline/is,
  );
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

    it('has an exhaustive mandatory dispatch contract', () => {
      assertMandatoryContract(content, CANONICAL);
      expect(content, 'Lightweight Mode must still dispatch').toMatch(
        /Lightweight Mode still dispatches one agent/i,
      );
    });

    it('starts Scribe on the first Team Mode turn', () => {
      assertScribeBootstrap(content, CANONICAL);
    });

    describe('Scribe bootstrap routing parity', () => {
      for (const loc of ROUTING_LOCATIONS) {
        it(`${loc} starts Scribe at the beginning of Team Mode`, () => {
          expect(read(loc)).toMatch(/Scribe always starts once at the beginning of every Team Mode session/i);
        });
      }
    });

    describe('client compatibility reference parity', () => {
      for (const loc of [
        ...CLIENT_COMPATIBILITY_LOCATIONS,
        ...SPAWN_REFERENCE_LOCATIONS,
        ...CLIENT_COMPATIBILITY_SKILL_LOCATIONS,
        CLIENT_COMPATIBILITY_DOC,
      ]) {
        it(`${loc} preserves the mandatory dispatch contract`, () => {
          assertCompatibilityDispatchContract(read(loc), loc);
        });
      }
    });
  });

  describe('dispatch contract parity across all 5 synced copies', () => {
    for (const loc of SQUAD_AGENT_LOCATIONS) {
      it(`${loc} contains the mandatory dispatch and Scribe gates`, () => {
        const content = read(loc);
        expect(content, `${loc}: missing inline-dispatch gate anchor`).toMatch(GATE_ANCHOR);
        assertGateBody(content, loc);
        assertMandatoryContract(content, loc);
        assertScribeBootstrap(content, loc);
      });
    }
  });
});
