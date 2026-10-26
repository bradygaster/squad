#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const NO_ARGUMENT_COMMANDS = new Map([
  ['cast', 'cast'],
  ['status', 'status'],
  ['review', 'review'],
  ['retro', 'retro'],
  ['approve-improvement', 'approve-improvement'],
  ['revoke-improvement', 'revoke-improvement'],
  ['plan', 'plan'],
  ['triage', 'triage'],
  ['plan program', 'plan program'],
  ['plan implementation', 'plan implementation'],
  ['plan validate', 'plan validate'],
  ['activate', 'activate'],
  ['plan accept', 'plan accept'],
  ['plan accept scope', 'plan accept scope'],
  ['plan accept implementation', 'plan accept implementation'],
  ['plan activate', 'plan activate'],
  ['implement', 'implement'],
]);

const FREEFORM_ARGUMENT_COMMANDS = [
  ['plan program revise', 'plan program revise'],
  ['plan revise', 'plan revise'],
  ['triage revise', 'triage revise'],
  ['cast-member', 'cast-member'],
];

const SINGLE_ARGUMENT_COMMANDS = [
  ['connect', 'connect'],
  ['adopt', 'adopt'],
  ['retire', 'retire'],
];

const PHASE_COMMANDS = new Map([
  ['activate', 'activate'],
  ['plan accept', 'plan accept'],
  ['plan accept implementation', 'plan accept implementation'],
  ['plan activate', 'plan activate'],
]);

const OPEN_MODES = new Set([
  'status',
  'review',
  'research',
  'plan',
]);

export const VALID_COMMANDS = Object.freeze([
  '/squad',
  '/squad cast',
  '/squad connect <owner/repo>',
  '/squad adopt <url>',
  '/squad cast-member <spec>',
  '/squad retire <name>',
  '/squad status',
  '/squad review',
  '/squad retro',
  '/squad approve-improvement',
  '/squad revoke-improvement',
  '/squad research [focus]',
  '/squad plan',
  '/squad plan revise <feedback>',
  '/squad triage',
  '/squad triage revise <feedback>',
  '/squad plan program',
  '/squad plan program revise <feedback>',
  '/squad plan implementation',
  '/squad plan validate',
  '/squad activate [phase N]',
  '/squad plan accept [phase N]',
  '/squad plan accept scope',
  '/squad plan accept implementation [phase N]',
  '/squad plan activate [phase N]',
  '/squad implement',
  '/squad reconcile activation <request-comment-id> <request-sha256>',
]);

function normalizeNewlines(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

function firstNonEmptyLine(value) {
  return normalizeNewlines(value)
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) ?? '';
}

function sourceFromPayload(payload, eventName) {
  const dispatched = payload?.inputs?.command ?? payload?.workflow_dispatch?.inputs?.command;
  if (dispatched !== undefined || eventName === 'workflow_dispatch') {
    return { source: 'workflow_dispatch', text: firstNonEmptyLine(dispatched) };
  }
  if (payload?.comment && typeof payload.comment.body === 'string') {
    return { source: 'comment', text: normalizeNewlines(payload.comment.body) };
  }
  if (payload?.issue && typeof payload.issue.body === 'string') {
    return { source: 'issue', text: normalizeNewlines(payload.issue.body) };
  }
  return { source: 'none', text: '' };
}

/** Blank code regions without joining the surrounding Markdown blocks. */
export function markdownContentLines(text) {
  let fence = null;
  return normalizeNewlines(text).split('\n').map(originalLine => {
    if (fence) {
      const closingFence = originalLine.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (closingFence
        && closingFence[1][0] === fence.delimiter
        && closingFence[1].length >= fence.length) {
        fence = null;
      }
      return '';
    }
    const openingFence = originalLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (openingFence) {
      fence = {
        delimiter: openingFence[1][0],
        length: openingFence[1].length,
      };
      return '';
    }
    return /^(?: {4}| {0,3}\t)/.test(originalLine) ? '' : originalLine;
  });
}

function extractInvocation(source, text) {
  if (source === 'workflow_dispatch') {
    if (!text) return null;
    const slash = text.match(/^\/squad(?:\s|$)/);
    return {
      rejectedCommand: text,
      argumentText: slash ? text.slice(slash[0].length).trim() : text.trim(),
      malformedPrefix: text.toLowerCase().startsWith('/squad') && !slash,
    };
  }

  for (const originalLine of markdownContentLines(text)) {
    const line = originalLine.replace(/`+[^`]*`+/g, '').trim();
    if (!/^\/squad/i.test(line)) continue;
    const slash = line.match(/^\/squad(?:\s|$)/);
    const invocation = line;
    return {
      rejectedCommand: invocation,
      argumentText: slash ? invocation.slice(slash[0].length).trim() : '',
      malformedPrefix: !slash,
    };
  }
  return null;
}

export function commandRequiresAuthorization(result) {
  if (result?.status !== 'accepted') {
    throw new Error('An accepted command result is required.');
  }
  return !OPEN_MODES.has(result.mode);
}

export function isAuthorizedPermission(permission) {
  return ['admin', 'maintain', 'write'].includes(permission);
}

function accepted(mode, argumentText, phase = null) {
  return { status: 'accepted', mode, argumentText, phase };
}

function classifyArgument(argumentText) {
  if (!argumentText) return accepted('cast', '');

  const normalized = argumentText.replace(/[ \t]+/g, ' ').trim();
  const lowered = normalized.toLowerCase();

  const reconciliation = normalized.match(/^([A-Za-z]+ [A-Za-z]+) [1-9]\d* [a-f0-9]{64}$/);
  if (reconciliation?.[1]?.toLowerCase() === 'reconcile activation') {
    return accepted('reconcile activation', normalized);
  }

  const exact = NO_ARGUMENT_COMMANDS.get(lowered);
  if (exact) return accepted(exact, normalized);

  if (lowered === 'research' || lowered.startsWith('research ')) {
    return accepted('research', normalized);
  }

  for (const [command, mode] of FREEFORM_ARGUMENT_COMMANDS) {
    if (lowered.startsWith(`${command} `) && normalized.slice(command.length).trim()) {
      return accepted(mode, normalized);
    }
  }

  for (const [command, mode] of SINGLE_ARGUMENT_COMMANDS) {
    const argument = normalized.slice(command.length).trim();
    if (lowered.startsWith(`${command} `) && argument && !/\s/.test(argument)) {
      return accepted(mode, normalized);
    }
  }

  for (const [command, mode] of PHASE_COMMANDS) {
    const match = lowered.match(new RegExp(`^${command.replaceAll(' ', '\\s+')}\\s+phase\\s+([1-9][0-9]*)$`));
    if (match) return accepted(mode, normalized, Number(match[1]));
  }

  return null;
}

export function classifySquadCommand(payload, eventName = '') {
  const sourceData = sourceFromPayload(payload, eventName);
  const invocation = extractInvocation(sourceData.source, sourceData.text);
  if (!invocation) {
    return { status: 'none', source: sourceData.source };
  }
  if (invocation.malformedPrefix) {
    return {
      status: 'rejected',
      source: sourceData.source,
      rejectedCommand: invocation.rejectedCommand,
      reason: 'Malformed /squad prefix.',
    };
  }
  const classification = classifyArgument(invocation.argumentText);
  if (!classification) {
    return {
      status: 'rejected',
      source: sourceData.source,
      rejectedCommand: invocation.rejectedCommand,
      reason: 'Unknown command or malformed arguments.',
    };
  }
  if (sourceData.source === 'issue' && classification.mode === 'revoke-improvement') {
    return {
      status: 'rejected',
      source: sourceData.source,
      rejectedCommand: invocation.rejectedCommand,
      reason: 'Issue-body revocations are not durable. Post /squad revoke-improvement as a new, unedited human issue comment.',
    };
  }
  if (sourceData.source === 'comment' && payload?.action === 'edited' &&
      classification.mode === 'revoke-improvement') {
    return {
      status: 'rejected',
      source: sourceData.source,
      rejectedCommand: invocation.rejectedCommand,
      reason: 'Edited comment revocations are not durable. Post /squad revoke-improvement as a new, unedited human issue comment.',
    };
  }
  return { ...classification, source: sourceData.source };
}

function canonicalInvocation(result) {
  if (result.status === 'none') return null;
  if (result.status === 'accepted') {
    const normalizedArgument = result.argumentText.replace(/\s+/g, ' ').trim();
    const canonicalArgument = result.phase !== null
      ? `${result.mode} phase ${result.phase}`
      : !normalizedArgument || normalizedArgument.toLowerCase() === result.mode
        ? result.mode
        : `${result.mode} ${normalizedArgument.slice(result.mode.length).trim()}`;
    return JSON.stringify([
      'accepted',
      result.mode,
      canonicalArgument,
      result.phase,
    ]);
  }
  return JSON.stringify([
    'rejected',
    result.reason,
    result.rejectedCommand.replace(/\s+/g, ' ').trim().toLowerCase(),
  ]);
}

export function editedCommandShouldRoute(payload, eventName, currentResult) {
  const action = payload?.action;
  if (action !== 'edited' || !['issues', 'issue_comment'].includes(eventName)) {
    return true;
  }
  const previousBody = payload?.changes?.body?.from;
  if (typeof previousBody !== 'string') return false;
  const previousPayload = eventName === 'issue_comment'
    ? { ...payload, action: 'created', comment: { ...payload.comment, body: previousBody } }
    : { ...payload, action: 'opened', issue: { ...payload.issue, body: previousBody } };
  const previousResult = classifySquadCommand(previousPayload, eventName);
  return canonicalInvocation(previousResult) !== canonicalInvocation(currentResult);
}

export function rejectionComment(result) {
  if (result?.status !== 'rejected') throw new Error('A rejected command result is required.');
  return [
    '⛔ Squad rejected this command:',
    '',
    '```text',
    result.rejectedCommand,
    '```',
    '',
    `${result.reason} The workflow stopped without running a Squad mode.`,
    '',
    `Valid commands: ${VALID_COMMANDS.map(command => `\`${command}\``).join(', ')}`,
  ].join('\n');
}

export async function authorizeSquadCommand({ payload, eventName, actor, resolvePermission, result }) {
  if (result?.status !== 'accepted') throw new Error('An accepted command result is required.');
  const sender = payload?.sender;
  if (typeof actor !== 'string' || !actor.trim() || sender?.login !== actor ||
      !['User', 'Bot'].includes(sender?.type)) {
    throw new Error('Squad command authorization requires a verified event actor and sender.');
  }
  // GitHub authorizes workflow_dispatch with Actions write permission, including
  // GITHUB_TOKEN router/worker continuations. Inputs never select this trust path.
  if (eventName === 'workflow_dispatch' && result.source === 'workflow_dispatch') return;
  if (!['issues', 'issue_comment'].includes(eventName)) {
    throw new Error(`Unsupported Squad command event: ${eventName}`);
  }
  const author = eventName === 'issue_comment' ? payload?.comment?.user : payload?.issue?.user;
  if (sender.type !== 'User' || author?.type !== 'User' ||
      typeof author.login !== 'string' || !author.login.trim()) {
    throw new Error('Squad issue commands require identifiable human actor and command author.');
  }
  if (!editedCommandShouldRoute(payload, eventName, result)) {
    throw new Error('Squad edited command is unchanged or previous-body evidence is unavailable.');
  }
  if (!commandRequiresAuthorization(result)) return;
  if (typeof resolvePermission !== 'function') {
    throw new Error('Squad command permission resolver is unavailable.');
  }
  const checked = new Set();
  for (const [principal, login] of [['event actor', actor], ['command author', author.login]]) {
    if (checked.has(login)) continue;
    let permission;
    try {
      permission = await resolvePermission(login);
    } catch (error) {
      throw new Error(`Unable to resolve Squad repository permission for ${login}: ${error.message}`);
    }
    if (!isAuthorizedPermission(permission)) {
      throw new Error(`Squad refused mutating mode ${result.mode}: ${principal} ${login}=${permission || 'unresolved'}. Both the event actor and command author require write, maintain, or admin.`);
    }
    checked.add(login);
  }
}

function serializedPlanBody(body, data) {
  // gh-aw v0.91.5 appends this suffix in safe_output_type_validator.cjs.
  // Validate, rather than rewrite, so the writer retains the planning artifact.
  const match = /(?:^|\n\n)Structured data:\n```json\n([\s\S]*?)\n```$/.exec(body);
  let envelope;
  try {
    envelope = match && JSON.parse(match[1]);
  } catch {
    // Malformed data is rejected along with missing or mismatching envelopes.
  }
  if (!match || !isDeepStrictEqual(envelope, data) ||
      // Draft data has exactly four flat properties; reject duplicate JSON keys.
      (match[1].match(/"(?:[^"\\]|\\.)*"\s*:/g) || []).length !== 4) {
    throw new Error('Squad serialized plan comment requires one matching structured data envelope.');
  }
  return body.slice(0, match.index);
}

function validateOpenModeOutputs(result, payload, items) {
  const issueNumber = Number(result.source === 'workflow_dispatch'
    ? payload?.inputs?.issue_number : payload?.issue?.number);
  const types = new Set(['noop', 'missing_data', 'report_incomplete', 'add_comment']);
  if (result.mode === 'research') types.add('upsert_research_artifact');
  if (['research', 'plan'].includes(result.mode)) types.add('upsert_lifecycle_state');
  for (const item of items) {
    if (!item || !types.has(item.type)) {
      throw new Error(`Squad open mode ${result.mode} cannot emit ${item?.type || 'untyped output'}.`);
    }
    if (['noop', 'missing_data', 'report_incomplete'].includes(item.type)) continue;
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      throw new Error('Squad open-mode output requires a valid originating issue.');
    }
    const keys = item.type === 'add_comment'
      ? ['type', 'body', 'item_number', 'data', 'temporary_id']
      : ['type', 'body'];
    if (Object.keys(item).some(key => !keys.includes(key))) {
      throw new Error('Squad open-mode output contains unsupported mutation fields.');
    }
    if (item.type === 'add_comment' && item.item_number !== undefined &&
        String(item.item_number) !== String(issueNumber)) {
      throw new Error('Squad open-mode comments must target the originating issue.');
    }
    const serializedComment = Object.hasOwn(item, 'temporary_id');
    // The pinned add_comment adapter emits bare IDs: generated eight-character
    // IDs or normalized caller IDs accepted by temporary_id.cjs (3–12 characters).
    if (serializedComment && (typeof item.temporary_id !== 'string' ||
        !/^aw_[A-Za-z0-9_]{3,12}$/.test(item.temporary_id))) {
      throw new Error('Squad open-mode comment has invalid serializer metadata.');
    }
    if (item.data !== undefined) {
      const data = item.data;
      if (result.mode !== 'plan' || !data || typeof data !== 'object' || Array.isArray(data) ||
          Object.keys(data).sort().join(',') !== 'origin_issue,phases,schema_version,squad_artifact' ||
          !['plan', 'program', 'implementation', 'validation'].includes(data.squad_artifact) ||
          data.schema_version !== '1' || data.origin_issue !== issueNumber ||
          !Array.isArray(data.phases) || data.phases.length !== 0) {
        throw new Error('Squad open mode cannot emit acceptance, activation, or unrelated artifacts.');
      }
    }
    // Inspect all prose, including hidden/code regions. Only a serializer suffix
    // matching separately validated draft data is exempt; metadata grants no authority.
    const body = typeof item.body === 'string' && serializedComment && item.data !== undefined
      ? serializedPlanBody(normalizeNewlines(item.body), item.data) : item.body;
    if (typeof body !== 'string' ||
        /structured\s+data\s*:|[`~]{3,}\s*json|"squad_artifact"\s*:/i.test(body)) {
      throw new Error('Squad open-mode body must not supply a structured artifact envelope.');
    }
    if (item.type === 'upsert_lifecycle_state') {
      const expected = result.mode === 'research' ? 'Researched' : 'Planned';
      const states = [...item.body.matchAll(/^(?:[-*]\s+)?\*\*(?:Current state|State):\*\*\s+(.+)$/gim)];
      const commands = [...item.body.matchAll(/^(?:[-*]\s+)?\*\*Last command:\*\*\s+`([^`]+)`[ \t]*$/gim)];
      if (states.length !== 1 || states[0][1].trim() !== expected ||
          commands.length !== 1 ||
          ![`/squad ${result.mode}`, `/squad ${result.argumentText}`].includes(commands[0][1])) {
        throw new Error('Squad open-mode lifecycle must describe only the requested research or plan.');
      }
    }
  }
}

function readOutputItems(agentOutputPath) {
  if (!agentOutputPath) throw new Error('GH_AW_AGENT_OUTPUT is required for Squad output authorization.');
  const output = JSON.parse(readFileSync(agentOutputPath, 'utf8'));
  if (!Array.isArray(output?.items)) throw new Error('Squad agent output must contain an items array.');
  return output.items;
}

export function enforceSquadRouterOutputs(agentOutputPath) {
  for (const item of readOutputItems(agentOutputPath)) {
    if (!item || !['noop', 'missing_data', 'report_incomplete'].includes(item.type)) {
      throw new Error('Squad router agent may emit diagnostics only; routing is deterministic.');
    }
  }
}

export async function enforceSquadCommandContract({
  payload, eventName, createComment, actor, resolvePermission, agentOutputPath,
}) {
  const result = classifySquadCommand(payload, eventName);
  if (result.status === 'accepted') {
    await authorizeSquadCommand({ payload, eventName, actor, resolvePermission, result });
    const items = readOutputItems(agentOutputPath);
    if (!commandRequiresAuthorization(result)) validateOpenModeOutputs(result, payload, items);
    const activationArtifacts = new Set(['plan-accepted', 'phases-accepted', 'activated', 'phases-activated', 'activation-reconciled']);
    for (const item of items) {
      if (!item || typeof item !== 'object') throw new Error('Squad output item is malformed.');
      const rawBody = typeof item.body === 'string' ? item.body : '';
      // Readers can see fenced HTML comments; also inspect the normalized view
      // so comment-split lifecycle text cannot bypass the trusted writer boundary.
      const bodies = [rawBody, rawBody.replace(/<!--[\s\S]*?-->/g, '')];
      if (activationArtifacts.has(item.data?.squad_artifact) ||
          bodies.some(body => /Activation (?:bindings|reconciliation):/i.test(body) ||
          /squad-activation-(?:pending|finalization)\/v1/.test(body) ||
          (item.type === 'upsert_lifecycle_state' &&
            (/^(?:[-*]\s+)?\*\*(?:Current state|State):\*\*\s+Activated\s*$/im.test(body) ||
             /^(?:[-*]\s+)?(?:\*\*)?Activation:(?:\*\*)?\s+(?:✅\s+)?Done\b/im.test(body) ||
             /^\|\s*Activat(?:e|ion|ed)\s*\|\s*✅\s+Done\b/im.test(body))) ||
          [...body.matchAll(/Structured data:\s*```json\s*([\s\S]*?)```/gi)].some(match => {
            try { return activationArtifacts.has(JSON.parse(match[1])?.squad_artifact); }
            catch { return true; }
          })) ||
          (result.mode.startsWith('plan') && item.type === 'create_issue')) {
        throw new Error('Activation acceptance, bindings and terminal lifecycle belong exclusively to the trusted writer.');
      }
    }
    if (['activate', 'plan accept', 'plan activate'].includes(result.mode) ||
        (result.mode === 'plan accept implementation' && result.phase !== null)) {
      if (items.length !== 1 || items[0]?.type !== 'activate_plan' ||
          typeof items[0].plan_comment_id !== 'string' ||
          !/^[1-9]\d*$/.test(items[0].plan_comment_id) ||
          !Number.isSafeInteger(Number(items[0].plan_comment_id)) ||
          Object.keys(items[0]).some(key => !['type', 'plan_comment_id'].includes(key))) {
        throw new Error('Activation requires one activate_plan request with plan_comment_id; native issue creation and model acceptance/lifecycle outputs are forbidden.');
      }
    }
    if (result.mode === 'reconcile activation') {
      if (items.length !== 1 || items[0]?.type !== 'reconcile_activation' ||
          items[0].action !== 'reconcile' ||
          Object.keys(items[0]).some(key => !['type', 'action'].includes(key))) {
        throw new Error('Reconciliation requires exactly one reconcile_activation request with no model-supplied mappings.');
      }
    }
    return result;
  }
  if (result.status === 'none') throw new Error('No explicit Squad command; refusing all safe outputs.');
  const issueNumber = Number(payload?.issue?.number ?? payload?.pull_request?.number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Rejected command has no valid issue or pull request target: ${result.rejectedCommand}`);
  }
  await createComment(issueNumber, rejectionComment(result));
  throw new Error(`Squad rejected command: ${result.rejectedCommand}`);
}

function eventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required.');
  return JSON.parse(readFileSync(eventPath, 'utf8'));
}

function main(argv) {
  const outputIndex = argv.indexOf('--materialize');
  if (outputIndex === -1 || !argv[outputIndex + 1]) {
    throw new Error('Usage: squad-command-contract.mjs --materialize <output-path>');
  }
  const result = classifySquadCommand(eventPayload(), process.env.GITHUB_EVENT_NAME ?? '');
  writeFileSync(argv[outputIndex + 1], `${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
