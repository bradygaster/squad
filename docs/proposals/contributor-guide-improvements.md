# Proposal: Contributor Guide Improvements

> **Author:** Flight (Lead)
> **Date:** 2025-07-24
> **Status:** Draft — awaiting team review
> **Goal:** External contributors can be successful with issues and PRs without requiring repeated guidance from Brady and Tamir.

---

## Executive Summary

Squad has strong internal process documentation (CONTRIBUTING.md, PR_REQUIREMENTS.md, PR template) but significant gaps for **external contributors** — people who discover the project, want to help, and need to find their footing without hand-holding. This proposal identifies 8 gaps and recommends 7 concrete deliverables, prioritized by impact on maintainer time savings.

---

## 1. Current State Audit

### What Exists Today (dev branch)

| File | Status | Quality |
|------|--------|---------|
| `CONTRIBUTING.md` | ✅ Exists | **Strong** — 300 lines covering setup, build, test, branch strategy, changesets, code style, common tasks. Well-structured. |
| `CONTRIBUTORS.md` | ✅ Exists | **Good** — lists AI team, community contributors, Insider Program. Good recognition. |
| `.github/PULL_REQUEST_TEMPLATE.md` | ✅ Exists | **Strong** — What/Why/How/Testing/Docs/Exports/Breaking/Waivers sections with checkboxes. |
| `.github/PR_REQUIREMENTS.md` | ✅ Exists | **Excellent** — 240 lines, canonical spec for PR requirements by category (a–f), waivers, exceptions. |
| `SECURITY.md` | ✅ Exists | **Adequate** — directs to GitHub Private Vulnerability Reporting. Minor typo ("manor" → "manner"). |
| `.github/copilot-instructions.md` | ✅ Exists | **Strong** — git safety rules, team context, capability self-check for Copilot coding agent. |
| `README.md` | ✅ Exists | **Good** — quick start, install, usage. Points to CONTRIBUTING.md. |
| `docs/proposals/` | ✅ Exists | 7 existing proposals. Healthy proposal-first culture. |

### What's Missing

| Gap | Impact | Who Suffers |
|-----|--------|-------------|
| **No issue templates** (`.github/ISSUE_TEMPLATE/`) | Contributors file unstructured issues; maintainers spend time asking for reproduction steps, versions, environment | Brady, Tamir, triagers |
| **No CODE_OF_CONDUCT.md** | Standard OSS expectation missing. Some contributors may hesitate without one. GitHub community profile incomplete | Community trust |
| **No "good first issue" issues** | Label exists (`good first issue`) but **zero issues** currently tagged. New contributors have no on-ramp | New contributors |
| **No `.squad/` explainer in contributor docs** | External contributors don't know what `.squad/` is, why it exists, or that they should never modify it in PRs | External contributors who include `.squad/` changes |
| **Branch strategy buried** | Branch info is in CONTRIBUTING.md §Branch Strategy but easy to miss. PR #633 (external) was opened against wrong base — empty body, zero comments, closed | External contributors |
| **No contributor FAQ / troubleshooting** | Common stumbling blocks (changeset prompts, fork sync, CI failures) require maintainer intervention | All external contributors |
| **PR #639 pattern** | External contributor submitted quality work but it targeted a feature being removed (#665). No way for contributors to know what's "safe to work on" | Contributors who pick up work |
| **`status:contributor-invited` label underused** | 8 issues tagged historically, only 2 currently open. No documented workflow for how contributors claim these | Contributors looking for work |

### Friction Patterns from Community PRs

Only **4 external PRs** in the last 100 (out of 100 total) — very low external contribution rate:

| PR | Contributor | Outcome | Friction |
|----|------------|---------|----------|
| #608 | @eric-vanartsdalen | ✅ Merged | Clean — security policy revision |
| #592 | @joniba | ✅ Merged | Clean — hiring wiring guide, high-quality |
| #639 | @gaburn | ❌ Closed | Worked on REPL feature being removed (#665). No way to know. Brady redirected kindly but work was wasted. |
| #633 | @JerrettDavis | ❌ Closed | Empty PR body, no description, opened against `dev` — likely a test PR or confusion about process |

**Key insight:** The successful external PRs (#608, #592) came from contributors who already had context. The failed ones (#639, #633) show the "cold start" problem — new contributors lack the context to pick good work and submit correctly.

---

## 2. Proposed Changes

### P1 — High Impact, Low Effort (do first)

#### 2a. GitHub Issue Templates (`.github/ISSUE_TEMPLATE/`)

**What:** Create 4 structured issue templates:
- `bug_report.yml` — version, environment, reproduction steps, expected vs actual behavior
- `feature_request.yml` — problem statement, proposed solution, alternatives considered
- `documentation.yml` — what's missing or wrong, where, suggested improvement
- `config.yml` — blank issue escape hatch + links to Discussions for questions

**Who it helps:** Brady and Tamir (fewer clarification round-trips), triagers (structured data), reporters (guided through what to include).

**Effort:** ~2 hours. YAML form-based templates (GitHub native).

**Details:**
- Use YAML form format (not markdown) for required fields — GitHub enforces completion
- Bug template: require version (`squad version` output), Node version, OS, reproduction steps
- Feature template: require problem statement before solution (prevents "just add X" issues)
- Add `type:bug`, `type:feature`, `type:docs` auto-labels per template

---

#### 2b. "Good First Issue" Curation Sprint

**What:** Audit open issues and tag 5–10 with `good first issue`. Create a documented workflow for maintaining the label.

**Who it helps:** New contributors looking for an on-ramp. Reduces "where do I start?" questions.

**Effort:** ~1 hour to tag + 30 min to document the curation workflow.

**Details:**
- Candidates: documentation gaps, typo fixes, test additions, small CLI improvements
- Each `good first issue` should include a "Getting Started" comment with:
  - Which files to look at
  - What the acceptance criteria are
  - Which squad member to tag for questions
- Document the curation workflow in CONTRIBUTING.md: who tags, when, criteria

---

#### 2c. `.squad/` Directory Explainer Section in CONTRIBUTING.md

**What:** Add a clear section explaining what `.squad/` is, why it exists in the repo, and that **external contributors should never modify `.squad/` files in their PRs**.

**Who it helps:** Every external contributor. Prevents accidental `.squad/` changes in PRs.

**Effort:** ~30 minutes.

**Proposed content:**
```markdown
## The .squad/ Directory

The `.squad/` directory contains Squad's AI team state — agent charters, decision history,
routing rules, and accumulated learnings. It is managed exclusively by the Squad team.

**For external contributors:**
- ❌ Do NOT modify any files in `.squad/` in your PRs
- ❌ Do NOT include `.squad/` changes in your commits
- ✅ You can READ `.squad/decisions.md` to understand team conventions
- ✅ You can READ agent charters to understand domain ownership

If your PR includes `.squad/` changes, you'll be asked to remove them before review.
```

---

### P2 — Medium Impact, Medium Effort

#### 2d. CODE_OF_CONDUCT.md

**What:** Adopt the Contributor Covenant (v2.1), the standard for OSS projects. Customized with Squad-specific enforcement contacts.

**Who it helps:** Community trust. GitHub community profile completion. Sets behavioral expectations.

**Effort:** ~30 minutes (adopt standard, customize contact info).

**Details:**
- Use Contributor Covenant v2.1 (industry standard, used by Node.js, Rails, etc.)
- Enforcement: Brady as primary contact
- Link from CONTRIBUTING.md and README.md

---

#### 2e. Contributor FAQ / Troubleshooting Section

**What:** Add a "Common Issues" section to CONTRIBUTING.md covering the questions maintainers answer repeatedly.

**Who it helps:** All external contributors. Direct time savings for Brady and Tamir.

**Effort:** ~1 hour.

**Proposed topics:**
- "My PR CI is failing" — how to read CI output, common causes (missing changeset, build errors, lint failures)
- "Which branch do I target?" — always `dev`, never `main`. With a bold callout box.
- "Do I need a changeset?" — yes, always. How `changeset add` works. What to pick for patch/minor/major.
- "How do I know what's safe to work on?" — look for `good first issue`, `status:contributor-invited`, `help wanted` labels. Avoid issues with `squad:*` labels (team-internal). Check the issue isn't already assigned.
- "My fork is out of date" — step-by-step rebase instructions (already in CONTRIBUTING.md, but worth a FAQ entry pointing to it)
- "What's the `.squad/` directory?" — link to the explainer section

---

#### 2f. "Contributing" Section Enhancement in README.md

**What:** Expand the README's contributor section beyond just linking to CONTRIBUTING.md. Add a quick "Ways to Contribute" section.

**Who it helps:** Discovery — README is the first file most people read.

**Effort:** ~30 minutes.

**Proposed content:**
```markdown
## Contributing

We welcome contributions! Here's how to get involved:

- 🐛 **Report bugs** — [Open an issue](link) using the bug report template
- 💡 **Suggest features** — [Open an issue](link) using the feature request template
- 🔧 **Fix something** — Look for [`good first issue`](link) or [`help wanted`](link) labels
- 📖 **Improve docs** — Typos, clarity, missing examples — all welcome

**Before you start coding**, read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch strategy, and PR requirements.

All PRs target the `dev` branch. See [Branch Strategy](CONTRIBUTING.md#branch-strategy) for details.
```

---

### P3 — Nice to Have

#### 2g. SECURITY.md Typo Fix

**What:** Fix "manor" → "manner" (line 19). Minor but noticed during audit.

**Who it helps:** Professional appearance.

**Effort:** 30 seconds.

---

## 3. Priority Order

| Priority | Deliverable | Effort | Maintainer Time Saved | Ship With |
|----------|-------------|--------|----------------------|-----------|
| **P1** | Issue templates (2a) | 2 hrs | High — structured reports reduce back-and-forth | This PR or immediate follow-up |
| **P1** | Good first issue curation (2b) | 1.5 hrs | High — gives contributors a clear on-ramp | Separate task (requires issue audit) |
| **P1** | `.squad/` explainer (2c) | 30 min | Medium — prevents common PR mistake | This PR or immediate follow-up |
| **P2** | CODE_OF_CONDUCT.md (2d) | 30 min | Low direct, high trust signal | This PR or immediate follow-up |
| **P2** | Contributor FAQ (2e) | 1 hr | High — answers repeated questions | This PR or immediate follow-up |
| **P2** | README contributing section (2f) | 30 min | Medium — improves discovery | This PR or immediate follow-up |
| **P3** | SECURITY.md typo (2g) | 30 sec | None | Any PR |

**Recommended execution:** Items 2a + 2c + 2e + 2f + 2g can be shipped in a single PR (estimated 4 hours total). Item 2b (good first issue curation) is a separate task requiring issue-by-issue audit. Item 2d (CODE_OF_CONDUCT) can ship standalone.

---

## 4. Success Criteria

After these changes ship:

1. **A new contributor can go from "I found this repo" to "my PR is ready for review" using only the docs** — no DMs, no repeated questions to Brady/Tamir.
2. **Every bug report includes version, OS, and reproduction steps** — enforced by issue template required fields.
3. **Contributors know what to work on** — `good first issue` and `status:contributor-invited` labels are actively maintained with 5+ open issues at all times.
4. **No PRs include `.squad/` changes** — explainer section makes the boundary clear.
5. **Brady and Tamir can respond to contributor questions with links** — "See [FAQ: Which branch do I target?](CONTRIBUTING.md#faq)" instead of writing the answer each time.

---

## 5. What This Does NOT Cover

- **Automated PR checks for `.squad/` changes** — that's a CI gate (separate issue)
- **Contributor license agreement (CLA)** — Squad uses MIT, no CLA needed currently
- **Discord/Slack community** — out of scope, GitHub Discussions is the channel
- **Docs site contributor guide** — the Astro docs site (`docs/`) has its own needs; this proposal focuses on repo-level contributor docs

---

## 6. Open Questions for Team

1. **Who should be the CODE_OF_CONDUCT enforcement contact?** Brady as repo owner is the default, but should we list a backup?
2. **Should we add a `.github/FUNDING.yml`?** Not strictly contributor guidance but often expected in OSS.
3. **Should `status:contributor-invited` be renamed to `help wanted`?** GitHub surfaces `help wanted` specially in search and explore. We have both labels — should we consolidate?
4. **PR #639 pattern prevention:** Should we add a "Do Not Contribute" label or a "being removed" label for features that are being deprecated? This would prevent contributors from wasting effort on doomed features.
