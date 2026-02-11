# Copilot Coding Agent (@copilot)

Add the GitHub Copilot coding agent to your Squad as an autonomous team member. It picks up issues, creates branches, and opens PRs — all without a Copilot chat session.

---

## Enabling @copilot

### Add to an existing Squad

```bash
# Add @copilot to the team
npx github:bradygaster/squad copilot

# Add with auto-assign enabled
npx github:bradygaster/squad copilot --auto-assign
```

This adds @copilot to your roster with a default capability profile and creates `.github/copilot-instructions.md`.

### Remove from the team

```bash
npx github:bradygaster/squad copilot --off
```

### During init

Squad mentions the option during team setup. Run the `copilot` subcommand after init to add it.

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

## Auto-Assign

When enabled, the `squad-issue-assign` workflow automatically assigns `@copilot` on the GitHub issue when work is routed to it — so the coding agent picks it up without manual intervention.

Enable it:
```bash
npx github:bradygaster/squad copilot --auto-assign
```

Or set it manually in `team.md` by changing `<!-- copilot-auto-assign: false -->` to `<!-- copilot-auto-assign: true -->`.

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
