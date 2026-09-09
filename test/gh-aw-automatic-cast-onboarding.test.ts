import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CAST = readFileSync(resolve(ROOT, 'workflows/squad-cast.md'), 'utf8');
const ONBOARDING = readFileSync(resolve(ROOT, 'workflows/squad-onboarding.md'), 'utf8');

describe('automatic Cast and onboarding workflows', () => {
  it('uses separate closed-PR workflows with stable visible markers', () => {
    expect(CAST).toMatch(/name: Squad Automatic Cast/);
    expect(ONBOARDING).toMatch(/name: Squad Onboarding/);
    for (const marker of [
      'Squad-Bootstrap-Marker: squad-gh-aw/v1',
      'Squad-Cast-Marker: squad-gh-aw/v1',
      'Squad-Onboarding-Marker: squad-gh-aw/v1',
      'Squad-State-Footer: v1',
    ]) {
      expect(`${CAST}\n${ONBOARDING}`).toContain(marker);
    }
    expect(CAST).not.toMatch(/<!--\s*squad-(?:bootstrap|cast|onboarding)/i);
    expect(ONBOARDING).not.toMatch(/<!--\s*squad-(?:bootstrap|cast|onboarding)/i);
  });

  it('keeps activation guards narrow and idempotent', () => {
    for (const workflow of [CAST, ONBOARDING]) {
      expect(workflow).toMatch(/pull_request:\n\s+types: \[closed\]/);
      expect(workflow).toMatch(/pull request was\s+merged/);
      expect(workflow).toContain('default branch');
      expect(workflow).toContain('call `noop`');
      expect(workflow).toContain('`report_incomplete`');
      expect(workflow).toContain('standalone visible line');
    }
    expect(CAST).toContain('Squad-Cast-Marker: squad-gh-aw/v1');
    expect(CAST).toContain('never create a second Cast PR');
    expect(ONBOARDING).toContain('Recasting must remain idempotent');
    expect(ONBOARDING).toContain('update-issue');
    expect(ONBOARDING).toContain('create-issue');
  });

  it('restricts mutations to the intended bounded outputs', () => {
    expect(CAST).toContain('allowed-files:');
    expect(CAST).toContain('".squad/team.md"');
    expect(CAST).toContain('".github/agents/squad.agent.md"');
    expect(CAST).toContain('max: 1');
    expect(CAST).toContain('run-squad-cast-validator');
    expect(CAST).toContain('Cast validation passed.');
    expect(ONBOARDING).toContain('deduplicate-by-title: true');
    expect(ONBOARDING).toContain('required-title-prefix: "[Squad] Your repository team is ready"');
    expect(ONBOARDING).toMatch(
      /Do not create Research, Triage, Planning, Implementation Plan, or Work\s+Item issues/,
    );
  });

  it('documents the Stage 2 human handoff and deferred automation', () => {
    expect(CAST).toContain('native human PR review and merge are required');
    expect(CAST).toMatch(/Do not merge it, dispatch\s+Research/);
    expect(ONBOARDING).toContain('executable Work Items are not created until a human explicitly');
    expect(ONBOARDING).toContain('/squad activate [phase N]');
    expect(ONBOARDING).toContain('/squad stop <reason>');
    expect(ONBOARDING).toContain('no Research, Triage, Planning, Implementation Plan, or Work Item automation is enabled');
  });
});
