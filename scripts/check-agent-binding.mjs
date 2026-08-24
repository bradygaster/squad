import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ACTIVATION_ARTIFACTS = new Set(['activated', 'phases-activated']);
const VALID_OMISSIONS = new Set(['multi-owner', 'non-roster']);

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function parseStructuredData(comment) {
  const blocks = [...comment.matchAll(/Structured data:\s*```json\s*([\s\S]*?)```/gi)];
  if (blocks.length === 0) {
    if (/Structured data:/i.test(comment) && /"squad_artifact"\s*:\s*"?(?:phases-)?activated/i.test(comment)) {
      throw new Error('activation structured data block could not be parsed');
    }
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(blocks.at(-1)[1]);
  } catch (error) {
    throw new Error(`activation structured data is invalid JSON: ${error.message}`);
  }
  return parsed;
}

export function parseRoster(teamMarkdown) {
  const lines = teamMarkdown.replace(/\r/g, '').split('\n');
  const section = lines.findIndex(line => /^##\s+Members\s*$/.test(line.trim()));
  if (section < 0) throw new Error('roster has no ## Members section');

  const nextSection = lines.findIndex((line, index) => index > section && /^##\s/.test(line));
  const table = lines.slice(section + 1, nextSection < 0 ? undefined : nextSection)
    .filter(line => line.trim().startsWith('|'));
  if (table.length < 3) throw new Error('roster Members table is missing or empty');

  const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
  const header = cells(table[0]);
  const nameIndex = header.findIndex(cell => normalize(cell) === 'name');
  if (nameIndex < 0) throw new Error('roster Members table has no Name column');

  const names = table.slice(2)
    .map(line => normalize(cells(line)[nameIndex]))
    .filter(Boolean);
  if (names.length === 0) throw new Error('roster Members table has no members');
  return new Set(names);
}

function expectedLabel(agent, roster) {
  if (agent === '@copilot') return { label: 'squad:copilot', omission: null };
  if (roster.has(agent)) return { label: `squad:${agent}`, omission: null };
  return { label: null, omission: 'non-roster' };
}

function validateReportedOutcome(binding, prefix, expected) {
  const labelKey = prefix ? `${prefix}_label` : 'label';
  const omissionKey = prefix ? `${prefix}_omission_reason` : 'omission_reason';
  if (binding[labelKey] !== expected.label && !(expected.label === null && binding[labelKey] === undefined)) {
    throw new Error(
      `issue #${binding.issue}: reported ${labelKey} ${binding[labelKey] ?? '(none)'} does not match ${expected.label ?? 'bare squad'}`,
    );
  }
  if (binding[omissionKey] !== expected.omission && !(expected.omission === null && binding[omissionKey] === undefined)) {
    throw new Error(
      `issue #${binding.issue}: ${omissionKey} must be ${expected.omission ?? 'absent'}`,
    );
  }
  if (binding[omissionKey] && !VALID_OMISSIONS.has(binding[omissionKey])) {
    throw new Error(`issue #${binding.issue}: invalid ${omissionKey}`);
  }
}

function validateTaskBinding(binding, roster) {
  if (!binding || typeof binding !== 'object' || !Number.isInteger(binding.issue) || binding.issue < 1) {
    throw new Error('binding has no valid issue number');
  }
  if (!Number.isInteger(binding.epic_issue) || binding.epic_issue < 1) {
    throw new Error(`issue #${binding.issue}: missing epic issue linkage`);
  }
  if (!normalize(binding.task)) throw new Error(`issue #${binding.issue}: binding has no plan task number`);
  if (!normalize(binding.epic)) throw new Error(`issue #${binding.issue}: missing epic linkage`);
  const agent = normalize(binding.agent);
  if (!agent) throw new Error(`issue #${binding.issue}: binding has no agent`);
  if (!Array.isArray(binding.epic_agents) || binding.epic_agents.length === 0) {
    throw new Error(`issue #${binding.issue}: epic_agents must be a non-empty array`);
  }
  const epicAgents = [...new Set(binding.epic_agents.map(normalize).filter(Boolean))].sort();
  if (epicAgents.length !== binding.epic_agents.length || !epicAgents.includes(agent)) {
    throw new Error(`issue #${binding.issue}: epic_agents are empty, duplicated, or exclude the task agent`);
  }
  const expected = expectedLabel(agent, roster);
  validateReportedOutcome(binding, '', expected);
  return { epicAgents, expected };
}

function validateActualLabels(issue, labels, expected) {
  if (!labels) throw new Error(`issue #${issue}: labels could not be resolved`);
  if (!labels.has('squad')) throw new Error(`issue #${issue}: missing squad label`);
  const actualAgentLabels = [...labels].filter(label => label.startsWith('squad:'));
  const expectedAgentLabels = expected.label ? [expected.label] : [];
  if (actualAgentLabels.length !== expectedAgentLabels.length || actualAgentLabels[0] !== expectedAgentLabels[0]) {
    throw new Error(
      `issue #${issue}: expected ${expected.label ?? 'bare squad'}, found ${actualAgentLabels.join(', ') || 'bare squad'}`,
    );
  }
}

export function validateBindings(artifact, roster, labelsByIssue) {
  return validateActivation(artifact, roster, labelsByIssue);
}

export function validateActivation(artifact, roster, labelsByIssue, expectedOrigin) {
  if (!artifact || !ACTIVATION_ARTIFACTS.has(artifact.squad_artifact)) return { skipped: true };
  if (artifact.schema_version !== '1') throw new Error('activation artifact schema_version must be 1');
  if (!Number.isInteger(artifact.origin_issue) || artifact.origin_issue < 1) {
    throw new Error('activation artifact origin_issue is invalid');
  }
  if (expectedOrigin !== undefined && artifact.origin_issue !== expectedOrigin) {
    throw new Error(`activation artifact origin_issue ${artifact.origin_issue} does not match comment issue ${expectedOrigin}`);
  }
  if (!Array.isArray(artifact.phases) || artifact.phases.some(phase => !Number.isInteger(phase) || phase < 1)) {
    throw new Error('activation artifact phases are invalid');
  }
  if (!Array.isArray(artifact.bindings) || artifact.bindings.length === 0) {
    throw new Error('activation artifact bindings are missing or empty');
  }

  const seen = new Set();
  const epics = new Map();
  const epicIssuesByIdentifier = new Map();
  for (const binding of artifact.bindings) {
    const { epicAgents, expected } = validateTaskBinding(binding, roster);
    if (seen.has(binding.issue)) throw new Error(`issue #${binding.issue}: duplicate binding`);
    seen.add(binding.issue);
    validateActualLabels(binding.issue, labelsByIssue.get(binding.issue), expected);

    const epicIdentifier = normalize(binding.epic);
    const priorEpicIssue = epicIssuesByIdentifier.get(epicIdentifier);
    if (priorEpicIssue !== undefined && priorEpicIssue !== binding.epic_issue) {
      throw new Error(`epic ${epicIdentifier}: maps to multiple epic issue numbers`);
    }
    epicIssuesByIdentifier.set(epicIdentifier, binding.epic_issue);

    const epic = epics.get(binding.epic_issue) ?? {
      epic: epicIdentifier,
      agents: epicAgents,
      bindings: [],
    };
    if (epic.epic !== epicIdentifier) {
      throw new Error(`epic issue #${binding.epic_issue}: conflicting epic identifiers`);
    }
    if (epic.agents.join('\0') !== epicAgents.join('\0')) {
      throw new Error(`epic issue #${binding.epic_issue}: inconsistent epic_agents sets`);
    }
    epic.bindings.push(binding);
    epics.set(binding.epic_issue, epic);
  }

  for (const [epicIssue, epic] of epics) {
    const expected = epic.agents.length > 1
      ? { label: null, omission: 'multi-owner' }
      : expectedLabel(epic.agents[0], roster);
    for (const binding of epic.bindings) validateReportedOutcome(binding, 'epic', expected);
    validateActualLabels(epicIssue, labelsByIssue.get(epicIssue), expected);
  }
  return { skipped: false, checked: seen.size, epics: epics.size };
}

async function fetchLabels(repo, issues, token) {
  const labels = new Map();
  for (const issue of issues) {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issue}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`issue #${issue}: GitHub API returned ${response.status}`);
    const body = await response.json();
    labels.set(issue, new Set(body.labels.map(label => normalize(typeof label === 'string' ? label : label.name))));
  }
  return labels;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }));
  if ((!args['comment-file'] && !args['comments-file']) || !args['team-file'] || !args.repo) {
    throw new Error('usage: check-agent-binding.mjs --comment-file=PATH|--comments-file=PATH --team-file=PATH --repo=OWNER/REPO');
  }

  const roster = parseRoster(await readFile(args['team-file'], 'utf8'));
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required for activation binding checks');

  const comments = args['comments-file']
    ? JSON.parse(await readFile(args['comments-file'], 'utf8'))
    : [{ body: await readFile(args['comment-file'], 'utf8') }];
  if (!Array.isArray(comments)) throw new Error('comments file must contain an array');

  let checked = 0;
  for (const comment of comments) {
    const artifact = parseStructuredData(comment.body ?? '');
    if (!artifact || !ACTIVATION_ARTIFACTS.has(artifact.squad_artifact)) continue;
    const issues = Array.isArray(artifact.bindings)
      ? artifact.bindings.flatMap(binding => [binding?.issue, binding?.epic_issue]).filter(Number.isInteger)
      : [];
    const labels = await fetchLabels(args.repo, [...new Set(issues)], token);
    const result = validateActivation(artifact, roster, labels, comment.issue);
    checked += result.checked;
  }
  console.log(checked === 0 ? 'No activation artifact found; skipping.' : `Validated ${checked} activation bindings.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Agent binding check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
