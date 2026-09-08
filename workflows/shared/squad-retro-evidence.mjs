import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  deriveActionTemporaryId,
  deriveActionTemporaryIds,
  extractActionKey,
  hasTrustedActionProvenance,
  isTrustedActionIssue,
  findNativeLinkedPullsSync,
  NATIVE_LINK_MAX_PAGES,
  parseRetroActionPullMarker,
  parseStructuredData,
  isTrustedRetroPull,
  parseDispatchMarker,
  pullLinksIssue,
} from './squad-retro-provenance.mjs';

export {
  deriveActionTemporaryId,
  deriveActionTemporaryIds,
  extractActionKey,
  hasTrustedActionProvenance,
  parseRetroActionPullMarker,
  parseStructuredData,
};

const BOT = 'github-actions[bot]';
const STATE_LABEL = 'squad-retro-state';
const STATE_TITLE = 'Squad retrospective state';
const ACTION_LABEL = 'squad-retro-action';
const FINGERPRINT = /^(?:fail|review):[0-9a-f]{16}$/;
const ABANDON_MARKER = /^Squad-Retro-Dispatch-Abandoned:\s*#(\d+)\s*$/m;
const DEFAULTS = Object.freeze({
  enabled: true,
  threshold: 2,
  windowHours: 168,
  cooldownHours: 72,
  autoImplementEnabled: false,
  autoImplementRetryHours: 48,
});
const LOG_MAX_BYTES = 262144;
const LOG_MAX_LINES = 2000;
const ERROR_LINE_MAX = 200;
const WEEKLY_INTERVAL_HOURS = 168;
export const FAILED_RUN_LIMIT = 100;
export const PULL_REQUEST_LIMIT = 50;
const ACTION_RUN_MAX_PAGES = 10;
const RUN_JOB_MAX_PAGES = 2;
const LOG_REQUESTS_PER_RUN = 1;
const STATE_MAX_PAGES = 20;
const PULL_MAX_PAGES = 10;
const REVIEW_MAX_PAGES = 3;
const FILE_MAX_PAGES = 3;
// Shared caches bound verification for both failed runs and rejected PRs.
export const SELF_PULL_VERIFICATION_LIMIT = 10;
export const SELF_PULL_FETCH_LIMIT = 10;
const API_REQUEST_CEILING =
  4 * STATE_MAX_PAGES +
  ACTION_RUN_MAX_PAGES +
  FAILED_RUN_LIMIT * (RUN_JOB_MAX_PAGES + LOG_REQUESTS_PER_RUN) +
  PULL_MAX_PAGES +
  PULL_REQUEST_LIMIT * (REVIEW_MAX_PAGES + FILE_MAX_PAGES) +
  SELF_PULL_VERIFICATION_LIMIT + SELF_PULL_FETCH_LIMIT;
// Reconciliation adds no requests unless ordinary auto-implementation is enabled.
export const ACTION_ISSUE_MAX_PAGES = 3;
export const ACTION_ISSUE_CANDIDATE_LIMIT = 20;
export const ACTION_ISSUE_COMMENT_MAX_PAGES = 2;
export const IMPLEMENT_PULL_MAX_PAGES = 5;
// One initial dispatch plus one retry, then a candidate is permanently
// excluded from further auto-dispatch — bounds the retry loop structurally
// instead of relying on the cooldown window alone.
export const AUTO_IMPLEMENT_MAX_ATTEMPTS = 2;
// Matches the `dispatch-workflow.max` configured for squad-implement-worker in
// workflows/squad-retro.md's frontmatter; keep both in sync.
export const AUTO_IMPLEMENT_MAX = 3;
export const AUTO_IMPLEMENT_API_REQUEST_CEILING =
  ACTION_ISSUE_MAX_PAGES +
  ACTION_ISSUE_CANDIDATE_LIMIT * ACTION_ISSUE_COMMENT_MAX_PAGES +
  IMPLEMENT_PULL_MAX_PAGES +
  ACTION_ISSUE_CANDIDATE_LIMIT * NATIVE_LINK_MAX_PAGES;
const ORIGIN_KIND = Object.freeze({
  'squad-review': 'review',
  'squad-implement': 'fail',
});

function boundedInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function resolveRetroConfig(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('.squad/config.json must contain a JSON object.');
  }
  const mode = raw.squadRetro;
  if (mode !== undefined && mode !== 'allow' && mode !== 'deny') {
    throw new Error('squadRetro must be "allow" or "deny".');
  }
  // Opt-in, defaults OFF: unlike `squadRetro` (default allow, deny to opt out),
  // this new dispatch capability must default disabled and requires an
  // explicit "allow" to enable, preserving today's no-auto-dispatch behavior
  // for every existing installation.
  const autoImplementMode = raw.squadRetroAutoImplement;
  if (autoImplementMode !== undefined && autoImplementMode !== 'allow' && autoImplementMode !== 'deny') {
    throw new Error('squadRetroAutoImplement must be "allow" or "deny".');
  }
  return {
    enabled: mode !== 'deny',
    autoImplementEnabled: autoImplementMode === 'allow',
    autoImplementRetryHours: boundedInteger(
      raw.squadRetroAutoImplementRetryHours,
      DEFAULTS.autoImplementRetryHours,
      1,
      720,
      'squadRetroAutoImplementRetryHours',
    ),
    threshold: boundedInteger(
      raw.squadRetroEarlyThreshold,
      DEFAULTS.threshold,
      2,
      20,
      'squadRetroEarlyThreshold',
    ),
    windowHours: boundedInteger(
      raw.squadRetroWindowHours,
      DEFAULTS.windowHours,
      1,
      8760,
      'squadRetroWindowHours',
    ),
    cooldownHours: boundedInteger(
      raw.squadRetroCooldownHours,
      DEFAULTS.cooldownHours,
      0,
      8760,
      'squadRetroCooldownHours',
    ),
  };
}

export function normalizeSignature(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/g, '<time>')
    .replace(/(?:[a-z]:)?[\\/](?:tmp|temp)[\\/][^\s:]+/g, '<temp>')
    .replace(/\b[0-9a-f]{7,40}\b/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function evidenceFingerprint(kind, value) {
  if (kind !== 'fail' && kind !== 'review') {
    throw new Error(`Unsupported evidence kind: ${kind}`);
  }
  return `${kind}:${createHash('sha256')
    .update(normalizeSignature(value))
    .digest('hex')
    .slice(0, 16)}`;
}

function labelsOf(issue) {
  return (issue?.labels || []).map(label =>
    typeof label === 'string' ? label : String(label?.name || ''));
}

function trustedStateCandidates(issues) {
  return issues.filter(issue =>
    issue.author === BOT &&
    issue.state === 'open' &&
    !issue.pull_request &&
    (labelsOf(issue).includes(STATE_LABEL) || issue.title === STATE_TITLE))
    .sort((left, right) =>
      Number(labelsOf(right).includes(STATE_LABEL)) -
      Number(labelsOf(left).includes(STATE_LABEL)) ||
      left.number - right.number);
}

function isRetroIssue(issue) {
  return labelsOf(issue).some(label =>
    label === 'squad-retro' ||
    label === 'squad-retro-state' ||
    label === 'squad-retro-action');
}

/**
 * Permanent, structural dedup. Any squad-implement-worker pull request linked
 * to this issue -- OPEN (a dispatch is already in flight), MERGED (the fix
 * shipped), or CLOSED-UNMERGED (a human deliberately rejected or abandoned
 * it) -- permanently excludes the issue from further auto-dispatch. The
 * closed-unmerged case is the important one: re-dispatching it would relitigate
 * a human decision automatically, so this workflow reports that state and
 * leaves the action issue under human management instead.
 */
function implementPullStatus(pulls, issueNumber, repository, nativeLinkedPulls) {
  let open = false;
  let merged = false;
  let closed = false;
  for (const pull of pulls || []) {
    if (!pullLinksIssue(pull, issueNumber, repository)) continue;
    if (pull.state === 'open') open = true;
    if (pull.merged || pull.merged_at) merged = true;
    else if (pull.state === 'closed') closed = true;
  }
  // Native links (the PR "Development" sidebar) can attach a human PR to
  // this issue with no closing-keyword text at all -- `pullLinksIssue` never
  // matches these entries, so they are already confirmed for this specific
  // issue number and always count, regardless of state.
  for (const pull of nativeLinkedPulls || []) {
    if (pull.state === 'open') open = true;
    if (pull.merged) merged = true;
    else if (pull.state === 'closed') closed = true;
  }
  return {
    open,
    merged,
    closed,
    linked: open || merged || closed,
    state: merged ? 'merged' : open ? 'open' : closed ? 'closed-unmerged' : null,
  };
}

/**
 * Trusted provenance for an auto-dispatch candidate. A `squad-retro-action`
 * label is NOT provenance: any human (or any workflow with `issues: write`)
 * can apply a label to an issue they wrote. The full rule lives in
 * `shared/squad-retro-provenance.mjs` (`hasTrustedActionProvenance`), which
 * both this gate and the two output-boundary guards share so that the agent
 * job and the privileged safe-outputs job cannot disagree about what counts.
 */

/**
 * Derive the bounded, durable set of `squad-retro-action` issues eligible for
 * opt-in auto-dispatch to squad-implement-worker.
 *
 * Authority is the live action issue itself, never a cache: state, labels, and
 * provenance come from a fresh issue fetch, and prior-dispatch history comes
 * from `Squad-Retro-Dispatch:` marker comments authored by this bot on that
 * same issue (`collectLiveInput` maps `actionIssues[].comments` from the
 * GitHub API, never from agent-authored issue/comment text). An issue is
 * eligible only when ALL of:
 *   - open, labeled `squad-retro-action`, and NOT labeled `squad-retro-proposal`
 *     (governance/`.squad/**`/`.github/**` proposals stay human-review-only —
 *     ordinary source/docs/regression fixes only);
 *   - it carries trusted retrospective provenance (see
 *     `hasTrustedActionProvenance`) — a labeled human-authored issue never
 *     qualifies;
 *   - no squad-implement-worker PR exists for it in ANY state;
 *   - fewer than `AUTO_IMPLEMENT_MAX_ATTEMPTS` prior dispatch markers exist;
 *   - either no prior dispatch marker exists, or the latest one is older than
 *     `retryHours` (durable retry, not an unbounded loop).
 *
 * Returns `{ eligible, exhausted, suppressed }`: `exhausted` names the issues
 * that used up the bounded retry budget with no pull request to show for it,
 * and `suppressed` names the issues already carrying a linked implement pull
 * request, with its state, so the report can hand them to a human once
 * instead of dropping either group silently.
 */
export function deriveAutoImplementCandidates({
  actionIssues = [],
  implementPulls = [],
  now,
  retryHours,
  max = AUTO_IMPLEMENT_MAX,
  repository,
  nativeLinkedPullsByIssue = new Map(),
} = {}) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('deriveAutoImplementCandidates: now must be an ISO-8601 timestamp.');
  const eligible = [];
  const exhausted = [];
  const suppressed = [];
  for (const issue of actionIssues) {
    if (!isTrustedActionIssue(issue) || issue.comments_truncated) continue;
    const status = implementPullStatus(implementPulls, issue.number, repository, nativeLinkedPullsByIssue.get(issue.number));
    if (status.linked) {
      // A human already owns this action's implementation. Report it; never
      // reopen, re-dispatch, or race it.
      suppressed.push({ issue_number: issue.number, pull_state: status.state });
      continue;
    }
    const botComments = (issue.comments || [])
      .filter(comment => comment.author === BOT || comment?.user?.login === BOT);
    const receipts = botComments.map(comment => parseDispatchMarker(comment, issue.number)).filter(Boolean);
    const markers = [...new Map(receipts.map(marker =>
      [marker.run_id || String(marker.at), marker.at])).values()].sort((left, right) => left - right);
    const latestMarker = markers.at(-1);
    // Do not abandon the second attempt while its worker may still be running.
    if (latestMarker !== undefined && (nowMs - latestMarker) / 3600000 < retryHours) continue;
    if (markers.length >= AUTO_IMPLEMENT_MAX_ATTEMPTS) {
      // The retry budget is spent and nothing shipped. Surfacing it once (the
      // caller posts a single durable `Squad-Retro-Dispatch-Abandoned:` note)
      // converts a silent permanent drop into a visible human handoff.
      const announced = botComments.some(comment =>
        ABANDON_MARKER.test(String(comment.body || '')) &&
        Number(ABANDON_MARKER.exec(String(comment.body || ''))[1]) === issue.number);
      if (!announced) exhausted.push({ issue_number: issue.number, attempts: markers.length });
      continue;
    }
    eligible.push({
      issue_number: issue.number,
      retry: latestMarker !== undefined,
      action_key: extractActionKey(issue.body),
    });
  }
  const bounded = Math.min(AUTO_IMPLEMENT_MAX, Math.max(0, max));
  const byNumber = (left, right) => left.issue_number - right.issue_number;
  return {
    eligible: eligible.sort(byNumber).slice(0, bounded),
    exhausted: exhausted.sort(byNumber).slice(0, bounded),
    suppressed: suppressed.sort(byNumber).slice(0, bounded),
  };
}

function newest(records) {
  return [...records].sort((left, right) =>
    String(left.created_at || '').localeCompare(String(right.created_at || ''))).at(-1);
}

function validArtifact(comment, kinds) {
  if (comment?.author !== BOT && comment?.user?.login !== BOT) return null;
  const data = parseStructuredData(comment.body);
  if (!data || data.schema_version !== '1' || !kinds.includes(data.squad_artifact)) {
    return null;
  }
  return data;
}

function groupEvidence(evidence, threshold) {
  const groups = new Map();
  for (const item of evidence) {
    const current = groups.get(item.fingerprint) || {
      fingerprint: item.fingerprint,
      kind: item.kind,
      attempts: new Set(),
      evidence: [],
    };
    current.attempts.add(item.attempt);
    current.evidence.push(item);
    groups.set(item.fingerprint, current);
  }
  return [...groups.values()]
    .map(group => {
      const lowConfidence = group.evidence.some(item => item.low_confidence === true);
      return {
        fingerprint: group.fingerprint,
        kind: group.kind,
        attempt_count: group.attempts.size,
        evidence: group.evidence,
        low_confidence: lowConfidence,
        latest_occurrence: group.evidence
          .map(item => String(item.occurred_at || ''))
          .sort()
          .at(-1) || '',
        qualifies: group.attempts.size >= threshold && !lowConfidence,
      };
    })
    .sort((left, right) =>
      right.attempt_count - left.attempt_count ||
      left.fingerprint.localeCompare(right.fingerprint));
}

function newestGroup(groups) {
  return [...groups].sort((left, right) =>
    String(left.latest_occurrence).localeCompare(String(right.latest_occurrence)) ||
    right.fingerprint.localeCompare(left.fingerprint)).at(-1) || null;
}

export function deriveRequestGroup(groups, origin) {
  if (groups.length === 0) return null;
  const key = String(origin || '');
  const wantedKind = Object.hasOwn(ORIGIN_KIND, key) ? ORIGIN_KIND[key] : null;
  const kindMatches = wantedKind
    ? groups.filter(group => group.kind === wantedKind)
    : [];
  const candidates = kindMatches.length > 0 ? kindMatches : groups;
  const qualifying = candidates.filter(group => group.qualifies);
  if (qualifying.length > 0) return qualifying[0];
  const confident = candidates.filter(group => !group.low_confidence);
  return newestGroup(confident.length > 0 ? confident : candidates);
}

export function evaluateRetro(input) {
  const now = new Date(input.now || new Date().toISOString());
  if (!Number.isFinite(now.getTime())) throw new Error('now must be an ISO-8601 timestamp.');
  const config = resolveRetroConfig(input.config || {});
  const cutoff = new Date(now.getTime() - config.windowHours * 60 * 60 * 1000);
  const stateCandidates = trustedStateCandidates(input.stateIssues || []);
  const stateIssue = stateCandidates[0] || null;

  if (!config.enabled) {
    return { action: 'noop', reason: 'disabled-by-config', config };
  }
  if (!stateIssue) {
    return {
      action: 'initialize_state',
      reason: 'trusted-state-issue-missing',
      config,
      duplicate_state_issues: 0,
    };
  }
  if (!labelsOf(stateIssue).includes(STATE_LABEL)) {
    return {
      action: 'repair_state_label',
      reason: 'trusted-state-issue-unlabeled',
      config,
      state_issue: stateIssue.number,
      missing_label: STATE_LABEL,
      duplicate_state_issues: Math.max(0, stateCandidates.length - 1),
    };
  }

  const comments = input.stateComments || [];
  let malformedRecords = 0;
  const states = [];
  const requests = [];
  for (const comment of comments) {
    if (comment.author !== BOT && comment?.user?.login !== BOT) continue;
    const data = parseStructuredData(comment.body);
    if (data === undefined) { malformedRecords++; continue; }
    if (data === null) continue;
    if (data.schema_version !== '1') {
      malformedRecords++;
      continue;
    }
    if (data.squad_artifact === 'retro-state') states.push({ ...comment, data });
    else if (data.squad_artifact === 'retro-request' && FINGERPRINT.test(data.fingerprint)) {
      requests.push({ ...comment, data });
    } else if (data.squad_artifact === 'retro-report' &&
        (data.fingerprint === null || FINGERPRINT.test(data.fingerprint))) {
      // Reports are an audit ledger only. A fingerprint is resolved exclusively
      // by the final state checkpoint after all idempotent action handling.
    } else {
      malformedRecords++;
    }
  }

  const currentState = newest(states);
  const completedAt = Date.parse(currentState?.data?.completed_at || '');
  const hasLastFullCompletedAt = Object.hasOwn(
    currentState?.data || {},
    'last_full_completed_at',
  );
  const lastFullCompletedAt = Date.parse(
    hasLastFullCompletedAt
      ? currentState?.data?.last_full_completed_at || ''
      : currentState?.data?.completed_at || '',
  );
  const stateResolved = new Set(
    (currentState?.data?.resolved_fingerprints || []).filter(value => FINGERPRINT.test(value)),
  );
  const resolved = new Set(stateResolved);
  const resolutionTimes = new Map();
  if (Number.isFinite(completedAt)) {
    for (const fingerprint of stateResolved) {
      resolutionTimes.set(
        fingerprint,
        Math.max(resolutionTimes.get(fingerprint) || 0, completedAt),
      );
    }
  }
  const statePending = new Set(
    (currentState?.data?.pending_fingerprints || []).filter(value => FINGERPRINT.test(value)),
  );
  const stateRetroId = /^\d+$/.test(String(currentState?.data?.retro_id || ''))
    ? BigInt(currentState.data.retro_id)
    : null;
  const pending = new Set(statePending);
  for (const request of requests) {
    const fingerprint = request.data.fingerprint;
    if (statePending.has(fingerprint)) {
      pending.add(fingerprint);
      continue;
    }
    const requestRetroId = /^\d+$/.test(String(request.data.retro_id || ''))
      ? BigInt(request.data.retro_id)
      : null;
    const afterStateCheckpoint = stateRetroId === null ||
      requestRetroId === null ||
      requestRetroId > stateRetroId;
    const requestedAt = Date.parse(request.created_at || '');
    const resolvedAt = resolutionTimes.get(fingerprint) || 0;
    if (afterStateCheckpoint && Number.isFinite(requestedAt) && requestedAt > resolvedAt) {
      pending.add(fingerprint);
    }
  }

  const workflowEvidence = (input.workflowRuns || [])
    .filter(run =>
      new Date(run.created_at) >= cutoff &&
      run.conclusion === 'failure' &&
      run.workflow_name !== 'Squad Retro' &&
      !run.self_retro)
    .map(run => {
      const signature = `${run.workflow_name}|${run.job_name}|${run.error_line}`;
      const lowConfidence = run.error_confidence === 'low' || run.low_confidence === true;
      return {
        kind: 'fail',
        fingerprint: evidenceFingerprint('fail', signature),
        attempt: `run:${run.id}`,
        url: run.html_url,
        occurred_at: run.created_at,
        low_confidence: lowConfidence,
        source: {
          workflow: run.workflow_name,
          job: run.job_name,
          error: run.error_line,
          error_confidence: lowConfidence ? 'low' : 'error-line',
          run_id: run.id,
          run_attempt: run.run_attempt,
          head_sha: run.head_sha,
          issue_number: run.issue_number,
        },
      };
    });

  const reviewEvidence = (input.reviews || [])
    .filter(review =>
      new Date(review.submitted_at) >= cutoff &&
      review.state === 'CHANGES_REQUESTED' &&
      !review.self_retro)
    .map(review => {
      const signature = `${review.theme || 'changes requested'}|${review.path_prefix || '<root>'}`;
      return {
        kind: 'review',
        fingerprint: evidenceFingerprint('review', signature),
        attempt: `pr:${review.pr_number}:${review.head_sha}`,
        url: review.html_url,
        occurred_at: review.submitted_at,
        low_confidence: review.low_confidence === true,
        source: {
          pr_number: review.pr_number,
          head_sha: review.head_sha,
          theme: review.theme,
          path_prefix: review.path_prefix,
        },
      };
    });

  const evidence = [...workflowEvidence, ...reviewEvidence];
  const groups = groupEvidence(evidence, config.threshold);
  const isUnresolvedOrRecurring = group => {
    if (!resolved.has(group.fingerprint)) return true;
    const resolvedAt = resolutionTimes.get(group.fingerprint);
    return Number.isFinite(resolvedAt) && Date.parse(group.latest_occurrence) > resolvedAt;
  };
  const requestedReason = String(input.incoming?.reason || '').trim();
  const requestOrigin = String(input.incoming?.origin || '').trim();
  const explicitFingerprint = FINGERPRINT.test(input.incoming?.fingerprint || '')
    ? input.incoming.fingerprint
    : null;
  const manualRequest = requestedReason === 'manual' || requestOrigin === 'manual';
  const wantsDerivedRequest = !explicitFingerprint &&
    !manualRequest &&
    (requestedReason !== '' || requestOrigin !== '');
  const derivedGroup = wantsDerivedRequest ? deriveRequestGroup(groups, requestOrigin) : null;
  const incomingFingerprint = explicitFingerprint || derivedGroup?.fingerprint || null;
  const incomingGroup = incomingFingerprint
    ? groups.find(group => group.fingerprint === incomingFingerprint) || null
    : null;
  const isNewRecurrence = Boolean(
    incomingGroup &&
    resolved.has(incomingFingerprint) &&
    isUnresolvedOrRecurring(incomingGroup),
  );
  const alreadyPending = incomingFingerprint
    ? pending.has(incomingFingerprint) ||
      (resolved.has(incomingFingerprint) && !isNewRecurrence)
    : false;
  const incomingRequest = incomingFingerprint ? {
    fingerprint: incomingFingerprint,
    origin: requestOrigin || 'unknown',
    reason: requestedReason || 'early-evidence',
    derived: !explicitFingerprint,
    already_pending: alreadyPending,
    recurrence: isNewRecurrence,
    latest_occurrence: incomingGroup?.latest_occurrence || null,
  } : null;
  if (incomingFingerprint && !alreadyPending) {
    pending.add(incomingFingerprint);
  }

  const startedAt = Date.parse(currentState?.data?.started_at || '');
  const legacyInFlight = currentState?.data?.status === 'IN_FLIGHT' &&
    Number.isFinite(startedAt) &&
    now.getTime() - startedAt < 6 * 60 * 60 * 1000;
  const cooldownActive = Number.isFinite(completedAt) &&
    now.getTime() - completedAt < config.cooldownHours * 60 * 60 * 1000;
  const weeklyDue = !Number.isFinite(lastFullCompletedAt) ||
    now.getTime() - lastFullCompletedAt >= WEEKLY_INTERVAL_HOURS * 60 * 60 * 1000;
  const triggerPath = requestedReason ||
    (input.eventName === 'workflow_dispatch' ? 'manual' : weeklyDue ? 'scheduled' : 'drain');
  const fullReport = triggerPath === 'manual' || triggerPath === 'scheduled';
  const qualifying = groups.filter(group =>
    group.qualifies && (fullReport || isUnresolvedOrRecurring(group)));
  const observedFingerprints = new Set(groups.map(group => group.fingerprint));
  const pendingFingerprints = [...pending].sort();
  const collection = input.collection && typeof input.collection === 'object'
    ? input.collection
    : null;
  const stateLedgerIncomplete = Boolean(collection?.state_comments_truncated);
  const evidenceTruncated = Boolean(
    collection?.failed_runs_truncated || collection?.pull_requests_truncated,
  );
  const unobservedPending = pendingFingerprints.filter(fingerprint =>
    fingerprint !== incomingFingerprint && !observedFingerprints.has(fingerprint));
  const truncationPreserved = unobservedPending.filter(fingerprint =>
    fingerprint.startsWith('fail:')
      ? collection?.failed_runs_truncated
      : collection?.pull_requests_truncated);
  const expiredPending = unobservedPending.filter(fingerprint =>
    !truncationPreserved.includes(fingerprint));
  const activePending = pendingFingerprints.filter(fingerprint => !expiredPending.includes(fingerprint));

  // Fail closed on a truncated collection: an incomplete action-issue or
  // implement-pull scan cannot prove "no existing PR", so a false negative
  // there would duplicate-dispatch. Absence of proof is not proof of absence.
  const autoImplementCollectionComplete =
    !collection?.action_issues_truncated &&
    !collection?.implement_pulls_truncated &&
    !collection?.native_links_truncated;
  const nativeLinkedPullsByIssue = nativeLinkedPullMap(input.nativeLinkedPullsByIssue);
  const autoImplement = config.autoImplementEnabled && autoImplementCollectionComplete
  ? deriveAutoImplementCandidates({
      actionIssues: input.actionIssues || [],
      implementPulls: input.implementPulls || [],
      now: now.toISOString(),
      retryHours: config.autoImplementRetryHours,
      max: AUTO_IMPLEMENT_MAX,
      repository: input.repository || '',
      nativeLinkedPullsByIssue,
    })
    : { eligible: [], exhausted: [], suppressed: [] };
  const autoImplementCandidates = autoImplement.eligible;
  const autoImplementExhausted = autoImplement.exhausted;
  const autoImplementSuppressed = autoImplement.suppressed;
  // Reconciliation is periodic maintenance, not reporting: it exists precisely
  // for the runs where no report is due. The six-hourly schedule therefore has
  // to reach it even when the cooldown suppresses a report or the window holds
  // no new evidence at all.
  const hasReconcileWork =
    autoImplementCandidates.length + autoImplementExhausted.length > 0;

  const actionMatches = (input.allActionIssues || input.actionIssues || [])
    .filter(hasTrustedActionProvenance)
    .map(issue => ({ issue_number: issue.number, action_key: extractActionKey(issue.body), state: issue.state }));
  const newActionIds = config.autoImplementEnabled && autoImplementCollectionComplete
    ? deriveActionTemporaryIds(qualifying.map(group => group.fingerprint)
      .filter(key => !actionMatches.some(match => match.action_key === key)))
    : [];
  const base = {
    now: now.toISOString(),
    repository: input.repository || '',
    run_id: input.run_id || '',
    config,
    state_issue: stateIssue.number,
    duplicate_state_issues: Math.max(0, stateCandidates.length - 1),
    malformed_records: malformedRecords,
    reason: triggerPath,
    trigger_path: triggerPath,
    weekly_interval_hours: WEEKLY_INTERVAL_HOURS,
    collection,
    evidence_truncated: evidenceTruncated,
    evidence_count: evidence.length,
    evidence_groups: groups,
    qualifying_groups: qualifying,
    primary_fingerprint: qualifying[0]?.fingerprint ||
      (fullReport ? groups[0]?.fingerprint : null) || null,
    pending_fingerprints: activePending,
    expired_pending_fingerprints: expiredPending,
    truncation_preserved_fingerprints: truncationPreserved,
    resolved_fingerprints: [...resolved].sort(),
    incoming_request: incomingRequest,
    state_ledger_incomplete: stateLedgerIncomplete,
    stale_in_flight_recovered: currentState?.data?.status === 'IN_FLIGHT' && !legacyInFlight,
    state_completed_at: Number.isFinite(completedAt)
      ? new Date(completedAt).toISOString()
      : null,
    state_last_full_completed_at: Number.isFinite(lastFullCompletedAt)
      ? new Date(lastFullCompletedAt).toISOString()
      : null,
    // Only the `run`, `housekeep`, and `reconcile` outcomes below ever
    // populate these with a non-empty list — every other outcome (noop,
    // suppress, repair, init) returns via `...base` without overriding them,
    // so dispatch is structurally impossible outside those three paths
    // regardless of prompt wording. The safe-outputs guard enforces the same
    // boundary again from the trusted checkout, where the agent cannot reach.
    auto_implement_candidates: [],
    auto_implement_exhausted: [],
    // Reported on every outcome: naming the action issues a human already
    // owns costs nothing and never authorizes a mutation.
    auto_implement_suppressed: autoImplementSuppressed,
    // Deterministic temporary id per qualifying fingerprint, so a NEW action
    // issue can be created, marked, and dispatched inside this same run. The
    // id is derived from the fingerprint alone, which is what lets the output
    // guard recompute it from the created issue's own `Action-Key:` line
    // instead of trusting the agent's claim.
    auto_implement_new_action_ids: [],
    action_scan_complete: autoImplementCollectionComplete,
    action_matches: actionMatches,
  };

  if (stateLedgerIncomplete) {
    return {
      ...base,
      action: hasReconcileWork ? 'reconcile' : 'noop',
      reason: 'state-ledger-incomplete',
      diagnostic: 'Retrospective state comments exceeded the bounded checkpoint-tail pagination limit.',
      auto_implement_candidates: autoImplementCandidates,
      auto_implement_exhausted: autoImplementExhausted,
    };
  }
  if (legacyInFlight) {
    return { ...base, action: 'suppress', reason: 'trusted-state-is-in-flight' };
  }
  if (cooldownActive && triggerPath !== 'manual') {
    // Cooldown governs REPORTING. Handoff reconciliation is independent
    // maintenance on the six-hourly schedule, so it still runs — while the
    // cooldown's actual job (no report, no state checkpoint, no cleared
    // pending requests, incoming requests still durably recorded) is
    // unchanged. `reconcile` is `suppress` plus that reconciliation.
    if (hasReconcileWork) {
      return {
        ...base,
        action: 'reconcile',
        reason: 'cooldown-active',
        report_suppressed: true,
        auto_implement_candidates: autoImplementCandidates,
        auto_implement_exhausted: autoImplementExhausted,
      };
    }
    return { ...base, action: 'suppress', reason: 'cooldown-active' };
  }

  const shouldRun = fullReport ? evidence.length > 0 : qualifying.length > 0;
  if (!shouldRun) {
    if (expiredPending.length > 0) {
      return {
        ...base,
        action: 'housekeep',
        reason: 'expired-pending-requests',
        auto_implement_candidates: autoImplementCandidates,
        auto_implement_exhausted: autoImplementExhausted,
      };
    }
    const reason = evidence.length === 0 ? 'no-evidence-in-window' : 'early-threshold-not-met';
    if (hasReconcileWork) {
      // Zero new evidence says nothing about whether an already-open action
      // issue still needs dispatching or retrying, so this path reconciles
      // rather than exiting silently.
      return {
        ...base,
        action: 'reconcile',
        reason,
        report_suppressed: true,
        auto_implement_candidates: autoImplementCandidates,
        auto_implement_exhausted: autoImplementExhausted,
      };
    }
    return { ...base, action: 'noop', reason };
  }
  return {
    ...base,
    action: 'run',
    auto_implement_candidates: autoImplementCandidates,
    auto_implement_exhausted: autoImplementExhausted,
    auto_implement_new_action_ids: newActionIds,
  };
}

function ghJson(route, fields = {}) {
  const args = ['api', '--method', 'GET', route];
  for (const [key, value] of Object.entries(fields)) {
    args.push('-f', `${key}=${value}`);
  }
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function ghGraphql(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) continue;
    args.push(Number.isInteger(value) ? '-F' : '-f', `${key}=${value}`);
  }
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function nativeLinkedPullEntries(value) {
  if (value instanceof Map) {
    return [...value.entries()].map(([issueNumber, pulls]) => ({
      issue_number: Number(issueNumber),
      pulls: Array.isArray(pulls) ? pulls : [],
    }));
  }
  if (Array.isArray(value)) {
    return value.flatMap(entry => {
      if (Array.isArray(entry)) {
        const issueNumber = Number(entry[0]);
        return Number.isInteger(issueNumber) ? [{ issue_number: issueNumber, pulls: Array.isArray(entry[1]) ? entry[1] : [] }] : [];
      }
      const issueNumber = Number(entry?.issue_number ?? entry?.issueNumber);
      return Number.isInteger(issueNumber) ? [{ issue_number: issueNumber, pulls: Array.isArray(entry?.pulls) ? entry.pulls : [] }] : [];
    });
  }
  return [];
}

function nativeLinkedPullMap(value) {
  return new Map(nativeLinkedPullEntries(value).map(entry => [entry.issue_number, entry.pulls]));
}

function paginated(route, fields, select, maxPages = STATE_MAX_PAGES, fetchJson = ghJson) {
  const values = [];
  for (let page = 1; page <= maxPages; page++) {
    const response = fetchJson(route, { ...fields, per_page: 100, page });
    const batch = select(response);
    values.push(...batch);
    if (batch.length < 100) return { values, truncated: false };
  }
  // A full final page cannot prove exhaustion; do not spend an extra API request.
  return { values, truncated: true };
}

export function collectStateIssues(repository, fetchPage = fields =>
  ghJson(`repos/${repository}/issues`, fields)) {
  const scan = fields => {
    const issues = [];
    for (let page = 1; page <= STATE_MAX_PAGES; page++) {
      const batch = fetchPage({
        state: 'open',
        creator: BOT,
        sort: 'created',
        direction: 'asc',
        ...fields,
        per_page: 100,
        page,
      });
      issues.push(...batch.filter(issue => !issue.pull_request).map(issue => ({
        number: issue.number,
        author: issue.user?.login,
        state: issue.state,
        title: issue.title,
        labels: issue.labels,
      })));
      if (batch.length < 100) return issues;
    }
    // An incomplete title scan cannot prove that initialization is safe.
    throw new Error('Retrospective state issue discovery exceeded its pagination limit.');
  };
  const labeled = scan({ labels: STATE_LABEL });
  if (trustedStateCandidates(labeled).some(issue => labelsOf(issue).includes(STATE_LABEL))) {
    return labeled;
  }
  return [...labeled, ...scan({})];
}

export function collectRecentPages(fetchPage, {
  cutoff,
  maxPages,
  maxItems,
  occurredAt,
  accept = () => true,
}) {
  const cutoffTime = Date.parse(cutoff);
  if (!Number.isFinite(cutoffTime)) throw new Error('cutoff must be an ISO-8601 timestamp.');
  const values = [];
  let reachedCutoff = false;
  let reachedEnd = false;
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const batch = fetchPage(page);
    if (!Array.isArray(batch)) throw new Error('paginated response must be an array.');
    for (let index = 0; index < batch.length; index++) {
      const item = batch[index];
      const timestamp = Date.parse(occurredAt(item));
      if (!Number.isFinite(timestamp) || timestamp < cutoffTime) {
        reachedCutoff = true;
        break;
      }
      if (!accept(item)) continue;
      values.push(item);
      if (values.length >= maxItems) {
        truncated = index < batch.length - 1 || batch.length === 100;
        break;
      }
    }
    if (reachedCutoff || truncated) break;
    if (batch.length < 100) {
      reachedEnd = true;
      break;
    }
  }
  if (!reachedCutoff && !reachedEnd && !truncated) truncated = true;
  return { values, truncated, reached_cutoff: reachedCutoff };
}

function recentPaginated(route, fields, select, options, fetchJson = ghJson) {
  return collectRecentPages(
    page => {
      const response = fetchJson(route, { ...fields, per_page: 100, page });
      return select(response);
    },
    options,
  );
}

export function extractErrorLine(logText) {
  const text = String(logText || '');
  if (!text || text.includes('\u0000')) return null;
  const lines = text
    .split(/\r?\n/)
    .slice(0, LOG_MAX_LINES)
    .map(line => line
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s+/, '')
      .trim())
    .filter(Boolean);
  const genericRunnerExit = line =>
    /^(?:error:\s*)?(?:process completed with exit code \d+|the process .+ failed with exit code \d+|(?:bash|pwsh|powershell|cmd) exited with code \d+)\.?$/i
      .test(line);
  const zeroFailureSummary = line => {
    if (/\b(?:expected|actual|but|got)\b/i.test(line)) return false;
    const labeledCounts = [...line.matchAll(
      /\b(?:fail(?:ed|ures?)?|errors?)\s*[:=]\s*(\d+)\b/gi,
    )].map(match => Number(match[1]));
    if (labeledCounts.length > 0 && labeledCounts.every(count => count === 0)) return true;
    return (
      /^(?:\[[^\]]+\]\s*)?(?:build succeeded\.?\s*)?(?:\d+\s+warning\(s\)\s*)?0\s+(?:error|failure)\(s\)\.?$/i.test(line) ||
      /^#\s*fail\s+0\b/i.test(line) ||
      /\bfound\s+0\s+errors?\b/i.test(line) ||
      /^(?:\[[^\]]+\]\s*)?0\s+errors?(?:\s*,\s*0\s+warnings?)?\.?$/i.test(line) ||
      /\b0\s+(?:failed|errors?\s+found)\b/i.test(line)
    );
  };
  const annotated = lines
    .map(line => line.match(/##\[error\]\s*(.*)$/i)?.[1]?.trim())
    .find(line => line && !genericRunnerExit(line) && !zeroFailureSummary(line));
  const chosen = annotated ||
    lines
      .map(line => line.replace(/^##\[error\]\s*/i, ''))
      .find(line =>
        !genericRunnerExit(line) &&
        !zeroFailureSummary(line) &&
        /(?:^not ok\b|(?:^|[^a-z])(?:error|exception|assertion|fail|failure|fatal|traceback|npm err!)[a-z]*(?:\b|$))/i
          .test(line));
  return chosen ? chosen.slice(0, ERROR_LINE_MAX) : null;
}

function isBinary(buffer) {
  const head = buffer.subarray(0, 1024);
  if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return true;
  return head.includes(0);
}

function ghJobLog(repository, jobId) {
  return execFileSync(
    'gh',
    ['api', '-H', 'Accept: application/vnd.github+json', `repos/${repository}/actions/jobs/${jobId}/logs`],
    { encoding: 'buffer', maxBuffer: LOG_MAX_BYTES * 8, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function jobLogExcerpt(repository, jobId, fetchLog) {
  let buffer;
  let truncated = false;
  try {
    buffer = fetchLog(repository, jobId);
  } catch (error) {
    buffer = Buffer.isBuffer(error?.stdout) ? error.stdout : null;
    truncated = true;
  }
  if (!buffer || buffer.length === 0 || isBinary(buffer)) {
    return { text: null, truncated: true };
  }
  const text = buffer.subarray(0, LOG_MAX_BYTES).toString('utf8');
  return {
    text,
    truncated: truncated || buffer.length > LOG_MAX_BYTES ||
      text.split(/\r?\n/).length > LOG_MAX_LINES,
  };
}

function firstFailure(jobs, repository, fetchLog) {
  const failedJobs = jobs.filter(job => job.conclusion === 'failure');
  const additionalFailuresUninspected = failedJobs.length > 1;
  for (const job of failedJobs) {
    const jobName = String(job.name || 'unknown job');
    const step = (job.steps || []).find(candidate => candidate.conclusion === 'failure');
    const log = job.id
      ? jobLogExcerpt(repository, job.id, fetchLog)
      : { text: null, truncated: true };
    const errorLine = extractErrorLine(log.text);
    if (errorLine) {
      return {
        jobName,
        errorLine,
        confidence: 'error-line',
        logsTruncated: log.truncated || additionalFailuresUninspected,
      };
    }
    return {
      jobName,
      errorLine: `<no-error-line>|step:${String(step?.name || 'unknown step')}`,
      confidence: 'low',
      logsTruncated: true,
    };
  }
  return {
    jobName: 'unknown job',
    errorLine: '<no-error-line>|workflow failed',
    confidence: 'low',
    logsTruncated: true,
  };
}

function reviewTheme(body) {
  const theme = String(body || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => {
      const plain = line
        .replace(/^[-*>\s]+/, '')
        .replace(/\*\*/g, '')
        .trim();
      return (
        plain &&
        !plain.startsWith('Squad-Review-Head:') &&
        !/^#{1,6}\s+/.test(line) &&
        !/^<!--/.test(line) &&
        !/^(?:review|summary|findings|changes requested|blocking findings?)[:.]?$/i.test(plain) &&
        !/^(?:provenance|scope|linked issue|reviewed sha|head sha|pull request|issue)\s*:/i.test(plain) &&
        !/^human approval remains mandatory\.?$/i.test(plain)
      );
    });
  return {
    value: theme || 'changes requested',
    lowConfidence: !theme,
  };
}

function pathPrefix(files) {
  const names = files.map(file => String(file.filename || '')).filter(Boolean);
  if (names.length === 0) return '<root>';
  const first = names[0].split('/');
  return first.length > 1 ? first[0] : '<root>';
}

function readConfig(root) {
  const path = resolve(root, '.squad', 'config.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function collectRemediationInput(repository, config, now, fetchJson = ghJson, fetchGraphql = null) {
  const empty = {
    actionIssues: [], allActionIssues: [], implementPulls: [], nativeLinkedPullsByIssue: [], repository,
    collection: {
      auto_implement_api_request_ceiling: AUTO_IMPLEMENT_API_REQUEST_CEILING,
      action_issues_considered: 0, action_issues_truncated: false,
      implement_pulls_considered: 0, implement_pulls_truncated: false,
      native_links_considered: 0, native_links_truncated: false,
      native_link_pages_scanned: 0, native_linked_actions_suppressed: 0,
      action_candidate_rotation: 0, action_candidates_deferred: 0,
    },
  };
  if (!config.enabled || !config.autoImplementEnabled) return empty;
  const issues = paginated(
    `repos/${repository}/issues`,
    { state: 'all', labels: ACTION_LABEL, sort: 'created', direction: 'asc' },
    response => response, ACTION_ISSUE_MAX_PAGES, fetchJson,
  );
  const pulls = paginated(
    `repos/${repository}/pulls`,
    { state: 'all', sort: 'created', direction: 'desc' },
    response => response, IMPLEMENT_PULL_MAX_PAGES, fetchJson,
  );
  const allActionIssues = issues.values.filter(hasTrustedActionProvenance);
  const trustedOpenActions = allActionIssues.filter(issue => isTrustedActionIssue(issue));
  const restLinkedIssues = trustedOpenActions.filter(issue =>
    pulls.values.some(pull => pullLinksIssue(pull, issue.number, repository)));
  const candidates = trustedOpenActions.filter(issue =>
    !restLinkedIssues.some(linked => linked.number === issue.number)).sort((a, b) => a.number - b.number);
  // Rotate a bounded comment window so exhausted or numerous open issues
  // cannot permanently starve an older handoff.
  const windows = Math.max(1, Math.ceil(candidates.length / ACTION_ISSUE_CANDIDATE_LIMIT));
  const rotation = Math.floor(now.getTime() / (6 * 3600000)) % windows;
  const selected = candidates.slice(rotation * ACTION_ISSUE_CANDIDATE_LIMIT, (rotation + 1) * ACTION_ISSUE_CANDIDATE_LIMIT);
  const nativeLinkedPulls = new Map();
  const nativeLinkedIssues = [];
  const nativeFailures = [];
  let nativePagesScanned = 0;
  if (!issues.truncated && !pulls.truncated && fetchGraphql) {
    for (const issue of selected) {
      const native = findNativeLinkedPullsSync(fetchGraphql, repository, issue.number);
      nativePagesScanned += native.pages_scanned || 0;
      if (native.truncated) nativeFailures.push({
        issue_number: issue.number,
        reason: native.reason,
        pages_scanned: native.pages_scanned,
      });
      if (native.pulls.length) {
        nativeLinkedPulls.set(issue.number, native.pulls);
        nativeLinkedIssues.push(issue);
      }
    }
  }
  const nativeTruncated = nativeFailures.length > 0;
  const nativeLinkedNumbers = new Set(nativeLinkedIssues.map(issue => issue.number));
  const selectedForComments = nativeTruncated
    ? []
    : selected.filter(issue => !nativeLinkedNumbers.has(issue.number));
  const actionIssues = selectedForComments.map(issue => {
    const comments = paginated(`repos/${repository}/issues/${issue.number}/comments`, {},
      response => response, ACTION_ISSUE_COMMENT_MAX_PAGES, fetchJson);
    return { ...issue, author: issue.user?.login, comments: comments.values, comments_truncated: comments.truncated };
  });
  // Include linked issues for reporting without spending their comment budget.
  actionIssues.push(...restLinkedIssues.map(issue => ({ ...issue, comments: [] })));
  if (!nativeTruncated) {
    actionIssues.push(...nativeLinkedIssues.map(issue => ({ ...issue, comments: [] })));
  }
  return {
    actionIssues,
    allActionIssues,
    implementPulls: pulls.values,
    nativeLinkedPullsByIssue: nativeTruncated ? [] : nativeLinkedPullEntries(nativeLinkedPulls),
    repository,
    collection: {
      ...empty.collection,
      action_issues_considered: selected.length,
      action_issues_truncated: issues.truncated,
      action_comments_truncated: actionIssues.some(issue => issue.comments_truncated),
      implement_pulls_considered: pulls.values.length,
      implement_pulls_truncated: pulls.truncated || nativeTruncated,
      native_links_considered: fetchGraphql && !issues.truncated && !pulls.truncated ? selected.length : 0,
      native_links_truncated: nativeTruncated,
      native_link_failures: nativeFailures,
      native_link_pages_scanned: nativePagesScanned,
      native_linked_actions_suppressed: nativeTruncated ? 0 : nativeLinkedIssues.length,
      action_candidate_rotation: rotation,
      action_candidates_deferred: Math.max(0, candidates.length - selected.length),
    },
  };
}

export function collectLiveInput(env = process.env, {
  fetchJson = ghJson,
  fetchLog = ghJobLog,
  fetchGraphql = ghGraphql,
  now = new Date(),
  remediationInput,
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
  const root = env.GITHUB_WORKSPACE || process.cwd();
  const rawConfig = readConfig(root);
  const config = resolveRetroConfig(rawConfig);
  const remediation = remediationInput || collectRemediationInput(repository, config, now, fetchJson, fetchGraphql);
  const incoming = {
    reason: env.SQUAD_RETRO_REASON || '',
    fingerprint: env.SQUAD_RETRO_REQUEST_FINGERPRINT || '',
    origin: env.SQUAD_RETRO_REQUEST_ORIGIN || '',
  };
  const eventName = env.SQUAD_RETRO_EVENT_NAME || '';
  if (!config.enabled) {
    return {
      now: now.toISOString(),
      eventName,
      config: rawConfig,
      stateIssues: [],
      stateComments: [],
      workflowRuns: [],
      reviews: [],
      actionIssues: [],
      implementPulls: [],
      incoming,
      collection: {
        api_request_ceiling: API_REQUEST_CEILING,
        failed_run_limit: FAILED_RUN_LIMIT,
        job_pages_per_run: RUN_JOB_MAX_PAGES,
        log_requests_per_run: LOG_REQUESTS_PER_RUN,
        run_jobs_truncated: false,
        job_logs_truncated: false,
        failed_runs_considered: 0,
        failed_runs_truncated: false,
        pull_request_limit: PULL_REQUEST_LIMIT,
        review_pages_per_pull: REVIEW_MAX_PAGES,
        file_pages_per_pull: FILE_MAX_PAGES,
        reviews_truncated: false,
        files_truncated: false,
        pull_requests_considered: 0,
        pull_requests_truncated: false,
        self_pull_verification_limit: SELF_PULL_VERIFICATION_LIMIT,
        self_pull_verifications: 0,
        self_pulls_suppressed: 0,
        auto_implement_api_request_ceiling: AUTO_IMPLEMENT_API_REQUEST_CEILING,
        action_issues_considered: 0,
        action_issues_truncated: false,
        implement_pulls_considered: 0,
        implement_pulls_truncated: false,
      },
    };
  }
  const cutoff = new Date(now.getTime() - config.windowHours * 60 * 60 * 1000);
  const stateIssues = collectStateIssues(repository, fields =>
    fetchJson(`repos/${repository}/issues`, fields));
  const trusted = trustedStateCandidates(stateIssues)[0];
  const stateCommentCollection = trusted
    ? paginated(
        `repos/${repository}/issues/${trusted.number}/comments`,
        {},
        response => response,
        STATE_MAX_PAGES,
        fetchJson,
      )
    : { values: [], truncated: false };
  let stateComments = stateCommentCollection.values;
  let stateCommentsTruncated = stateCommentCollection.truncated;
  let stateCheckpointTailRecovered = false;
  if (trusted && stateCommentsTruncated) {
    const checkpoint = [...stateComments]
      .filter(comment => validArtifact(comment, ['retro-state']))
      .sort((left, right) =>
        String(left.updated_at || left.created_at || '')
          .localeCompare(String(right.updated_at || right.created_at || '')))
      .at(-1);
    if (checkpoint?.updated_at) {
      const tail = paginated(
        `repos/${repository}/issues/${trusted.number}/comments`,
        { since: checkpoint.updated_at },
        response => response,
        STATE_MAX_PAGES,
        fetchJson,
      );
      const byId = new Map();
      for (const comment of [checkpoint, ...tail.values]) {
        byId.set(String(comment.id ?? `${comment.created_at}:${comment.body}`), comment);
      }
      stateComments = [...byId.values()];
      stateCommentsTruncated = tail.truncated;
      stateCheckpointTailRecovered = true;
    }
  }
  stateComments = stateComments.map(comment => ({
        id: comment.id,
        author: comment.user?.login,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        body: comment.body,
      }));

  const actionIssueCache = new Map();
  const pullCache = new Map();
  let selfPullFetches = 0;
  let selfPullsSuppressed = 0;
  let selfFailuresSuppressed = 0;
  const isVerifiedRetroPull = pull => {
    if (pull?.user?.login !== BOT) return false;
    const marker = parseRetroActionPullMarker(pull.body);
    if (!marker || extractActionKey(pull.body) !== marker.action_key) return false;
    if (!actionIssueCache.has(marker.issue_number)) {
      if (actionIssueCache.size >= SELF_PULL_VERIFICATION_LIMIT) return false;
      let issue = null;
      try { issue = fetchJson(`repos/${repository}/issues/${marker.issue_number}`, {}); } catch { /* retain unverified evidence */ }
      actionIssueCache.set(marker.issue_number, issue);
    }
    return isTrustedRetroPull(pull, actionIssueCache.get(marker.issue_number));
  };
  const isVerifiedRetroFailure = run => (run.pull_requests || []).some(reference => {
    if (!Number.isSafeInteger(reference?.number) || reference.number < 1) return false;
    if (!pullCache.has(reference.number)) {
      if (selfPullFetches >= SELF_PULL_FETCH_LIMIT) return false;
      selfPullFetches++;
      let pull = null;
      try { pull = fetchJson(`repos/${repository}/pulls/${reference.number}`, {}); } catch { /* retain unverified evidence */ }
      pullCache.set(reference.number, pull);
    }
    const pull = pullCache.get(reference.number);
    return pull?.number === reference.number && pull.head?.sha === run.head_sha && isVerifiedRetroPull(pull);
  });
  const runCollection = recentPaginated(
    `repos/${repository}/actions/runs`,
    { status: 'completed' },
    response => response.workflow_runs || [],
    {
      cutoff: cutoff.toISOString(),
      maxPages: ACTION_RUN_MAX_PAGES,
      maxItems: FAILED_RUN_LIMIT,
      occurredAt: run => run.created_at,
      accept: run => run.conclusion === 'failure' && run.name !== 'Squad Retro',
    },
    fetchJson,
  );
  const runs = runCollection.values;
  let jobsTruncated = false;
  let logsTruncated = false;
  const workflowRuns = runs.flatMap(run => {
    if (isVerifiedRetroFailure(run)) { selfFailuresSuppressed++; return []; }
    const jobs = paginated(
      `repos/${repository}/actions/runs/${run.id}/jobs`,
      {},
      response => response.jobs || [],
      RUN_JOB_MAX_PAGES,
      fetchJson,
    );
    jobsTruncated ||= jobs.truncated;
    const failure = firstFailure(jobs.values, repository, fetchLog);
    logsTruncated ||= failure.logsTruncated;
    return {
      id: run.id,
      run_attempt: run.run_attempt,
      workflow_name: run.name,
      job_name: failure.jobName,
      error_line: failure.errorLine,
      error_confidence: failure.confidence,
      head_sha: run.head_sha,
      html_url: run.html_url,
      created_at: run.created_at,
      conclusion: run.conclusion,
      self_retro: run.name === 'Squad Retro',
    };
  });

  const pullCollection = recentPaginated(
    `repos/${repository}/pulls`,
    { state: 'all', sort: 'updated', direction: 'desc' },
    response => response,
    {
      cutoff: cutoff.toISOString(),
      maxPages: PULL_MAX_PAGES,
      maxItems: PULL_REQUEST_LIMIT,
      occurredAt: pull => pull.updated_at,
      accept: () => true,
    },
    fetchJson,
  );
  const pulls = pullCollection.values;
  const reviews = [];
  let reviewsTruncated = false;
  let filesTruncated = false;
  for (const pull of pulls) {
    const reviewCollection = paginated(
      `repos/${repository}/pulls/${pull.number}/reviews`,
      {},
      response => response,
      REVIEW_MAX_PAGES,
      fetchJson,
    );
    reviewsTruncated ||= reviewCollection.truncated;
    const pullReviews = reviewCollection.values.filter(review =>
      review.state === 'CHANGES_REQUESTED' &&
      new Date(review.submitted_at) >= cutoff);
    if (pullReviews.length === 0) continue;
    if (isVerifiedRetroPull(pull)) {
      selfPullsSuppressed++;
      continue;
    }
    const files = paginated(
      `repos/${repository}/pulls/${pull.number}/files`,
      {},
      response => response,
      FILE_MAX_PAGES,
      fetchJson,
    );
    filesTruncated ||= files.truncated;
    for (const review of pullReviews) {
      const theme = reviewTheme(review.body);
      reviews.push({
        pr_number: pull.number,
        head_sha: review.commit_id,
        state: review.state,
        submitted_at: review.submitted_at,
        html_url: review.html_url,
        theme: theme.value,
        low_confidence: theme.lowConfidence,
        path_prefix: pathPrefix(files.values),
        labels: pull.labels,
        self_retro: false,
      });
    }
  }

  return {
    now: now.toISOString(),
    repository,
    run_id: env.GITHUB_RUN_ID || '',
    eventName,
    config: rawConfig,
    stateIssues,
    stateComments,
    workflowRuns,
    reviews,
    ...remediation,
    incoming,
    collection: {
      api_request_ceiling: API_REQUEST_CEILING,
      state_comment_pages: STATE_MAX_PAGES,
      state_comments_truncated: stateCommentsTruncated,
      state_checkpoint_tail_recovered: stateCheckpointTailRecovered,
      failed_run_limit: FAILED_RUN_LIMIT,
      job_pages_per_run: RUN_JOB_MAX_PAGES,
      log_requests_per_run: LOG_REQUESTS_PER_RUN,
      run_jobs_truncated: jobsTruncated,
      job_logs_truncated: logsTruncated,
      failed_runs_considered: runs.length,
      failed_runs_truncated: runCollection.truncated || jobsTruncated || logsTruncated,
      failed_runs_cutoff_reached: runCollection.reached_cutoff,
      pull_request_limit: PULL_REQUEST_LIMIT,
      review_pages_per_pull: REVIEW_MAX_PAGES,
      file_pages_per_pull: FILE_MAX_PAGES,
      reviews_truncated: reviewsTruncated,
      files_truncated: filesTruncated,
      pull_requests_considered: pulls.length,
      pull_requests_truncated: pullCollection.truncated || reviewsTruncated || filesTruncated,
      pull_requests_cutoff_reached: pullCollection.reached_cutoff,
      self_pull_verification_limit: SELF_PULL_VERIFICATION_LIMIT,
      self_pull_verifications: actionIssueCache.size,
      self_pulls_suppressed: selfPullsSuppressed,
      self_pull_fetches: selfPullFetches,
      self_pull_fetch_limit: SELF_PULL_FETCH_LIMIT,
      self_failures_suppressed: selfFailuresSuppressed,
      ...remediation.collection,
    },
  };
}

export function collectionFailureContext(error, rawConfig = {}) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    action: 'noop',
    reason: 'evidence-collection-unavailable',
    diagnostic: message.slice(0, 500).replace(/\s+/g, ' ').trim(),
    config: resolveRetroConfig(rawConfig),
    evidence_count: 0,
    evidence_groups: [],
    qualifying_groups: [],
    primary_fingerprint: null,
    collection: null,
    evidence_truncated: false,
    pending_fingerprints: [],
    expired_pending_fingerprints: [],
    truncation_preserved_fingerprints: [],
    resolved_fingerprints: [],
    incoming_request: null,
    auto_implement_candidates: [],
    auto_implement_exhausted: [],
    auto_implement_suppressed: [],
    auto_implement_new_action_ids: [],
  };
}

export function collectRetroContext(env = process.env, options = {}) {
  const now = options.now || new Date();
  const rawConfig = readConfig(env.GITHUB_WORKSPACE || process.cwd());
  const config = resolveRetroConfig(rawConfig);
  let remediation;
  try {
    remediation = collectRemediationInput(
      env.GITHUB_REPOSITORY,
      config,
      now,
      options.fetchJson,
      options.fetchGraphql || ghGraphql,
    );
  } catch {
    remediation = {
      actionIssues: [], allActionIssues: [], implementPulls: [], nativeLinkedPullsByIssue: [],
      collection: { action_issues_truncated: true, implement_pulls_truncated: true },
    };
  }
  let result;
  try {
    result = evaluateRetro(collectLiveInput(env, { ...options, now, remediationInput: remediation }));
  } catch (error) {
    result = collectionFailureContext(error, rawConfig);
    // Reporting outages cannot erase a durable action or its dispatch receipt.
    if (config.autoImplementEnabled && !remediation.collection.action_issues_truncated &&
        !remediation.collection.implement_pulls_truncated &&
        !remediation.collection.native_links_truncated) {
      const handoffs = deriveAutoImplementCandidates({
        ...remediation,
        now: now.toISOString(),
        retryHours: config.autoImplementRetryHours,
        nativeLinkedPullsByIssue: nativeLinkedPullMap(remediation.nativeLinkedPullsByIssue),
      });
      result = {
        ...result, action: handoffs.eligible.length || handoffs.exhausted.length ? 'reconcile' : 'noop',
        auto_implement_candidates: handoffs.eligible, auto_implement_exhausted: handoffs.exhausted,
        auto_implement_suppressed: handoffs.suppressed, action_scan_complete: true,
        collection: remediation.collection,
      };
    }
  }
  return { ...result, now: now.toISOString(), repository: env.GITHUB_REPOSITORY || '', run_id: env.GITHUB_RUN_ID || '' };
}

function cli(args, env = process.env) {
  const outputIndex = args.indexOf('--output');
  const fixtureIndex = args.indexOf('--fixture');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : '';
  if (!output) throw new Error('--output is required.');
  if (fixtureIndex >= 0) {
    const input = JSON.parse(readFileSync(args[fixtureIndex + 1], 'utf8'));
    writeFileSync(output, `${JSON.stringify(evaluateRetro(input), null, 2)}\n`);
    return;
  }
  const context = collectRetroContext(env);
  writeFileSync(output, `${JSON.stringify(context, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
