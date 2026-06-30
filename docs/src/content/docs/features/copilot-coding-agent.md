# Copilot Coding Agent (@copilot)

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Add the GitHub Copilot coding agent to your Squad as an autonomous team member. It picks up issues, creates branches, and opens PRs — all without a Copilot chat session.

---

## Prerequisites

Before enabling @copilot on your Squad, ensure:

1. **Copilot coding agent is enabled** on the repository (Settings → Copilot → Coding agent)
2. **`copilot-setup-steps.yml`** exists in `.github/` (defines the agent's environment)
3. **GitHub Actions** are enabled on the repository

---

## Quick Start

```bash
# 1. Add @copilot to your squad with auto-assign
squad copilot --auto-assign

# 2. Create a classic PAT for auto-assignment (see below)
#    https://github.com/settings/tokens/new → check "repo" scope

# 3. Add the PAT as a repo secret
gh secret set COPILOT_ASSIGN_TOKEN

# 4. Commit and push
git add .github/ .squad/ && git commit -m "feat: add copilot to squad" && git push

# 5. Test — label any issue with squad:copilot
gh issue edit <number> --add-label "squad:copilot"
```

> **Why can't I use `gh issue edit --add-assignee "@copilot"`?** Bot accounts cannot be assigned via the GitHub CLI the same way as human users. Use label-based assignment instead. See [FAQ: Why doesn't gh issue edit --add-assignee "@copilot" work?](../guide/faq.md#why-doesnt-gh-issue-edit---add-assignee-copilot-work) for details.

---

## Enabling @copilot

### In conversation (recommended)

Say something like:
- **"I want to add copilot to the squad"**
- **"cast copilot to the squad"**
- **"add team member copilot"**

The coordinator will add @copilot to the roster and ask about auto-assign.

> **Note:** If your project has features named "copilot" (e.g., a Copilot extension), the coordinator may misinterpret the phrase as project work. Use the CLI fallback in that case.

### During team setup (new projects)

Squad asks if you want to include the coding agent during `init`. Say **yes** and it's added to the roster with a default capability profile.

### Via CLI (fallback)

```bash
# Add @copilot to the team
squad copilot

# Add with auto-assign enabled
squad copilot --auto-assign

# Remove from the team
squad copilot --off
```

---

## COPILOT_ASSIGN_TOKEN (required for auto-assign)

The `squad-issue-assign` workflow needs a **classic Personal Access Token** to assign `copilot-swe-agent[bot]` to issues. The default `GITHUB_TOKEN` cannot do this.

### Create the token

1. Go to https://github.com/settings/tokens/new
2. **Note:** `squad-copilot-assign`
3. **Expiration:** 90 days (or your preference)
4. **Scopes:** check **`repo`** (full control of private repositories)
5. Click **Generate token**

### Add as repo secret

```bash
gh secret set COPILOT_ASSIGN_TOKEN --repo owner/repo
```

> **Why a classic PAT?** Fine-grained PATs return `403 Resource not accessible` for this endpoint. The REST API for assigning `copilot-swe-agent[bot]` requires a classic PAT with `repo` scope. The `GITHUB_TOKEN` silently ignores the assignment.

---

## How @copilot Differs from Other Members

| | AI Agent | Human Member | @copilot |
|---|----------|-------------|----------|
| Badge | ✅ Active | 👤 Human | 🤖 Coding Agent |
| Name | Cast from universe | Real name | Always "@copilot" |
| Charter | ✅ | ❌ | ❌ (uses `copilot-instructions.md`) |
| Works in session | ✅ | ❌ | ❌ (asynchronous via issue assignment) |
| Spawned by coordinator | ✅ | ❌ | ❌ |
| Creates PRs | Via session commands | Outside Squad | Autonomously |

---

## Capability Profile

The capability profile in `team.md` defines what @copilot should and shouldn't handle:

| Tier | Meaning | Examples |
|------|---------|----------|
| 🟢 **Good fit** | Route automatically | Bug fixes, test coverage, lint fixes, dependency updates, small features, docs |
| 🟡 **Needs review** | Route to @copilot but flag for PR review | Medium features with specs, refactoring with tests, API additions |
| 🔴 **Not suitable** | Route to a squad member instead | Architecture, multi-system design, security-critical, ambiguous requirements |

The profile is editable. The Lead can suggest updates based on experience:

```
> @copilot nailed that refactoring — bump refactoring to good fit
> That API change needed too much context — keep multi-endpoint work at not suitable
```

---

## Auto-Assign Flow

When the `squad:copilot` label is added to an issue:

1. **Step 1** — Workflow posts a routing comment (uses `GITHUB_TOKEN`)
2. **Step 2** — Workflow assigns `copilot-swe-agent[bot]` to the issue (uses `COPILOT_ASSIGN_TOKEN`)
3. **Step 3** — Coding agent picks up the issue, creates a `copilot/*` branch, and opens a draft PR

The workflow automatically detects the repo's default branch (`main`, `master`, etc.).

---

## Lead Triage

The Lead evaluates every issue against @copilot's capability profile during triage:

1. **Good fit?** → Routes to @copilot with reasoning
2. **Needs review?** → Routes to @copilot, flags for squad member PR review
3. **Not suitable?** → Routes to the right squad member, explains why not @copilot

The Lead can also suggest reassignment in either direction:

```
> This test coverage task could go to @copilot — want me to reassign?
> @copilot might struggle with this — suggesting we reassign to Ripley.
```

---

## Labels

When @copilot is on the team, the `sync-squad-labels` workflow creates:

| Label | Color | Purpose |
|-------|-------|---------|
| `squad:copilot` | 🟢 Green | Assigned to @copilot for autonomous work |

This works alongside the existing `squad` (triage) and `squad:{member}` labels.

---

## copilot-instructions.md

The `.github/copilot-instructions.md` file gives the coding agent context about your Squad when it works autonomously. It tells @copilot to:

- Read `team.md` for roster and capability profile
- Read `routing.md` for work routing rules
- Check its capability profile before starting (and request reassignment if the issue doesn't match)
- Follow the `squad/{issue}-{slug}` branch naming convention
- Write decisions to the inbox for the Scribe to merge

This file is **upgraded automatically** when you run `squad upgrade` and `@copilot` is on your team — even if Squad is already up to date. If @copilot is not enabled, the file is left untouched.

---

## Tips

- Start conservative with the capability profile and expand as you see what @copilot handles well.
- Use auto-assign for repos where you want fully autonomous issue processing.
- The coding agent works great alongside [issue-driven development](../scenarios/issue-driven-dev.md) — label issues `squad` and the Lead + @copilot handle the rest.
- @copilot's PRs go through normal review — treat them like any team member's work.

## Sample Prompts

```
add copilot to the squad with auto-assign enabled
```

Adds @copilot to the roster and configures automatic issue assignment.

```
what's copilot's capability profile?
```

Shows which task types are marked as good fit, needs review, or not suitable for @copilot.

```
reassign issue #42 from copilot to Kane
```

Routes an issue away from @copilot to a different squad member.

```
bump refactoring to good fit for copilot
```

Updates the capability profile to mark refactoring tasks as automatically routable to @copilot.

```
review copilot's PR on #56
```

Spawns the appropriate squad member to review @copilot's pull request.
