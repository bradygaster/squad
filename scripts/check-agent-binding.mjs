import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ACTIVATION_ARTIFACTS = new Set(['activated', 'phases-activated']);
const VALID_OMISSIONS = new Set(['multi-owner', 'non-roster', 'copilot']);

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

function expectedBinding(binding, roster) {
  if (!binding || typeof binding !== 'object' || !Number.isInteger(binding.issue) || binding.issue < 1) {
    throw new Error('binding has no valid issue number');
  }
  if (!['task', 'epic'].includes(binding.kind)) throw new Error(`issue #${binding.issue}: invalid binding kind`);
  if (!normalize(binding.epic)) throw new Error(`issue #${binding.issue}: missing epic linkage`);
  if (!Array.isArray(binding.agents) || binding.agents.length === 0) {
    throw new Error(`issue #${binding.issue}: agents must be a non-empty array`);
  }

  const agents = [...new Set(binding.agents.map(normalize).filter(Boolean))];
  if (agents.length !== binding.agents.length) {
    throw new Error(`issue #${binding.issue}: agents contain empty or duplicate values`);
  }

  if (binding.kind === 'task') {
    if (!normalize(binding.task)) throw new Error(`issue #${binding.issue}: task binding has no plan task number`);
    const agent = normalize(binding.agent);
    if (!agent || agents.length !== 1 || agents[0] !== agent) {
      throw new Error(`issue #${binding.issue}: task agent does not match its agents array`);
    }
  }

  let label = null;
  let omission = null;
  if (binding.kind === 'epic' && agents.length > 1) {
    omission = 'multi-owner';
  } else if (agents[0] === '@copilot') {
    omission = 'copilot';
  } else if (!roster.has(agents[0])) {
    omission = 'non-roster';
  } else {
    label = `squad:${agents[0]}`;
  }

  if (binding.label !== label && !(label === null && binding.label === undefined)) {
    throw new Error(`issue #${binding.issue}: reported label ${binding.label ?? '(none)'} does not match ${label ?? 'bare squad'}`);
  }
  if (binding.omission_reason !== omission && !(omission === null && binding.omission_reason === undefined)) {
    throw new Error(`issue #${binding.issue}: omission report must be ${omission ?? 'absent'}`);
  }
  if (binding.omission_reason && !VALID_OMISSIONS.has(binding.omission_reason)) {
    throw new Error(`issue #${binding.issue}: invalid omission reason`);
  }
  return label;
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
  for (const binding of artifact.bindings) {
    const expected = expectedBinding(binding, roster);
    if (seen.has(binding.issue)) throw new Error(`issue #${binding.issue}: duplicate binding`);
    seen.add(binding.issue);

    const labels = labelsByIssue.get(binding.issue);
    if (!labels) throw new Error(`issue #${binding.issue}: labels could not be resolved`);
    if (!labels.has('squad')) throw new Error(`issue #${binding.issue}: missing squad label`);

    const actualAgentLabels = [...labels].filter(label => label.startsWith('squad:'));
    const expectedAgentLabels = expected ? [expected] : [];
    if (actualAgentLabels.length !== expectedAgentLabels.length || actualAgentLabels[0] !== expectedAgentLabels[0]) {
      throw new Error(
        `issue #${binding.issue}: expected ${expected ?? 'bare squad'}, found ${actualAgentLabels.join(', ') || 'bare squad'}`,
      );
    }
  }
  return { skipped: false, checked: seen.size };
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
      ? artifact.bindings.map(binding => binding?.issue).filter(Number.isInteger)
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
