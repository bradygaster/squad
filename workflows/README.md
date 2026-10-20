# Squad Agentic Workflows

This nested `gh-aw` package installs the complete Squad workflow bundle from one
immutable commit:

```bash
gh aw add bradygaster/squad/workflows@<40-character-commit-sha>
```

The package contains exactly eight workflows, seventeen runtime resources, and
the `gh-aw-enlistment` skill. After installation, follow the enlistment skill to
materialize runtime resources, strictly compile every workflow, and verify the
package-owned topology before opening the bootstrap pull request.

## Optional CAO research evidence

Ordinary `/squad research` remains the only per-wave user action. A normal
reviewed CAO installation may opt in by installing the receipt-owned
`.squad/cao-evidence-provider.json` and its pinned Node runtime closure. Without a
descriptor, Squad does not collect or restore CAO evidence and leaves the native
research envelope unchanged.

The narrow descriptor uses schema `squad-evidence-provider/v1`, kind
`cao-farm-v1`, fixed entry
`.squad/cao-evidence-runtime/activity/squad-wave-evidence.mjs`, and
`runtime_files`: SHA-256 hashes keyed by the complete repository-relative paths:
the three `activity/{squad-wave-evidence,squad-farm,authentication}.mjs` files
and `.github/workflows/shared/{policy,setup-github-apps}.mjs`, all beneath
`.squad/cao-evidence-runtime/`. No arbitrary commands, URLs, runtime package
installation, issue-selected repositories, floating references or PR-head code
are supported. Descriptor, runtime and policy come only from the immutable
executing workflow checkout. `SQUAD_WORKFLOW_SHA` identifies that revision;
`GITHUB_SHA` is not a substitute.

The trusted pre-agent gate collects a complete run-bound bundle into
`/tmp/gh-aw/agent/cao-farm/`. Its `manifest.json` uses
`cao-squad-wave-evidence/v1` and binds the control repository, workflow revision,
policy/enrollment SHA-256 digests, issue, run/attempt, capture/expiry times,
repository revisions and document hashes. `farm/evidence.json` and every other
declared document must be present, regular, hash-matching and bounded. Missing,
partial, tampered, future or expired evidence fails closed. Maximum age is
24 hours, with expiry exactly 24 hours after capture; maximum bundle size is
8 MiB and 256 files. The closed document set is `farm/INDEX.md`,
`farm/evidence.json`, and `farm/{owner}/{repo}/SNAPSHOT.md` for every enrolled
repository. Policy is `.github/workflows/cao.json`: the policy digest hashes its
raw bytes, and enrollment hashes `JSON.stringify(policy['control-plane'].scope)`.

Before the agent starts, Squad retains that verified bundle as the control
repository's Actions artifact
`squad-cao-evidence-<run-id>-<run-attempt>` (one-day retention unless gh-aw's
`vars.GH_AW_DEFAULT_ARTIFACT_RETENTION_DAYS` overrides it; the 24-hour freshness
bound still applies). The trusted publication
gate restores and validates this immutable copy before any successful safe
output. The deterministic research writer validates it again, adds a run link
and structured `evidence` provenance, and updates the native research comment.
The model cannot select the artifact or author provenance.

The six modes `triage`, `triage revise`, `plan`, `plan revise`, `plan program`,
and `plan program revise` restore only the newest bot-authored research
artifact's referenced wave, validate it against current trusted enrollment,
and keep that lineage. If unavailable or stale, use ordinary `/squad research`
again. Committed install-time `farm/` evidence remains a historical bootstrap
baseline with unchanged receipt ownership, Cast and bootstrap validation.
Sampled issues/PRs describe capture-time observations, not an atomic snapshot.

Credentials are step-local to collection, never forwarded to the agent.
**Native v1 supports App authentication only.** Collection requires
`vars.GH_AW_GITHUB_AUTH_MODE=app`, `vars.GH_AW_GITHUB_READ_APP_ID` and
`secrets.GH_AW_GITHUB_READ_APP_PRIVATE_KEY`, scoped to the collect step.
Other authentication modes, including PAT and workflow-token-only collection,
fail explicitly as unsupported in v1 before executing the runtime. Restore and
publication validation receive no App credentials. Azure Key
Vault credentials do not automatically become Actions secrets. If CAO Actions
read authentication is absent, this implementation fails rather than silently
asking for duplicate secrets or changing deployment/authentication settings.

This adds no schedules, dispatch chains, target-repository writes, live
promotion, review bypasses, cast changes or attribution exceptions. Actions
artifact access follows control-repository visibility; CAO must reject visibility
leaks before collection. Hosted two-wave acceptance and live deployment remain
separate approval steps.

Collection runs the hash-checked runtime with no arguments and the immutable
checkout as cwd. Restored bundles use `--validate-bundle` and
`SQUAD_EVIDENCE_BUNDLE`; their recorded run/attempt and workflow revision stay
bound to the research wave, not the downstream command's new run. The runtime
receives `GITHUB_REPOSITORY`, `SQUAD_WORKFLOW_SHA`, `GITHUB_RUN_ID`,
`GITHUB_RUN_ATTEMPT`, and `SQUAD_ISSUE_NUMBER`. No event-head SHA substitutes for
the executing revision.
