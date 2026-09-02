import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// `activated` / `phases-activated` come from the granular `/squad plan activate` path
// (`squad-plan-activate`); `plan-accepted` / `phases-accepted` come from the recommended
// `/squad activate` fast path (`squad-plan-accept`). Both paths create or recognize issues
// and apply labels the same way, so both carry the same mandatory `Activation bindings:`
// contract — see workflows/shared/squad-planning-ontology.md and the E4 preflight package A
// fast-path artifact-integrity fix.
const ACTIVATION_ARTIFACTS = new Set(['activated', 'phases-activated', 'plan-accepted', 'phases-accepted']);
const ACTIVATION_ARTIFACT_PATTERN = new RegExp(
  `"squad_artifact"\\s*:\\s*"?(?:${[...ACTIVATION_ARTIFACTS].join('|')})`,
  'i',
);
const VALID_OMISSIONS = new Set(['multi-owner', 'non-roster']);
const TEMPORARY_ID = /^#?aw_[A-Za-z0-9_]{3,12}$/i;
const RESOLVED_REFERENCE = /^#?(\d+)$/;

// Standalone certainty claims a label-operation report may never make: safe outputs like
// `add_labels` are applied in a post-agent job, so an activation/acceptance run only ever
// knows a call was *accepted for a specific target* — never that GitHub applied it. Word
// boundaries keep this from matching substrings ("unverified", "prechecked").
const FORBIDDEN_LABEL_CLAIM_WORDS = ['applied', 'received', 'landed', 'verified', 'confirmed', 'checked'];
// A clause is treated as a compliant, honest non-claim (never flagged) when it explicitly
// negates the outcome — e.g. "not verified", "never confirmed" — since that is the accurate,
// honest statement the contract requires, not an over-claim.
const NEGATION_NEARBY = /\b(never|not|no|n't|without|cannot|can't|won't|isn't|wasn't|doesn't|didn't|nor)\b/i;
// Scope the forbidden-word scan to clauses that are actually reporting a label operation —
// mentioning "label"/"labels" or a `squad:*` token — rather than scanning the whole comment.
// A blanket scan would false-positive on an unrelated quoted task title like "Verified Email
// Addresses" sitting in the created-issues table.
const LABEL_OPERATION_CONTEXT = /\blabels?\b|\bsquad:[a-z0-9_.-]+\b/i;
// Protects a `squad:{agent}` token's colon from being mistaken for a clause boundary while
// splitting a line into clauses. Requires each embedded `.` to be followed by another name
// character (e.g. `squad:kint.jones`), so a sentence-ending period right after an agent name
// (`squad:kint.`) is left alone as a real delimiter, not swallowed into the token.
const SQUAD_TOKEN = /\bsquad:([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)/gi;
// Placeholder standing in for a protected token's colon while clauses are split; chosen to
// never collide with real comment text.
const SQUAD_COLON_PLACEHOLDER = '\u0000';

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Resolve a binding issue reference to a real issue number.
 *
 * Activation writes these as quoted `#`-prefixed strings so gh-aw's temporary-ID
 * substitution — a plain text replacement that does not skip fenced code blocks and keeps
 * the `#` — yields valid JSON. A reference the runtime resolved arrives as `"#42"`; one it
 * could not resolve arrives verbatim as `"#aw_task3"`, which means that `create-issue`
 * never landed. Fail closed on the latter rather than skipping the binding. Bare integers
 * stay accepted so artifacts written before this contract still validate.
 */
function resolveIssueReference(value, description, invalidMessage) {
  if (Number.isInteger(value)) {
    if (value < 1) throw new Error(invalidMessage);
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (TEMPORARY_ID.test(trimmed)) {
      throw new Error(
        `${description} "${trimmed}" is an unresolved temporary ID — the referenced issue was never created`,
      );
    }
    const resolved = RESOLVED_REFERENCE.exec(trimmed);
    if (resolved && Number(resolved[1]) >= 1) return Number(resolved[1]);
  }
  throw new Error(invalidMessage);
}

/**
 * Best-effort issue number extraction for label prefetching. Unlike
 * `resolveIssueReference()`, this never throws: an unresolved/malformed
 * reference is simply skipped here so `validateTaskBinding()` can report the
 * real error (e.g. an unresolved temporary ID) instead of a misleading
 * "labels could not be resolved" failure.
 */
function extractIssueNumber(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const resolved = RESOLVED_REFERENCE.exec(value.trim());
    if (resolved) return Number(resolved[1]);
  }
  return undefined;
}

export function parseStructuredData(comment) {
  const blocks = [...comment.matchAll(/Structured data:\s*```json\s*([\s\S]*?)```/gi)];
  if (blocks.length === 0) {
    if (/Structured data:/i.test(comment) && ACTIVATION_ARTIFACT_PATTERN.test(comment)) {
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
  if (ACTIVATION_ARTIFACTS.has(parsed.squad_artifact)) {
    const bindingBlock = /Activation bindings:\s*```json\s*([\s\S]*?)```/i.exec(comment);
    if (!bindingBlock) return parsed;
    try {
      parsed.bindings = JSON.parse(bindingBlock[1]);
    } catch (error) {
      throw new Error(`activation bindings are invalid JSON: ${error.message}`);
    }
  }
  return parsed;
}

/**
 * Strip content a forbidden-word scan must never see as a claim: fenced/inline code and
 * quoted strings. A quoted work-item title ("Verified Email Addresses") or a JSON fragment
 * inside backticks is data being described, not a certainty claim about a label operation.
 */
function stripQuotedAndCode(line) {
  return line
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/'[^']*'/g, ' ');
}

/**
 * Split a line into clauses on clause/sentence-ending punctuation (`.`, `,`, `;`, `:`) so a
 * negation and a certainty claim are only ever treated as connected when they actually share
 * the same clause. Without this, "No issues were skipped: Label squad:kint was verified for
 * #42." would let the unrelated negation on "skipped" blanket-suppress the real, separate
 * claim that follows the colon — and a claim about a *different* subject sharing a line with
 * a label mention (e.g. "Reported squad:kint for issue #123, its verified real number") would
 * wrongly inherit label-operation context from a clause it isn't part of.
 *
 * `squad:{agent}` tokens are protected first so the colon inside them is never itself treated
 * as a clause boundary.
 */
function splitClauses(line) {
  const guarded = line.replace(SQUAD_TOKEN, (_match, agent) => `squad${SQUAD_COLON_PLACEHOLDER}${agent}`);
  return guarded
    .split(/[.,;:]+/)
    .map(clause => clause.replaceAll(SQUAD_COLON_PLACEHOLDER, ':'))
    .filter(clause => clause.trim().length > 0);
}

/**
 * Reject standalone certainty claims ("applied", "received", "landed", "verified",
 * "confirmed", "checked") in an activation/acceptance comment's label-operation reporting.
 * `add_labels` is a safe output applied in a post-agent job — the run only ever knows a call
 * was *accepted* for a target, never that GitHub actually applied it. A summary claiming more
 * than that is over-claiming an outcome nothing here observed.
 *
 * Deliberately scoped, not a blanket whole-comment or whole-line scan:
 *   - Markdown table rows (`| ... |`) are skipped — that's where quoted work-item titles live.
 *   - Fenced code blocks, inline code, and quoted strings are stripped before matching, so a
 *     quoted title or JSON fragment containing a forbidden word never counts.
 *   - Each line is split into clauses (see `splitClauses`), and label-operation context
 *     (`label`/`labels`/`squad:*`), the forbidden word, and any negation must all be found
 *     within the *same* clause. This is what lets a genuinely unrelated negation elsewhere on
 *     the line ("No issues were skipped: ... was verified ...") fail to suppress a real claim,
 *     while a forbidden word describing an unrelated subject in a different clause on the same
 *     line as a label mention ("Reported squad:kint for issue #123, its verified real number")
 *     is correctly out of scope — its clause carries no label-operation context at all.
 *   - A clause that explicitly negates the claim ("was not verified", "never confirmed") is
 *     the honest, compliant statement the contract requires, so it is never flagged.
 *
 * No-op for artifact types outside the activation contract (fast-path `plan-accepted` /
 * `phases-accepted` and granular `activated` / `phases-activated`).
 */
export function assertAcceptedOnlyLabelWording(commentBody, artifactType) {
  if (!ACTIVATION_ARTIFACTS.has(artifactType)) return { skipped: true };
  const body = typeof commentBody === 'string' ? commentBody : '';
  const withoutFences = body.replace(/```[\s\S]*?```/g, ' ');
  for (const rawLine of withoutFences.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('|')) continue;
    const scrubbed = stripQuotedAndCode(trimmed);
    for (const clause of splitClauses(scrubbed)) {
      if (!LABEL_OPERATION_CONTEXT.test(clause)) continue;
      if (NEGATION_NEARBY.test(clause)) continue;
      for (const word of FORBIDDEN_LABEL_CLAIM_WORDS) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(clause)) {
          throw new Error(
            `label-operation report uses forbidden certainty claim "${word}" — report label ` +
              `operations as accepted only, never applied/received/landed/verified/confirmed/` +
              `checked: "${trimmed}"`,
          );
        }
      }
    }
  }
  return { skipped: false };
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
  if (!binding || typeof binding !== 'object') {
    throw new Error('binding has no valid issue number');
  }
  const issue = resolveIssueReference(binding.issue, 'binding issue', 'binding has no valid issue number');
  const epicIssue = resolveIssueReference(
    binding.epic_issue,
    `issue #${issue}: epic_issue`,
    `issue #${issue}: missing epic issue linkage`,
  );
  if (!normalize(binding.task)) throw new Error(`issue #${issue}: binding has no plan task number`);
  if (!normalize(binding.epic)) throw new Error(`issue #${issue}: missing epic linkage`);
  const agent = normalize(binding.agent);
  if (!agent) throw new Error(`issue #${issue}: binding has no agent`);
  if (!Array.isArray(binding.epic_agents) || binding.epic_agents.length === 0) {
    throw new Error(`issue #${issue}: epic_agents must be a non-empty array`);
  }
  const epicAgents = [...new Set(binding.epic_agents.map(normalize).filter(Boolean))].sort();
  if (epicAgents.length !== binding.epic_agents.length || !epicAgents.includes(agent)) {
    throw new Error(`issue #${issue}: epic_agents are empty, duplicated, or exclude the task agent`);
  }
  const expected = expectedLabel(agent, roster);
  validateReportedOutcome({ ...binding, issue }, '', expected);
  return { issue, epicIssue, epicAgents, expected };
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
  for (const rawBinding of artifact.bindings) {
    const { issue, epicIssue, epicAgents, expected } = validateTaskBinding(rawBinding, roster);
    const binding = { ...rawBinding, issue, epic_issue: epicIssue };
    if (seen.has(issue)) throw new Error(`issue #${issue}: duplicate binding`);
    seen.add(issue);
    validateActualLabels(issue, labelsByIssue.get(issue), expected);

    const epicIdentifier = normalize(binding.epic);
    const priorEpicIssue = epicIssuesByIdentifier.get(epicIdentifier);
    if (priorEpicIssue !== undefined && priorEpicIssue !== epicIssue) {
      throw new Error(`epic ${epicIdentifier}: maps to multiple epic issue numbers`);
    }
    epicIssuesByIdentifier.set(epicIdentifier, epicIssue);

    const epic = epics.get(epicIssue) ?? {
      epic: epicIdentifier,
      agents: epicAgents,
      bindings: [],
    };
    if (epic.epic !== epicIdentifier) {
      throw new Error(`epic issue #${epicIssue}: conflicting epic identifiers`);
    }
    if (epic.agents.join('\0') !== epicAgents.join('\0')) {
      throw new Error(`epic issue #${epicIssue}: inconsistent epic_agents sets`);
    }
    epic.bindings.push(binding);
    epics.set(epicIssue, epic);
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
    assertAcceptedOnlyLabelWording(comment.body ?? '', artifact.squad_artifact);
    const issues = Array.isArray(artifact.bindings)
      ? artifact.bindings.flatMap(binding => [extractIssueNumber(binding?.issue), extractIssueNumber(binding?.epic_issue)]).filter(Number.isInteger)
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
