import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ARMS,
  AVAILABLE_TOOLS,
  attachSessionRecorder,
  buildEpisodePrompt,
  buildFactCheckerPrompt,
  buildPairedCalibrationPlan,
  buildRunPlan,
  buildSystemPrompt,
  compareLimitObservations,
  createUsageLedger,
  hasEvidenceReviewTrace,
  loadPromptBundle,
  normalizeUsage,
  recordMissingReviewerUsage,
  runModelPreflight,
  shouldStopCampaign,
  toolEventDetails,
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
      priorTurns?: Array<{ speaker: string; content: string }>;
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
    expect(coordinator).toContain('Do not dispatch Fact Checker solely to restate that a future goal is unverified or evidence is missing');
    expect(coordinator).toContain('Do not retry without new evidence, abandon the goal');
  });

  it('builds a balanced baseline-vs-truth-first pair for every frozen family', () => {
    const plan = buildPairedCalibrationPlan(fixture.episodes);
    expect(plan).toHaveLength(fixture.families.length * 2);
    expect(new Set(plan.map(run => run.family))).toEqual(new Set(fixture.families.map(family => family.id)));
    for (const [index, family] of fixture.families.entries()) {
      const pair = plan.filter(run => run.family === family.id);
      expect(pair).toHaveLength(2);
      expect(pair.map(run => run.arm).sort()).toEqual(['baseline', 'truth-first']);
      expect(pair.map(run => run.episodeId).filter(id => id === pair[0].episodeId)).toHaveLength(2);
      expect(pair[0].arm).toBe(index % 2 === 0 ? 'baseline' : 'truth-first');
    }
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
      if (episode.placement === 'midflight') {
        expect(episode.priorTurns?.length, episode.id).toBeGreaterThanOrEqual(2);
        expect(episode.priorTurns?.some(turn => turn.speaker === 'Agent handoff'), episode.id).toBe(true);
      }
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

  it('uses an explicit empty-mode allowlist for only the synthetic tools', () => {
    expect(AVAILABLE_TOOLS).toEqual(['read_evidence', 'task']);
  });

  it('uses the SDK completion event contract and keeps omitted fields unknown', () => {
    expect(toolEventDetails({
      toolCallId: 'call-1',
    }, 'task')).toEqual({
      toolName: 'task',
      toolCallId: 'call-1',
      success: null,
      error: null,
      arguments: null,
      result: null,
    });
  });

  it.each(['coordinator', 'fact-checker'] as const)(
    'correlates reused tool call IDs across sessions when %s completes first',
    firstRole => {
      const directory = mkdtempSync(path.join(tmpdir(), 'premise-checking-recorder-'));
      try {
        const context = {
          activeSessions: new Set(),
          sessionIds: [],
          messages: [],
          events: [] as Array<{
            eventType: string;
            sessionId: string;
            role: string;
            data: { toolCallId: string; toolName: string };
          }>,
          eventsPath: path.join(directory, 'events.jsonl'),
          toolCallNames: new Map<string, string>(),
        };
        const coordinator = Object.assign(new EventEmitter(), { sessionId: 'coordinator-1' });
        const reviewer = Object.assign(new EventEmitter(), { sessionId: 'reviewer-1' });
        attachSessionRecorder(coordinator, context, 'coordinator');
        attachSessionRecorder(reviewer, context, 'fact-checker');
        const toolCallId = 'shared-call-1';
        coordinator.emit('tool.execution_start', { data: { toolCallId, toolName: 'task' } });
        reviewer.emit('tool.execution_start', { data: { toolCallId, toolName: 'read_evidence' } });
        expect(context.toolCallNames.size).toBe(2);

        const [first, second] = firstRole === 'coordinator'
          ? [coordinator, reviewer]
          : [reviewer, coordinator];
        const [firstName, secondName] = firstRole === 'coordinator'
          ? ['task', 'read_evidence']
          : ['read_evidence', 'task'];
        // SDK completions may omit toolName in both interleaved sessions.
        first.emit('tool.execution_complete', { data: { toolCallId } });
        expect(context.toolCallNames.size).toBe(1);
        expect([...context.toolCallNames.values()]).toEqual([secondName]);
        second.emit('tool.execution_complete', { data: { toolCallId } });
        expect(context.toolCallNames.size).toBe(0);

        const completions = context.events.filter(event => event.eventType === 'tool.execution_complete');
        expect(completions).toMatchObject([
          { sessionId: first.sessionId, role: firstRole, data: { toolCallId, toolName: firstName } },
          {
            sessionId: second.sessionId,
            role: firstRole === 'coordinator' ? 'fact-checker' : 'coordinator',
            data: { toolCallId, toolName: secondName },
          },
        ]);
        const persisted = readFileSync(context.eventsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
        expect(persisted).toEqual(context.events);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([
    { finishReason: 'stop', stopReason: null, expectedAbortCount: 0 },
    {
      finishReason: 'tool_calls',
      stopReason: 'per-episode-call-limit-reached',
      expectedAbortCount: 1,
    },
  ])(
    'enforces the call cap for coordinator finish reason $finishReason',
    async ({ finishReason, stopReason, expectedAbortCount }) => {
      const directory = mkdtempSync(path.join(tmpdir(), 'premise-checking-call-limit-'));
      try {
        const context = {
          activeSessions: new Set(),
          usage: [],
          sessionIds: [],
          messages: [],
          events: [],
          eventsPath: path.join(directory, 'events.jsonl'),
          toolCallNames: new Map<string, string>(),
          limits: {
            maxPromptTokens: 100,
            maxOutputTokens: 20,
            maxModelCallsPerEpisode: 1,
            softTokenLimit: 200,
          },
          ledger: createUsageLedger(),
          stopReason: null as string | null,
        };
        let abortCalls = 0;
        const coordinator = Object.assign(new EventEmitter(), {
          sessionId: 'coordinator-final-call',
          abort: async () => { abortCalls++; },
        });
        context.activeSessions.add(coordinator);
        attachSessionRecorder(coordinator, context, 'coordinator');

        coordinator.emit('assistant.usage', {
          data: {
            inputTokens: 100,
            outputTokens: 20,
            maxPromptTokens: 100,
            maxOutputTokens: 20,
            finishReason,
          },
        });

        expect(context.ledger.snapshot().callCount).toBe(1);
        expect(context.stopReason).toBe(stopReason);
        expect(abortCalls).toBe(expectedAbortCount);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('delivers frozen preceding turns and a distinct current turn to every matched arm', () => {
    const episode = fixture.episodes.find(item => item.id === 'revenue-midflight-agent');
    expect(episode?.priorTurns).toHaveLength(3);
    const prompt = buildEpisodePrompt(episode!);
    expect(prompt).toContain('Frozen preceding conversation and handoff turns (in order):');
    expect(prompt).toContain('Agent handoff: I found a synthetic market report excerpt');
    expect(prompt.indexOf('Agent handoff:')).toBeLessThan(prompt.indexOf('Current user turn:'));
    expect(prompt).toContain('Current user turn: An agent says a market report guarantees');

    const matchedPrompts = buildRunPlan(fixture.episodes)
      .filter(run => run.episodeId === episode!.id)
      .map(run => buildEpisodePrompt(fixture.episodes.find(item => item.id === run.episodeId)!));
    expect(new Set(matchedPrompts)).toEqual(new Set([prompt]));
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
      evidenceIds: ['market-report'],
    });

    expect(prompt).toContain('Review the revenue guarantee claim');
    expect(prompt).toContain('read_evidence');
    expect(prompt).toContain('market-report');
    expect(prompt).not.toContain('The report does not predict this product.');
    expect(prompt).not.toContain('Fact Checker policy');
    expect(prompt).not.toContain('contradicted_by_supplied_source');
  });

  it('counts a Fact Checker review only after correlated fixture evidence reads and a completed review', () => {
    const record = {
      factCheckerSessionIds: ['reviewer-1'],
      messages: [{ sessionId: 'reviewer-1', role: 'fact-checker', content: 'Review complete.' }],
      usageEvents: [{
        sessionId: 'reviewer-1',
        role: 'fact-checker',
        usageStatus: 'observed',
        inputTokens: 10,
        outputTokens: 4,
      }],
    };
    const events = [
      {
        eventType: 'tool.execution_start',
        sessionId: 'coordinator-1',
        role: 'coordinator',
        data: { toolName: 'task', toolCallId: 'task-1', arguments: { evidence_ids: ['market-report'] } },
      },
      {
        eventType: 'tool.execution_start',
        sessionId: 'reviewer-1',
        role: 'fact-checker',
        data: { toolName: 'read_evidence', toolCallId: 'read-1', arguments: { id: 'market-report' } },
      },
      {
        eventType: 'evidence.read',
        sessionId: 'reviewer-1',
        role: 'fact-checker',
        id: 'market-report',
      },
      {
        eventType: 'tool.execution_complete',
        sessionId: 'reviewer-1',
        role: 'fact-checker',
        data: { toolName: 'read_evidence', toolCallId: 'read-1' },
      },
      {
        eventType: 'fact-checker.review_completed',
        coordinatorSessionId: 'coordinator-1',
        taskCallId: 'task-1',
        reviewerSessionId: 'reviewer-1',
        evidenceIds: ['market-report'],
        reviewLength: 14,
      },
      {
        eventType: 'tool.execution_complete',
        sessionId: 'coordinator-1',
        role: 'coordinator',
        data: { toolName: 'task', toolCallId: 'task-1' },
      },
    ];

    expect(hasEvidenceReviewTrace(record, events)).toBe(true);
    const withoutRead = events.filter(event => event.eventType !== 'evidence.read');
    expect(hasEvidenceReviewTrace(record, withoutRead)).toBe(false);
    const afterReview = [...events];
    const readIndex = afterReview.findIndex(event => event.eventType === 'evidence.read');
    const [readEvent] = afterReview.splice(readIndex, 1);
    afterReview.splice(afterReview.findIndex(event => event.eventType === 'fact-checker.review_completed') + 1, 0, readEvent);
    expect(hasEvidenceReviewTrace(record, afterReview)).toBe(false);
  });

  it('records missing reviewer usage as unknown and halts later episodes', () => {
    const context = {
      usage: [],
      stopReason: null as string | null,
      activeSessions: new Set(),
      ledger: createUsageLedger(),
      limits: { maxPromptTokens: 100, maxOutputTokens: 20 },
    };
    const events: Array<Record<string, unknown>> = [];
    let aborted = false;
    recordMissingReviewerUsage(
      context as never,
      { sessionId: 'reviewer-failed' },
      event => events.push(event),
      () => { aborted = true; },
    );

    expect(context.usage).toHaveLength(1);
    expect(context.usage[0]).toMatchObject({
      sessionId: 'reviewer-failed',
      role: 'fact-checker',
      usageStatus: 'unknown',
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
    });
    expect(context.stopReason).toBe('fact-checker-usage-unknown');
    expect(events[0].eventType).toBe('assistant.usage_missing');
    expect(aborted).toBe(true);
    expect(shouldStopCampaign(context as never, 'completed')).toBe(true);
    expect(context.ledger.snapshot()).toMatchObject({
      callCount: 1,
      chargedTokens: 120,
      totals: { inputTokens: null, outputTokens: null, reasoningTokens: null },
    });
  });

  it('persists preflight state before catalog lookup and retains catalog failures', async () => {
    const manifest: Record<string, unknown> = {};
    const snapshots: string[] = [];
    const persist = () => snapshots.push(String((manifest.modelPreflight as { status: string }).status));
    await expect(runModelPreflight({
      manifest,
      limits: { maxPromptTokens: 100, maxOutputTokens: 20 },
      persist,
      queryModel: async () => {
        expect(snapshots).toEqual(['checking']);
        throw new Error('catalog unavailable');
      },
    })).rejects.toThrow('catalog unavailable');

    expect(snapshots).toEqual(['checking', 'failed']);
    expect(manifest.modelPreflightAttempts).toHaveLength(1);
    expect((manifest.modelPreflightAttempts as Array<{ status: string }>)[0].status).toBe('failed');
    expect(manifest.modelPreflight).toMatchObject({
      status: 'failed',
      available: false,
      error: 'catalog unavailable',
    });
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

  it('distinguishes an unreported request limit from a known mismatch', () => {
    const limits = { maxPromptTokens: 64_000, maxOutputTokens: 8_000 };
    const usage = normalizeUsage({ maxPromptTokens: 64_000 });

    expect(compareLimitObservations(usage, limits)).toEqual({
      prompt: true,
      output: null,
      overall: null,
    });
    expect(compareLimitObservations(normalizeUsage({
      maxPromptTokens: 32_000,
      maxOutputTokens: 8_000,
    }), limits).overall).toBe(false);
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
