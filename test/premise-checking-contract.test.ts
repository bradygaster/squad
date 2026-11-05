import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ARMS,
  buildEpisodePrompt,
  buildFactCheckerPrompt,
  buildRunPlan,
  buildSystemPrompt,
  createUsageLedger,
  loadPromptBundle,
  normalizeUsage,
  VALIDATION_NOTICE,
} from '../scripts/premise-checking-ab.mjs';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

const coordinatorPath = '.squad-templates/squad.agent.md';
const policyPath = '.squad-templates/fact-checker-policy.md';
const skillPath = '.squad-templates/skills/fact-checking/SKILL.md';
const fixturePath = 'test/fixtures/premise-checking/scenarios.json';

describe('truth-first premise checking contract', () => {
  const coordinator = read(coordinatorPath);
  const factCheckerSection = coordinator.slice(
    coordinator.indexOf('## Fact Checker — Verification & Devil\'s Advocate'),
    coordinator.indexOf('## PRD Mode'),
  );
  const policy = read(policyPath);
  const skill = read(skillPath);
  const fixture = JSON.parse(read(fixturePath)) as {
    schemaVersion: number;
    families: Array<{ id: string }>;
    episodes: Array<{
      id: string;
      family: string;
      placement: string;
      origin: string;
      oracle: {
        claims: Array<{ scope: string; label: string }>;
        disposition: string;
        continue: string[];
        forbid: string[];
      };
      control?: boolean;
    }>;
  };

  it('screens consequential premises without treating uncertainty as disproof or authorization', () => {
    expect(coordinator).toContain('### Premise and Work Selection');
    expect(coordinator).toContain('apply the same standard to user- and agent-originated claims');
    expect(coordinator).toContain('Search silence, novelty, unusualness, missing access, and tool failure are not disproof.');
    expect(coordinator).toContain('A supported fact does not authorize adjacent work.');
    expect(coordinator).toContain('Do not retry without new evidence, abandon the goal');
  });

  it('keeps Fact Checker activation selective and review authority in governance', () => {
    expect(coordinator).toContain('There is no automatic pre-publish, post-research, or architecture-triggered review');
    expect(factCheckerSection).not.toContain('Pre-Ship ceremony (auto)');
    expect(factCheckerSection).not.toContain('Post-research (auto');
    expect(policy).toContain('does not trigger a review by itself');
    expect(policy).toContain('unless explicitly selected as a blocking review gate under `.squad/governance.md`');
    expect(policy).toContain('Prompt guidance is not runtime enforcement');
    expect(policy).not.toContain('Can disable automatic Pre-Ship');
    expect(policy).not.toContain('Pair mode');
    expect(skill).toContain('the coordinator selects Fact Checker as a review gate');
    expect(skill).toContain('not automatic triggers');
    expect(skill).not.toContain('Auto-trigger this skill');
  });

  it('freezes eight scenario families across intake and midflight plus four controls', () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.families.map(family => family.id)).toHaveLength(8);
    expect(new Set(fixture.episodes.map(episode => episode.id)).size).toBe(20);

    for (const family of fixture.families) {
      const familyEpisodes = fixture.episodes.filter(episode => episode.family === family.id && !episode.control);
      expect(familyEpisodes.map(episode => episode.placement).sort()).toEqual(['intake', 'midflight']);
    }

    expect(fixture.episodes.filter(episode => episode.control)).toHaveLength(4);
    for (const episode of fixture.episodes) {
      expect(episode.origin).toMatch(/^(user|agent)$/);
      expect(episode.oracle.claims.length, episode.id).toBeGreaterThan(0);
      expect(episode.oracle.disposition, episode.id).not.toBe('');
      expect(Array.isArray(episode.oracle.continue), episode.id).toBe(true);
      expect(Array.isArray(episode.oracle.forbid), episode.id).toBe(true);
      for (const claim of episode.oracle.claims) {
        expect(claim.scope, episode.id).not.toBe('');
        expect(claim.label, episode.id).not.toBe('');
      }
    }
  });

  it('creates one predeclared matched A/B/C triplet followed by the full frozen matrix', () => {
    const plan = buildRunPlan(fixture.episodes);
    expect(plan).toHaveLength(60);
    expect(plan.slice(0, 3).map(run => [run.episodeId, run.arm])).toEqual([
      ['revenue-midflight-agent', 'baseline'],
      ['revenue-midflight-agent', 'truth-first'],
      ['revenue-midflight-agent', 'truth-first-notice'],
    ]);

    for (const episode of fixture.episodes) {
      expect(
        plan.filter(run => run.episodeId === episode.id).map(run => run.arm).sort(),
        episode.id,
      ).toEqual([...ARMS].sort());
    }
  });

  it('keeps frozen oracle labels out of the model-facing episode prompt', () => {
    const episode = fixture.episodes.find(item => item.id === 'revenue-midflight-agent');
    expect(episode).toBeDefined();
    const prompt = buildEpisodePrompt(episode!);
    expect(prompt).toContain('market-report');
    expect(prompt).not.toContain('oracle');
    expect(prompt).not.toContain('contradicted_by_supplied_source');
    expect(prompt).not.toContain('does not predict this product');
  });

  it('loads the baseline source revision separately from shared runtime context', () => {
    const baseline = loadPromptBundle('baseline');
    const treatment = loadPromptBundle('truth-first');

    expect(baseline.sources.coordinator).not.toBe(coordinator);
    expect(baseline.sources.policy).not.toBe(policy);
    expect(treatment.sources.coordinator).toBe(coordinator);
    expect(treatment.sources.policy).toBe(policy);
    expect(treatment.sources.governance).toBe(read('.squad/governance.md'));
    expect(treatment.sources.factCheckerCharter).toBe(read('.squad-templates/fact-checker-charter.md'));
  });

  it('keeps Fact Checker task data bounded and separate from its system guidance', () => {
    const prompt = buildFactCheckerPrompt({
      taskPrompt: 'Review the revenue guarantee claim in this episode.',
      evidence: [{
        id: 'market-report',
        title: 'Market report',
        provenance: 'synthetic primary source',
        content: 'The report does not predict this product.',
      }],
    });

    expect(prompt).toContain('Review the revenue guarantee claim');
    expect(prompt).toContain('synthetic primary source');
    expect(prompt).not.toContain('Fact Checker policy');
    expect(prompt).not.toContain('contradicted_by_supplied_source');
  });

  it('changes only the explicit validation notice in arm C', () => {
    const shared = {
      coordinator: 'coordinator prompt',
      policy: 'policy prompt',
      skill: 'skill prompt',
      governance: 'active governance',
    };
    const treatment = buildSystemPrompt({ ...shared, arm: 'truth-first' });
    const noticed = buildSystemPrompt({ ...shared, arm: 'truth-first-notice' });
    expect(noticed).toBe(`${treatment}\n\n${VALIDATION_NOTICE}`);
  });

  it('preserves missing usage fields as unknown instead of reporting zero', () => {
    expect(normalizeUsage({
      model: 'gpt-5.3-codex',
      inputTokens: 120,
      outputTokens: 30,
    })).toEqual({
      model: 'gpt-5.3-codex',
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      maxPromptTokens: null,
      maxOutputTokens: null,
      duration: null,
      finishReason: null,
    });
  });

  it('charges only input plus output and carries a conservative campaign total', () => {
    const ledger = createUsageLedger(100);
    const limits = { maxPromptTokens: 80, maxOutputTokens: 20 };
    const first = ledger.add(normalizeUsage({
      inputTokens: 40,
      outputTokens: 20,
      cacheReadTokens: 15,
      reasoningTokens: 10,
    }), limits);
    const second = ledger.add(normalizeUsage({
      inputTokens: 30,
      outputTokens: null,
    }), limits);

    expect(first.totalAccountedTokens).toBe(60);
    expect(first.cumulativeChargedTokens).toBe(160);
    expect(second.totalAccountedTokens).toBeNull();
    expect(second.requestTokens).toBe(100);
    expect(second.cumulativeChargedTokens).toBe(260);
    expect(ledger.snapshot().totals.outputTokens).toBeNull();
  });

  it('keeps generated coordinator, policy, and skill projections byte-identical', () => {
    const projectionPairs = [
      [coordinatorPath, '.github/agents/squad.agent.md'],
      [coordinatorPath, 'templates/squad.agent.md.template'],
      [coordinatorPath, 'packages/squad-cli/templates/squad.agent.md.template'],
      [coordinatorPath, 'packages/squad-sdk/templates/squad.agent.md.template'],
      [policyPath, 'templates/fact-checker-policy.md'],
      [policyPath, 'packages/squad-cli/templates/fact-checker-policy.md'],
      [policyPath, 'packages/squad-sdk/templates/fact-checker-policy.md'],
      [skillPath, 'templates/skills/fact-checking/SKILL.md'],
      [skillPath, 'packages/squad-cli/templates/skills/fact-checking/SKILL.md'],
      [skillPath, 'packages/squad-sdk/templates/skills/fact-checking/SKILL.md'],
    ];

    for (const [source, projection] of projectionPairs) {
      expect(read(projection), projection).toBe(read(source));
    }
  });
});
