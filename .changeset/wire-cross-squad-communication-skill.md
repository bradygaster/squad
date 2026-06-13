---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Add **cross-squad-communication** as a built-in skill (companion to cross-squad)

The merged registry work (#1291) added `squad registry add/list/remove` and the `cross-squad/SKILL.md` for discovery. But discovery is only half the story — once a peer squad is known, agents need to know **how** to actually exchange information with it (sync CLI sessions, async git-based requests, issue-based delegation).

This change ports `cross-squad-communication` from [tamirdresher/squad-skills](https://github.com/tamirdresher/squad-skills/tree/main/plugins/cross-squad-communication) into Squad's bundled skills so a fresh `squad init` produces a coordinator that already knows the four communication patterns. The plugin was validated against two production squad instances (one GitHub-hosted, one Azure DevOps-hosted) before being ported.

**What this skill teaches**

| Pattern | When to use |
|---|---|
| Pattern 0: Synchronous CLI session | Quick knowledge queries — spawn `copilot` with `--working-directory` set to target repo |
| Pattern 1: Read-only metadata scan | "What's the architecture of squad X?" — read their `team.md` / `decisions.md` directly |
| Pattern 2: Async git-based request/response | Long-running work, PR reviews, multi-cycle tasks. Request files in `.squad/cross-squad/requests/`, response files in `.squad/cross-squad/responses/`. |
| Pattern 3: Issue-based delegation | GitHub-hosted repos — `gh issue create` with `squad:cross-squad` label as the message bus |

Plus: decision tree for choosing the right pattern, anti-patterns, request/response YAML format, and validation status.

**Changes**

- New `.squad/skills/cross-squad-communication/SKILL.md` (canonical source). `sync-skill-templates.mjs` (prebuild) propagates to both `packages/squad-cli/templates/skills/` and `packages/squad-sdk/templates/skills/`.
- `MANIFEST_SKILL_NAMES` in `packages/squad-sdk/src/config/init.ts` grows by 1 entry: `cross-squad-communication`. Now 11 entries.
- `cross-squad/SKILL.md` (the registry-aware skill from #1291) gets a one-paragraph "Companion skill" note at the top pointing to `cross-squad-communication` for protocol details. The two skills are designed to be used together: `cross-squad` answers "who?" (discovery via registry), `cross-squad-communication` answers "how?" (the 4 communication patterns).

**Genericization**

The original plugin documented validation against specific internal Microsoft repositories. Examples in this version use generic names (`platform-squad`, `research-squad`, etc.) so they're meaningful to all upstream users. The protocol mechanics are unchanged. The frontmatter `source:` attributes the port to `tamirdresher/squad-skills`.

**Test coverage**

New `test/init.test.ts > should install cross-squad-communication skill (companion to cross-squad — #5)`: asserts the SKILL.md ends up at `.copilot/skills/cross-squad-communication/SKILL.md` after `initSquad()` and that the content contains the expected pattern names. 26/26 init tests pass; `npm run lint` clean.

**Composition with #1291**

```bash
# 1. Init produces a squad that already knows both skills
squad init

# 2. Register a peer squad (#1291)
squad registry add ../peer-squad-repo

# 3. Ask the coordinator: "what are the team members of the peer squad?"
#    → The coordinator now has cross-squad-communication's Pattern 1 in scope
#      and knows to read team.md from the registered peer
```

**Note on overlap with #1292**

PR #1292 (skills bundling fix) adds `squad-commands`, `squad-version-check`, `tiered-memory`, `iterative-retrieval`, `reflect`, and `cross-squad` to `MANIFEST_SKILL_NAMES`. That PR and this one both modify the same array but add disjoint entries. When both merge, the manifest grows to 15 entries (10 base + 4 from #1292 + 1 from here). Either PR can land first.
