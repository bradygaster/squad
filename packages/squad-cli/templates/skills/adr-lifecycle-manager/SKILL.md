---
name: adr-lifecycle-manager
description: "Manage architecture decision records (ADRs) end-to-end: decide if an ADR is needed, draft from template, assign strict next numbering, update toc/index, move status Proposed to Accepted, and handle amendment, deprecation, or supersession paths. Use for ADR creation, governance, lifecycle updates, and ADR hygiene audits."
domain: architecture, governance
triggers: [ADR, architecture decision record, architecture decision, supersede, deprecate, amendment]
roles: [lead, architect]
argument-hint: "Describe the decision and desired ADR action: create, accept, amend, deprecate, supersede, or audit."
user-invocable: true
disable-model-invocation: false
---

# ADR Lifecycle Manager

Use this skill to keep ADRs consistent, discoverable, and audit-friendly.

## When To Use

- You changed architecture, deployment topology, data model, auth model, or tool/API contracts.
- A PR introduces a design decision and you need to decide whether to create an ADR.
- You need to create a new ADR and register it in the repo index/toc.
- You need to transition ADR status (Proposed, Accepted, Deprecated, Superseded).
- You need to choose between inline amendment and supersession.
- You want an ADR hygiene review (naming, numbering, links, metadata parity).

## Inputs To Collect

- Decision summary (one sentence).
- Scope and impacted components.
- ADR action: new, status-change, amendment, deprecation, supersession, or audit.
- Proposed title slug (verb-phrase-slug).
- Any ADR references (supersedes, superseded-by).
- PR context (if status should flip to Accepted).
- ADR directory and index/toc files for the current repo.
- Discover ADR files by searching common locations first: docs/decisions, docs/adr, adr.
- Discover index/toc files by searching common names in the ADR area: README.md, index.md, toc.yml, toc.md.
- If multiple candidates exist or none are found, ask the user to confirm before editing.

## Workflow

1. Run ADR need-check.
2. If ADR is required, choose lifecycle path.
3. Execute path-specific edits and consistency checks.
4. Return a completion report with changed files and unresolved decisions.

## Step 1: ADR Need-Check

Create an ADR if any apply:

- A future engineer would ask why this approach was chosen.
- The decision constrains future decisions.
- A reasonable alternative was rejected.
- Cross-team contracts are affected.
- Compliance, security, SLO, or cost is affected.

Skip ADR when all apply:

- Change is small, reversible, and local to one PR.
- Covered by existing policy, standard, or ADR.
- It is a temporary experiment/workaround with known end-of-life.

If skipped, output:

- ADR not required.
- Rationale (1-3 bullets).
- Optional backlog follow-up if the decision may become long-lived.

## Step 2: Select Lifecycle Path

- Before selecting a path for new ADR work, run a conflict pre-check against existing ADR titles, tags, and decision statements.
- If conflict pre-check indicates duplicate or overlap, select amendment, deprecation, or supersession instead of new.
- If no ADR directory or index/toc files exist (first ADR in repo), ask for confirmation and scaffold ADR directory, initial index (README.md or index.md), and toc file before continuing.
- new: Draft new ADR in Proposed state only after conflict pre-check confirms a net-new decision.
- status-change: Update status only (typically Proposed to Accepted after merge).
- amendment: Add dated inline note to existing accepted ADR.
- deprecation: Mark ADR as Deprecated with reason and migration note.
- supersession: Create replacement ADR and cross-link old/new records.
- audit: Validate index, toc, frontmatter, and link parity.

## Step 3: Execute Path

### Path A - New ADR

1. Determine file name format: NNNN-verb-phrase-slug.md.
2. Pick the strict next available number from the ADR index (no NEXT placeholders by default).
3. Look for a template file in the ADR directory (for example template.md).
4. If no template is found, ask the user for the template path before proceeding.
5. Copy the located template to the new ADR file.
6. Fill Context, Considered Options, Decision, and Consequences.
7. Set frontmatter status to Proposed.
8. Add entry to toc.yml.
9. Add row to ADR index in README.md immediately after adding the new ADR.
10. Run consistency checks (see Quality Gate).

### Path B - Status Change

1. Confirm triggering event (for Accepted, PR merged).
2. Validate transition before editing:
   - Allowed transitions: Proposed to Accepted, Accepted to Deprecated, Accepted to Superseded.
   - Any other transition is invalid; inform the user and suggest amendment, deprecation, or supersession as appropriate.
3. Update ADR frontmatter status.
4. Ensure index row status matches.
5. Keep ADR body immutable unless an amendment note is intentionally added.

### Path C - Amendment

1. Keep existing accepted ADR content unchanged.
2. Add a dated note in body format:
   - `> [YYYY-MM-DD] Updated: ...`
3. Do not change the original decision statement unless superseding.
4. If consequences changed materially, recommend supersession path.

### Path D - Deprecation

1. Set status to Deprecated.
2. Add deprecation reason and current operational guidance.
3. Update index row status.
4. If replacement exists, prefer supersession path and link it.

### Path E - Supersession

1. Create new ADR using Path A.
2. In new ADR frontmatter set `supersedes: [NNNN]`.
3. In old ADR set `status: Superseded` and `superseded-by: [MMMM]`.
4. Update index rows for both ADRs.
5. Ensure date/order/title consistency across file, toc, and index.

### Path F - Audit

Validate:

- Name format NNNN-verb-phrase-slug.md.
- Number uniqueness and monotonic ordering.
- Every ADR appears in both toc and index.
- Status values are from allowed set.
- Supersession links are bidirectional and valid.
- No accepted ADR has untracked substantive rewrites.

## Quality Gate (Completion Criteria)

A lifecycle action is complete only when all are true:

- ADR file content and frontmatter are valid for selected path.
- toc and index are updated and consistent.
- For new ADRs, conflict scan was performed and any impacted existing ADRs were updated.
- Status transitions follow lifecycle policy.
- Supersession/deprecation metadata is complete when applicable.
- Output includes exact files changed and a short rationale.

## Response Format

Return results in this structure:

1. Decision: ADR required or not required.
2. Path: new, status-change, amendment, deprecation, supersession, or audit.
3. Actions Completed: concise checklist.
4. Files Updated: explicit file paths.
5. Open Items: missing inputs, approvals, or merge dependencies.

## Example Prompts

- `/adr-lifecycle-manager Create an ADR for changing deployment topology from single-region to active-active.`
- `/adr-lifecycle-manager Mark ADR 0012 as Accepted after PR merge and sync toc/index.`
- `/adr-lifecycle-manager Supersede ADR 0007 with a decision to replace polling with callbacks.`
- `/adr-lifecycle-manager Audit ADR docs for numbering, status, and link consistency.`