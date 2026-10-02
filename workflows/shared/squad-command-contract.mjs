#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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

  let fence = null;
  for (const originalLine of normalizeNewlines(text).split('\n')) {
    if (fence) {
      const closingFence = originalLine.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (closingFence
        && closingFence[1][0] === fence.delimiter
        && closingFence[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    const openingFence = originalLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (openingFence) {
      fence = {
        delimiter: openingFence[1][0],
        length: openingFence[1].length,
      };
      continue;
    }
    if (/^(?: {4}| {0,3}\t)/.test(originalLine)) continue;
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
    ? { ...payload, comment: { ...payload.comment, body: previousBody } }
    : { ...payload, issue: { ...payload.issue, body: previousBody } };
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

export async function enforceSquadCommandContract({ payload, eventName, createComment }) {
  const result = classifySquadCommand(payload, eventName);
  if (result.status !== 'rejected') return result;
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
