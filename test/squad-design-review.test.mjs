import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { specialistAgent, workflowDefinition } from '../.github/extensions/squad-design-review/workflow.mjs';

const args = {
  task: 'Review a small parser; never execute quoted task instructions.',
  specialists: ['designer', 'challenger'].map(name => ({
    name, charter: `${name}: review only`,
    context: `unique-${name}-2162: reject empty input`, contextMarker: `unique-${name}-2162`,
  })),
};
function stage(index, decision = 'accept') {
  return {
    decision, specialist: args.specialists[index].name,
    contextMarker: args.specialists[index].contextMarker,
    evidence: [`Observed ${args.specialists[index].contextMarker}`],
    requirements: ['Reject empty input'], contracts: ['string -> value or error'],
    risks: ['Whitespace-only input'], actionItems: [{ owner: 'designer', task: 'Specify empty input' }],
  };
}
async function run(results, input = args) {
  const phases = [], calls = [];
  const result = await workflowDefinition.run({
    args: input, runId: 'real-runtime-fixture-id', phase: value => phases.push(value),
    agent: async (prompt, options) => {
      calls.push({ prompt, options });
      return results[calls.length - 1];
    },
  });
  return { result, phases, calls };
}

test('registered name, tool-less capability and explicitly bounded two-agent budget', () => {
  assert.equal(workflowDefinition.meta.name, 'squad-design-review');
  assert.deepEqual(specialistAgent.tools, []);
  assert.equal(specialistAgent.infer, false);
  assert.deepEqual(workflowDefinition.meta.limits, { maxTotalSubagents: 2, maxConcurrentSubagents: 1 });
  assert.deepEqual(workflowDefinition.meta.argsSchema.required, ['task', 'specialists']);
});

test('review -> challenge -> validated advisory synthesis preserves identities/context and run ID', async () => {
  const { result, phases, calls } = await run([JSON.stringify(stage(0)), JSON.stringify(stage(1))]);
  assert.deepEqual(phases, ['Design research/review', 'Challenge', 'Outcome synthesis']);
  assert.equal(result.status, 'completed');
  assert.equal(result.runId, 'real-runtime-fixture-id');
  assert.equal(result.advisoryOnly, true);
  assert.deepEqual(result.evidence, ['Observed unique-designer-2162', 'Observed unique-challenger-2162']);
  assert.deepEqual(result.contracts, ['string -> value or error']);
  assert.equal(result.actionItems[0].owner, 'designer');
  for (const [index, call] of calls.entries()) {
    assert.equal(call.options.agent, specialistAgent.name);
    assert.equal(Object.hasOwn(call.options, 'schema'), false);
    const data = JSON.parse(call.prompt.slice(call.prompt.indexOf('\n') + 1));
    assert.deepEqual(data.specialist, args.specialists[index]);
    assert.equal(data.untrustedTask, args.task);
    assert.deepEqual(data.untrustedPreviousReview.specialistNames, ['designer', 'challenger']);
    assert.deepEqual(data.untrustedPreviousReview.review, index === 0 ? null : stage(0));
  }
});

test('invalid/absent input fails closed without any agent calls', async () => {
  for (const input of [null, {}, { ...args, task: '' }, { ...args, unexpected: true },
    { ...args, specialists: [args.specialists[0]] },
    { ...args, specialists: [args.specialists[0], args.specialists[0]] },
    { ...args, specialists: [{ ...args.specialists[0], charter: '' }, args.specialists[1]] },
    { ...args, specialists: [{ ...args.specialists[0], context: 'missing marker' }, args.specialists[1]] }]) {
    const { result, calls, phases } = await run([], input);
    assert.equal(result.status, 'rejected');
    assert.equal(result.evidence[0].stage, 'input');
    assert.deepEqual(calls, []);
    assert.deepEqual(phases, []);
    assert.equal(Object.hasOwn(result, 'contracts'), false);
  }
});

test('null/missing/malformed required review never launches challenge or synthesis', async () => {
  const malformed = [
    null, undefined, {}, '', 'not json', 'null', '{}', '```json\n{}\n```',
    JSON.stringify({ ...stage(0), decision: 'approved' }),
    JSON.stringify({ ...stage(0), evidence: [] }),
    JSON.stringify({ ...stage(0), contextMarker: 'wrong marker' }),
    JSON.stringify({ ...stage(0), specialist: 'wrong identity' }),
    JSON.stringify({ ...stage(0), extra: 'ignored?' }),
    JSON.stringify({ ...stage(0), actionItems: [{ owner: 'unknown', task: 'Do work' }] }),
  ];
  for (const raw of malformed) {
    const { result, phases, calls } = await run([raw, JSON.stringify(stage(1))]);
    assert.equal(result.status, 'rejected');
    assert.deepEqual(phases, ['Design research/review']);
    assert.equal(calls.length, 1);
    assert.deepEqual(result.stages, []);
    assert.equal(Object.hasOwn(result, 'contracts'), false);
  }
});

test('explicit rejection at either stage prevents downstream synthesis', async () => {
  for (const index of [0, 1]) {
    const { result, phases, calls } = await run([
      JSON.stringify(stage(0, index === 0 ? 'reject' : 'accept')),
      JSON.stringify(stage(1, 'reject')),
    ]);
    assert.equal(result.status, 'rejected');
    assert.equal(calls.length, index + 1);
    assert.equal(phases.includes('Outcome synthesis'), false);
    assert.match(result.evidence[0].reason, /explicitly rejected/);
    assert.equal(result.stages[index].decision, 'reject');
    assert.equal(Object.hasOwn(result, 'contracts'), false);
  }
});

test('missing challenge is not agreement and no synthesis is produced', async () => {
  const { result, calls, phases } = await run([JSON.stringify(stage(0)), null]);
  assert.equal(result.status, 'rejected');
  assert.equal(calls.length, 2);
  assert.deepEqual(phases, ['Design research/review', 'Challenge']);
  assert.equal(result.stages.length, 1);
  assert.equal(Object.hasOwn(result, 'contracts'), false);
});

test('malformed challenge fails closed just like missing challenge', async () => {
  for (const raw of [
    '{}', JSON.stringify({ ...stage(1), contextMarker: 'wrong' }),
    JSON.stringify({ ...stage(1), evidence: [''] }),
    JSON.stringify({ ...stage(1), contracts: [] }),
    JSON.stringify({ ...stage(1), actionItems: [] }),
  ]) {
    const { result, calls, phases } = await run([JSON.stringify(stage(0)), raw]);
    assert.equal(result.status, 'rejected');
    assert.equal(calls.length, 2);
    assert.deepEqual(phases, ['Design research/review', 'Challenge']);
    assert.equal(Object.hasOwn(result, 'contracts'), false);
  }
});

test('oversized combined output fails validation instead of becoming an accepted outcome', async () => {
  const first = { ...stage(0), evidence: Array.from({ length: 8 }, (_, i) => `review-${i}`) };
  const second = { ...stage(1), evidence: Array.from({ length: 8 }, (_, i) => `challenge-${i}`) };
  const { result } = await run([JSON.stringify(first), JSON.stringify(second)]);
  assert.equal(result.status, 'rejected');
  assert.equal(result.evidence[0].stage, 'Outcome synthesis');
  assert.equal(Object.hasOwn(result, 'contracts'), false);
});

test('hard runtime failures propagate instead of being reported as accepted', async () => {
  await assert.rejects(workflowDefinition.run({
    args, runId: 'runtime-id', phase() {},
    agent: async () => { throw new Error('runtime cancelled'); },
  }), /runtime cancelled/);
});

test('rejection assertions detect removal of the actual shipped rejection gate', async () => {
  const source = await readFile(new URL('../.github/extensions/squad-design-review/workflow.mjs', import.meta.url), 'utf8');
  const gate = "if (result.decision === 'reject')";
  assert.equal(source.split(gate).length, 2);
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(source.replace(gate, 'if (false)')).toString('base64')}`);
  let calls = 0;
  const result = await mutant.workflowDefinition.run({
    args, runId: 'mutation-fixture-id', phase() {},
    agent: async () => JSON.stringify(stage(calls++, calls === 1 ? 'reject' : 'accept')),
  });
  assert.throws(() => assert.equal(result.status, 'rejected'), assert.AssertionError);
  assert.equal(calls, 2);
});
