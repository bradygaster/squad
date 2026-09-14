#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { validateCastTree } from './squad-cast-validator.mjs';
export const BOOTSTRAP_BRANCH = 'squad/bootstrap-cast';
export const BOOTSTRAP_PR_TITLE = '[squad] Cast your Squad';
export const BOOTSTRAP_ISSUE_TITLE = '[Research Proposals] Agent-discovered repo opportunities';
export const BOOTSTRAP_ISSUE_MARKER = '<!-- squad:bootstrap-opportunities schema=1 -->';
export const BOOTSTRAP_RESEARCH_TITLE = '## 🔬 Squad Research — Bootstrap proposals';
export const PAYLOAD_CHUNK_BYTES = 6000;
export const PAYLOAD_MAX_CHUNKS = 16;
export const PAYLOAD_MAX_BYTES = PAYLOAD_CHUNK_BYTES * PAYLOAD_MAX_CHUNKS;
export const PAYLOAD_CHUNK_STRING_MAX_BYTES = 3 + Math.ceil(PAYLOAD_CHUNK_BYTES / 3) * 4;

const REQUIRED_ISSUE_HEADINGS = [
  '## Repository snapshot',
  '## Meet the proposed Squad',
  '## Prioritized proposals',
  '## Recommended sequence',
  '## How to launch work',
  '## Actionable backlog',
];
const REQUIRED_COMMANDS = [
  '/squad triage',
  '/squad triage revise <feedback>',
  '/squad plan',
  '/squad activate',
];
const REQUIRED_GUIDANCE_LINES = [
  '1. Review and merge the linked draft Cast PR.',
  '2. Rerun `/squad triage` to classify these existing proposals, or use focused `/squad research ...` first when deeper research is desired.',
  '3. Run `/squad plan`, review the plan, then run `/squad activate` to create assignable implementation issues.',
];
const LINK_PLACEHOLDER = '{{CAST_PR_URL}}';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function chunkField(index) {
  return `payload_chunk_${String(index).padStart(2, '0')}`;
}

function parseBoundedDecimal(value, field, { minimum, maximum }) {
  if (typeof value !== 'string' || !CANONICAL_DECIMAL_PATTERN.test(value)) {
    throw new Error(`${field} must be a canonical decimal string.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function decodeCanonicalBase64(value, field) {
  if (!BASE64_PATTERN.test(value)) {
    throw new Error(`${field} must contain canonical Base64.`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`${field} must contain canonical Base64.`);
  }
  return decoded;
}

export function createBootstrapPayloadEnvelope(payloadText) {
  if (typeof payloadText !== 'string') {
    throw new Error('Bootstrap payload transport requires a UTF-8 string.');
  }
  const payloadBytes = Buffer.from(payloadText, 'utf8');
  if (payloadBytes.length === 0 || payloadBytes.length > PAYLOAD_MAX_BYTES) {
    throw new Error(`Bootstrap payload must be between 1 and ${PAYLOAD_MAX_BYTES} bytes.`);
  }

  const chunkCount = Math.ceil(payloadBytes.length / PAYLOAD_CHUNK_BYTES);
  const envelope = {
    payload_encoding: 'base64',
    payload_byte_length: String(payloadBytes.length),
    payload_sha256: createHash('sha256').update(payloadBytes).digest('hex'),
    payload_chunk_count: String(chunkCount),
  };
  for (let index = 0; index < chunkCount; index++) {
    const start = index * PAYLOAD_CHUNK_BYTES;
    const encoded = payloadBytes.subarray(start, start + PAYLOAD_CHUNK_BYTES).toString('base64');
    envelope[chunkField(index)] = `${String(index).padStart(2, '0')}:${encoded}`;
  }
  return envelope;
}

export function reconstructBootstrapPayload(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('Bootstrap payload transport must be an object.');
  }
  if (envelope.payload_encoding !== 'base64') {
    throw new Error('payload_encoding must be base64.');
  }

  const chunkCount = parseBoundedDecimal(envelope.payload_chunk_count, 'payload_chunk_count', {
    minimum: 1,
    maximum: PAYLOAD_MAX_CHUNKS,
  });
  const expectedLength = parseBoundedDecimal(envelope.payload_byte_length, 'payload_byte_length', {
    minimum: 1,
    maximum: PAYLOAD_MAX_BYTES,
  });
  if (typeof envelope.payload_sha256 !== 'string' || !SHA256_PATTERN.test(envelope.payload_sha256)) {
    throw new Error('payload_sha256 must be a lowercase SHA-256 digest.');
  }

  const chunks = [];
  for (let index = 0; index < PAYLOAD_MAX_CHUNKS; index++) {
    const field = chunkField(index);
    const value = envelope[field];
    if (index >= chunkCount) {
      if (value !== undefined) {
        throw new Error(`${field} is trailing data beyond payload_chunk_count.`);
      }
      continue;
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${field} is missing.`);
    }
    if (Buffer.byteLength(value, 'utf8') > PAYLOAD_CHUNK_STRING_MAX_BYTES) {
      throw new Error(`${field} exceeds ${PAYLOAD_CHUNK_STRING_MAX_BYTES} bytes.`);
    }
    const prefix = `${String(index).padStart(2, '0')}:`;
    if (!value.startsWith(prefix)) {
      throw new Error(`${field} has a duplicate, missing, or reordered chunk ordinal.`);
    }
    const decoded = decodeCanonicalBase64(value.slice(prefix.length), field);
    const expectedChunkLength =
      index === chunkCount - 1
        ? expectedLength - (PAYLOAD_CHUNK_BYTES * (chunkCount - 1))
        : PAYLOAD_CHUNK_BYTES;
    if (expectedChunkLength < 1 || expectedChunkLength > PAYLOAD_CHUNK_BYTES) {
      throw new Error('payload_byte_length is inconsistent with payload_chunk_count.');
    }
    if (decoded.length !== expectedChunkLength) {
      throw new Error(`${field} decoded length does not match the deterministic chunk boundary.`);
    }
    chunks.push(decoded);
  }

  const payloadBytes = Buffer.concat(chunks);
  if (payloadBytes.length > PAYLOAD_MAX_BYTES) {
    throw new Error(`Bootstrap payload exceeds ${PAYLOAD_MAX_BYTES} bytes.`);
  }
  if (payloadBytes.length !== expectedLength) {
    throw new Error(`Bootstrap payload length mismatch: expected ${expectedLength}, got ${payloadBytes.length}.`);
  }
  const actualHash = createHash('sha256').update(payloadBytes).digest('hex');
  if (actualHash !== envelope.payload_sha256) {
    throw new Error('Bootstrap payload SHA-256 mismatch.');
  }

  let payloadText;
  try {
    payloadText = new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes);
  } catch {
    throw new Error('Bootstrap payload is not valid UTF-8.');
  }
  if (!Buffer.from(payloadText, 'utf8').equals(payloadBytes)) {
    throw new Error('Bootstrap payload UTF-8 reconstruction is not byte-identical.');
  }
  return payloadText;
}

function pullHead(pullRequest) {
  return pullRequest?.head?.ref ?? pullRequest?.headRefName ?? '';
}

function pullBase(pullRequest) {
  return pullRequest?.base?.ref ?? pullRequest?.baseRefName ?? '';
}

function issueBody(issue) {
  return String(issue?.body ?? '');
}

function researchEnvelope(comment) {
  const blocks = String(comment?.body ?? '').matchAll(
    /Structured data:\s*```json\s*([\s\S]*?)```/gi,
  );
  let envelope = null;
  for (const block of blocks) {
    let candidate;
    try {
      candidate = JSON.parse(block[1]);
    } catch {
      continue;
    }
    if (candidate?.squad_artifact !== 'research') continue;
    if (envelope) {
      throw new Error(
        `Ambiguous bootstrap research comment #${comment.id}: found multiple research envelopes.`,
      );
    }
    envelope = candidate;
  }
  return envelope;
}

export function findBootstrapResearchArtifacts(comments, issueNumber) {
  if (!Array.isArray(comments) || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('Bootstrap research discovery requires comments and a positive issue number.');
  }
  return comments
    .filter((comment) => comment?.user?.login === 'github-actions[bot]')
    .filter((comment) => {
      const envelope = researchEnvelope(comment);
      if (!envelope) return false;
      const keys = Object.keys(envelope).sort();
      const expectedKeys = ['origin_issue', 'phases', 'schema_version', 'squad_artifact'];
      if (
        JSON.stringify(keys) !== JSON.stringify(expectedKeys) ||
        envelope.schema_version !== '1' ||
        envelope.origin_issue !== issueNumber ||
        !Array.isArray(envelope.phases) ||
        envelope.phases.length !== 0
      ) {
        throw new Error(
          `Malformed bootstrap research comment #${comment.id}: expected the canonical research envelope.`,
        );
      }
      return true;
    })
    .sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)),
    );
}

export function isBootstrapResearchSeed(comment) {
  return String(comment?.body ?? '').startsWith(`${BOOTSTRAP_RESEARCH_TITLE}\n`);
}

export function classifyBootstrapState({ pullRequests, issues, comments, defaultBranch }) {
  if (!Array.isArray(pullRequests) || !Array.isArray(issues) || !defaultBranch) {
    throw new Error('Bootstrap state requires pullRequests, issues, and defaultBranch.');
  }

  const relevantPullRequests = pullRequests.filter(
    (pullRequest) =>
      pullHead(pullRequest) === BOOTSTRAP_BRANCH ||
      pullRequest?.title === BOOTSTRAP_PR_TITLE,
  );
  const malformedPullRequest = relevantPullRequests.find(
    (pullRequest) =>
      pullHead(pullRequest) !== BOOTSTRAP_BRANCH ||
      pullRequest?.title !== BOOTSTRAP_PR_TITLE ||
      pullBase(pullRequest) !== defaultBranch,
  );
  if (malformedPullRequest) {
    throw new Error(
      `Ambiguous bootstrap pull request #${malformedPullRequest.number}: expected exact branch, title, and base.`,
    );
  }
  if (relevantPullRequests.length > 1) {
    throw new Error(
      `Ambiguous bootstrap state: found ${relevantPullRequests.length} matching pull requests.`,
    );
  }

  const relevantIssues = issues.filter(
    (issue) =>
      issue?.title === BOOTSTRAP_ISSUE_TITLE ||
      issueBody(issue).includes(BOOTSTRAP_ISSUE_MARKER),
  );
  const malformedIssue = relevantIssues.find(
    (issue) =>
      issue?.title !== BOOTSTRAP_ISSUE_TITLE ||
      occurrences(issueBody(issue), BOOTSTRAP_ISSUE_MARKER) !== 1,
  );
  if (malformedIssue) {
    throw new Error(
      `Ambiguous bootstrap issue #${malformedIssue.number}: expected exact title and durable marker.`,
    );
  }
  if (relevantIssues.length > 1) {
    throw new Error(
      `Ambiguous bootstrap state: found ${relevantIssues.length} matching issues.`,
    );
  }

  const pullRequest = relevantPullRequests[0] ?? null;
  const issue = relevantIssues[0] ?? null;
  const researchArtifacts =
    issue && comments !== undefined
      ? findBootstrapResearchArtifacts(comments, issue.number)
      : [];
  const closedUnmerged =
    pullRequest?.state === 'closed' &&
    !pullRequest?.merged_at &&
    pullRequest?.merged !== true;

  let action;
  if (closedUnmerged) action = 'opt_out';
  else if (pullRequest && issue && comments !== undefined && researchArtifacts.length !== 1) {
    action = 'create_research';
  } else if (pullRequest && issue) action = 'noop';
  else if (pullRequest) action = 'create_issue';
  else if (issue) action = 'create_pr';
  else action = 'create_both';

  return {
    action,
    pull_request: pullRequest
      ? {
          number: pullRequest.number,
          state: pullRequest.state,
          merged: Boolean(pullRequest.merged_at || pullRequest.merged),
          url: pullRequest.html_url ?? pullRequest.url ?? '',
          head_sha: pullRequest.head?.sha ?? pullRequest.headSha ?? '',
          merge_commit_sha: pullRequest.merge_commit_sha ?? pullRequest.mergeCommitSha ?? '',
        }
      : null,
    issue: issue
      ? {
          number: issue.number,
          state: issue.state,
          url: issue.html_url ?? issue.url ?? '',
        }
      : null,
    research_artifact_count: researchArtifacts.length,
  };
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: squad-bootstrap-validator.mjs --root <path> --payload <json-file> '
        + '--repository <owner/repo> --default-branch <branch> --link-mode <placeholder|resolved>',
      );
    }
    args.set(key.slice(2), value);
  }
  for (const key of ['root', 'payload', 'repository', 'default-branch', 'link-mode']) {
    if (!args.has(key)) throw new Error(`Missing required --${key}.`);
  }
  if (!['placeholder', 'resolved'].includes(args.get('link-mode'))) {
    throw new Error('--link-mode must be placeholder or resolved.');
  }
  return {
    root: resolve(args.get('root')),
    payloadPath: resolve(args.get('payload')),
    repository: args.get('repository'),
    defaultBranch: args.get('default-branch'),
    linkMode: args.get('link-mode'),
  };
}

function normalizePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').includes('..') ||
    /[*?{}[\]]/.test(value)
  ) {
    return null;
  }
  return value.replace(/^\.\//, '');
}

function parseTeamMembers(team) {
  const section = team.match(/^## Members\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m)?.[1] ?? '';
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter(
      (cells) =>
        cells.length >= 2 &&
        cells[0] !== 'Name' &&
        !/^:?-+/.test(cells[0]) &&
        cells[0] !== '@copilot',
    )
    .map(([name, role]) => ({ name, role }));
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function parseProposalSections(issueBody, errors) {
  const matches = [
    ...issueBody.matchAll(/^### (P([1-5]))\s+[—-]\s+(.+)$/gm),
  ];
  if (matches.length < 3 || matches.length > 5) {
    errors.push(`issue: expected 3-5 proposals, found ${matches.length}`);
    return [];
  }
  const ids = matches.map((match) => match[1]);
  const expected = ids.map((_, index) => `P${index + 1}`);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    errors.push(`issue: proposal IDs must be consecutive from P1 (found ${ids.join(', ')})`);
  }

  return matches.map((match, index) => {
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? issueBody.indexOf('\n## Recommended sequence', start);
    const section = issueBody.slice(start, end === -1 ? issueBody.length : end);
    const fields = {};
    for (const label of ['Evidence', 'Why it matters', 'How the Squad facilitates it']) {
      fields[label] = section.match(
        new RegExp(`^- \\*\\*${label}:\\*\\*\\s+(.+)$`, 'm'),
      )?.[1]?.trim() ?? '';
      if (!fields[label]) {
        errors.push(`issue: ${ids[index]} is missing a non-empty ${label} field`);
      }
    }
    if (!section.includes(`/squad research Focus only on proposal ${ids[index]}:`)) {
      errors.push(`issue: ${ids[index]} is missing its focused research command`);
    }
    const evidenceLine = fields.Evidence;
    const evidencePaths = [...evidenceLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (evidencePaths.length === 0) {
      errors.push(`issue: ${ids[index]} must cite at least one repository path`);
    }
    return {
      id: ids[index],
      title: match[3].trim(),
      evidenceLine,
      evidencePaths,
      whyItMatters: fields['Why it matters'],
    };
  });
}

function validateProposalSections(issueBody, root, errors) {
  const proposals = parseProposalSections(issueBody, errors);
  for (const proposal of proposals) {
    const { id, evidencePaths } = proposal;
    for (const evidencePath of evidencePaths) {
      const normalized = normalizePath(evidencePath);
      if (!normalized || !existsSync(join(root, normalized))) {
        errors.push(`issue: ${id} cites missing or unsafe evidence path ${evidencePath}`);
      }
    }
  }
}

export function createBootstrapResearchBody(issueBodyText) {
  const errors = [];
  if (occurrences(issueBodyText, BOOTSTRAP_ISSUE_MARKER) !== 1) {
    errors.push('issue: durable bootstrap marker must appear exactly once');
  }
  for (const heading of REQUIRED_ISSUE_HEADINGS) {
    if (occurrences(issueBodyText, heading) !== 1) {
      errors.push(`issue: expected exactly one ${heading}`);
    }
  }
  const proposals = parseProposalSections(issueBodyText, errors);
  if (errors.length > 0) {
    throw new Error(`Cannot derive bootstrap research:\n${[...new Set(errors)].map((error) => `- ${error}`).join('\n')}`);
  }

  const tableCell = (value) => String(value).replace(/\|/g, '\\|');
  const evidenceRows = proposals.map((proposal, index) => {
    const citation = `\`${tableCell(proposal.evidencePaths[0])}\``;
    return `| R${index + 1} | ${proposal.id} is a validated bootstrap proposal in the root issue body. | 🟡 | M | ${citation} |`;
  });
  const traceability = proposals.map((_, index) => `R${index + 1}`).join(', ');

  return [
    BOOTSTRAP_RESEARCH_TITLE,
    '',
    'The automatic bootstrap validated these repository-derived proposals before publishing the issue. This concise seed makes them available to normal triage without duplicating the full proposal descriptions in another comment.',
    '',
    '### Goals',
    '- Classify the existing bootstrap proposals into work, decisions, and exclusions.',
    '- Preserve direct traceability to the validated repository evidence in the issue body.',
    '',
    '### Non-goals',
    '- This seed does not approve the proposed roster or authorize implementation.',
    '- This seed does not replace focused `/squad research ...` when deeper investigation is desired.',
    '',
    '### Evidence table',
    '| Rn | Finding | Risk | Complexity | Citation |',
    '| --- | --- | --- | --- | --- |',
    ...evidenceRows,
    '',
    '### Load-bearing assumptions',
    `- ${traceability}: cited paths remain representative when triage runs; focused research should refresh any stale evidence.`,
    '',
    '### Open decisions',
    `- Decide which of ${proposals.map((proposal) => proposal.id).join(', ')} should proceed to planning after the Cast PR is merged.`,
    '',
    '### Acceptance framing',
    `- ${traceability}: every selected proposal has a clear disposition, scope boundary, owner direction, and evidence-backed rationale.`,
    '',
    '### Online sources',
    'Online sources: unavailable — automatic bootstrap intentionally uses validated repository evidence only.',
    '',
    '### Recommendations',
    `- Triage ${traceability} directly after the linked Cast PR merges.`,
    '- Run focused `/squad research ...` first only for proposals that need deeper or refreshed evidence.',
    '',
    '### Next step',
    'Review and merge the linked Cast PR, then rerun `/squad triage` on this issue.',
  ].join('\n');
}

export function createBootstrapResearchComment(issueBodyText, issueNumber) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('Bootstrap research comment requires a positive issue number.');
  }
  const body = createBootstrapResearchBody(issueBodyText);
  const data = JSON.stringify({
    squad_artifact: 'research',
    schema_version: '1',
    origin_issue: issueNumber,
    phases: [],
  });
  return `${body}\n\nStructured data:\n\n\`\`\`json\n${data}\n\`\`\``;
}

export function validateBootstrapPayload({
  root,
  payloadPath,
  repository,
  defaultBranch,
  linkMode,
}) {
  const errors = [];
  let payload;
  try {
    payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
  } catch (error) {
    return [`payload: invalid JSON (${error.message})`];
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['payload: expected a JSON object'];
  }
  if (payload.schema_version !== '1') errors.push('payload: schema_version must be "1"');
  if (payload.repository !== repository) errors.push('payload: repository does not match the runtime repository');
  if (payload.default_branch !== defaultBranch) errors.push('payload: default_branch does not match the runtime default');
  if (payload.branch !== BOOTSTRAP_BRANCH) errors.push(`payload: branch must be ${BOOTSTRAP_BRANCH}`);
  if (payload.pr_title !== BOOTSTRAP_PR_TITLE) errors.push(`payload: pr_title must be ${BOOTSTRAP_PR_TITLE}`);
  if (payload.issue_title !== BOOTSTRAP_ISSUE_TITLE) {
    errors.push(`payload: issue_title must be ${BOOTSTRAP_ISSUE_TITLE}`);
  }
  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    errors.push('payload: files must be a non-empty array');
    return errors;
  }

  const castPaths = [];
  const seenPaths = new Set();
  for (const [index, file] of payload.files.entries()) {
    const normalized = normalizePath(file?.path);
    if (!normalized || typeof file?.content !== 'string') {
      errors.push(`payload: file ${index} must contain a concrete POSIX path and string content`);
      continue;
    }
    if (seenPaths.has(normalized)) errors.push(`payload: duplicate file path ${normalized}`);
    seenPaths.add(normalized);
    castPaths.push(normalized);
    const diskPath = join(root, normalized);
    if (!existsSync(diskPath)) {
      errors.push(`payload: ${normalized} is missing from the generated tree`);
      continue;
    }
    const diskContent = readFileSync(diskPath, 'utf8').replace(/\r\n/g, '\n');
    if (diskContent !== file.content.replace(/\r\n/g, '\n')) {
      errors.push(`payload: ${normalized} content does not match the generated tree`);
    }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'squad-bootstrap-validator-'));
  try {
    const castPayloadPath = join(tempDir, 'cast-paths.json');
    writeFileSync(castPayloadPath, `${JSON.stringify(castPaths)}\n`);
    errors.push(...validateCastTree({ root, payloadPath: castPayloadPath }));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const prBody = typeof payload.pr_body === 'string' ? payload.pr_body.trim() : '';
  const issueBody = typeof payload.issue_body === 'string' ? payload.issue_body.trim() : '';
  if (prBody.length < 100) errors.push('payload: pr_body must be a meaningful Cast summary');
  if (issueBody.length < 500 || issueBody.length > 65000) {
    errors.push('payload: issue_body must be between 500 and 65,000 characters');
  }

  if (occurrences(issueBody, BOOTSTRAP_ISSUE_MARKER) !== 1) {
    errors.push('issue: durable bootstrap marker must appear exactly once');
  }
  for (const heading of REQUIRED_ISSUE_HEADINGS) {
    if (occurrences(issueBody, heading) !== 1) errors.push(`issue: expected exactly one ${heading}`);
  }
  if (!/proposals?, not approved work/i.test(issueBody)) {
    errors.push('issue: must clearly state that proposals are not approved work');
  }
  if (!/assignable implementation issues/i.test(issueBody)) {
    errors.push('issue: actionable-backlog endpoint must name assignable implementation issues');
  }
  for (const command of REQUIRED_COMMANDS) {
    if (!issueBody.includes(command)) errors.push(`issue: missing valid lifecycle command ${command}`);
  }
  for (const line of REQUIRED_GUIDANCE_LINES) {
    if (!issueBody.includes(line)) errors.push(`issue: missing required bootstrap guidance ${line}`);
  }
  if (/\/squad implement\s+P[1-5]\b/i.test(issueBody)) {
    errors.push('issue: /squad implement must never target a proposal ID');
  }
  if (!/\/squad research Evaluate proposals P1 and P2 together/i.test(issueBody)) {
    errors.push('issue: missing multi-proposal research instruction');
  }
  if (!/\/squad research Evaluate proposals P1 through P[3-5]/i.test(issueBody)) {
    errors.push('issue: missing all-proposals research instruction');
  }

  if (linkMode === 'placeholder') {
    if (occurrences(issueBody, LINK_PLACEHOLDER) !== 1) {
      errors.push(`issue: ${LINK_PLACEHOLDER} must appear exactly once before materialization`);
    }
  } else {
    if (issueBody.includes(LINK_PLACEHOLDER)) {
      errors.push('issue: unresolved Cast PR placeholder is forbidden');
    }
    const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`https://github\\.com/${escapedRepository}/pull/[1-9][0-9]*`).test(issueBody)) {
      errors.push('issue: resolved body must link to the deterministic Cast PR');
    }
  }

  let team = '';
  try {
    team = readFileSync(join(root, '.squad/team.md'), 'utf8').replace(/\r\n/g, '\n');
  } catch (error) {
    errors.push(`team: unable to read .squad/team.md (${error.message})`);
  }
  const members = parseTeamMembers(team);
  if (members.length < 4 || members.length > 7) {
    errors.push(`team: expected 4-7 proposed specialists, found ${members.length}`);
  }
  for (const { name, role } of members) {
    const row = `| **${name}** | ${role} |`;
    if (!issueBody.includes(row)) errors.push(`issue: proposed Squad row diverges for ${name} (${role})`);
    if (!prBody.includes(`| ${name} | ${role} |`)) {
      errors.push(`pull request: Cast summary row diverges for ${name} (${role})`);
    }
  }

  validateProposalSections(issueBody, root, errors);
  return [...new Set(errors)].sort();
}

function main() {
  const cliArgs = process.argv.slice(2);
  if (cliArgs.length === 2 && cliArgs[0] === '--encode-payload') {
    try {
      const payloadText = readFileSync(resolve(cliArgs[1]), 'utf8');
      process.stdout.write(`${JSON.stringify(createBootstrapPayloadEnvelope(payloadText), null, 2)}\n`);
    } catch (error) {
      console.error(`Squad bootstrap payload encoding failed:\n- ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }

  let options;
  try {
    options = parseArgs(cliArgs);
  } catch (error) {
    console.error(`Squad bootstrap validation failed:\n- ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const errors = validateBootstrapPayload(options);
  if (errors.length > 0) {
    console.error(`Squad bootstrap validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log('Squad bootstrap validation passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
