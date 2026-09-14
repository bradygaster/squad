#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { validateCastTree } from './squad-cast-validator.mjs';
export const BOOTSTRAP_BRANCH = 'squad/bootstrap-cast';
export const BOOTSTRAP_PR_TITLE = '[squad] Cast your Squad';
export const BOOTSTRAP_ISSUE_TITLE = '[Research Proposals] Agent-discovered repo opportunities';
export const BOOTSTRAP_ISSUE_MARKER = '<!-- squad:bootstrap-opportunities schema=1 -->';

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
const LINK_PLACEHOLDER = '{{CAST_PR_URL}}';

function pullHead(pullRequest) {
  return pullRequest?.head?.ref ?? pullRequest?.headRefName ?? '';
}

function pullBase(pullRequest) {
  return pullRequest?.base?.ref ?? pullRequest?.baseRefName ?? '';
}

function issueBody(issue) {
  return String(issue?.body ?? '');
}

export function classifyBootstrapState({ pullRequests, issues, defaultBranch }) {
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
      !issueBody(issue).includes(BOOTSTRAP_ISSUE_MARKER),
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
  const closedUnmerged =
    pullRequest?.state === 'closed' &&
    !pullRequest?.merged_at &&
    pullRequest?.merged !== true;

  let action;
  if (closedUnmerged) action = 'opt_out';
  else if (pullRequest && issue) action = 'noop';
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

function validateProposalSections(issueBody, root, errors) {
  const matches = [
    ...issueBody.matchAll(/^### (P([1-5]))\s+[—-]\s+(.+)$/gm),
  ];
  if (matches.length < 3 || matches.length > 5) {
    errors.push(`issue: expected 3-5 proposals, found ${matches.length}`);
    return;
  }
  const ids = matches.map((match) => match[1]);
  const expected = ids.map((_, index) => `P${index + 1}`);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    errors.push(`issue: proposal IDs must be consecutive from P1 (found ${ids.join(', ')})`);
  }

  for (let index = 0; index < matches.length; index++) {
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? issueBody.indexOf('\n## Recommended sequence', start);
    const section = issueBody.slice(start, end === -1 ? issueBody.length : end);
    for (const label of ['Evidence', 'Why it matters', 'How the Squad facilitates it']) {
      if (!new RegExp(`^- \\*\\*${label}:\\*\\*\\s+\\S`, 'm').test(section)) {
        errors.push(`issue: ${ids[index]} is missing a non-empty ${label} field`);
      }
    }
    if (!section.includes(`/squad research Focus only on proposal ${ids[index]}:`)) {
      errors.push(`issue: ${ids[index]} is missing its focused research command`);
    }
    const evidenceLine = section.match(/^- \*\*Evidence:\*\*\s+(.+)$/m)?.[1] ?? '';
    const evidencePaths = [...evidenceLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (evidencePaths.length === 0) {
      errors.push(`issue: ${ids[index]} must cite at least one repository path`);
    }
    for (const evidencePath of evidencePaths) {
      const normalized = normalizePath(evidencePath);
      if (!normalized || !existsSync(join(root, normalized))) {
        errors.push(`issue: ${ids[index]} cites missing or unsafe evidence path ${evidencePath}`);
      }
    }
  }
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
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
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
