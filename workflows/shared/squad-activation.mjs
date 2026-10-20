import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  checkActivationPublication, extractIssueNumber, parseAgentRegistry, parsePendingReservation, parseRoster, parseStructuredData, selectActivationRecord,
  validateActivation, validateCastingPairFiles,
} from './check-agent-binding.mjs';
import { authorizeSquadCommand, classifySquadCommand, markdownContentLines } from './squad-command-contract.mjs';

export const ACTIVATION_CAPTURE_SCHEMA = 'squad-activation-capture/v1';
export const ACTIVATION_RECEIPT_SCHEMA = 'squad-activation-receipts/v1';
export const ACTIVATION_MODES = new Set(['activate', 'plan accept', 'plan activate']);
const ACCEPTANCES = new Set(['plan-accepted', 'phases-accepted', 'activated', 'phases-activated', 'activation-reconciled']);
const STABLE_ID = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const SHA = /^[a-f0-9]{40}$/;
const BOT_ID = 41898282;
const MAX_ISSUES = 50;
const MAX_PLAN_BYTES = 35000;
const MAX_ISSUE_BODY_CHARACTERS = 65536;

function isActivationCommand(command) {
  return ACTIVATION_MODES.has(command.mode) ||
    (command.mode === 'plan accept implementation' && command.phase !== null);
}

function requireThat(condition, reason) {
  if (!condition) throw new Error(`Activation refused: ${reason}`);
}

export function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function positive(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function envelope(body) {
  return parseStructuredData(body ?? '', { envelopeOnly: true });
}

function requireWorkflowRecord(comment, repository, origin) {
  requireThat(comment?.user?.id === BOT_ID && comment.user.login === 'github-actions[bot]' &&
    comment.user.type === 'Bot' &&
    comment.issue_url === `https://api.github.com/repos/${repository}/issues/${origin}`,
  'acceptance and plan authority must be workflow-bot records on this origin; explicit reconciliation is required');
}

function labelFor(name, roster) {
  if (name === '@copilot') return 'squad:copilot';
  if (!roster.has(normalize(name))) return null;
  return `squad:${normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function tableCells(line) {
  requireThat(!line.includes('\\|'), 'escaped pipes in plan tables are unsupported');
  return line.trim().split('|').slice(1, -1).map(cell => cell.trim().replace(/^`([^`]+)`$/, '$1'));
}

function dependencies(value) {
  if (['', '-', '\u2014', 'none'].includes(normalize(value))) return [];
  const values = value.split(',').map(cell => cell.trim().replace(/^`([^`]+)`$/, '$1'));
  requireThat(values.every(id => STABLE_ID.test(id)) && new Set(values).size === values.length,
    'Depends On must contain unique comma-separated stable task IDs');
  return values;
}

/** Parse only the documented table grammar; prose and titles never establish identity. */
export function parseActivationPlan(body, kind, registryValue, teamMarkdown, selectedPhases = null) {
  requireThat(typeof body === 'string' && Buffer.byteLength(body) <= MAX_PLAN_BYTES,
    `frozen plan must be at most ${MAX_PLAN_BYTES} bytes`);
  requireThat(['plan', 'implementation'].includes(kind), 'unsupported plan artifact');
  const registry = parseAgentRegistry(registryValue);
  const roster = parseRoster(teamMarkdown);
  const lines = markdownContentLines(body);
  const phased = lines.some(line => /^### Phase [1-9]\d*(?:\s|$)/.test(line));
  let phase = null;
  const tasks = [];
  const ids = new Set();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = /^### Phase ([1-9]\d*)(?:\s|$)/.exec(line);
    if (heading) phase = Number(heading[1]);
    if (!line.trim().startsWith('|')) continue;
    const header = tableCells(line);
    if (!header.includes('#')) continue;
    const required = ['#', 'Title', kind === 'plan' ? 'Owner' : 'Agent', 'Agent ID', 'Depends On'];
    if (kind === 'implementation') required.push('Epic');
    requireThat(required.every(name => header.includes(name)) && new Set(header).size === header.length,
      `task table requires ${required.join(', ')}`);
    requireThat(/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[++index] ?? ''),
      'task table separator is missing');
    while (lines[index + 1]?.trim().startsWith('|')) {
      const cells = tableCells(lines[++index]);
      requireThat(cells.length === header.length, 'task table row has the wrong column count');
      const row = Object.fromEntries(header.map((key, offset) => [key, cells[offset]]));
      const id = row['#'];
      requireThat(STABLE_ID.test(id) && !ids.has(id), 'stable task IDs are missing, malformed or duplicated');
      ids.add(id);
      requireThat(row.Title && !/[\r\n]/.test(row.Title), `task ${id} has no title`);
      requireThat(!phased || positive(phase), `task ${id} is outside a declared phase`);
      const agent = row[kind === 'plan' ? 'Owner' : 'Agent'];
      requireThat(agent, `task ${id} has no owner`);
      const agentId = row['Agent ID'];
      const active = Object.entries(registryValue.agents).find(([, record]) =>
        record.status === 'active' && normalize(record.display_name) === normalize(agent));
      let identity = null;
      let omission;
      if (roster.has(normalize(agent))) {
        requireThat(active && agentId === active[0] && registry.agents.has(agentId),
          `task ${id} Agent ID does not match its active frozen roster owner`);
        identity = agentId;
      } else {
        requireThat(agent === '@copilot', `task ${id} has an unknown non-roster owner`);
        requireThat(['-', '\u2014'].includes(agentId), `task ${id} cannot assert a non-roster Agent ID`);
        omission = 'external-agent';
      }
      const epic = kind === 'implementation' ? row.Epic : phased ? `phase-${phase}` : 'origin';
      requireThat(STABLE_ID.test(epic), `task ${id} has an invalid epic ID`);
      tasks.push({
        id, title: row.Title, phase, epic, agent, agent_id: identity,
        ...(omission ? { identity_omission_reason: omission } : {}),
        dependencies: dependencies(row['Depends On']), label: labelFor(agent, roster),
      });
    }
  }
  requireThat(tasks.length > 0, 'plan has no supported task table');
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  const sorted = [];
  const visit = task => {
    requireThat(!visiting.has(task.id), `task ${task.id} has a cyclic dependency`);
    if (visited.has(task.id)) return;
    visiting.add(task.id);
    for (const dependency of task.dependencies) {
      requireThat(byId.has(dependency), `task ${task.id} references missing task ${dependency}`);
      visit(byId.get(dependency));
    }
    visiting.delete(task.id);
    visited.add(task.id);
    sorted.push(task);
  };
  tasks.forEach(visit);
  const epics = [...new Set(tasks.map(task => task.epic))].filter(epic => epic !== 'origin');
  const selected = selectedPhases === null ? tasks : tasks.filter(task => selectedPhases.includes(task.phase));
  const selectedEpics = new Set(selected.map(task => task.epic).filter(epic => epic !== 'origin'));
  requireThat(selected.length + selectedEpics.size <= MAX_ISSUES, `activation exceeds ${MAX_ISSUES} issues`);
  return { kind, phased, tasks: sorted, epics };
}

export function activationIssueLimit(issueBody, repositoryPolicy = '') {
  const profiles = { default: 20, lean: 10, enterprise: 50, spike: 5 };
  const visible = String(issueBody).replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  const profileLines = [...visible.matchAll(/^Squad-Policy:\s*([a-z][a-z0-9-]*)\s*$/gm)];
  requireThat(profileLines.length <= 1 &&
    [...visible.matchAll(/^Squad-Policy:/gm)].length === profileLines.length,
  'planning policy directive is malformed or ambiguous');
  const frontmatter = repositoryPolicy.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  requireThat(!repositoryPolicy.trim() || frontmatter, 'repository planning policy requires supported YAML frontmatter');
  const profile = profileLines[0]?.[1] ?? frontmatter.match(/^profile:\s*([a-z][a-z0-9-]*)\s*$/m)?.[1] ?? 'default';
  const settings = [...frontmatter.matchAll(/^\s*max_issues:\s*(\d+)\s*$/gm)];
  requireThat(settings.length <= 1 &&
    [...frontmatter.matchAll(/^\s*max_issues:/gm)].length === settings.length,
  'repository max_issues is malformed or ambiguous');
  requireThat(Object.hasOwn(profiles, profile) || (profile === 'custom' && settings.length === 1), 'unsupported planning policy profile');
  let limit = profileLines.length && Object.hasOwn(profiles, profile)
    ? profiles[profile] : settings.length ? Number(settings[0][1]) : profiles[profile];
  const overrides = [...visible.matchAll(/^Squad-Setting:\s*(.+)$/gm)]
    .flatMap(match => match[1].split(',').map(value => value.trim()))
    .filter(value => value.startsWith('max_issues='));
  requireThat(overrides.length <= 1 && overrides.every(value => /^max_issues=[1-9]\d*$/.test(value)),
    'max_issues override is malformed or ambiguous');
  if (overrides.length) limit = Number(overrides[0].slice('max_issues='.length));
  requireThat(positive(limit), 'max_issues must be a positive safe integer');
  return Math.min(limit, MAX_ISSUES);
}

/** Validate an actual create result, not an agent's claimed issue-number mapping. */
export function validateCreateReceipt(result, operation, capture, prior = []) {
  requireThat(result?.staged === false && result.issue && !result.issue.pull_request,
    `operation ${operation.id}: createIssue did not return an actual issue`);
  const issue = result.issue;
  requireThat(positive(issue.number) && positive(issue.id) &&
    typeof issue.node_id === 'string' && issue.node_id.length > 0,
  `operation ${operation.id}: actual issue identities are missing or malformed`);
  requireThat(issue.html_url === `https://github.com/${capture.repository}/issues/${issue.number}` &&
    issue.url === `https://api.github.com/repos/${capture.repository}/issues/${issue.number}`,
  `operation ${operation.id}: create result repository or URL does not match`);
  requireThat(!prior.some(receipt => receipt.operation_id === operation.id ||
    receipt.number === issue.number || receipt.id === issue.id || receipt.node_id === issue.node_id),
  `operation ${operation.id}: duplicate operation or actual issue identity`);
  return {
    operation_id: operation.id, repository: capture.repository,
    number: issue.number, id: issue.id, node_id: issue.node_id, url: issue.html_url,
  };
}

export function validateReceiptSet(capture, journal) {
  requireThat(journal?.schema === ACTIVATION_RECEIPT_SCHEMA &&
    journal.capture_sha256 === digest(capture) &&
    journal.repository === capture.repository && journal.run_id === capture.run_id &&
    journal.run_attempt === capture.run_attempt, 'receipt journal does not match the frozen capture');
  requireThat(Array.isArray(journal.receipts) && Array.isArray(journal.started),
    'receipt journal is malformed');
  requireThat(Array.isArray(journal.parent_fallbacks) &&
    new Set(journal.parent_fallbacks).size === journal.parent_fallbacks.length &&
    journal.parent_fallbacks.every(id => capture.operations.some(operation => operation.id === id)),
  'receipt journal parent fallback metadata is invalid');
  requireThat(new Set(journal.started).size === journal.started.length &&
    isDeepStrictEqual(journal.started, capture.operations.map(operation => operation.id)),
  'operations are incomplete, duplicated or out of order; no-create recovery required');
  requireThat(journal.receipts.length === capture.operations.length,
    'actual create receipts are missing; an API write may have occurred; recreation is forbidden');
  const checked = [];
  for (const [index, operation] of capture.operations.entries()) {
    const receipt = journal.receipts[index];
    requireThat(receipt?.operation_id === operation.id && receipt.repository === capture.repository,
      'receipt operation identity or repository mismatch');
    checked.push(validateCreateReceipt({ staged: false, issue: {
      number: receipt.number, id: receipt.id, node_id: receipt.node_id,
      html_url: receipt.url, url: `https://api.github.com/repos/${receipt.repository}/issues/${receipt.number}`,
    } }, operation, capture, checked));
  }
  return new Map(checked.map(receipt => [receipt.operation_id, receipt]));
}

export function buildActivationBindings(capture, journal) {
  const receipts = validateReceiptSet(capture, journal);
  for (const receipt of capture.prior?.issues ?? []) {
    requireThat(![...receipts.values()].some(current => current.number === receipt.number || current.id === receipt.id ||
      current.node_id === receipt.node_id), 'new issue collides with an explicitly mapped prior issue');
    receipts.set(receipt.operation_id, receipt);
  }
  return bindingsForIssueMap({ ...capture, plan: {
    ...capture.plan, tasks: [...(capture.prior?.tasks ?? []), ...capture.plan.tasks],
  } }, receipts);
}

function bindingsForIssueMap(capture, receipts) {
  const artifact = capture.plan.kind === 'plan'
    ? (capture.phase === null ? 'plan-accepted' : 'phases-accepted')
    : (capture.phase === null ? 'activated' : 'phases-activated');
  return capture.plan.tasks.map(task => {
    const peers = (capture.fullPlan ?? capture.plan).tasks.filter(peer => peer.epic === task.epic);
    const agents = [...new Set(peers.map(peer => normalize(peer.agent)))].sort();
    const agentIds = [...new Set(peers.map(peer => peer.agent_id).filter(Boolean))].sort();
    const root = task.epic === 'origin';
    const parentLabel = agents.length === 1 ? peers[0].label : null;
    return {
      binding_schema: 'squad-work-agent-binding/v1', binding_version: 1,
      producer: 'squad', repository: capture.repository, origin_issue: capture.origin_issue,
      artifact, registry_schema: 'squad-agent-provenance/v1', registry_revision: capture.registry.revision,
      task: task.id, issue: `#${receipts.get(`task:${task.id}`).number}`,
      epic: task.epic, epic_issue: `#${root ? capture.origin_issue : receipts.get(`epic:${task.epic}`).number}`,
      agent: task.agent, agent_id: task.agent_id, epic_agents: agents, epic_agent_ids: agentIds,
      ...(task.identity_omission_reason ? { identity_omission_reason: task.identity_omission_reason } : {}),
      ...(peers.some(peer => peer.agent_id === null) ? { epic_identity_omission_reason: 'partial' } : {}),
      label: task.label,
      ...(!task.label ? { omission_reason: 'non-roster' } : {}),
      epic_label: root ? null : parentLabel,
      ...(root ? { epic_omission_reason: 'origin' } : !parentLabel
        ? { epic_omission_reason: agents.length > 1 ? 'multi-owner' : 'non-roster' } : {}),
      depends_on: task.dependencies.map(id => `#${receipts.get(`task:${id}`).number}`),
    };
  });
}

export function activationRequest(items) {
  requireThat(Array.isArray(items) && items.length === 1 && items[0]?.type === 'activate_plan',
    'activation requires exactly one activate_plan request; native creates, acceptance and lifecycle outputs are forbidden');
  const request = items[0];
  requireThat(Object.keys(request).every(key => ['type', 'plan_comment_id'].includes(key)) &&
    typeof request.plan_comment_id === 'string' && /^[1-9]\d*$/.test(request.plan_comment_id) &&
    positive(Number(request.plan_comment_id)), 'activate_plan requires an exact numeric plan_comment_id');
  return Number(request.plan_comment_id);
}

export function frozenAssignments(plan) {
  return plan.tasks.map(task => ({ task: task.id, epic: task.epic, agent: task.agent, agentId: task.agent_id }));
}

function activationHeads(records, comments, repository) {
  const superseded = new Set();
  const visited = new Set();
  const visiting = new Set();
  const reference = (id, hash) => {
    const source = comments.find(comment => comment.id === id);
    requireThat(source && digest(source.body) === hash, 'activation ancestry reference is missing or changed');
    superseded.add(id);
    visit(source);
  };
  const visit = comment => {
    requireThat(!visiting.has(comment.id), 'activation ancestry is cyclic');
    if (visited.has(comment.id)) return;
    visiting.add(comment.id);
    const artifact = envelope(comment.body);
    if (artifact?.squad_artifact === 'activation-reconciled') {
      const metadata = jsonBlock(comment.body, 'Activation reconciliation');
      reference(metadata.supersedes_comment_id, metadata.supersedes_sha256);
    } else {
      const origin = records[0]?.artifact.origin_issue;
      const prior = comment.body.includes('squad-activation-pending/v1')
        ? parsePendingReservation(comment.body, repository, origin).prior
        : comment.body.includes('Activation evidence:') ? jsonBlock(comment.body, 'Activation evidence').prior : null;
      if (prior) {
        reference(prior.source_comment_id, prior.source_sha256);
        reference(prior.reconciliation_comment_id, prior.reconciliation_sha256);
      }
    }
    visiting.delete(comment.id);
    visited.add(comment.id);
  };
  for (const record of records) visit(record.comment);
  return records.filter(record => !superseded.has(record.comment.id));
}

/** Structural head check only; the caller must independently verify the returned record. */
export function activationHistoryHead(comments, origin, repository) {
  const records = comments.map(comment => ({ comment, artifact: envelope(comment.body) }))
    .filter(({ artifact }) => ACCEPTANCES.has(artifact?.squad_artifact) && artifact.origin_issue === origin);
  const heads = activationHeads(records, comments, repository);
  requireThat(heads.length === 1, 'activation history has competing, cyclic or missing heads');
  return heads[0].comment.id;
}

function coveredHistory(verified, selected) {
  const allowed = new Set([selected.id]);
  const pending = new Set();
  let source = verified.original;
  let sourceKind = verified.request.source_kind ?? 'activation';
  let phases = verified.request.phases ?? [];
  while (source) {
    requireThat(!allowed.has(source.id), 'cyclic phase continuation ancestry');
    allowed.add(source.id);
    if (sourceKind !== 'pending' && !source.body.includes('Activation evidence:')) break;
    const evidence = sourceKind === 'pending'
      ? { ...parsePendingReservation(source.body, verified.request.repository, verified.request.origin_issue), pending_comment_id: source.id }
      : jsonBlock(source.body, 'Activation evidence');
    requireThat(['squad-activation-finalization/v1', 'squad-activation-pending/v1'].includes(evidence.schema),
      'unknown phase finalization evidence');
    const reservation = verified.comments.find(comment => comment.id === evidence.pending_comment_id);
    if (reservation) {
      const blocks = [...reservation.body.matchAll(/```json\s*([\s\S]*?)```/g)];
      requireThat(blocks.length === 1, 'prior reservation is malformed');
      const value = JSON.parse(blocks[0][1]);
      requireThat(value.schema === 'squad-activation-pending/v1' &&
        value.repository === verified.request.repository && value.origin_issue === verified.request.origin_issue &&
        value.capture_sha256 === evidence.capture_sha256 &&
        value.run_id === evidence.run_id && value.run_attempt === evidence.run_attempt,
      'prior reservation does not match the explicitly covered source record');
      pending.add(reservation.id);
    }

    if (!evidence.prior) break;
    const link = evidence.prior;
    exactKeys(link, ['source_comment_id', 'source_sha256', 'reconciliation_comment_id', 'reconciliation_sha256'],
      'phase ancestry reference is malformed');
    const previous = verified.comments.find(comment => comment.id === link.source_comment_id);
    const supplement = verified.comments.find(comment => comment.id === link.reconciliation_comment_id);
    requireThat(previous && supplement && digest(previous.body) === link.source_sha256 &&
      digest(supplement.body) === link.reconciliation_sha256 && !allowed.has(supplement.id),
    'phase ancestry source/supplement is missing, changed or cyclic');
    const supplementEnvelope = envelope(supplement.body);
    const record = jsonBlock(supplement.body, 'Activation reconciliation');
    const previousEnvelope = record.supersedes_kind === 'pending'
      ? { squad_artifact: 'activation-pending', ...parsePendingReservation(previous.body,
        verified.request.repository, verified.request.origin_issue) } : envelope(previous.body);
    requireThat((ACCEPTANCES.has(previousEnvelope?.squad_artifact) || previousEnvelope?.squad_artifact === 'activation-pending') &&
      previousEnvelope.squad_artifact !== 'activation-reconciled' &&
      previousEnvelope.origin_issue === verified.request.origin_issue &&
      supplementEnvelope?.squad_artifact === 'activation-reconciled' &&
      supplementEnvelope.origin_issue === verified.request.origin_issue &&
      Array.isArray(supplementEnvelope.phases) && supplementEnvelope.phases.length < phases.length &&
      supplementEnvelope.phases.every(phase => phases.includes(phase)) &&
      record.supersedes_comment_id === previous.id && record.supersedes_sha256 === link.source_sha256 &&
      record.plan_sha256 === digest(verified.planComment.body) && record.registry_sha256 === digest(verified.registry),
    'phase ancestry is not an exact covered predecessor');
    allowed.add(supplement.id);
    phases = supplementEnvelope.phases;
    source = previous;
    sourceKind = record.supersedes_kind ?? 'activation';
  }
  return { allowed_comment_ids: [...allowed], ignored_pending_ids: [...pending] };
}

/** Capture from trusted API/base inputs, never from an agent-authored snapshot. */
export async function prepareActivation({ github, context, env, root, outputPath, capturePath }) {
  const command = classifySquadCommand(context.payload, env.GITHUB_EVENT_NAME);
  requireThat(isActivationCommand(command), 'command is not an activation mode');
  await authorizeSquadCommand({
    payload: context.payload, eventName: env.GITHUB_EVENT_NAME, actor: context.actor, result: command,
    resolvePermission: async username => (await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo, username,
    })).data.permission,
  });
  const origin = Number(context.payload.inputs?.issue_number ?? context.payload.issue?.number);
  requireThat(positive(origin) && !context.payload.issue?.pull_request, 'origin must be an issue');
  const originResponse = await github.rest.issues.get({ ...context.repo, issue_number: origin });
  requireThat(!originResponse.data.pull_request, 'activation cannot target a pull request');
  const planId = activationRequest(JSON.parse(readFileSync(outputPath, 'utf8')).items);
  const registry = await validateCastingPairFiles(`${root}/.squad/casting/registry.json`);
  const team = readFileSync(`${root}/.squad/team.md`, 'utf8');
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...context.repo, issue_number: origin, per_page: 100,
  });
  const accepted = comments.map(comment => ({ comment, artifact: envelope(comment.body) }))
    .filter(({ artifact }) => ACCEPTANCES.has(artifact?.squad_artifact) && artifact.origin_issue === origin);
  let prior;
  if (command.phase !== null && accepted.length &&
      !accepted.some(({ artifact }) => artifact.phases?.includes(command.phase))) {
    const bridges = [];
    for (const candidate of accepted.filter(({ artifact }) => artifact.squad_artifact === 'activation-reconciled')) {
      requireWorkflowRecord(candidate.comment, `${context.repo.owner}/${context.repo.repo}`, origin);
      const metadata = jsonBlock(candidate.comment.body, 'Activation reconciliation');
      const verified = await verifyReconciliationRequest({
        github, context, root, requestCommentId: metadata.request_comment_id, requestSha256: metadata.request_sha256,
      });
      const phases = verified.request.phases ?? [];
      if (!phases.length || phases.some(phase => phase >= command.phase)) continue;
      requireThat(verified.snapshots.every(snapshot => snapshot.body === snapshot.after), 'prior-phase dependencies are not reconciled');
      selectActivationRecord([verified.original, candidate.comment], registry, {
        repository: `${context.repo.owner}/${context.repo.repo}`, originIssue: origin,
        reconciliations: [selectionEvidence(verified)], epicAssignments: frozenAssignments(verified.fullPlan),
      });
      bridges.push({ verified, candidate, phases });
    }
    const complete = bridges.filter(bridge => {
      const previous = [...new Set(bridge.verified.fullPlan.tasks.filter(task => task.phase < command.phase).map(task => task.phase))];
      return isDeepStrictEqual([...bridge.phases].sort((a, b) => a - b), previous.sort((a, b) => a - b));
    });
    requireThat(complete.length === 1,
      'exactly one current-state authorized prior-phase mapping bridge is required; reconcile the complete prior-phase coverage');
    const { verified, candidate, phases } = complete[0];
    prior = {
      request_comment_id: verified.requestCommentId, request_sha256: verified.requestSha256,
      source_comment_id: verified.original.id, reconciliation_comment_id: candidate.comment.id,
      source_sha256: digest(verified.original.body), reconciliation_sha256: digest(candidate.comment.body),
      ...coveredHistory(verified, candidate.comment),
      phases, tasks: verified.plan.tasks, issues: verified.snapshots,
      plan_sha256: digest(verified.planComment.body), registry_sha256: digest(verified.registry),
    };
  }

  if (accepted.length && !prior) {
    const selected = activationHeads(accepted, comments, `${context.repo.owner}/${context.repo.repo}`).filter(({ artifact }) =>
      command.phase === null || artifact.phases?.includes(command.phase));
    requireThat(selected.length === 1,
      'existing phase/supersession authority is incomplete or ambiguous; later-phase creation is blocked');
    const { comment } = selected[0];
    requireWorkflowRecord(comment, `${context.repo.owner}/${context.repo.repo}`, origin);
    const artifact = parseStructuredData(comment.body);
    let assignments;
    let fullPlan;
    if (artifact.squad_artifact === 'activation-reconciled') {
      const metadata = jsonBlock(comment.body, 'Activation reconciliation');
      const verified = await verifyReconciliationRequest({
        github, context, root, requestCommentId: metadata.request_comment_id, requestSha256: metadata.request_sha256,
      });
      requireThat(verified.snapshots.every(snapshot => snapshot.body === snapshot.after), 'current dependency corrections are incomplete');
      selectActivationRecord([verified.original, comment], registry, {
        repository: `${context.repo.owner}/${context.repo.repo}`, originIssue: origin,
        reconciliations: [selectionEvidence(verified)], epicAssignments: frozenAssignments(verified.fullPlan),
      });
      assignments = frozenAssignments(verified.fullPlan);
      fullPlan = verified.fullPlan;
    } else if (comment.body.includes('Activation evidence:')) {
      const published = await verifyPublishedActivation({ github, context, root, comment });
      fullPlan = published.fullPlan;
      assignments = published.assignments;
    } else {
      fullPlan = await verifyLegacyActivation({
        github, context, comments, comment, planId, registry, team, origin,
      });
      assignments = frozenAssignments(fullPlan);
    }
    if (command.phase === null && artifact.phases?.length) {
      requireThat(assignments?.length === artifact.bindings?.length,
        'only prior phases are accepted; activate the explicitly selected next phase using its mapping bridge');
    }
    const labels = new Map();
    for (const issue of new Set((artifact.bindings ?? []).flatMap(binding =>
      [extractIssueNumber(binding.issue), extractIssueNumber(binding.epic_issue)]).filter(positive))) {
      const actual = (await github.rest.issues.get({ ...context.repo, issue_number: issue })).data;
      requireThat(!actual.pull_request, 'existing binding references a pull request');
      labels.set(issue, new Set(actual.labels.map(label => normalize(typeof label === 'string' ? label : label.name))));
    }
    validateActivation(artifact, parseRoster(team), labels, origin, {
      repository: `${context.repo.owner}/${context.repo.repo}`, registry: parseAgentRegistry(registry),
      epicAssignments: assignments,
    });
    await upsertActivationLifecycle({ github, context, origin, fullPlan, phases: artifact.phases,
      command: `/squad ${command.argumentText}` });
    return { existingAcceptanceId: comment.id };
  }
  for (const comment of comments) {
    // Even an untrusted reservation stops creation; it can deny service, never authorize a retry.
    const artifact = envelope(comment.body);
    requireThat(!ACCEPTANCES.has(artifact?.squad_artifact) || prior?.allowed_comment_ids.includes(comment.id),
      'an acceptance already exists; preserve it. Missing authenticated historical capture/operation receipts; no-create reconciliation is required');
    requireThat(!String(comment.body ?? '').includes('squad-activation-pending/v1') || prior?.ignored_pending_ids.includes(comment.id),
      'a pending activation exists; an API write may have occurred. No-create recovery requires an authorized current-state request with source_kind: pending, its exact comment ID/hash, and complete existing issue mappings');
  }
  const candidates = comments.filter(comment => {
    const artifact = envelope(comment.body);
    return ['plan', 'implementation'].includes(artifact?.squad_artifact) &&
      artifact.schema_version === '1' && artifact.origin_issue === origin;
  }).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.id - right.id);
  const planComment = candidates.at(-1);
  if (!planComment && comments.some(comment => envelope(comment.body)?.squad_artifact === 'program' &&
    envelope(comment.body)?.origin_issue === origin)) {
    throw new Error('Activation refused: only a program plan exists. Use /squad plan accept scope, /squad plan implementation, /squad plan validate and /squad plan accept implementation before /squad plan activate.');
  }
  requireThat(planComment?.id === planId, 'request does not identify the latest supported plan comment');
  requireThat(planComment.user?.id === BOT_ID && planComment.user?.login === 'github-actions[bot]' &&
    planComment.user?.type === 'Bot', 'plan comment must be produced by the repository workflow bot');
  const envelopes = [...planComment.body.matchAll(/Structured data:\s*```json\s*([\s\S]*?)```/gi)];
  requireThat(envelopes.length === 1, 'plan comment must contain exactly one structured envelope');
  const artifact = parseStructuredData(planComment.body);
  requireThat(Array.isArray(artifact.phases) && artifact.phases.length === 0, 'draft plan phases envelope is invalid');
  const plan = parseActivationPlan(planComment.body, artifact.squad_artifact, registry, team, []);
  const fullPlan = structuredClone(plan);
  if (prior) requireThat(prior.plan_sha256 === digest(planComment.body) && prior.registry_sha256 === digest(registry),
    'prior-phase bridge is stale for this exact plan/registry');
  if (command.phase !== null) {
    requireThat(plan.phased, 'phase activation requires explicit Phase headings');
    const previousPhases = [...new Set(fullPlan.tasks.filter(task => task.phase < command.phase).map(task => task.phase))]
      .sort((left, right) => left - right);
    requireThat(isDeepStrictEqual(prior?.phases ?? [], previousPhases),
      'complete prior-phase mapping bridge is required before a later phase, including independent tasks');
    const selected = plan.tasks.filter(task => task.phase === command.phase);
    requireThat(selected.length > 0, 'requested phase has no tasks');
    const selectedIds = new Set(selected.map(task => task.id));
    const previousIds = new Set(prior?.tasks.map(task => task.id) ?? []);
    requireThat(selected.every(task => task.dependencies.every(id => selectedIds.has(id) || previousIds.has(id))),
      'authenticated prior-phase issue mappings are unavailable; cross-phase activation requires no-create reconciliation');
    plan.tasks = selected;
    plan.epics = [...new Set(selected.map(task => task.epic))].filter(epic => epic !== 'origin');
  }
  let approvals;
  if (artifact.squad_artifact === 'implementation') {
    const acceptedComments = comments.filter(comment => comment.user?.id === BOT_ID &&
      envelope(comment.body)?.schema_version === '1' && envelope(comment.body)?.origin_issue === origin);
    const scope = acceptedComments.filter(comment => envelope(comment.body).squad_artifact === 'scope-accepted').at(-1);
    requireThat(scope, 'granular activation requires existing scope-accepted');
    if (command.mode === 'plan accept implementation') {
      const validation = acceptedComments.filter(comment => envelope(comment.body).squad_artifact === 'validation').at(-1);
      requireThat(validation, 'combined phase acceptance requires a current validation artifact');
      validateImplementationVerdict(validation.body, planComment, fullPlan);
      approvals = { scope, validation };
    } else {
      const implementation = acceptedComments.filter(comment => {
        const value = envelope(comment.body);
        return value.squad_artifact === 'impl-accepted' ||
          (command.phase !== null && value.squad_artifact === 'impl-phases-accepted' && value.phases?.includes(command.phase));
      }).at(-1);
      requireThat(implementation, 'granular activation requires existing impl-accepted or selected implementation-phase acceptance');
      validateImplementationAcceptance(implementation, planComment, `${context.repo.owner}/${context.repo.repo}`, origin);
      approvals = { scope, implementation };
    }
  }
  requireThat(command.mode !== 'plan accept implementation' || artifact.squad_artifact === 'implementation',
    'combined acceptance requires an implementation plan');
  const runId = Number(env.GITHUB_RUN_ID);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  requireThat(positive(runId) && positive(attempt) && SHA.test(env.SQUAD_WORKFLOW_SHA ?? ''),
    'trusted run/attempt/workflow identity is unavailable');
  const operations = [
    ...plan.epics.filter(epic => !prior?.issues.some(issue => issue.operation_id === `epic:${epic}`)).map(epic => ({
      id: `epic:${epic}`, epic, title: `[Epic] ${epic}`,
      labels: ['squad', ...new Set(fullPlan.tasks.filter(task => task.epic === epic).map(task => task.label))],
    })).map(operation => {
      const names = new Set(fullPlan.tasks.filter(task => task.epic === operation.epic).map(task => normalize(task.agent)));
      return { ...operation, labels: names.size === 1 ? operation.labels.filter(Boolean) : ['squad'] };
    }),
    ...plan.tasks.map(task => ({
      id: `task:${task.id}`, task: task.id, epic: task.epic, title: task.title,
      labels: ['squad', ...(task.label ? [task.label] : [])],
    })),
  ];
  let repositoryPolicy = '';
  try { repositoryPolicy = readFileSync(`${root}/.squad/planning-policy.md`, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const issueLimit = activationIssueLimit(originResponse.data.body ?? '', repositoryPolicy);
  requireThat(operations.length <= issueLimit && new Set(operations.map(operation => operation.id)).size === operations.length,
    'operation cap or unique stable operation identity violated');
  const capture = {
    schema: ACTIVATION_CAPTURE_SCHEMA, repository: `${context.repo.owner}/${context.repo.repo}`,
    origin_issue: origin, run_id: runId, run_attempt: attempt, workflow_sha: env.SQUAD_WORKFLOW_SHA,
    command: command.mode, phase: command.phase, actor: context.actor,
    plan_comment: { id: planComment.id, author_id: planComment.user.id, updated_at: planComment.updated_at,
      body: planComment.body, sha256: digest(planComment.body), url: planComment.html_url },
    registry, registry_sha256: digest(registry), team, plan, fullPlan, operations, issue_limit: issueLimit,
    ...(prior ? { prior } : {}),
    ...(approvals ? { approvals } : {}),
  };
  writeFileSync(capturePath, `${JSON.stringify(capture)}\n`);
  return capture;
}

async function revalidateCapture({ github, context, env, root, capture }) {
  const command = classifySquadCommand(context.payload, env.GITHUB_EVENT_NAME);
  requireThat(isActivationCommand(command) && command.mode === capture.command &&
    command.phase === capture.phase && context.actor === capture.actor &&
    capture.repository === `${context.repo.owner}/${context.repo.repo}` &&
    capture.origin_issue === Number(context.payload.inputs?.issue_number ?? context.payload.issue?.number) &&
    capture.run_id === Number(env.GITHUB_RUN_ID) && capture.run_attempt === Number(env.GITHUB_RUN_ATTEMPT) &&
    capture.workflow_sha === env.SQUAD_WORKFLOW_SHA, 'capture does not match the executing command/run/attempt');
  await authorizeSquadCommand({
    payload: context.payload, eventName: env.GITHUB_EVENT_NAME, actor: context.actor, result: command,
    resolvePermission: async username => (await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo, username,
    })).data.permission,
  });
  const registry = await validateCastingPairFiles(`${root}/.squad/casting/registry.json`);
  requireThat(digest(registry) === capture.registry_sha256 &&
    readFileSync(`${root}/.squad/team.md`, 'utf8') === capture.team, 'frozen registry/roster changed during execution');
  for (const approval of Object.values(capture.approvals ?? {})) {
    const current = (await github.rest.issues.getComment({ ...context.repo, comment_id: approval.id })).data;
    requireThat(current?.updated_at === approval.updated_at && current.body === approval.body,
      'scope acceptance, implementation acceptance or validation changed during execution');
  }
  if (capture.prior) {
    const verified = await verifyReconciliationRequest({ github, context, root,
      requestCommentId: capture.prior.request_comment_id, requestSha256: capture.prior.request_sha256 });
    const selected = verified.comments.find(comment => comment.id === capture.prior.reconciliation_comment_id);
    requireWorkflowRecord(selected, capture.repository, capture.origin_issue);
    requireThat(selected && digest(selected.body) === capture.prior.reconciliation_sha256 &&
      digest(verified.original.body) === capture.prior.source_sha256 &&
      verified.snapshots.every(snapshot => snapshot.body === snapshot.after) &&
      isDeepStrictEqual(verified.snapshots.map(snapshot => [snapshot.number, snapshot.after_sha256]),
        capture.prior.issues.map(snapshot => [snapshot.number, snapshot.after_sha256])),
    'prior-phase bridge changed during execution');
    selectActivationRecord([verified.original, selected], registry, {
      repository: capture.repository, originIssue: capture.origin_issue,
      reconciliations: [selectionEvidence(verified)], epicAssignments: frozenAssignments(verified.fullPlan),
    });
    requireThat(isDeepStrictEqual(coveredHistory(verified, selected), {
      allowed_comment_ids: capture.prior.allowed_comment_ids, ignored_pending_ids: capture.prior.ignored_pending_ids,
    }), 'prior-phase ancestry changed during execution');
  }
}

function pendingBody(capture, artifactId) {
  return [
    '## Activation pending - not accepted',
    'Issue creation may have started. Do not repeat creation or infer task identity from titles.',
    'This reservation is a no-create guard, not recovery authority or historical attestation.',
    '',
    '```json',
    JSON.stringify({ schema: 'squad-activation-pending/v1', repository: capture.repository,
      origin_issue: capture.origin_issue, run_id: capture.run_id, run_attempt: capture.run_attempt,
      capture_sha256: digest(capture), capture_artifact_id: artifactId,
      plan_comment_id: capture.plan_comment.id, plan_sha256: capture.plan_comment.sha256,
      registry_sha256: capture.registry_sha256,
      phases: capture.phase === null ? [] : [...(capture.prior?.phases ?? []), capture.phase],
      ...(capture.prior ? { prior: {
        source_comment_id: capture.prior.source_comment_id, source_sha256: capture.prior.source_sha256,
        reconciliation_comment_id: capture.prior.reconciliation_comment_id,
        reconciliation_sha256: capture.prior.reconciliation_sha256,
      } } : {}),
    }),
    '```',
  ].join('\n');
}

function validationTable(body, columns) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const headers = lines.map((line, index) => ({ line, index })).filter(({ line }) =>
    line.trim().startsWith('|') && isDeepStrictEqual(tableCells(line), columns));
  requireThat(headers.length === 1, `validation requires one ${columns.join(' | ')} table`);
  let index = headers[0].index;
  requireThat(/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[++index] ?? ''), 'validation table separator is missing');
  const rows = [];
  while (lines[index + 1]?.trim().startsWith('|')) {
    const cells = tableCells(lines[++index]);
    requireThat(cells.length === columns.length, 'validation table row is malformed');
    rows.push(Object.fromEntries(columns.map((column, offset) => [column, cells[offset]])));
  }
  return rows;
}

function extractImplementationPlanCommentIds(body, repository, origin) {
  const text = String(body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '');
  const escapedRepo = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ids = [];
  const collect = source => {
    for (const match of source.matchAll(
      new RegExp(`https://github\\.com/${escapedRepo}/issues/${origin}#issuecomment-([1-9]\\d*)\\b`, 'g'),
    )) {
      ids.push(Number(match[1]));
    }
    for (const match of source.matchAll(/(?:^|[^A-Za-z0-9_/])#issuecomment-([1-9]\d*)\b/g)) {
      ids.push(Number(match[1]));
    }
    for (const match of source.matchAll(/\bcomment(?:[-_\s]+id)?\s*[:=#]?\s*([1-9]\d*)\b/gi)) {
      ids.push(Number(match[1]));
    }
  };
  const labeledLines = text.split(/\r?\n/).filter(line =>
    /^(?:[-*]\s+)?(?:\*\*)?(?:implementation(?:\s+plan)?(?:\s+version)?|impl\s+plan(?:\s+version)?|plan\s+version)(?:\*\*)?\s*:/i
      .test(line.trim()),
  );
  if (labeledLines.length) {
    for (const line of labeledLines) collect(line);
  } else {
    collect(text);
  }
  return [...new Set(ids.filter(positive))];
}

function validateImplementationAcceptance(comment, planComment, repository, origin) {
  const body = String(comment.body ?? '');
  const ids = extractImplementationPlanCommentIds(body, repository, origin);
  requireThat(ids.length === 1 && ids[0] === planComment.id,
    'implementation acceptance must uniquely reference the selected implementation plan revision');
  const shas = [...body.matchAll(/^\*\*Implementation SHA-256:\*\*\s*(\S+)\s*$/gm)].map(match => match[1]);
  requireThat(shas.length <= 1 && (shas.length === 0 || shas[0] === digest(planComment.body)),
    'implementation acceptance SHA-256 does not match the selected implementation plan revision');
}

function validateImplementationVerdict(body, planComment, plan) {
  const verdicts = [...body.matchAll(/^RESULT:\s*(PASS|FAIL)\s*$/gm)];
  requireThat(verdicts.length === 1 && verdicts[0][1] === 'PASS' &&
    body.split(/\r?\n/).includes(`**Implementation plan:** ${planComment.html_url}`) &&
    body.split(/\r?\n/).includes(`**Implementation SHA-256:** ${digest(planComment.body)}`),
  'validation must PASS and bind this exact implementation comment/revision');
  const checks = validationTable(body, ['Check', 'Status', 'Details']);
  requireThat(checks.length === 16 && new Set(checks.map(row => row.Check)).size === 16 &&
    checks.every(row => /^(?:[1-9]|1[0-6])$/.test(row.Check) &&
      /^(?:PASS|✅(?:\s+(?:PASS|Done))?)$/i.test(row.Status) && row.Details),
  'all sixteen structural/adversarial validation checks must pass');
  const sizes = validationTable(body, ['Task', 'Size', 'Traces to']);
  requireThat(sizes.length === plan.tasks.length && new Set(sizes.map(row => row.Task)).size === sizes.length &&
    sizes.every(row => plan.tasks.some(task => task.id === row.Task) &&
      ['XS', 'S', 'M', 'L'].includes(row.Size) && row['Traces to'].trim() &&
      !['-', '\u2014', 'none'].includes(normalize(row['Traces to']))),
  'validation sizing/traceability must cover the exact plan, with task sizes no larger than L');
}

function bodyFor(operation, capture, journal) {
  const receipts = new Map([...(capture.prior?.issues ?? []), ...journal.receipts]
    .map(receipt => [receipt.operation_id, receipt]));
  const task = operation.task ? capture.plan.tasks.find(task => task.id === operation.task) : null;
  const parent = !task || task.epic === 'origin' ? capture.origin_issue : receipts.get(`epic:${task.epic}`)?.number;
  requireThat(positive(parent), `operation ${operation.id}: parent has no actual create receipt`);
  const deps = task ? task.dependencies.map(id => {
    const receipt = receipts.get(`task:${id}`);
    requireThat(receipt, `operation ${operation.id}: dependency ${id} has no actual create receipt`);
    return `#${receipt.number}`;
  }) : [];
  return {
    parent,
    body: [
      `## ${operation.title}`, '', `**Stable work ID:** ${operation.id}`,
      `**Parent:** #${parent}`, `**Depends On:** ${deps.length ? deps.join(', ') : 'None'}`,
      ...(task ? [`**Owner:** ${task.agent}`] : []), '',
      `Frozen plan: ${capture.plan_comment.url}`,
      `Plan SHA-256: ${capture.plan_comment.sha256}`, '',
      'The frozen plan below is reference context. This issue covers only the stable work ID above.',
      '', ...capture.plan_comment.body.split(/\r?\n/).map(line => `> ${line}`),
    ].join('\n'),
  };
}

function checkedIssueBody(body, operation, sanitizeContent, formatIssueBody, repo) {
  const sanitized = sanitizeContent(body);
  requireThat(typeof sanitized === 'string', `operation ${operation.id}: sanitizer returned a non-string issue body`);
  const attributed = formatIssueBody(sanitized, { repo });
  requireThat(typeof attributed === 'string' && attributed.length <= MAX_ISSUE_BODY_CHARACTERS,
    `operation ${operation.id}: rendered issue body exceeds the pinned runtime's ${MAX_ISSUE_BODY_CHARACTERS}-character limit including attribution`);
  return sanitized;
}

function identityLines(body) {
  return String(body ?? '').split(/\r?\n/).filter(line =>
    /^\*\*(?:Stable work ID|Parent|Depends On):\*\*/.test(line));
}

function omissionSummary(bindings) {
  const epics = new Map();
  for (const binding of bindings) {
    if (binding.epic_omission_reason) epics.set(binding.epic_issue,
      `- Epic ${binding.epic_issue}: ${binding.epic_omission_reason}; owners: ${binding.epic_agents.join(', ')}. No sole-owner label is asserted.`);
  }
  return epics.size ? ['', '### Non-roster agent values', ...epics.values()] : [];
}

async function verifyCurrentParent(github, context, issue, parent, operation, fallbacks) {
  let current;
  try {
    current = (await github.rest.issues.getParent({ ...context.repo, issue_number: issue })).data;
  } catch (error) {
    if ([404, 422].includes(error.status) && fallbacks.includes(operation)) return;
    throw error;
  }
  requireThat(current?.number === parent &&
    current.url === `https://api.github.com/repos/${context.repo.owner}/${context.repo.repo}/issues/${parent}`,
  `operation ${operation}: current API hierarchy differs from the frozen binding`);
}

/** Only this trusted caller receives the runtime's synchronous createIssue result. */
export async function createActivation({
  github, context, env, root, capture, captureArtifactId, journalPath, createIssue, sanitizeContent, formatIssueBody,
}) {
  requireThat(capture.schema === ACTIVATION_CAPTURE_SCHEMA &&
    capture.repository === `${context.repo.owner}/${context.repo.repo}` &&
    positive(captureArtifactId), 'trusted capture identity or durable capture artifact is missing');
  await revalidateCapture({ github, context, env, root, capture });
  requireThat(typeof formatIssueBody === 'function', 'pinned runtime issue-body formatter is required before reservation');
  const titles = new Map(capture.operations.map(operation => {
    const title = sanitizeContent(operation.title);
    requireThat(typeof title === 'string' && title.trim().length > 0 && title.length <= 256,
      `operation ${operation.id}: sanitized title is empty or exceeds GitHub's limit`);
    requireThat(operation.labels.every(name => name.length <= 50 &&
      (name === 'squad' || /^squad:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))),
    `operation ${operation.id}: unsupported activation label`);
    return [operation.id, title];
  }));
  // Reserve only after rendering every body with the longest accepted numeric
  // references and the pinned runtime's attribution and UTF-16 length bound.
  const preview = { receipts: capture.operations.map(operation => ({
    operation_id: operation.id, number: Number.MAX_SAFE_INTEGER,
  })) };
  for (const operation of capture.operations) {
    checkedIssueBody(bodyFor(operation, capture, preview).body, operation, sanitizeContent, formatIssueBody, context.repo);
  }
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...context.repo, issue_number: capture.origin_issue, per_page: 100,
  });
  requireThat(!comments.some(comment =>
    (String(comment.body ?? '').includes('squad-activation-pending/v1') && !capture.prior?.ignored_pending_ids.includes(comment.id)) ||
    (ACCEPTANCES.has(envelope(comment.body)?.squad_artifact) && !capture.prior?.allowed_comment_ids.includes(comment.id))),
  'activation was reserved or accepted after capture; no issue may be recreated');
  const currentPlan = (await github.rest.issues.getComment({
    ...context.repo, comment_id: capture.plan_comment.id,
  })).data;
  requireThat(currentPlan.updated_at === capture.plan_comment.updated_at &&
    digest(currentPlan.body) === capture.plan_comment.sha256, 'plan changed after capture');
  // Label provisioning and exact approval upserts are retry-safe prerequisites,
  // unlike createIssue, whose ambiguous outcomes must retain the reservation.
  const labels = [...new Set(capture.operations.flatMap(operation => operation.labels))];
  for (const name of labels) {
    requireThat(name === 'squad' || /^squad:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name), 'unsupported activation label');
    try {
      await github.rest.issues.getLabel({ ...context.repo, name });
    } catch (error) {
      if (error.status !== 404) throw error;
      await github.rest.issues.createLabel({ ...context.repo, name, color: '9B8FCC' });
    }
  }
  if (capture.approvals?.validation) {
    const body = [
      `## Implementation Phase ${capture.phase} Accepted`,
      `**Implementation plan:** ${capture.plan_comment.url}`,
      `**Implementation SHA-256:** ${capture.plan_comment.sha256}`,
      `Validation: ${capture.approvals.validation.html_url}`,
      `Accepted by: ${capture.actor}`,
      '', 'Structured data:', '```json',
      JSON.stringify({ squad_artifact: 'impl-phases-accepted', schema_version: '1',
        origin_issue: capture.origin_issue, phases: [...(capture.prior?.phases ?? []), capture.phase] }), '```',
    ].join('\n');
    if (!comments.some(comment => comment.body === body && comment.user?.id === BOT_ID &&
      comment.user?.login === 'github-actions[bot]' && comment.user?.type === 'Bot' &&
      comment.issue_url === `https://api.github.com/repos/${capture.repository}/issues/${capture.origin_issue}`)) {
      await github.rest.issues.createComment({ ...context.repo, issue_number: capture.origin_issue, body });
    }
  }
  const beforeReservation = await github.paginate(github.rest.issues.listComments, {
    ...context.repo, issue_number: capture.origin_issue, per_page: 100,
  });
  requireThat(!beforeReservation.some(comment =>
    (String(comment.body ?? '').includes('squad-activation-pending/v1') && !capture.prior?.ignored_pending_ids.includes(comment.id)) ||
    (ACCEPTANCES.has(envelope(comment.body)?.squad_artifact) && !capture.prior?.allowed_comment_ids.includes(comment.id))),
  'activation was reserved or accepted during preflight; no issue may be recreated');
  const pending = await github.rest.issues.createComment({
    ...context.repo, issue_number: capture.origin_issue, body: pendingBody(capture, captureArtifactId),
  });
  requireThat(positive(pending.data.id), 'durable no-create reservation identity is missing');
  const journal = {
    schema: ACTIVATION_RECEIPT_SCHEMA, repository: capture.repository,
    capture_sha256: digest(capture), run_id: capture.run_id, run_attempt: capture.run_attempt,
    pending_comment_id: pending.data.id, capture_artifact_id: captureArtifactId,
    started: [], receipts: [], parent_fallbacks: [],
  };
  const save = () => writeFileSync(journalPath, `${JSON.stringify(journal)}\n`);
  save();
  for (const operation of capture.operations) {
    const content = bodyFor(operation, capture, journal);
    const body = checkedIssueBody(content.body, operation, sanitizeContent, formatIssueBody, context.repo);
    journal.started.push(operation.id);
    save();
    // No retry on an ambiguous API failure: the durable reservation outlives this runner.
    const result = await createIssue({
      ...context.repo, title: titles.get(operation.id), body,
      labels: operation.labels,
    });
    const receipt = validateCreateReceipt(result, operation, capture, [...(capture.prior?.issues ?? []), ...journal.receipts]);
    journal.receipts.push(receipt);
    save();
    try {
      await github.rest.issues.addSubIssue({
        ...context.repo, issue_number: content.parent, sub_issue_id: receipt.id,
      });
    } catch (error) {
      if (![404, 422].includes(error.status)) throw error;
      journal.parent_fallbacks.push(operation.id);
      save();
    }
  }
  validateReceiptSet(capture, journal);
  return journal;
}

export async function finalizeActivation({ github, context, env, root, capture, journal, receiptArtifactId }) {
  requireThat(positive(receiptArtifactId), 'durable receipt artifact upload is missing; acceptance is withheld');
  await revalidateCapture({ github, context, env, root, capture });
  const receipts = validateReceiptSet(capture, journal);
  const bindings = buildActivationBindings(capture, journal);
  const labels = new Map();
  if (capture.prior) {
    for (const previous of capture.prior.issues) {
      const current = (await github.rest.issues.get({ ...context.repo, issue_number: previous.number })).data;
      requireThat(current.id === previous.id && current.node_id === previous.node_id &&
        digest(current.body) === previous.after_sha256, 'prior-phase issue changed during activation');
      labels.set(previous.number, new Set(current.labels.map(label => normalize(typeof label === 'string' ? label : label.name))));
    }
  }
  for (const operation of capture.operations) {
    const receipt = receipts.get(operation.id);
    const issue = (await github.rest.issues.get({
      ...context.repo, issue_number: receipt.number,
    })).data;
    requireThat(!issue.pull_request && issue.id === receipt.id && issue.node_id === receipt.node_id &&
      issue.number === receipt.number && issue.url === `https://api.github.com/repos/${capture.repository}/issues/${receipt.number}`,
      `operation ${operation.id}: current issue identity differs from the actual receipt`);
    const expected = identityLines(bodyFor(operation, capture, journal).body);
    requireThat(isDeepStrictEqual(identityLines(issue.body), expected),
      `operation ${operation.id}: current parent/dependency/stable ID references differ from the frozen binding`);
    await verifyCurrentParent(github, context, receipt.number, bodyFor(operation, capture, journal).parent,
      operation.id, journal.parent_fallbacks);
    labels.set(receipt.number, new Set(issue.labels.map(label => normalize(typeof label === 'string' ? label : label.name))));
  }
  const artifact = {
    squad_artifact: bindings[0].artifact, schema_version: '1', origin_issue: capture.origin_issue,
    phases: capture.phase === null ? [] : [...(capture.prior?.phases ?? []), capture.phase], bindings,
  };
  validateActivation(artifact, parseRoster(capture.team), labels, capture.origin_issue, {
    repository: capture.repository, registry: parseAgentRegistry(capture.registry),
    epicAssignments: frozenAssignments(capture.fullPlan ?? capture.plan),
  });
  const currentPlan = (await github.rest.issues.getComment({
    ...context.repo, comment_id: capture.plan_comment.id,
  })).data;
  requireThat(digest(currentPlan.body) === capture.plan_comment.sha256 &&
    currentPlan.updated_at === capture.plan_comment.updated_at, 'plan changed during activation; acceptance is withheld');
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...context.repo, issue_number: capture.origin_issue, per_page: 100,
  });
  const reservation = comments.find(comment => comment.id === journal.pending_comment_id);
  requireThat(reservation?.body === pendingBody(capture, journal.capture_artifact_id),
    'no-create reservation changed or disappeared; acceptance is withheld');
  requireThat(!comments.some(comment => ACCEPTANCES.has(envelope(comment.body)?.squad_artifact) &&
    !capture.prior?.allowed_comment_ids.includes(comment.id)),
    'acceptance already exists; never recreate or edit it');
  const evidence = {
    schema: 'squad-activation-finalization/v1', basis: 'current-trusted-execution',
    run_id: capture.run_id, run_attempt: capture.run_attempt, workflow_sha: capture.workflow_sha,
    capture_sha256: digest(capture), receipts_sha256: digest(journal),
    capture_artifact_id: journal.capture_artifact_id, receipts_artifact_id: receiptArtifactId,
    pending_comment_id: journal.pending_comment_id,
    parent_fallbacks: journal.parent_fallbacks,
    plan_comment_id: capture.plan_comment.id, plan_sha256: capture.plan_comment.sha256,
    registry_sha256: capture.registry_sha256,
    ...(capture.prior ? { prior: {
      source_comment_id: capture.prior.source_comment_id, source_sha256: capture.prior.source_sha256,
      reconciliation_comment_id: capture.prior.reconciliation_comment_id,
      reconciliation_sha256: capture.prior.reconciliation_sha256,
    } } : {}),
  };
  const { bindings: _bindings, ...recordEnvelope } = artifact;
  const body = [
    '## Plan activated', '',
    `${bindings.length} task issues have complete actual-ID bindings.`,
    'Dependencies are recorded in issue bodies; this record makes no native dependency-edge claim.',
    journal.parent_fallbacks.length
      ? 'Some native parent links were unavailable; the parent body references are the recorded fallback.'
      : 'Native parent links were requested successfully.',
    ...omissionSummary(bindings),
    '', 'Activation bindings:', '```json', JSON.stringify(bindings), '```',
    '', 'Activation evidence:', '```json', JSON.stringify(evidence), '```',
    '', 'Structured data:', '```json', JSON.stringify(recordEnvelope), '```',
  ].join('\n');
  await publishActivation({ github, context, env, root, body });
  await upsertActivationLifecycle({ github, context, origin: capture.origin_issue,
    fullPlan: capture.fullPlan, phases: artifact.phases,
    command: `/squad ${capture.command}${capture.phase === null ? '' : ` phase ${capture.phase}`}` });
  return evidence;
}

async function publishActivation({ github, context, env, root, body }) {
  requireThat(positive(Number(env.GITHUB_RUN_ID)) && positive(Number(env.GITHUB_RUN_ATTEMPT)) &&
    SHA.test(env.SQUAD_WORKFLOW_SHA ?? ''), 'trusted publication run/attempt/workflow identity is unavailable');
  // Keep the authenticated write response in this execution. Historical searches,
  // uploaded artifacts and self-asserted run fields never substitute for it.
  const receipt = (await github.rest.issues.createComment({
    ...context.repo,
    issue_number: Number(context.payload.inputs?.issue_number ?? context.payload.issue?.number),
    body,
  })).data;
  return checkActivationPublication({ github, context, root, receipt, expectedBody: body });
}

async function upsertActivationLifecycle({ github, context, origin, fullPlan, phases, command }) {
  const remaining = phases.length && fullPlan
    ? [...new Set(fullPlan.tasks.map(task => task.phase))].filter(phase => !phases.includes(phase)).sort((a, b) => a - b)
    : [];
  const next = remaining.length
    ? `\`/squad ${fullPlan.kind === 'implementation' ? 'plan activate' : 'activate'} phase ${remaining[0]}\``
    : 'Track progress on the created task issues; no further planning action is required.';
  const body = [
    '## Squad lifecycle', '',
    `**State:** ${remaining.length ? 'Partially activated' : 'Activated'}`,
    `**Activation:** ${remaining.length ? `Phases ${phases.join(', ')} activated; ${remaining.length} remaining` : '\u2705 Done'}`,
    `**Last command:** \`${command}\``, `**Next action:** ${next}`,
    '', 'Structured data:', '```json',
    JSON.stringify({ squad_artifact: 'lifecycle-state', schema_version: '1', origin_issue: origin, phases }), '```',
  ].join('\n');
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...context.repo, issue_number: origin, per_page: 100,
  });
  const current = comments.filter(comment => comment.user?.id === BOT_ID &&
    comment.user?.type === 'Bot' && envelope(comment.body)?.squad_artifact === 'lifecycle-state' &&
    envelope(comment.body)?.origin_issue === origin)
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.id - right.id).at(-1);
  if (current?.body === body) return;
  if (current) await github.rest.issues.updateComment({ ...context.repo, comment_id: current.id, body });
  else await github.rest.issues.createComment({ ...context.repo, issue_number: origin, body });
}

const RECONCILIATION_REQUEST_SCHEMA = 'squad-activation-reconciliation-request/v1';

export function selectionEvidence(verified) {
  return {
    requestCommentId: verified.requestCommentId, requestSha256: verified.requestSha256, actorId: verified.actorId,
    sourceCommentId: verified.original.id, sourceSha256: digest(verified.original.body),
    planSha256: digest(verified.planComment.body), registrySha256: digest(verified.registry),
    bindingsSha256: digest(verified.bindings), phases: verified.request.phases ?? [],
    sourceKind: verified.request.source_kind ?? 'activation',
  };
}

async function verifyLegacyActivation({ github, context, comments, comment, planId, registry, team, origin }) {
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const artifact = parseStructuredData(comment.body);
  const plans = comments.filter(item => {
    const value = envelope(item.body);
    return ['plan', 'implementation'].includes(value?.squad_artifact) &&
      value.schema_version === '1' && value.origin_issue === origin;
  }).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.id - right.id);
  const planComment = plans.at(-1);
  requireWorkflowRecord(planComment, repository, origin);
  requireThat(planComment.id === planId, 'legacy acceptance requires the current explicit plan; reconcile changed sources');
  const draft = jsonBlock(planComment.body, 'Structured data');
  requireThat(Array.isArray(draft.phases) && draft.phases.length === 0, 'legacy source draft has invalid phases');
  const fullPlan = parseActivationPlan(planComment.body, draft.squad_artifact, registry, team, []);
  validateActivation(artifact, parseRoster(team), new Map(), origin, {
    repository, registry: parseAgentRegistry(registry), structuralOnly: true, epicAssignments: frozenAssignments(fullPlan),
  });
  requireThat(artifact.phases.every(phase => fullPlan.tasks.some(task => task.phase === phase)),
    'legacy acceptance names an unknown plan phase; explicit reconciliation is required');
  const plan = { ...fullPlan, tasks: fullPlan.tasks.filter(task =>
    artifact.phases.length === 0 || artifact.phases.includes(task.phase)) };
  requireThat(plan.tasks.length === artifact.bindings.length &&
    plan.tasks.every(task => artifact.bindings.some(binding => binding.task === task.id)),
  'legacy acceptance must cover the exact plan task set; explicit reconciliation is required');
  const receipts = new Map();
  for (const binding of artifact.bindings) {
    receipts.set(`task:${binding.task}`, { number: extractIssueNumber(binding.issue) });
    if (binding.epic !== 'origin') receipts.set(`epic:${binding.epic}`, { number: extractIssueNumber(binding.epic_issue) });
  }
  requireThat(plan.tasks.every(task => task.dependencies.every(id => receipts.has(`task:${id}`))),
    'legacy phase coverage omits dependencies; explicit reconciliation is required');
  const expected = bindingsForIssueMap({
    repository, origin_issue: origin, plan, fullPlan, registry, phase: artifact.phases.length ? artifact.phases.at(-1) : null,
  }, receipts);
  requireThat(isDeepStrictEqual(expected, artifact.bindings),
    'legacy bindings differ from the exact plan; explicit reconciliation is required');
  // Old records remain readable, but promotion needs issue-side source identity,
  // not an unverified model mapping, a matching title, or ownership labels.
  for (const [operation, receipt] of receipts) {
    const issue = (await github.rest.issues.get({ ...context.repo, issue_number: receipt.number })).data;
    const binding = expected.find(binding => operation === `task:${binding.task}`);
    const parent = binding ? extractIssueNumber(binding.epic_issue) : origin;
    const fields = [
      `**Stable work ID:** ${operation}`, `**Parent:** #${parent}`,
      `**Depends On:** ${binding?.depends_on.length ? binding.depends_on.join(', ') : 'None'}`,
    ];
    const sourceLines = String(issue.body ?? '').split(/\r?\n/).filter(line =>
      /^(?:Frozen plan:|Plan SHA-256:|\*\*Owner:\*\*)/.test(line));
    requireThat(!issue.pull_request && issue.number === receipt.number &&
      issue.url === `https://api.github.com/repos/${repository}/issues/${receipt.number}` &&
      isDeepStrictEqual(identityLines(issue.body), fields) &&
      isDeepStrictEqual(sourceLines, [
        ...(binding ? [`**Owner:** ${binding.agent}`] : []),
        `Frozen plan: ${planComment.html_url}`, `Plan SHA-256: ${digest(planComment.body)}`,
      ]), 'legacy issue source/task/owner/parent/dependencies are unproved; explicit reconciliation is required');
    await verifyCurrentParent(github, context, receipt.number, parent, operation, []);
  }
  return fullPlan;
}

export async function verifyPublishedActivation({ github, context, root, comment }) {
  const artifact = parseStructuredData(comment.body);
  const evidence = jsonBlock(comment.body, 'Activation evidence');
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  requireThat(comment.user?.id === BOT_ID && comment.user?.login === 'github-actions[bot]' && comment.user?.type === 'Bot' &&
    comment.issue_url === `https://api.github.com/repos/${repository}/issues/${artifact.origin_issue}`,
  'published activation must be a workflow-bot record on this origin');
  requireThat(evidence.schema === 'squad-activation-finalization/v1' &&
    evidence.basis === 'current-trusted-execution' && positive(evidence.plan_comment_id),
  'published finalization evidence is unsupported');
  const planComment = (await github.rest.issues.getComment({
    ...context.repo, comment_id: evidence.plan_comment_id,
  })).data;
  requireThat(planComment.user?.id === BOT_ID &&
    planComment.issue_url === `https://api.github.com/repos/${repository}/issues/${artifact.origin_issue}` &&
    digest(planComment.body) === evidence.plan_sha256, 'published frozen plan reference changed');
  const registry = await validateCastingPairFiles(`${root}/.squad/casting/registry.json`);
  const team = readFileSync(`${root}/.squad/team.md`, 'utf8');
  requireThat(digest(registry) === evidence.registry_sha256, 'published registry snapshot changed');
  const fullPlan = parseActivationPlan(planComment.body, envelope(planComment.body)?.squad_artifact, registry, team, []);
  const plan = { ...fullPlan, tasks: fullPlan.tasks.filter(task =>
    artifact.phases.length === 0 || artifact.phases.includes(task.phase)) };
  const assignments = frozenAssignments(fullPlan);
  validateActivation(artifact, parseRoster(team), new Map(), artifact.origin_issue, {
    repository, registry: parseAgentRegistry(registry), structuralOnly: true, epicAssignments: assignments,
  });
  requireThat(plan.tasks.length === artifact.bindings.length &&
    plan.tasks.every(task => artifact.bindings.some(binding => binding.task === task.id)),
  'published bindings do not cover the exact frozen phase task set');
  const receipts = new Map();
  for (const binding of artifact.bindings) {
    receipts.set(`task:${binding.task}`, { number: extractIssueNumber(binding.issue) });
    if (binding.epic !== 'origin') receipts.set(`epic:${binding.epic}`, { number: extractIssueNumber(binding.epic_issue) });
  }
  requireThat(plan.tasks.every(task => task.dependencies.every(id => receipts.has(`task:${id}`))),
    'published phase coverage omits a dependency');
  const expected = bindingsForIssueMap({
    repository, origin_issue: artifact.origin_issue, plan, fullPlan, registry,
    phase: artifact.phases.length ? artifact.phases.at(-1) : null,
  }, receipts);
  requireThat(digest(expected) === digest(artifact.bindings), 'published bindings conflict with the frozen plan');
  const priorTasks = new Set();
  const priorEpics = new Set();
  if (evidence.prior) {
    const link = evidence.prior;
    exactKeys(link, ['source_comment_id', 'source_sha256', 'reconciliation_comment_id', 'reconciliation_sha256'],
      'published prior-phase reference is malformed');
    const supplement = (await github.rest.issues.getComment({
      ...context.repo, comment_id: link.reconciliation_comment_id,
    })).data;
    requireWorkflowRecord(supplement, repository, artifact.origin_issue);
    requireThat(supplement && digest(supplement.body) === link.reconciliation_sha256,
      'published prior-phase supplement changed');
    const metadata = jsonBlock(supplement.body, 'Activation reconciliation');
    const verified = await verifyReconciliationRequest({ github, context, root,
      requestCommentId: metadata.request_comment_id, requestSha256: metadata.request_sha256 });
    requireThat(verified.original.id === link.source_comment_id &&
      digest(verified.original.body) === link.source_sha256 &&
      digest(verified.planComment.body) === evidence.plan_sha256 &&
      digest(verified.registry) === evidence.registry_sha256 &&
      isDeepStrictEqual(verified.request.phases, artifact.phases.slice(0, -1)) &&
      verified.snapshots.every(snapshot => snapshot.body === snapshot.after),
    'published prior-phase authority or current dependencies changed');
    selectActivationRecord([verified.original, supplement], registry, {
      repository, originIssue: artifact.origin_issue,
      reconciliations: [selectionEvidence(verified)], epicAssignments: assignments,
    });
    coveredHistory(verified, supplement);
    for (const binding of verified.bindings) {
      const current = expected.find(candidate => candidate.task === binding.task);
      requireThat(current?.issue === binding.issue && current.epic_issue === binding.epic_issue,
        'published prior-phase issue map differs from its authorized bridge');
      priorTasks.add(binding.task);
      if (binding.epic !== 'origin') priorEpics.add(binding.epic);
    }
  }
  const fallbacks = Object.hasOwn(evidence, 'parent_fallbacks') ? evidence.parent_fallbacks : [];
  const newOperations = new Set(expected.flatMap(binding => [
    ...(!priorTasks.has(binding.task) ? [`task:${binding.task}`] : []),
    ...(binding.epic !== 'origin' && !priorEpics.has(binding.epic) ? [`epic:${binding.epic}`] : []),
  ]));
  requireThat(Array.isArray(fallbacks) && new Set(fallbacks).size === fallbacks.length &&
    fallbacks.every(operation => newOperations.has(operation)), 'published parent fallback metadata is invalid');
  const epics = new Set();
  for (const binding of expected) {
    if (priorTasks.has(binding.task)) continue;
    const issue = (await github.rest.issues.get({
      ...context.repo, issue_number: extractIssueNumber(binding.issue),
    })).data;
    requireThat(!issue.pull_request && issue.number === extractIssueNumber(binding.issue) &&
      issue.url === `https://api.github.com/repos/${repository}/issues/${issue.number}` &&
      isDeepStrictEqual(identityLines(issue.body),
      [`**Stable work ID:** task:${binding.task}`, `**Parent:** ${binding.epic_issue}`,
        `**Depends On:** ${binding.depends_on.length ? binding.depends_on.join(', ') : 'None'}`]
      ),
    'published task identity/parent/dependencies differ from current issue content');
    await verifyCurrentParent(github, context, issue.number, extractIssueNumber(binding.epic_issue),
      `task:${binding.task}`, fallbacks);
    if (binding.epic !== 'origin' && !priorEpics.has(binding.epic) && !epics.has(binding.epic)) {
      epics.add(binding.epic);
      await verifyCurrentParent(github, context, extractIssueNumber(binding.epic_issue), artifact.origin_issue,
        `epic:${binding.epic}`, fallbacks);
    }
  }
  return { fullPlan, registry, assignments };
}

function exactKeys(value, keys, reason) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'), reason);
}

function jsonBlock(body, heading) {
  const matches = [...String(body).matchAll(new RegExp(`${heading}:\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``, 'g'))];
  requireThat(matches.length === 1, `exactly one ${heading} JSON block is required`);
  return JSON.parse(matches[0][1]);
}

/** Explicitly approved token mappings are the only identities a reference repair may use. */
export function correctDependencyReferences(body, expectedDependencies, tokenMappings) {
  requireThat(typeof body === 'string', 'existing issue body is missing');
  const matches = [...body.matchAll(/^\*\*Depends On:\*\*[^\r\n]*$/gm)];
  requireThat(matches.length === 1, 'exactly one standalone **Depends On:** field is required');
  const match = matches[0];
  const corrected = match[0].replace(/`(aw_[A-Za-z0-9_]{3,12})`/g, (_whole, token) => {
    requireThat(positive(tokenMappings[token]), `dependency token ${token} has no explicitly approved issue mapping`);
    return `\`#${tokenMappings[token]}\``;
  });
  requireThat(!/aw_/.test(corrected), 'dependency field contains an unsupported unresolved reference');
  const actual = [...corrected.matchAll(/#([1-9]\d*)/g)].map(item => Number(item[1]));
  requireThat(actual.every(positive) && new Set(actual).size === actual.length &&
    isDeepStrictEqual([...actual].sort((a, b) => a - b), [...expectedDependencies].sort((a, b) => a - b)),
  'dependency references do not match the freshly frozen plan and explicit issue mapping');
  if (expectedDependencies.length === 0) {
    requireThat(/^\*\*Depends On:\*\*\s*(?:None|[-\u2014](?:\s*\(none\))?)\s*$/i.test(corrected),
      'empty dependency field has unsupported content');
  }
  return body.slice(0, match.index) + corrected + body.slice(match.index + match[0].length);
}

export async function verifyReconciliationRequest({
  github, context, root, requestCommentId, requestSha256, ancestors = [],
}) {
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  requireThat(positive(requestCommentId) && /^[a-f0-9]{64}$/.test(requestSha256), 'invalid reconciliation request identity');
  requireThat(!ancestors.includes(requestCommentId), 'reconciliation request ancestry is cyclic');
  const comment = (await github.rest.issues.getComment({ ...context.repo, comment_id: requestCommentId })).data;
  requireThat(digest(comment.body) === requestSha256, 'authorized request content digest changed');
  requireThat(comment.user?.type === 'User' && positive(comment.user.id), 'request must identify an eligible operator account');
  const permission = (await github.rest.repos.getCollaboratorPermissionLevel({
    ...context.repo, username: comment.user.login,
  })).data.permission;
  requireThat(['write', 'maintain', 'admin'].includes(permission), 'request author is not authorized for reconciliation');
  const request = jsonBlock(comment.body, 'Activation reconciliation request');
  exactKeys(request, ['schema', 'repository', 'origin_issue', 'original', 'plan', 'registry', 'tasks', 'epics',
    ...(Object.hasOwn(request, 'phases') ? ['phases'] : []),
    ...(Object.hasOwn(request, 'source_kind') ? ['source_kind'] : [])],
    'reconciliation request fields are unsupported');
  requireThat(request.source_kind === undefined || request.source_kind === 'pending', 'unknown reconciliation source kind');
  requireThat(request.schema === RECONCILIATION_REQUEST_SCHEMA && request.repository === repository &&
    positive(request.origin_issue) && comment.issue_url === `https://api.github.com/repos/${repository}/issues/${request.origin_issue}`,
  'request repository/origin identity mismatch');
  const commandOrigin = Number(context.payload.inputs?.issue_number ?? context.payload.issue?.number);
  requireThat(request.origin_issue === commandOrigin, 'request does not belong to the invoking origin issue');
  for (const reference of [request.original, request.plan]) {
    exactKeys(reference, ['comment_id', 'sha256'], 'comment reference fields are unsupported');
    requireThat(positive(reference.comment_id) && /^[a-f0-9]{64}$/.test(reference.sha256),
      'comment reference ID/hash is malformed');
  }
  exactKeys(request.registry, ['revision', 'sha256'], 'registry reference fields are unsupported');
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...context.repo, issue_number: request.origin_issue, per_page: 100,
  });
  const original = comments.find(item => item.id === request.original.comment_id);
  const planComment = comments.find(item => item.id === request.plan.comment_id);
  requireThat(original && digest(original.body) === request.original.sha256 &&
    planComment && digest(planComment.body) === request.plan.sha256, 'original acceptance or current plan content changed');
  const pending = request.source_kind === 'pending'
    ? parsePendingReservation(original.body, repository, request.origin_issue) : null;
  if (pending) requireThat(original.user?.id === BOT_ID && original.user?.login === 'github-actions[bot]' &&
    original.user?.type === 'Bot' && pending.plan_comment_id === request.plan.comment_id &&
    pending.plan_sha256 === request.plan.sha256 && pending.registry_sha256 === request.registry.sha256 &&
    isDeepStrictEqual(pending.phases, request.phases ?? []),
  'pending source is forged, stale or does not cover the approved frozen plan/phases');
  const oldEnvelope = pending
    ? { squad_artifact: 'activation-pending', schema_version: '1', origin_issue: pending.origin_issue, phases: pending.phases }
    : jsonBlock(original.body, 'Structured data');
  requireThat((ACCEPTANCES.has(oldEnvelope.squad_artifact) || pending) && oldEnvelope.squad_artifact !== 'activation-reconciled' &&
    oldEnvelope.origin_issue === request.origin_issue && oldEnvelope.schema_version === '1',
  'superseded record must be an original activation for this origin, not another reconciliation');
  const planEnvelope = jsonBlock(planComment.body, 'Structured data');
  requireThat(['plan', 'implementation'].includes(planEnvelope.squad_artifact) &&
    planEnvelope.origin_issue === request.origin_issue && planEnvelope.schema_version === '1',
  'current plan envelope is invalid');
  const latestPlan = comments.filter(item => {
    const value = envelope(item.body);
    return value?.squad_artifact === planEnvelope.squad_artifact && value.origin_issue === request.origin_issue;
  }).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.id - right.id).at(-1);
  requireThat(latestPlan?.id === planComment.id, 'approved plan is no longer the current plan');
  const registry = await validateCastingPairFiles(`${root}/.squad/casting/registry.json`);
  requireThat(request.registry.revision === registry.revision && request.registry.sha256 === digest(registry),
    'current registry differs from the approved request');
  const team = readFileSync(`${root}/.squad/team.md`, 'utf8');
  const phases = request.phases === undefined ? [] : request.phases;
  requireThat(Array.isArray(phases) &&
    phases.every((phase, index) => positive(phase) && (index === 0 || phases[index - 1] < phase)),
  'selected prior-phase coverage must be ascending unique phase IDs');
  requireThat(isDeepStrictEqual(phases, oldEnvelope.phases),
    'selected prior-phase coverage must exactly match the original phase artifact');
  const fullPlan = parseActivationPlan(planComment.body, planEnvelope.squad_artifact, registry, team, []);
  const plan = structuredClone(fullPlan);
  if (phases.length > 0) {
    requireThat(phases.every(phase => fullPlan.tasks.some(task => task.phase === phase)),
      'selected prior phase does not exist in the frozen plan');
    plan.tasks = plan.tasks.filter(task => phases.includes(task.phase));
    plan.epics = [...new Set(plan.tasks.map(task => task.epic))].filter(epic => epic !== 'origin');
    requireThat(plan.tasks.length > 0, 'selected prior phases contain no tasks');
    requireThat(plan.tasks.every(task => task.dependencies.every(id => plan.tasks.some(candidate => candidate.id === id))),
      'prior-phase request omits a dependency phase');
  }
  requireThat(Array.isArray(request.tasks) && Array.isArray(request.epics), 'explicit task/epic mappings are required');
  const issueIds = new Set([request.origin_issue]);
  const taskIds = new Set();
  const epicIds = new Set();
  const tokens = new Set();
  for (const mapping of request.tasks) {
    exactKeys(mapping, ['task', 'issue', 'temporary_id'], 'task mappings require task, issue and explicit temporary_id');
    requireThat(plan.tasks.some(task => task.id === mapping.task) && !taskIds.has(mapping.task) &&
      positive(mapping.issue) && !issueIds.has(mapping.issue),
    'task mapping is unknown, duplicated, incomplete or colliding');
    requireThat(mapping.temporary_id === null || (typeof mapping.temporary_id === 'string' &&
      /^aw_[A-Za-z0-9_]{3,12}$/.test(mapping.temporary_id) && !tokens.has(mapping.temporary_id)),
    'explicit temporary token mapping is malformed or duplicated');
    taskIds.add(mapping.task); issueIds.add(mapping.issue);
    if (mapping.temporary_id) tokens.add(mapping.temporary_id);
  }
  for (const mapping of request.epics) {
    exactKeys(mapping, ['epic', 'issue'], 'epic mappings require epic and issue');
    requireThat(plan.epics.includes(mapping.epic) && !epicIds.has(mapping.epic) &&
      positive(mapping.issue) && !issueIds.has(mapping.issue), 'epic mapping is unknown, duplicated or colliding');
    epicIds.add(mapping.epic); issueIds.add(mapping.issue);
  }
  requireThat(taskIds.size === plan.tasks.length && epicIds.size === plan.epics.length,
    'explicit mappings do not cover the complete frozen plan');
  const taskMap = new Map(request.tasks.map(mapping => [mapping.task, mapping.issue]));
  const epicMap = new Map(request.epics.map(mapping => [mapping.epic, mapping.issue]));
  const tokenMap = Object.fromEntries(request.tasks.filter(mapping => mapping.temporary_id)
    .map(mapping => [mapping.temporary_id, mapping.issue]));
  const snapshots = [];
  const nodeIds = new Set();
  const databaseIds = new Set();
  for (const mapping of [...request.epics.map(item => ({ key: `epic:${item.epic}`, ...item })),
    ...request.tasks.map(item => ({ key: `task:${item.task}`, ...item }))]) {
    const issue = (await github.rest.issues.get({ ...context.repo, issue_number: mapping.issue })).data;
    requireThat(!issue.pull_request && issue.number === mapping.issue && positive(issue.id) &&
      typeof issue.node_id === 'string' && issue.node_id.length > 0 &&
      !nodeIds.has(issue.node_id) && !databaseIds.has(issue.id) &&
      issue.html_url === `https://github.com/${repository}/issues/${mapping.issue}` &&
      issue.url === `https://api.github.com/repos/${repository}/issues/${mapping.issue}`,
    'current mapped issue identity is malformed, duplicated or belongs to another repository');
    nodeIds.add(issue.node_id); databaseIds.add(issue.id);
    const task = mapping.task ? plan.tasks.find(task => task.id === mapping.task) : null;
    const parent = !task || task.epic === 'origin' ? request.origin_issue : epicMap.get(task.epic);
    const currentParent = (await github.rest.issues.getParent({
      ...context.repo, issue_number: mapping.issue,
    })).data;
    requireThat(currentParent.number === parent &&
      currentParent.url === `https://api.github.com/repos/${repository}/issues/${parent}`,
    'current hierarchy does not match the explicit approved mapping; hierarchy changes are forbidden');
    const after = task ? correctDependencyReferences(issue.body,
      task.dependencies.map(id => taskMap.get(id)), tokenMap) : issue.body;
    snapshots.push({ operation_id: mapping.key, number: mapping.issue, id: issue.id, node_id: issue.node_id,
      url: issue.html_url, repository, body: issue.body, after, updated_at: issue.updated_at,
      labels: issue.labels.map(label => typeof label === 'string' ? label : label.name),
      title: issue.title, assignees: (issue.assignees ?? []).map(assignee => assignee.id),
      before_sha256: digest(issue.body), after_sha256: digest(after) });
  }
  const bindings = bindingsForIssueMap({
    repository, origin_issue: request.origin_issue, plan, fullPlan, registry, phase: null,
  }, new Map(snapshots.map(snapshot => [snapshot.operation_id, snapshot])))
    .map(binding => ({ ...binding, artifact: 'activation-reconciled' }));
  validateActivation({ squad_artifact: 'activation-reconciled', schema_version: '1',
    origin_issue: request.origin_issue, phases: [], bindings }, parseRoster(team),
  new Map(snapshots.map(item => [item.number, new Set(item.labels.map(normalize))])),
  request.origin_issue, { repository, registry: parseAgentRegistry(registry), epicAssignments: frozenAssignments(fullPlan) });
  const predecessor = pending?.prior ?? (original.body.includes('Activation evidence:')
    ? jsonBlock(original.body, 'Activation evidence').prior : null);
  if (predecessor) {
    exactKeys(predecessor, ['source_comment_id', 'source_sha256', 'reconciliation_comment_id', 'reconciliation_sha256'],
      'reconciliation predecessor is malformed');
    const supplement = comments.find(item => item.id === predecessor.reconciliation_comment_id);
    requireWorkflowRecord(supplement, repository, request.origin_issue);
    requireThat(supplement && digest(supplement.body) === predecessor.reconciliation_sha256,
      'reconciliation predecessor supplement is missing or changed');
    const metadata = jsonBlock(supplement.body, 'Activation reconciliation');
    const previous = await verifyReconciliationRequest({ github, context, root,
      requestCommentId: metadata.request_comment_id, requestSha256: metadata.request_sha256,
      ancestors: [...ancestors, requestCommentId] });
    requireThat(previous.original.id === predecessor.source_comment_id &&
      digest(previous.original.body) === predecessor.source_sha256 &&
      digest(previous.planComment.body) === digest(planComment.body) && digest(previous.registry) === digest(registry) &&
      Array.isArray(request.phases) && Array.isArray(previous.request.phases) &&
      previous.request.phases.length > 0 &&
      previous.request.phases.length < request.phases.length &&
      previous.request.phases.every((phase, index) => request.phases[index] === phase) &&
      previous.snapshots.every(snapshot => snapshot.body === snapshot.after) &&
      previous.bindings.every(binding => bindings.some(current => current.task === binding.task &&
        current.issue === binding.issue && current.epic_issue === binding.epic_issue)),
    'reconciliation predecessor coverage, frozen inputs or prior issue maps changed');
    selectActivationRecord([previous.original, supplement], registry, {
      repository, originIssue: request.origin_issue, reconciliations: [selectionEvidence(previous)],
      epicAssignments: frozenAssignments(fullPlan),
    });
  }
  return { request, requestCommentId, requestSha256, actorId: comment.user.id, comments,
    original, planComment, registry, team, plan, fullPlan, snapshots, bindings, predecessor };
}

/** Current-state repair is authorized separately; it never asserts historical creation provenance. */
export async function reconcileActivation({ github, context, env, root }) {
  const command = classifySquadCommand(context.payload, env.GITHUB_EVENT_NAME);
  requireThat(command.mode === 'reconcile activation', 'reconciliation command is required');
  await authorizeSquadCommand({
    payload: context.payload, eventName: env.GITHUB_EVENT_NAME, actor: context.actor, result: command,
    resolvePermission: async username => (await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo, username,
    })).data.permission,
  });
  const [, , id, sha256] = command.argumentText.split(' ');
  let verified = await verifyReconciliationRequest({
    github, context, root, requestCommentId: Number(id), requestSha256: sha256,
  });
  const existing = verified.comments.filter(comment =>
    envelope(comment.body)?.squad_artifact === 'activation-reconciled' &&
      jsonBlock(comment.body, 'Activation reconciliation').supersedes_comment_id === verified.original.id);
  requireThat(existing.length <= 1, 'competing reconciliation records require resolution');
  if (existing.length) {
    requireWorkflowRecord(existing[0], verified.request.repository, verified.request.origin_issue);
    selectActivationRecord([verified.original, existing[0]], verified.registry, {
      repository: verified.request.repository, originIssue: verified.request.origin_issue,
      reconciliations: [selectionEvidence(verified)], epicAssignments: frozenAssignments(verified.fullPlan),
    });
    requireThat(verified.snapshots.every(snapshot => snapshot.body === snapshot.after),
      'existing reconciliation conflicts with current authorized inputs; no fallback is allowed');
    const heads = activationHeads(verified.comments.map(comment => ({ comment, artifact: envelope(comment.body) }))
      .filter(({ artifact }) => ACCEPTANCES.has(artifact?.squad_artifact) &&
        artifact.origin_issue === verified.request.origin_issue), verified.comments, verified.request.repository);
    requireThat(heads.length === 1, 'competing activation heads prevent lifecycle recovery');
    if (heads[0].comment.id !== existing[0].id) {
      const head = heads[0].comment;
      if (heads[0].artifact.squad_artifact === 'activation-reconciled') {
        const metadata = jsonBlock(head.body, 'Activation reconciliation');
        const current = await verifyReconciliationRequest({ github, context, root,
          requestCommentId: metadata.request_comment_id, requestSha256: metadata.request_sha256 });
        selectActivationRecord([current.original, head], current.registry, {
          repository: current.request.repository, originIssue: current.request.origin_issue,
          reconciliations: [selectionEvidence(current)], epicAssignments: frozenAssignments(current.fullPlan),
        });
        requireThat(current.snapshots.every(snapshot => snapshot.body === snapshot.after),
          'current descendant dependencies changed');
      } else {
        await verifyPublishedActivation({ github, context, root, comment: head });
      }
      // An older retry must never replace a validated descendant's cumulative lifecycle.
      return { id: existing[0].id, unchanged: true };
    }
    await upsertActivationLifecycle({ github, context, origin: verified.request.origin_issue,
      fullPlan: verified.fullPlan, phases: verified.request.phases ?? [], command: `/squad ${command.argumentText}` });
    return { id: existing[0].id, unchanged: true };
  }
  const heads = activationHeads(verified.comments.map(comment => ({ comment, artifact: envelope(comment.body) }))
    .filter(({ artifact }) => ACCEPTANCES.has(artifact?.squad_artifact) &&
      artifact.origin_issue === verified.request.origin_issue), verified.comments, verified.request.repository);
  requireThat(heads.every(head => head.comment.id === verified.original.id ||
    (verified.request.source_kind === 'pending' && head.comment.id === verified.predecessor?.reconciliation_comment_id)),
    'the requested source is not the sole current activation head; no competing supplement may be published');
  const repairs = [];
  for (const snapshot of verified.snapshots) {
    if (snapshot.body === snapshot.after) continue;
    const current = (await github.rest.issues.get({ ...context.repo, issue_number: snapshot.number })).data;
    requireThat(current.id === snapshot.id && current.node_id === snapshot.node_id &&
      current.updated_at === snapshot.updated_at && digest(current.body) === snapshot.before_sha256 &&
      current.title === snapshot.title &&
      isDeepStrictEqual(current.labels.map(label => typeof label === 'string' ? label : label.name), snapshot.labels) &&
      isDeepStrictEqual((current.assignees ?? []).map(assignee => assignee.id), snapshot.assignees),
    `issue #${snapshot.number} changed before correction; no overwrite is allowed`);
    await github.rest.issues.createComment({
      ...context.repo, issue_number: verified.request.origin_issue,
      body: [
        'Dependency correction attempt (not acceptance or historical attestation):', '```json',
        JSON.stringify({ schema: 'squad-dependency-correction/v1', request_comment_id: Number(id),
          request_sha256: sha256, issue: snapshot.number, before_sha256: snapshot.before_sha256,
          after_sha256: snapshot.after_sha256 }), '```',
      ].join('\n'),
    });
    const request = (await github.rest.issues.getComment({ ...context.repo, comment_id: Number(id) })).data;
    requireThat(digest(request.body) === sha256 && request.user?.id === verified.actorId,
      'authorized request changed before dependency correction');
    const permission = (await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo, username: request.user.login,
    })).data.permission;
    requireThat(['write', 'maintain', 'admin'].includes(permission), 'request author lost correction permission');
    for (const reference of [verified.original, verified.planComment]) {
      const current = (await github.rest.issues.getComment({ ...context.repo, comment_id: reference.id })).data;
      requireThat(digest(current.body) === digest(reference.body), 'frozen source or plan changed before correction');
    }
    const beforeWrite = (await github.rest.issues.get({ ...context.repo, issue_number: snapshot.number })).data;
    requireThat(beforeWrite.updated_at === snapshot.updated_at && digest(beforeWrite.body) === snapshot.before_sha256,
      `issue #${snapshot.number} changed while recording the correction; no overwrite is allowed`);
    // GitHub provides no atomic body compare-and-swap. A fresh read narrows, but cannot eliminate, the race.
    await github.rest.issues.update({ ...context.repo, issue_number: snapshot.number, body: snapshot.after });
    const after = (await github.rest.issues.get({ ...context.repo, issue_number: snapshot.number })).data;
    requireThat(digest(after.body) === snapshot.after_sha256 && after.title === snapshot.title &&
      isDeepStrictEqual(after.labels.map(label => typeof label === 'string' ? label : label.name), snapshot.labels),
    `issue #${snapshot.number} changed during correction; reconciliation is withheld`);
    repairs.push({ issue: snapshot.number, before_sha256: snapshot.before_sha256, after_sha256: snapshot.after_sha256 });
  }
  verified = await verifyReconciliationRequest({
    github, context, root, requestCommentId: Number(id), requestSha256: sha256,
  });
  requireThat(verified.snapshots.every(snapshot => snapshot.body === snapshot.after), 'dependency corrections are incomplete');
  const record = {
    schema: 'squad-activation-reconciliation/v1', basis: 'current-state-authorized',
    request_comment_id: Number(id), request_sha256: sha256, actor_id: verified.actorId,
    supersedes_comment_id: verified.original.id, supersedes_sha256: digest(verified.original.body),
    plan_sha256: digest(verified.planComment.body), registry_sha256: digest(verified.registry),
    bindings_sha256: digest(verified.bindings),
    ...(verified.request.source_kind === 'pending' ? { supersedes_kind: 'pending' } : {}),
  };
  const body = [
    '## Activation reconciled against current state', '',
    `This explicitly supersedes the referenced ${verified.request.source_kind === 'pending' ? 'pending reservation' : 'invalid acceptance'} for validated readers only.`,
    'It preserves the original record and makes no historical creation-attestation claim. No issues were created.',
    'Dependency corrections use fresh conflict checks, not atomic compare-and-swap.',
    ...omissionSummary(verified.bindings),
    '', 'Activation bindings:', '```json', JSON.stringify(verified.bindings), '```',
    '', 'Activation reconciliation:', '```json', JSON.stringify(record), '```',
    '', 'Dependency corrections:', '```json', JSON.stringify(repairs), '```',
    '', 'Structured data:', '```json',
    JSON.stringify({ squad_artifact: 'activation-reconciled', schema_version: '1',
      origin_issue: verified.request.origin_issue, phases: verified.request.phases ?? [] }), '```',
  ].join('\n');
  const result = await publishActivation({ github, context, env, root, body });
  await upsertActivationLifecycle({ github, context, origin: verified.request.origin_issue,
    fullPlan: verified.fullPlan, phases: verified.request.phases ?? [], command: `/squad ${command.argumentText}` });
  return result;
}
