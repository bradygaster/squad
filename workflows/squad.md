---
name: Squad
run-name: "Squad — ${{ github.event.inputs.command || github.event.comment.body || github.event.issue.title || 'run' }}"
description: Cast, connect, or adopt a Squad AI team for your repository
emoji: "🤖"
private: false
on:
  bots: ["github-actions[bot]"]
  roles: all
  slash_command:
    name: squad
    events:
      - issues
      - issue_comment
      - pull_request_comment
      - pull_request_review_comment
  workflow_dispatch:
    inputs:
      command:
        description: 'Squad command (e.g., cast, implement, connect org/repo, adopt org/repo, status)'
        required: false
      issue_number:
        description: 'Issue number to implement when run manually'
        required: false
        type: string
      aw_context:
        description: 'Originating agentic workflow context'
        required: false
        type: string
permissions:
  contents: read
  copilot-requests: write
  issues: read
  pull-requests: read
concurrency:
  group: "squad-${{ github.event.inputs.issue_number || github.event.issue.number || github.event.pull_request.number || github.run_id }}"
  cancel-in-progress: false
network:
  allowed:
    - defaults
imports:
  - shared/squad.md
  - shared/squad-planning-ontology.md
  - shared/squad-planning-policy.md
tools:
  bash: true
  github:
    mode: gh-proxy
    toolsets: [default]
safe-outputs:
  data:
    type: object
    properties:
      squad_artifact:
        type: string
        enum:
          - research
          - plan
          - plan-accepted
          - phases-accepted
          - triage
          - lifecycle-state
          - program
          - implementation
          - validation
          - scope-accepted
          - impl-accepted
          - impl-phases-accepted
          - phases-activated
          - activated
      schema_version:
        type: string
        enum: ["1"]
      origin_issue:
        type: integer
        minimum: 1
      phases:
        type: array
        items:
          type: integer
          minimum: 1
    required:
      - squad_artifact
      - schema_version
      - origin_issue
      - phases
    additionalProperties: false
  create-pull-request:
    title-prefix: "[squad] "
    labels: [squad]
    max: 3
    auto-close-issue: false
    allowed-base-branches:
      - "squad/*"
    allowed-files:
      - ".squad/**"
      - ".github/agents/squad.agent.md"
      - "meet-the-squad.md"
    protected-files: allowed
    max-patch-files: 500
    expires: 14d
  create-issue:
    labels: [squad]
    max: 75
  add-comment:
    max: 20
    target: "*"
  dispatch-workflow:
    workflows: [squad-implement-worker, squad-review]
    max: 3
---

## Planning Artifact Data Contract (all modes)

gh-aw removes HTML comments from prompts and sanitized output bodies. Never use HTML comments as Squad state markers.

Every machine-readable planning comment MUST include safe-output `data` with:

```json
{
  "squad_artifact": "{artifact_kind}",
  "schema_version": "1",
  "origin_issue": 123,
  "phases": []
}
```

Use the triggering issue number for `origin_issue`. Because gh-aw requires every declared schema property, emit `phases: []` for non-phase artifacts and the accumulated phase numbers for phase-state artifacts. Validation results remain in the human-readable body. gh-aw appends the validated envelope as a `Structured data:` fenced JSON block in the GitHub body.

When locating artifacts:
1. **Paginate fully** — fetch ALL comments (paginate if >30).
2. **Parse structured data** — match exact `squad_artifact`, `schema_version: "1"`, and the current `origin_issue`.
3. **Latest = newest** — if multiple comments match, use the most recent.

# Squad — `/squad` Slash Command

## Trigger Context

The dispatch inputs for this run are interpolated below. Treat a non-empty value
as authoritative. For `workflow_dispatch`, empty expected values are activation
failures, not commands to reinterpret as Cast.

- **Event name:** `${{ github.event_name }}`
- **Dispatched command:** `${{ github.event.inputs.command }}`
- **Dispatched issue number:** `${{ github.event.inputs.issue_number }}`

### Workflow-dispatch activation guard [MANDATORY — run before any skill]

`workflow_dispatch` inputs `command` and `issue_number` are both
`required: false`, so an empty activation probe can reach this workflow. The
`squad-implement-worker` relay fires such a probe before its real dispatch (see
EECOM's `dispatch-workflow` `max` fix in PR #1777). That probe arrives here as a
`workflow_dispatch` with empty inputs. It is NOT a command. Guard against it as
the FIRST action of the run, before resolving any command or entering any skill:

- When `github.event_name` is `workflow_dispatch` AND the **Dispatched command**
  above is empty or missing: this is an empty activation probe, not a real run.
  Emit exactly one diagnostic annotation via bash —
  `echo "::warning::Squad workflow_dispatch fired with empty command input — empty activation probe (see PR #1777); halting with no side effects"`
  — and STOP immediately. Do NOT create an issue, do NOT post a comment, do NOT
  enter any skill. Creating an issue here is the junk-issue defect that produced
  fixture issues #12 and #14; never do it.
- When `github.event_name` is `workflow_dispatch`, the **Dispatched command** is
  non-empty and names an issue-bound mode (`research`, `triage`, `plan*`, or
  `implement`), but neither a dispatched nor a triggering `issue_number` is
  available: emit
  `echo "::warning::Squad workflow_dispatch for the named command is missing issue_number; halting with no side effects"`
  and STOP. Do NOT create an issue.

This guard is defense-in-depth: PR #1777's `max` bump keeps the real relay
dispatch alive, and this guard makes the surviving probe harmless and visible
(a log annotation that survives the run) instead of silently minting junk
issues. If the LLM ever emits a third dispatch entry, `max` alone fails again —
this guard still holds.

Resolve the slash command in this order:

1. **Dispatched command** (above) — when the event name is
   `workflow_dispatch`, this input must be present for the run to proceed. If it
   is empty, the activation guard above has already halted the run; never reach
   this step with an empty dispatched command. When it is non-empty, it is the
   trigger source; skip the remaining sources.
2. **Issue comment / PR review comment:** `github.event.comment.body` — the full
   comment text.
3. **Issue body:** `github.event.issue.body` — the full issue description.
4. Otherwise default to `cast` only for an explicit `/squad` slash command with
   no arguments.

Choosing a source never skips parsing: every source is parsed by **Parse
Command** below, so mode resolution has one implementation. The dispatched
command arrives **bare** (`implement`, not `/squad implement`) and MUST be
normalized by **Step PC-0** before PC-1 sees it.

Resolve the target issue in this order:

1. **Dispatched issue number** (above) — when non-empty, this is the target
   issue, including for merge-driven epic continuations.
2. The triggering issue or pull request number from the event payload.

**Never emit `noop` when the dispatched command is non-empty.** A workflow
dispatch with a non-empty command is always actionable: run the named mode
against the dispatched issue number. If the dispatched command names no mode in
the Modes table, that is a loud failure via Step PC-3 — still never `noop`. The
missing-`issue_number` case is handled by the activation guard above — halt with
a log annotation, never an issue.

The activation job already ran `squad init --preset default`, which produced a
generic 5-agent team (lead, reviewer, devrel, security, docs) in `.squad/`. Cast
mode REPLACES this scaffolding with a team tailored to the repository.

This workflow does not create or modify files under `.github/workflows/`.
Repository owners must configure Copilot setup steps separately when needed.

## Modes

| Command | Mode |
|---------|------|
| `/squad cast` | Cast |
| `/squad connect <source>` | Connect |
| `/squad adopt <url>` | Adopt |
| `/squad cast-member <spec>` | Cast Member |
| `/squad retire <name>` | Retire |
| `/squad status` | Status |
| `/squad review` | Review Relay |
| `/squad research` | Research |
| `/squad plan` | Plan |
| `/squad plan revise <feedback>` | Plan Revise |
| `/squad triage` | Triage |
| `/squad triage revise <feedback>` | Triage Revise |
| `/squad plan program` | Plan Program |
| `/squad plan program revise <feedback>` | Plan Program Revise |
| `/squad plan implementation` | Plan Implementation |
| `/squad plan validate` | Plan Validate |
| `/squad plan accept` | Plan Accept (fast-path) |
| `/squad plan accept phase {N}` | Plan Accept |
| `/squad plan accept scope` | Plan Accept Scope |
| `/squad plan accept implementation` | Plan Accept Implementation |
| `/squad plan accept implementation phase {N}` | Plan Accept Implementation |
| `/squad plan activate` | Plan Activate |
| `/squad plan activate phase {N}` | Plan Activate |
| `/squad implement` | Implement |
| `/squad` (no args) | Cast |

## Parse Command

**The command may appear anywhere in the body — not only at the start.** A body
that opens with a greeting, a sentence of context, or a blank line and *then*
carries the command is the normal shape of a first-run issue. Never assume the
body begins with `/squad`, and never decide by eye whether a command is present.

### Shell input security contract [MANDATORY]

Issue and comment bodies, issue/PR titles, and any other GitHub event text are
**attacker-controlled**.

**Mandatory channel:** event text MUST reach the shell only through named
step/job `env:` variables, read only by quoted parameter expansion:

```yaml
env:
  # Angle brackets stand in for Actions expression delimiters; literal ones
  # fail gh-aw's allowlist and break `gh aw compile`.
  SQUAD_TRIGGER_BODY: <github.event.comment.body || github.event.issue.body>
run: |
  body="${SQUAD_TRIGGER_BODY-}"
  printf '%s\n' "$body" | awk '...' | grep -F -- '/squad'
```

**Forbidden:**

- `UNTRUSTED_TEMPLATE_IN_RUN` — never place an event-text expression, or anything
  derived from one, inside a `run:` block. Actions expansion happens *before* the
  shell starts, so shell quoting cannot protect it.
- `UNTRUSTED_COMMAND_STRING` — never build shell syntax from that text: no
  `eval`, `source`, generated script text, or `bash -c`/`sh -c` string.
- `UNTRUSTED_PRINTF_FORMAT` — never pass it as `printf`'s first argument; that
  slot is the format. The body belongs in an argument slot: `printf '%s\n' "$body"`.
- `UNTRUSTED_AWK_PROGRAM_OR_VAR` — never interpolate it into an awk program, and
  never pass the raw body through `awk -v`, which applies escape processing and
  can mutate parser input. Use stdin.

**Per-hop requirements:**

1. **Actions assignment** — event text in YAML `env:` only; no such expression
   may appear in any compiled `run:` block.
2. **Shell variable** — plain assignment only. No `eval`, command substitution,
   here-doc generation, or `bash -c`.
3. **`printf`** — literal format string; body always an argument.
4. **Pipe** — stdin bytes between stages; never re-materialized as shell syntax.
5. **`awk`** — static single-quoted program, body on stdin; awk variables carry
   trusted constants only.
6. **`grep`** — `grep -F -- "$pattern"`, quoted: `-F` forces fixed-string, `--`
   ends option parsing so `-e` or `--version` stay data.

**Verification requirement:** the gate must inspect **compiled** gh-aw output,
not just this markdown, and fail when a compiled `run:` block carries event
expressions, or when parser code passes a body variable as a `printf` format,
into `eval`/`bash -c`, or into an awk program/`awk -v`. A gate that cannot turn
red on a fixture whose `run:` prints a raw issue-body expression is not valid.

That gate is **implemented** (#1834) in `test/gh-aw-quality.test.ts` (describe
`gh-aw: compiled workflow shell input security contract`), backed by the scanner
in `test/gh-aw-shell-contract.ts` and the positive-control fixture
`test/fixtures/gh-aw-shell-contract/violating.lock.yml`. It runs in CI, which
installs `gh aw` and compiles this workflow (see `.github/workflows/squad-ci.yml`).
The gate fails closed: a missing compiler, an absent lock, or zero inspected
surfaces are failures, never skips.

Because the contract spans two artifacts, it is verified on two surfaces:

- **Hop 1 (`UNTRUSTED_TEMPLATE_IN_RUN`)** is a property of the compiled lock, so
  it is scanned there. Actions expands template expressions before the shell
  starts, so an attacker-controlled event expression left in a compiled `run:`
  block is the observable failure.
- **Hops 2–6 (`printf`/`eval`/`bash -c`/`awk`)** live in the `/squad` parser
  one-liners below, which gh-aw pulls in verbatim at runtime via a
  runtime-import of this file and never inlines into the lock. That
  runtime-imported source is therefore the only surface on which those hops can
  be observed, and the gate scans it directly. The steps below satisfy hops 2–6
  as written.

### Step PC-0: Normalize a dispatched command [MANDATORY on `workflow_dispatch`]

`workflow_dispatch` delivers a **bare** command — its input schema documents
`cast`, `implement`, `connect org/repo`, never `/squad implement`. PC-1 scans for
a literal `/squad` token, so a bare token yields `NO_COMMAND` and routes a valid
manual or relayed run into the PC-3 failure path. Normalize here rather than
loosening PC-1: on the comment and issue-body paths a missing token *is* the
error condition and must keep failing loudly (#1824). Only dispatch is
structurally guaranteed a command, so only it is normalized.

When `github.event_name` is `workflow_dispatch`, assign the **Dispatched
command** to `SQUAD_DISPATCH_COMMAND` per hop 1 and run exactly this. Its output
is the `SQUAD_TRIGGER_BODY` PC-1 consumes:

```bash
printf '%s\n' "$SQUAD_DISPATCH_COMMAND" | awk '{sub(/\r$/,"");sub(/^[[:space:]]+/,"");sub(/[[:space:]]+$/,"");if($0=="")next;f=1;if($0~/^\/squad([[:space:]]|$)/)print;else print "/squad " $0;exit}END{if(!f)print "EMPTY_DISPATCH"}'
```

Normalization is idempotent: `implement` and `/squad implement` both yield
`/squad implement`, so typing the slash prefix into the dispatch box is not
penalized. It scans the first non-empty line (#1835).

`EMPTY_DISPATCH` means the activation guard above should already have halted the
run. Halt with that guard's `::warning::`; never route it to PC-3, which posts a
comment and fails the run. An empty activation probe must stay silent and
side-effect free (PR #1777; junk issues #12 and #14).

On the comment and issue-body paths there is no PC-0: assign the raw body
directly to `SQUAD_TRIGGER_BODY`.

### Step PC-1: Extract the command argument [MANDATORY]

Assign the trigger body chosen above — PC-0's output on `workflow_dispatch`, the
raw comment or issue body otherwise — to `SQUAD_TRIGGER_BODY` per hop 1, then
run exactly this:

```bash
printf '%s\n' "$SQUAD_TRIGGER_BODY" | awk '{sub(/\r$/,"")} !f && match($0, /(^|[[:space:]])\/squad([[:space:]]|$)/) {f=1; rest=substr($0, RSTART+RLENGTH); sub(/^[[:space:]]+/,"",rest); sub(/[[:space:]]+$/,"",rest); print rest} END{if(!f) print "NO_COMMAND"}'
```

It scans **every** line, takes the first `/squad` token wherever it sits, and
prints the argument text that followed it. Empty output means a bare `/squad`.
Exactly `NO_COMMAND` means no `/squad` token exists anywhere in the body.

`match()`/`substr()` extract the remainder of the **first** token. Greedy
`sub(/^.*\/squad/,"")` strips through the *last* token on the line, so
`/squad cast, then /squad status` resolves to `status` — a different mode than
requested. First-token-wins is the contract; keep extraction anchored to
`RSTART`/`RLENGTH`.

### Step PC-2: Route on the extracted text

1. `NO_COMMAND` → go to **Step PC-3**. Do **not** fall back to `cast`, do not
   enter a skill, do not finish the run reporting success.
2. Empty → mode is `cast` (bare `/squad`).
3. Otherwise match **longest-prefix-first**:
   - `plan accept implementation` (3), `plan accept scope` (3), `plan program revise` (3)
   - `plan implementation` (2), `plan program` (2), `plan activate` (2), `plan validate` (2), `plan accept` (2), `plan revise` (2), `triage revise` (2)
   - `cast-member` (1), `plan` (1), `cast`, `connect`, `adopt`, `retire`, `status`, `review`, `research`, `triage`, `implement`
4. No prefix matches → go to **Step PC-3**.
5. **Phase selector:** If remaining args contain `phase {N}`, extract N.

### Step PC-3: No recognized command [MANDATORY — a no-op run must never report success]

Reaching this step means the run matched no mode: it cast nothing, planned
nothing, changed nothing. Reporting success here is the #1824 defect — a green
check and a real cast were indistinguishable, so a first-run user got an empty
team and no signal that anything had gone wrong.

1. Show the text actually present in the body:

   ```bash
   printf '%s\n' "$SQUAD_TRIGGER_BODY" | tr -d '\r' | grep -n -i -m 3 -F -- '/squad' || echo 'NO_SQUAD_TEXT_IN_BODY'
   ```

2. Emit `echo "::error::Squad parsed no recognized command. Text seen: <verbatim
   output of the command above>"`. Quote the observed text — never a generic
   "unrecognized command" message with the offending input omitted.
3. Post one comment on the triggering issue reproducing that same text verbatim
   and listing the valid commands from the Modes table.
4. **Fail the run** — exit non-zero. Never call `noop`, never post a success
   summary, never let the run finish green.

Deliberate widening: this scan also matches `/squad` inside a quoted line or a
fenced block. Excluding those would reintroduce a silent-skip path, which is the
exact bug class this step exists to eliminate. Parsing them and surfacing the
result is preferred over ignoring them without a trace.

**Known limitation — step 4 is an instruction, not an enforced exit code.** This
file is an LLM prompt, so "fail the run" is a directive the runtime agent is
asked to obey, not a branch CI can execute. `test/gh-aw-command-parse.test.ts`
proves the *declared* commands emit `NO_COMMAND` and a diagnostic quoting the
offending text; it cannot prove the agent then exits non-zero. That gap is
inherent to gh-aw, not an oversight — two independent reviews have flagged it.
Steps 1–3 are load-bearing precisely because their output is observable: an
`::error::` annotation and an issue comment survive whatever exit status the
agent chooses. Do not drop them in favor of step 4, and do not call step 4 a
guarantee.

## Actor Authorization Guard

Run this guard after **Step PC-2** resolves the parsed mode and before **Execute Mode** loads any skill.

### Step AG-1: Classify the parsed mode [MANDATORY]

Authorization is opt-out only for the explicit open-mode allow-list below. Never infer "read-only" from a prefix, from the absence of a mutating keyword, or from prose. Anything outside the allow-list — including empty, malformed, or future mode strings — requires authorization or should already have been stopped by **Step PC-3**. Unknown text must never bypass this guard by being treated as read-only.

Assign the parsed mode string from **Step PC-2** to `SQUAD_PARSED_MODE` and run exactly this:

```bash
mode="${SQUAD_PARSED_MODE-}"
case "$mode" in
  status|review|research|plan)
    echo READ_ONLY
    ;;
  *)
    echo AUTH_REQUIRED
    ;;
esac
```

- `READ_ONLY` → skip the permission lookup entirely and continue to **Execute Mode** unchanged.
- `AUTH_REQUIRED` → continue to **Step AG-2**.

**Open-mode allow-list:** `status`, `review` (advisory relay), `research`, and
`plan` (plan preview). These commands remain available to any actor. Every
other recognized mode changes repository state, revises or advances a durable
planning artifact, or dispatches implementation work, so it requires
authorization.

### Step AG-2: Resolve actor permission [MANDATORY for `AUTH_REQUIRED`]

When **Step AG-1** returned `AUTH_REQUIRED`, resolve the event, actor, and repository only through named YAML `env:` bindings; never embed Actions expressions inside a shell block. Use `github.event_name` for `SQUAD_EVENT_NAME`, `github.actor` for `SQUAD_TRIGGER_ACTOR`, and `github.repository` for `SQUAD_REPOSITORY`.

GitHub requires write access to trigger `workflow_dispatch`. That platform authorization also covers the controlled `dispatch-workflow` relay from `squad-implement-worker`; do not look up the relay bot as though it were a human collaborator. For all issue, issue-comment, and pull-request-review-comment paths, call the collaborator-permission API for the triggering actor.

```bash
event="${SQUAD_EVENT_NAME-}"
actor="${SQUAD_TRIGGER_ACTOR-}"
repository="${SQUAD_REPOSITORY-}"
if [ "$event" = "workflow_dispatch" ]; then
  echo DISPATCH_AUTHORIZED
elif [ -z "$actor" ] || [ -z "$repository" ]; then
  echo PERMISSION_UNRESOLVED
else
  perm="$(gh api "repos/$repository/collaborators/$actor/permission" 2>/dev/null | jq -r '.permission // empty' 2>/dev/null || true)"
  if [ -n "$perm" ]; then
    printf '%s\n' "$perm"
  else
    echo PERMISSION_UNRESOLVED
  fi
fi
```

Only the exact `workflow_dispatch` event receives `DISPATCH_AUTHORIZED`; never use a generic event fallback. On every other event, API errors, empty output, and missing actor/repository identity are all `PERMISSION_UNRESOLVED`. Fail closed — never continue a mutating mode on an unresolved permission signal.

### Step AG-3: Decide authorization [MANDATORY]

Assign **Step AG-1**'s output to `SQUAD_MODE_AUTH_CLASS` and **Step AG-2**'s output to `SQUAD_ACTOR_PERMISSION`, then run exactly this:

```bash
mode_class="${SQUAD_MODE_AUTH_CLASS-}"
perm="${SQUAD_ACTOR_PERMISSION-}"
if [ "$mode_class" = "READ_ONLY" ]; then
  echo AUTH_SKIPPED
else
  case "$perm" in
    DISPATCH_AUTHORIZED|admin|maintain|write) echo AUTHORIZED ;;
    *) echo REFUSE ;;
  esac
fi
```

- `AUTHORIZED` → continue to **Execute Mode**.
- `AUTH_SKIPPED` → continue to **Execute Mode**.
- `REFUSE` → go to **Step AG-4**. This includes `read`, `triage`, `none`, `PERMISSION_UNRESOLVED`, empty output, and every other value not explicitly authorized above.

### Step AG-4: Refuse unauthorized mutation loudly [MANDATORY]

When **Step AG-3** returned `REFUSE`:

1. Emit `echo "::error::Squad refused mutating mode '<parsed mode>' for actor '<actor>' — repository permission admin, maintain, or write is required"` so the run log is visibly red. If the permission lookup failed, say that it was unresolved instead of inventing a tier.
2. Use the existing `add-comment` safe-output to post exactly one refusal comment on the triggering issue or pull request:
   `⛔ /squad <parsed mode> was refused for @<actor> (repository permission: <observed tier or unresolved>). Mutating /squad modes require write, maintain, or admin repository permission. Ask a repository maintainer to run this command or grant the required access.`
3. Stop immediately. Do not load **Execute Mode**, do not post success breadcrumbs for the requested mutating mode, and do not emit `dispatch-workflow`, `create-issue`, or `create-pull-request`.

**Authorization-required modes guarded by this section:** `cast`, `connect`, `adopt`, `cast-member`, `retire`, `plan revise`, `triage`, `triage revise`, `plan program`, `plan program revise`, `plan implementation`, `plan validate`, `plan accept`, `plan accept scope`, `plan accept implementation`, `plan activate`, and `implement`. Phase variants inherit their base parsed mode: `plan accept phase {N}` → `plan accept`, `plan accept implementation phase {N}` → `plan accept implementation`, `plan activate phase {N}` → `plan activate`.

## Execute Mode

Each mode's playbook ships as a **skill**. Enter this section only after **Actor Authorization Guard** returned `AUTHORIZED` or `AUTH_SKIPPED`. Load only the one skill for the parsed mode, then follow it verbatim.

**MODE ISOLATION:** Execute ONLY the active mode's skill. Other modes' instructions do not apply — do not load more than one mode skill.

**BREADCRUMB ≠ DELIVERABLE:** Every mode posts an acknowledgment first. This is never the deliverable — always complete ALL subsequent steps.

| Parsed mode | Skill to load |
|---|---|
| `cast` | `squad-cast` |
| `connect` | `squad-connect` |
| `adopt` | `squad-adopt` |
| `cast-member` | `squad-cast-member` |
| `retire` | `squad-retire` |
| `status` | `squad-status` |
| `review` | `squad-review-relay` |
| `research` | `squad-research` |
| `plan` | `squad-plan` |
| `plan revise` | `squad-plan-revise` |
| `triage` | `squad-triage` |
| `triage revise` | `squad-triage-revise` |
| `plan program` | `squad-plan-program` |
| `plan program revise` | `squad-plan-program-revise` |
| `plan implementation` | `squad-plan-implementation` |
| `plan validate` | `squad-plan-validate` |
| `plan accept` | `squad-plan-accept` |
| `plan accept scope` | `squad-plan-accept-scope` |
| `plan accept implementation` | `squad-plan-accept-implementation` |
| `plan activate` | `squad-plan-activate` |
| `implement` | `squad-implement` |

**Planning modes only** — before running the mode skill, also load `squad-planning-policy` (policy resolution) and `squad-planning-ontology` (artifact schemas and the lifecycle state machine). The non-planning modes (Cast, Connect, Adopt, Cast Member, Retire, Status, Review Relay, Implement) must not load them.

If the parsed mode's skill cannot be loaded, report the failure in plain language and stop. Never improvise a mode playbook from memory.

---

## Team Guard

**Applies to:** Research, Triage, Plan, Plan Program, Plan Implementation, Plan Validate, Plan Revise, Triage Revise, Plan Accept, Plan Accept Scope, Plan Accept Implementation, Plan Activate.
**Exempt:** Cast, Connect, Adopt, Cast Member, Retire, Status, Review Relay, Implement (these run their own pre-checks).

### Step TG-1: Check Team Presence

```bash
git show HEAD:.squad/team.md 2>/dev/null | awk '{sub(/\r$/,"")} /^## Members/{f=1;next} f&&/^#/{f=0} f&&/^\|/&&!/^\|[-: |]*\|$/&&!/\| *Name *\|/' | grep -q . && echo TEAM_PRESENT || echo TEAM_ABSENT
```

`TEAM_PRESENT` requires at least one Markdown table data row inside the `## Members` section of the **git-committed HEAD revision** of `.squad/team.md`. Neither the header row (`| Name | Role | … |`) nor the separator row (`|---|---|`) qualifies. A path absent from HEAD, an empty committed file, a header-only scaffold, or zero member rows all yield `TEAM_ABSENT`.

**Why committed HEAD, not local files:** an activation pre-step (e.g. `squad init --preset default`) can restore a local `.squad/` scaffold before the job runs; reading the local filesystem would return TEAM_PRESENT for that uncast scaffold. `git show HEAD:.squad/team.md` reads only committed state, so activation-restored local files are invisible to the guard.

The leading `sub(/\r$/,"")` normalizes CRLF so Windows-formatted team.md classifies correctly. No commits → `git show` exits non-zero → TEAM_ABSENT.

- `TEAM_PRESENT` → proceed to the original mode's section.
- `TEAM_ABSENT` → execute **Auto-Cast Pivot** below; do not proceed with the original mode this run.

### Step TG-2: Certify the Roster Set [MANDATORY when TEAM_PRESENT]

Every step that mints a `squad:{name}` label or binds an `Owner`/`Agent` value binds **only** to this command's stdout. Run once.

```bash
TEAM_MD="$(git show HEAD:.squad/team.md 2>/dev/null)"
if [ -z "$TEAM_MD" ]; then
  echo "ROSTER_UNREADABLE: .squad/team.md absent from HEAD"
elif ! printf '%s\n' "$TEAM_MD" | awk '{sub(/\r$/,"")} /^## Members/{f=1} END{exit !f}'; then
  echo "ROSTER_UNREADABLE: no ## Members section in .squad/team.md"
else
  ROSTER="$(printf '%s\n' "$TEAM_MD" | awk -F'|' '
    {sub(/\r$/,"")}
    /^## Members/{f=1;next}
    f&&/^#/{f=0}
    f&&/^\|/{
      if(col==0){for(i=1;i<=NF;i++){h=$i;gsub(/^[ \t]+|[ \t]+$/,"",h);if(h=="Name")col=i}next}
      if($0 ~ /^\|[-: |]*\|$/)next
      if(col==0)next
      n=$col;gsub(/^[ \t]+|[ \t]+$/,"",n);if(n!="")print tolower(n)}
    END{if(col==0)print "__NOCOL__"}')"
  if printf '%s\n' "$ROSTER" | grep -q "__NOCOL__"; then
    echo "ROSTER_UNREADABLE: no Name column in ## Members table"
  elif [ -z "$ROSTER" ]; then
    echo "ROSTER_UNREADABLE: ## Members has no data rows in .squad/team.md"
  else
    printf '%s\n' "$ROSTER" | awk '{print "ROSTER_MEMBER: " $0}'
  fi
fi
```

Reuses TG-1's committed-HEAD read (working-tree presets cannot leak); finds the `Name` column by header and emits one lowercased `ROSTER_MEMBER: {name}` per `## Members` data row, else a `ROSTER_UNREADABLE: {reason}`.

- **`ROSTER_MEMBER:` lines** are the **certified roster set** — bind only to these, reproduce them verbatim as provenance; a name outside them (bar `@copilot`) must never become a `squad:{name}` label.
- **`ROSTER_UNREADABLE:`** halts binding with its named reason — never a provenance sentence for a read that did not happen, never a preset fallback; treat as `TEAM_ABSENT`.

### Auto-Cast Pivot

**Canonical command variables** (derived from Parse Command output — never from raw input):
- `{canonical_mode}` — the parsed mode enum (e.g., `research`, `plan`, `plan-activate`); if the mode cannot be determined, substitute the literal string `squad` in prose
- `{canonical_command}` — reconstructed user-safe command: `/squad {canonical_mode}` with optional `phase {N}` suffix; if `{canonical_mode}` cannot be determined, use `/squad` as the safe fallback
- `{phase_n}` — numeric phase if present; omit the field otherwise

**Universal response invariant:** current state · result · one primary next action · recovery on ⚠️/🔴.

#### TG-3: Dedup Open Cast PR

```bash
gh pr list --state open --json number,url,headRefName --jq '[.[] | select(.headRefName | (startswith("squad/cast-") and (startswith("squad/cast-member-") | not)))] | first'
```

**If an open Cast PR is found (rerun before merge):**
- `add-comment`:
  ```
  🤖 Squad has already opened a Cast PR for this issue.

  **Current state:** Cast PR open — your team is ready for review.
  **Result:** No duplicate PR opened.
  **Next action:** Merge the Cast PR, then return to this issue and rerun: `{canonical_command}`

  **Cast PR:** {pr_url}
  ```
- Stop. Do not run Cast mode.

**If no open Cast PR found (first run, failed run, or a prior Cast PR was closed):**
- Execute Cast Mode Steps 0–6 using this issue as the casting brief.
- The Cast PR body may reference the originating issue and canonical command in plain language, but MUST NOT contain `Fixes`, `Closes`, or `Resolves` closing keywords for the originating work issue.
- Then `add-comment`:
  ```
  🤖 Your `{canonical_mode}` command found no team yet — Squad has automatically opened a Cast PR to assemble one.

  **Current state:** No team detected — Squad auto-pivoted to Cast.
  **Result:** A Cast PR has been opened. Your `{canonical_mode}` command is paused this run — resume it after merging.
  **Next action:** Merge the Cast PR, then return to this issue and rerun: `{canonical_command}`

  ⚠️ A direct Cast PR link is not available in this comment. Find it in the **Pull Requests** tab.
  ```
- A closed or failed Cast PR is not durable team state. A later rerun with no committed roster and no open Cast PR MUST attempt Cast again.
- Stop. Do not run the original command this run.

**Recovery (Cast step failure):** Report the exact error in plain language. Tell the user to rerun `{canonical_command}` on this issue to retry. Never instruct the user to run `/squad cast` separately.

---

## skill: `squad-cast`
---
description: "Cast a Squad team: analyze the repo, compose agents, assign character names, scaffold .squad/, open the Cast PR."
---

Analyze repo, compose team, assign character names from a fictional universe, generate `.squad/` scaffolding, open PR.

**Acknowledge:** `🤖 Squad is analyzing your repo and assembling a team…`

##### Step 0: Brief Resolution

Evaluate issue (title + body) and repo content to determine primary casting input:

| Repo | Issue | Result |
|------|-------|--------|
| Empty | Empty | **Noop** — post "Nothing to cast from" message, stop |
| Empty | Has content | **Issue wins** |
| Has content | Has content | **Merge** — repo base, issue augments/overrides |
| Has content | Empty/minimal | **Repo wins** |
| Any | Explicit team spec | **Issue is source of truth** |

"Explicit source-of-truth signal" = issue reads like a team spec (role lists, team-size declarations, operating-model descriptions).

##### Step 1: Repo Analysis

Analyze: languages/frameworks, project structure, CI/CD, testing, docs, tooling, README/purpose. Produce mental summary: project type, technologies, team size (4–7), needed specialist roles.

##### Step 2: Team Composition

Every team gets a **Lead**. Then allocate specialists based on signals:

| Signal | Role |
|--------|------|
| Frontend framework | Frontend Engineer |
| Backend/API | Backend Engineer |
| DB schemas/migrations | Data Engineer |
| Test suites | Test Engineer |
| CI/CD, Docker | DevOps/Platform |
| Auth, crypto | Security Engineer |
| Docs, tutorials | DevRel/Docs |
| Multiple packages | Integration Engineer |
| ML/data pipelines | ML Engineer |
| Mobile | Mobile Engineer |

Guidelines: 4–7 agents. Min: Lead + 2 specialists + 1 quality role. Scribe, Ralph, Rai are built-in (don't count).

##### Step 3: Universe & Name Allocation

1. Count agents from Step 2.
2. Select universe (pick one whose capacity fits with minimal waste):

| Universe | Cap | Shape |
|----------|-----|-------|
| The Usual Suspects | 6 | small, noir |
| Reservoir Dogs | 8 | small, noir |
| Alien | 8 | small, sci-fi |
| The Goonies | 8 | small, adventure |
| The Matrix | 10 | medium, sci-fi |
| Firefly | 10 | medium, sci-fi |
| Star Wars | 12 | medium, sci-fi |
| Breaking Bad | 12 | medium, drama |
| Futurama | 12 | medium, sci-fi |
| Ocean's Eleven | 14 | medium, heist |
| Arrested Development | 15 | medium, comedy |
| Lost | 18 | large, mystery |
| DC Universe | 18 | large, action |
| The Simpsons | 20 | large, comedy |
| Marvel Cinematic Universe | 25 | large, action |

3. Name rules: one universe only, pressure/function over authority, no spoilers, early-introduction names, Scribe/Ralph/Rai keep built-in names.
4. Record in `.squad/casting/registry.json`: `{ "agents": { "{id}": { "created_at": "ISO", "persistent_name": "Name", "universe": "Universe", "legacy_named": false, "status": "active" } } }`
5. Initialize `.squad/casting/history.json`: `{ "universe_usage_history": [{ "universe": "Name", "assigned_at": "ISO", "agent_count": N }], "assignment_cast_snapshots": {} }`

##### Step 4: Generate Scaffolding

Create/replace:

1. **`.squad/team.md`** — Roster table: Coordinator (Squad), Members (Name|Role|Charter path|Status), always-on (Scribe, Ralph, Rai), Coding Agent (@copilot with `copilot-auto-assign: false`).
2. **`.squad/agents/{id}/charter.md`** — Per agent: `# Name — Role`, Identity block (name, role, expertise, style), "What I Own", Boundaries (handle/don't), Model: auto.
3. **`.squad/routing.md`** — Domain→agent routing table.
4. **`.squad/casting/registry.json`** — From Step 3.
5. **`.squad/casting/history.json`** — From Step 3.
6. **`.squad/casting/policy.json`** — Standard policy with all 15 universes.
7. **`.squad/decisions/`** — Empty directory.
8. **`.github/agents/squad.agent.md`** — Verify exists (from `squad init`), include in PR.

##### Step 5: Generate meet-the-squad.md

Create `meet-the-squad.md` at repo root with: title, universe name, team table (Name|Role|Specialty|How to talk), Always-On Support table, How to Work With Your Squad (label-based assignment with `9B8FCC` color, iteration commands, routing reference), "What Happened Here" block with analysis rationale (languages, structure, CI/CD, rationale), footer with cast date.

##### Step 6: Open PR

`create-pull-request`: branch `squad/cast-{repo}`, title `[squad] Cast your Squad — {description}`, body with team summary. Append to the PR body: "After merging, return to the originating issue and rerun `{canonical_command}` to resume your work." Files: `.squad/`, `.github/agents/squad.agent.md`, `meet-the-squad.md`. Stage only these.

##### Step 7: Post Completion

`add-comment`: `🧑‍🤝‍🧑 Your Squad is ready for review.\n\n**PR:** #{pr_number}\n\nMerge the PR to activate your team. Run /squad status afterward to verify.`

## skill: `squad-review-relay`
---
description: Relay `/squad review` on a pull request to the independent reviewer.
---

This mode is only valid from a pull request comment or pull request review
comment. Resolve the pull request number and current 40-character lowercase
head SHA from GitHub's API, not from user text. If either cannot be established,
post one `add-comment` explaining that `/squad review` must target a pull
request, then stop without dispatching.

Use only the typed `dispatch-workflow` safe-output. Never call the generic
`dispatch_workflow` tool. Emit exactly one dispatch:

```json
{
  "workflow_name": "squad-review",
  "inputs": {
    "issue_number": "{pull-request-number}",
    "expected_head_sha": "{current-head-sha}",
    "request_origin": "manual"
  }
}
```

Do not review the diff in this router, emit a verdict, edit files, create an
issue, or dispatch any other workflow. The independent reviewer owns all
provenance, deduplication, and review decisions.

## skill: `squad-connect`
---
description: Connect an existing external team source into Squad.
---

Link repo to an external Squad source. Commits only a config pointer.

**Acknowledge:** `🤖 Squad is setting up the remote connection…`

1. **Parse source:** Extract `owner/repo` from args. Accept full URLs or shorthand. If missing, post usage help, stop.
2. **Validate:** Run `gh api repos/{owner}/{repo}/contents/.squad/team.md --jq .name`. On 404/error, post error comment, stop.
3. **Write config:** Create `.squad/config.json`: `{ "squadSource": "{owner}/{repo}", "mode": "connect", "connectedAt": "ISO" }`. Only `.squad/` file committed.
4. **Generate meet-the-squad.md** with Connect rationale: "externally managed — connected from `{source}`."
5. **Open PR:** `create-pull-request`: branch `squad/connect-{repo}`, files: `.squad/config.json`, `meet-the-squad.md` only.
6. **Post:** `🔗 Squad connection configured.\n\n**PR:** #{pr_number}`

## skill: `squad-adopt`
---
description: Adopt a team definition from a URL into .squad/.
---

Fetch complete squad from remote, commit locally. No ongoing sync.

**Acknowledge:** `🤖 Squad is importing the team definition…`

1. **Parse source:** Same as Connect. If missing, post usage help, stop.
2. **Validate & fetch:** `gh api repos/{owner}/{repo}/contents/.squad --jq '.[].name'`. On error, post, stop. Fetch `.squad/` recursively + `.github/agents/squad.agent.md` if exists.
3. **Install:** Copy `.squad/` (replacing init scaffolding) + agent file. Write `.squad/config.json`: `{ "squadSource": "{owner}/{repo}", "mode": "adopt", "adoptedAt": "ISO" }`.
4. **Adapt:** Update `.squad/routing.md` paths and charter references to match target repo structure.
5. **Generate meet-the-squad.md** with Adopt rationale: "adopted from `{source}` and now locally owned."
6. **Open PR:** `create-pull-request`: branch `squad/adopt-{repo}`, files: `.squad/`, `.github/agents/squad.agent.md`, `meet-the-squad.md`.
7. **Post:** `📥 Squad adopted from remote source.\n\n**PR:** #{pr_number}`

## skill: `squad-cast-member`
---
description: Add a single new member to an existing Squad team.
---

Add/modify/rename a single team member within an existing squad.

Subcommands: `/squad cast-member <description>` (add), `/squad cast-member rename|modify <name> to <change>`.

1. **Parse:** Determine operation (add vs modify/rename).
2. **Validate squad:** Confirm `.squad/team.md` and registry exist. If not, suggest `/squad cast`, stop.
3. **Check duplicates** (new only): If similar role exists, ask user to confirm.
4. **Allocate identity** (new only): Same universe, unused name, same naming rules. If universe full, suggest retire or re-cast.
5. **Generate/regenerate charter:** New: create from template. Modify: update expertise/ownership/boundaries, preserve name and `created_at`.
6. **Update files:** `.squad/team.md`, `.squad/routing.md`, `.squad/casting/registry.json`, `meet-the-squad.md`.
7. **Open PR:** On Squad PR: follow-up PR targeting existing branch. On issue: `create-pull-request` branch `squad/cast-member-{id}`, title `[squad] Add/Modify {Name}`.
8. **Post:** `👤 {Name} ({Role}) has been added to the team.\n\n**PR:** #{pr_number}`

## skill: `squad-retire`
---
description: Retire a named member from the Squad team.
---

Remove a member from active roster, archive charter.

1. **Identify:** Match arg against name/role/id (case-insensitive). If no/ambiguous match, list active members, ask to clarify.
2. **Archive:** Move `.squad/agents/{id}/` to `.squad/agents/_alumni/{id}/`. Add retirement header to charter.
3. **Update files:** Registry: set `status: "retired"`, add `retired_at`. team.md: remove row. routing.md: remove/reassign rules. meet-the-squad.md: remove from table.
4. **Open PR:** Same context-aware behavior as Cast Member. Branch: `squad/retire-{id}`.
5. **Post:** `👋 {Name} has been retired from the team.\n\n**PR:** #{pr_number}`

## skill: `squad-status`
---
description: Report current Squad team and planning lifecycle status.
---

Read-only team composition report.

**Acknowledge:** `🤖 Squad is checking team status…`

1. If `.squad/team.md` missing, reply "no squad cast yet, suggest `/squad cast`".
2. Read team.md + registry.json.
3. Post comment: team name, universe, member count, active members table, link to team.md.

## skill: `squad-implement`
---
description: Dispatch implementation work to the squad-implement-worker workflow.
---

Implement mode dispatches an isolated implementation worker for a regular issue.
When invoked on a parent (initiative or epic), it descends the sub-issue
hierarchy to the **leaf tasks** and dispatches workers for up to three currently
unblocked leaf tasks. The worker relays merged implementation pull requests back
to this mode so it can automatically refill the parent's available slots.

**Acknowledge:** Post `🤖 Squad is preparing implementation…` using the
`add-comment` safe-output.

##### Step 1: Validate and Gather Context

1. Resolve the target issue number using the Trigger Context resolution order:
   the interpolated dispatched issue number when non-empty, otherwise the
   triggering issue. If invoked from a pull request review comment, explain that
   `/squad implement` must be run from the target issue.
2. Read the target issue title, body, labels, state, and relevant comments.
3. Discover the target's open descendant issues using native GitHub sub-issue
   relationships, descending recursively through **every** level of the
   hierarchy (initiative → epic → task), not just immediate children. Also
   include open issues whose body contains a `Parent: #{ancestor-issue-number}`
   line for any ancestor, for compatibility with older plans.
4. Identify the **leaf tasks**: open descendants that have **no sub-issues at
   all** — neither open nor closed — and are not labeled `epic` or `initiative`.
   Intermediate parents (initiatives and epics that only group other issues)
   are never dispatched to a worker — only leaf tasks are implemented. Use "no
   sub-issues at all" rather than "no *open* sub-issues": an epic whose children
   have all been implemented and closed stays open until someone closes it, and
   an open-children-only test would reclassify that drained epic as a leaf and
   dispatch a worker against a grouping issue. That is the #1758 defect 2
   failure shape reappearing at the end of an epic's life, and it is reachable
   whenever a refill scan descends from the root across sibling epics.
5. If the target has one or more open leaf descendants, treat the target as a
   parent and follow the Epic Dispatch procedure below over the leaf-task set.
   Do not implement the parent body directly.
6. If the target has no open descendants (it is itself a leaf), call the
   workflow-specific `squad_implement_worker` safe-output tool with `issue_number`
   set to the target issue number.
7. Post a comment linking the dispatched worker run. The worker performs
   dependency, duplicate pull request, routing, implementation, and validation
   checks.

##### Epic Dispatch

For each open leaf task in the target's descendant set:

1. Parse its `Depends on:` line and check the state of every referenced issue.
2. Exclude leaf tasks with any open dependency.
3. Find leaf tasks that already have an open pull request whose branch starts
   with `squad/implement-{leaf-number}-` or whose body closes that leaf task.
   These are active implementation tasks.
4. Calculate `available-slots = max(0, 3 - active-implementation-count)`.
5. Exclude active implementation tasks from the ready set.
6. Sort ready leaf tasks by issue number and select at most `available-slots`.

For each selected leaf task, call the workflow-specific `squad_implement_worker`
safe-output tool with this input:

```json
{
  "issue_number": "{leaf-issue-number}"
}
```

Never call the generic `dispatch_workflow` tool. Never emit a dispatch without a
non-empty numeric `issue_number`. Emit exactly one workflow-specific dispatch
per selected leaf task, and only report a leaf task as dispatched after the tool
returns success.

Post a comment on the target listing the dispatched leaf tasks, blocked leaf
tasks, leaf tasks with existing implementation pull requests, and any ready leaf
tasks deferred because all three slots are occupied. If no leaf task is ready or
no slot is available, post the status summary and do not dispatch a workflow.

**Always leave a visible next step.** Every Implement run against a parent ends
with a comment on that parent — never a silent exit. Cover each terminal case:

- Leaf tasks dispatched → name them and state how many leaf tasks remain open.
- All remaining leaf tasks blocked → name the blocking dependencies.
- All three slots occupied → name the in-flight pull requests.
- No open leaf tasks left → state that the parent's implementation is complete.

Never emit `noop` for an Implement run. `noop` is not reported as a comment, so
it strands the parent with no signal about what to do next — the exact failure
this procedure exists to prevent.

After each implementation pull request merges, this workflow runs again and
fills newly available slots. Continue until the parent has no open leaf tasks.
`/squad implement` remains available as a manual recovery command.

## skill: `squad-research`
---
description: Produce the research artifact that seeds planning for an issue.
---

Deep analysis → structured findings comment. Read-only + comment. Works on open/closed issues.

**Acknowledge:** `🤖 Squad is researching this…`

**TASK:** Steps 1–4. The deliverable is Step 3's findings comment. Reserve ≥40% budget for Step 3.

##### Step 1: Determine Scope

- Issue-driven: issue has substantial content → research codebase in that context.
- Repo-driven: issue minimal → general architecture/health assessment.
- Combined: issue is lens on repo.
- Text after `/squad research` = research focus.

##### Step 2: Deep Repo Analysis

Budget-aware breadth-first investigation: architecture mapping, technology audit, code health, gap analysis, risk identification, prior art. If `.squad/team.md` exists, frame findings by team ownership.

##### Step 3: Post Findings

`add-comment` with `data: {"squad_artifact":"research","schema_version":"1","origin_issue":{issue_number},"phases":[]}`.

Structure: `## 🔬 Squad Research — {Title}` → Summary (2-3 sentences) → **Goals** → **Non-goals** → **Evidence table** (columns `Rn` | Finding | Risk 🟢/🟡/🔴 | Complexity S/M/L/XL | Citation) → **Load-bearing assumptions** → **Open decisions** → **Acceptance framing** → Recommendations (each referencing the `Rn` IDs it rests on) → Next Step (`/squad triage` or `/squad plan`).

**Structural contract (not a length floor).** The artifact MUST contain every one of these labeled sections: **Evidence table**, **Goals**, **Non-goals**, **Load-bearing assumptions**, **Open decisions**, **Acceptance framing**. Every evidence row carries a stable `Rn` traceability ID (`R1`, `R2`, …) and exactly one citation token — a file path, `path:line`, URL, or `#issue`/`#pr` reference — so each finding is independently checkable. Recommendations and load-bearing assumptions reference the `Rn` IDs they rest on. Assert structure, not length: never pad to hit a size target.

##### Step 4: Verify Completion [MANDATORY]

Confirm ALL of the following, each independently checkable from the posted comment without re-running research. If ANY fails, fix and re-post now:

1. Structured artifact `data` posted.
2. `## 🔬 Squad Research` heading present.
3. Every required section present: **Evidence table**, **Goals**, **Non-goals**, **Load-bearing assumptions**, **Open decisions**, **Acceptance framing**.
4. Every evidence row has a unique `Rn` ID and exactly one citation token.
5. ≥1 recommendation, each tracing to ≥1 `Rn` ID.

## skill: `squad-plan`
---
description: Produce the plan artifact from research for an issue.
---

Decompose issue into sub-issues as a comment. Does NOT create issues. Works on open/closed issues.

**Acknowledge:** `🤖 Squad is creating a plan…`

**TASK:** Steps 1–3. Deliverable = Step 3.

##### Step 1: Gather Context

1. Read issue body (the epic/brief).
2. Find latest `research` artifact comment for this issue. If found, use as primary context. If not, do lightweight repo analysis.
3. Read `.squad/team.md` if it exists. **Owner/Agent binding rule:** permitted
   `Owner`/`Agent` values are Team Guard Step TG-2's certified roster set — the
   `Name` column of `## Members` in **this repository's** `.squad/team.md` — plus
   `@copilot`. Map each item's domain to a member via `.squad/routing.md` and emit
   that member's exact `Name` cell — never a recalled name, never another column
   (the `Role` column included). If none fits, use `@copilot`. Governs every
   `Owner`/`Agent` column and `squad:{owner}` label downstream.
4. Text after `/squad plan` = planning guidance.

##### Step 2: Decompose

Break into discrete work items. **Minimum 3 items** unless genuinely atomic (explain why if fewer). Each item: independently deliverable, single-owner, testable, right-sized. Consider: dependency order, parallel tracks, risk ordering, vertical slices.

##### Step 3: Post Plan

`add-comment` with `data: {"squad_artifact":"plan","schema_version":"1","origin_issue":{issue_number},"phases":[]}`.

Structure: `## 📋 Squad Plan — {Title}` → reference line → Phase tables (# | Title | Owner | Size | Depends On) → Details per item (Scope, Acceptance criteria, Notes) → Dependency Graph → Execution Notes → Next Steps (`/squad plan accept`, `/squad plan accept phase 1`, `/squad plan revise`, `/squad plan`).

Re-check every `Owner` against the Step 1 permitted set before posting; a value absent from it is invalid and must be re-resolved.

Do NOT create issues.

## skill: `squad-plan-accept`
---
description: Accept a plan (whole plan or a single phase) and record the accepted artifact.
---

`/squad plan accept` [phase {N}] — combines scope+impl+activation for simple workflows.

**Behavior:** If `program` or `implementation` artifacts exist, run Accept Scope → Accept Impl → Activate in sequence. If only a `plan` artifact exists, use legacy behavior below.

**Acknowledge:** `🤖 Squad is creating the planned issues…`

##### Step 1: Find Plan and Route

Resolve which planning path this issue is on, in this order:

1. Find the latest `program` and `implementation` artifacts for this issue. If
   **either** exists, this is a granular (long-path) plan. Run the granular
   sequence in this exact order — **Accept Scope** (`squad-plan-accept-scope`) →
   **Accept Implementation** (`squad-plan-accept-implementation`) → **Activate**
   (`squad-plan-activate`) — each honoring its own preconditions (e.g. Accept
   Implementation requires a `validation` PASS). Then stop; do NOT run the
   legacy fast-path steps below.
2. Otherwise, find the latest `plan` artifact. If found, continue with the
   legacy fast-path behavior in the steps below.
3. If none of `program`, `implementation`, or `plan` exist, reply "No plan found.
   Run `/squad plan` first." and stop.

##### Step 1a: Phase Resolution

1. Extract `requested_phase` from args (or null).
2. Find the latest `phases-accepted` artifact and read its `phases` array → `accepted_phases` (or []).
3. Validate: already-accepted → stop with next-available hint. Out-of-order → stop with sequential hint.
4. Filter items: by phase if set, by unaccepted if prior phases exist, all if fresh.
5. If no items remain after filter: stop.

##### Step 2: Create Sub-Issues — Hierarchical

If plan has phases: Root → Phase issues → Task issues. Flat plan: tasks directly under root.

For each work item, `create-issue`:
- Title: work item title
- Labels: `squad` (color `9B8FCC`), plus `squad:{owner}` (color `9B8FCC`) where `{owner}` is the `Owner` lowercased. Mint `squad:{owner}` **only** when that value matches a `ROSTER_MEMBER:` line from Team Guard Step TG-2 — its stdout (the certified roster set, from the `Name` column of `## Members` in `.squad/team.md`) is the sole source; never re-read team.md or recall a name. Uncertified `Owner`: apply only `squad`, fall back to `@copilot`. On `ROSTER_UNREADABLE:`, stop and report that reason; never mint from a preset or remembered roster.
- Body: scope, acceptance criteria, context (parent, phase, size, depends on, owner), notes, footer
- Parent: phase issue (hierarchical) or root (flat)
- Size: set Project field if available, else body `**Size:**` line

Cross-phase deps: look up real issue numbers from prior acceptance comments.

Create in dependency order. Labels must have descriptions and colors.

##### Step 3: Native Dependency Edges

Add `blockedBy` relationships via GitHub API. Graceful fallback to body-text references if unavailable.

##### Step 4: Post Summary

Artifact data varies:
- Phase-specific: `data: {"squad_artifact":"phases-accepted","schema_version":"1","origin_issue":{issue_number},"phases":[{accumulated}]}` → Phase accepted table + remaining phases table
- Full (no phases): `data: {"squad_artifact":"plan-accepted","schema_version":"1","origin_issue":{issue_number},"phases":[]}` → All issues table

## skill: `squad-plan-revise`
---
description: Revise an existing plan artifact from reviewer feedback.
---

**Acknowledge:** `🤖 Squad is revising the plan…`

1. Find the latest `plan` artifact. If none: reply "No plan found."
2. Read feedback after "revise".
3. Apply feedback to plan.
4. **EDIT the existing artifact comment** (never post a duplicate).
5. Prepend revision note.

## skill: `squad-triage`
---
description: Triage a plan into classified work items and update lifecycle state.
---

Classify research findings as work/decision/excluded. Bridge between research and planning. Works on open/closed issues.

**Acknowledge:** `🤖 Squad is triaging research findings…`

**TASK:** Steps 1–4. Deliverable = Step 3.

The planning ontology is imported — follow its schemas directly.

##### Step 1: Validate

1. Find the latest `research` artifact for this issue. If none: reply "Run `/squad research` first." Stop.
2. Read root issue body (the Intent). If empty: reply "Issue body empty — add description." Stop.

##### Step 2: Classify

For each finding, assign disposition:
- **`work`**: needs building/changing. Include scope sketch, effort (S/M/L/XL), rationale.
- **`decision`**: requires human judgment. Flag question, impact, what it blocks.
- **`excluded`**: not relevant to intent. Reference intent in justification.

Default to `decision` when uncertain.

##### Step 3: Post Triage

`add-comment` with `data: {"squad_artifact":"triage","schema_version":"1","origin_issue":{issue_number},"phases":[]}`.

Structure: `## 🔍 Squad Triage — Dispositions` → Intent + reference lines → Work Items table (Finding|Scope Sketch|Effort|Rationale) → Decisions Needed table (Finding|Question|Impact|Blocks) → Excluded table (Finding|Reason) → Summary counts → Next step: `/squad plan program` or `/squad triage revise`.

##### Step 4: Update Lifecycle

Find/create the `lifecycle-state` artifact comment. Include `data: {"squad_artifact":"lifecycle-state","schema_version":"1","origin_issue":{issue_number},"phases":[]}`. Set Triage = `✅ Done`, state = Triaged, next = `/squad plan program`.

## skill: `squad-triage-revise`
---
description: Revise triage dispositions from reviewer feedback.
---

**Acknowledge:** `🤖 Squad is revising triage dispositions…`

1. Find the latest `triage` artifact. If none: reply "Run `/squad triage` first."
2. Read feedback after "revise".
3. Apply: reclassify, split, merge, adjust.
4. **EDIT the existing artifact comment** (one current artifact per issue). Prepend revision note.
5. Update lifecycle.

## skill: `squad-planning-policy`
---
description: Resolve the active planning policy profile and overrides. Load before any planning mode executes.
---

All planning modes resolve policy before executing.

The planning policy schema is imported — follow it directly.

Steps:
1. Scan the issue body for a line beginning `Squad-Policy:` or `Squad-Setting:` (case-insensitive, one directive per line). These are plain visible Markdown lines — never HTML comments, which gh-aw strips before you see the body.
2. Check repo for `.squad/planning-policy.md` with YAML frontmatter.
3. Match profile (`default`, `lean`, `enterprise`, `spike`, or custom).
4. Fall back to defaults for unset values.

Apply: artifact limits, sizing constraints, hierarchy rules, GitHub representation, validation strictness. Report active policy in every plan output: `Policy: {profile} ({overrides or "no overrides"})`.

## skill: `squad-plan-program`
---
description: Build the high-level program plan (initiatives, epics, stories, milestones, dependencies).
---

High-level program plan (the WHAT). Transforms triage work items into initiatives/epics/stories/milestones/dependencies. Works on open/closed issues.

**Acknowledge:** `🤖 Squad is building the program plan…`

The planning ontology is imported — follow its schemas directly.

##### Step 1: Validate

Find the latest `triage` artifact. If none: reply "Run `/squad triage` first." Stop. Read root issue body.

##### Step 2: Parse Triage

Extract work items, decisions, excluded from triage comment.

##### Step 3: Construct Hierarchy

Build: Initiatives (outcome-bearing top-level) → Epics (capability groupings) → Stories (user-observable increments) → Milestones (demonstrable outcomes) → Dependencies (DAG).

Rules: every triage work item → ≥1 story. Story → 1 epic. Epic → 1 initiative. Epic → 1 milestone. No cycles. Vertical slices preferred.

##### Step 4: GitHub Mapping

| Concept | GitHub Rep | Notes |
|---------|-----------|-------|
| Initiatives | Root issues | Labeled `initiative` |
| Epics | Parent issues | Labeled `epic` |
| Stories | Sub-issues | Standard |
| Milestones | GitHub milestones | Named after outcome |
| Dependencies | Issue bodies | Native `blocked-by` when available |

Not created yet — describes what activation will produce.

##### Step 5: Post Program Plan

`add-comment` with `data: {"squad_artifact":"program","schema_version":"1","origin_issue":{issue_number},"phases":[]}`.

Structure: `## 📋 Squad Program Plan` → Intent + triage ref → Milestones table (Milestone|Outcome|Contains) → Initiatives & Epics (per initiative: outcome, epic table with Description|Stories|Milestone|Depends On, details per epic with Outcome/Stories/Acceptance criteria) → Unresolved Decisions table → Program Metadata → Dependency Graph → Next: `/squad plan implementation` or `/squad plan program revise`.

##### Step 6: Update Lifecycle

Set Program Plan = `✅ Done`, state = Program Planned, next = `/squad plan implementation`.

## skill: `squad-plan-program-revise`
---
description: Revise the program plan from reviewer feedback.
---

**Acknowledge:** `🤖 Squad is revising the program plan…`

Works on open/closed issues.

1. Find the latest `program` artifact. If none: reply "Run `/squad plan program` first."
2. Check for a `scope-accepted` artifact. If scope accepted: require override flag or stop.
3. Read feedback after "revise".
4. Apply revisions maintaining structural integrity (all Step 3 rules still apply, DAG preserved).
5. **EDIT existing comment**. Prepend revision note.
6. Update lifecycle. If scope was invalidated (override), set Scope back to `⬚ Pending`.

## skill: `squad-plan-implementation`
---
description: Build the implementation plan (the HOW) from an accepted program plan.
---

Decompose program plan into PR-sized tasks with deps, sizing, agent assignments. Works on open/closed issues.

**Acknowledge:** `🤖 Squad is building the implementation plan…`

The planning ontology is imported — follow its schemas directly.

**TASK:** Steps 1–5. Deliverable = Step 4.

##### Step 1: Validate

Search in order: `scope-accepted` artifact (use as authoritative) → `program` artifact (draft) → `plan` artifact (fast-path). If none: reply "Run `/squad plan program` or `/squad plan` first." Stop.

##### Step 2: Decompose Into Tasks

Per task specify: Title, Scope (files/modules/APIs), Acceptance criteria, Size (XS <1h, S 1-3h, M 3-8h, L 1-2d; max per policy default L), Dependencies (task numbers), Agent, Rollout notes.

**Agent binding rule:** permitted `Agent` values are Team Guard Step TG-2's certified roster set (the `Name` column of `## Members` in **this repository's** `.squad/team.md`), plus `@copilot`. Resolve each task's domain via `.squad/routing.md` and emit that member's exact `Name` cell; no other column, the `Role` column included, supplies a valid `Agent`. If none fits, use `@copilot`.

Rules: no task > max_task_size. DAG only. Every task traces to program item. Every epic has ≥1 task. Vertical slices. Group into phases by dependency order (Phase 1 = no deps).

##### Step 3: Validate Structure

Check: sizes ≤ L, no cycles, traceability, coverage, agent validity (every `Agent` value matches a Team Guard Step TG-2 `ROSTER_MEMBER:` line — appears verbatim in the `Name` column — or is `@copilot`). Fix before posting.

##### Step 4: Post Implementation Plan

`add-comment` with `data: {"squad_artifact":"implementation","schema_version":"1","origin_issue":{issue_number},"phases":[]}`.

Structure: `## 🔧 Squad Implementation Plan` → Program ref → Phase tables (Title|Size|Depends On|Agent|Epic) → Details per task (Scope, Acceptance criteria, Dependencies, Rollout, Traces to) → Dependency Graph → Sizing Summary table → Next: `/squad plan validate`.

Re-check every `Agent` against the Step 2 binding rule before posting.

Do **not** emit a self-assessed validation section here. Validation is
`/squad plan validate`'s artifact and uses its check vocabulary; a pass claimed
by the skill that authored the plan is not evidence, and an earlier unspecified
`Validation Pre-check` section is what let a plan certify its own invalid agent
bindings (#1801).

##### Step 5: Update Lifecycle

Set Implementation Plan = `✅ Done`, state = Implementation planned, next = `/squad plan validate`.

## skill: `squad-plan-validate`
---
description: Validate the implementation plan and emit a PASS/FAIL validation artifact.
---

Readiness gate checking plan artifacts for structural issues.

**Acknowledge:** `🤖 Squad is validating the plan…`

The planning ontology is imported — follow its schemas directly.

**TASK:** Steps 1–5. Deliverable = Step 3.

##### Step 1: Locate Artifacts

Find the latest `program`, `implementation`, and `triage` artifacts. At minimum one of program/implementation must exist or stop.

##### Step 2: Run Checks

| # | Check | Applies To | Fails When |
|---|-------|-----------|-----------|
| 1 | Unresolved IDs | Program, Impl | TBD/TODO/??? in value fields |
| 2 | Missing traceability | Impl→Program | Task doesn't trace to program item |
| 3 | Invalid hierarchy | Program | Epic with no stories |
| 4 | Dependency cycles | Impl | Circular chains |
| 5 | Oversized work | Impl | Task > L |
| 6 | Missing decisions | Program | Unresolved decisions blocking epics |
| 7 | Incomplete metadata | Both | Missing sizes/agents/criteria |
| 8 | Orphaned items | Both | Triage items not in program |
| 9 | Milestone gaps | Program | Epics not in any milestone |
| 10 | Non-roster owner/agent | Both | An `Owner`/`Agent` value is absent from the roster (see below) |

Severity: ❌ Critical (blocks acceptance): 1–6, 8, 10. ⚠️ Warning: 7, 9, borderline 5.

###### Check 10 — roster binding (the `Name` column is the sole source of truth)

Run mechanically; never accept a value because it "looks like" a teammate.

1. The **roster set** is the certified output of Team Guard Step TG-2 — the
   `ROSTER_MEMBER:` names from the `Name` column of `## Members`. If TG-2 emitted
   `ROSTER_UNREADABLE:`, report Check 10 ❌ Critical and stop — no roster, no binding.
2. Quote the roster set in the validation output.
3. Every `Owner`/`Agent` cell is valid **only** if it matches a roster-set entry
   ignoring case, or is exactly `@copilot`; any other value — including one from a
   different column, such as the `Role` column — is invalid.
4. Every invalid value is a ❌ **Critical** finding (`RESULT: FAIL`), reported with
   artifact, row, offending value, and the roster set it must be drawn from.
   Never report a value as a valid roster name unless TG-2 emitted it as a
   `ROSTER_MEMBER:`.

##### Step 3: Post Result

`add-comment` with `data: {"squad_artifact":"validation","schema_version":"1","origin_issue":{issue_number},"phases":[]}`. Keep `RESULT: PASS` or `RESULT: FAIL` in the human-readable body.

Structure: `## ✅/❌ Squad Plan Validation — PASSED/FAILED` → Validated artifacts + timestamp → Results table (Check|Status|Details) → Issues Found (Critical ❌ then Warnings ⚠️ with fix instructions) → Summary (counts + verdict) → Next action.

Rules: any ❌ = FAILED heading+verdict. Warnings alone ≠ failure.

##### Step 4: Update Lifecycle

Set Validation = `✅ Done` or `❌ Failed`. Next on pass: `/squad plan accept scope`. On fail: fix + re-run.

##### Step 5: Surface Next Action

Pass: suggest `/squad plan accept scope`. Fail: suggest fix + re-validate.

## skill: `squad-plan-accept-scope`
---
description: Accept the program-plan scope and record the scope-accepted artifact.
---

`/squad plan accept scope` — locks the program plan (the WHAT).

**Acknowledge:** `🤖 Squad is accepting scope and creating the program backlog…`

##### Step 1: Validate

1. Find the latest `program` artifact. If none: reply "Run `/squad plan program` first." Stop.
2. Check whether a `scope-accepted` artifact already exists → reply already accepted, stop.

##### Step 2: Readiness

1. Check triage for unresolved decisions blocking epics → list them, stop.
2. Check program plan for placeholders → list them, stop.

##### Step 3: Record

`add-comment` with `data: {"squad_artifact":"scope-accepted","schema_version":"1","origin_issue":{issue_number},"phases":[]}`.

Content: `## ✅ Scope Accepted` → program plan version link, accepted by, date, what was approved (initiative/epic counts, scope boundary), lock note.

##### Step 4: Update Lifecycle

Set Scope = `✅ Done`, next = `/squad plan accept implementation`.

## skill: `squad-plan-accept-implementation`
---
description: Accept the implementation plan (whole or per phase) and lock it for activation.
---

`/squad plan accept implementation` [phase {N}] — locks the implementation plan (the HOW). Supports incremental phase acceptance.

**Acknowledge:** `🤖 Squad is creating implementation tasks…`

##### Step 1: Validate

**Precondition:** a `validation` artifact whose human-readable body contains `RESULT: PASS` must exist.

1. Find a `scope-accepted` artifact. If none: reply "Accept scope first." Stop.
2. Find the latest `implementation` artifact. If none: reply "Run implementation first." Stop.
3. Find validation PASS. If none/FAIL: reply "Run validate first." Stop.
4. Check for an `impl-accepted` artifact. If it exists and no phase arg: reply already accepted, stop.

##### Step 1a: Phase Resolution

Same pattern as Plan Accept: extract `requested_phase`, find the latest `impl-phases-accepted` artifact and read its `phases` array → `accepted_impl_phases`, validate order/duplication, scope acceptance to phase or remaining.

##### Step 2: Validate Integrity

Run: size ≤ L, no cycles, traceability, coverage, agent validity (scoped to target items). On failure: list issues, stop.

**Sizing source:** Use the latest passed `validation` artifact's Sizing Summary table as authoritative. Copy verbatim. Do NOT re-derive from plan text.

##### Step 3: Record

Artifact data varies:
- Phase: `data: {"squad_artifact":"impl-phases-accepted","schema_version":"1","origin_issue":{issue_number},"phases":[{accumulated}]}` → `## ✅ Implementation Phase {N} Accepted` with phase sizing, remaining phases table
- Full: `data: {"squad_artifact":"impl-accepted","schema_version":"1","origin_issue":{issue_number},"phases":[]}` → `## ✅ Implementation Accepted` with total sizing (from validation), lock note

Both include: impl plan link, scope acceptance link, accepted by, date, counts.

##### Step 4: Update Lifecycle

Phase: `🔄 Phase {N} of {total}`. Full: `✅ Done`, next = `/squad plan activate`.

##### Step 5: Auto-Activate (Phase-Specific Only)

After phase acceptance, check if ready for automatic activation:
1. All prior phases must be accepted AND activated (check the latest `phases-activated` artifact's `phases` array).
2. If Phase 1 or all prior activated: auto-activate using Plan Activate logic for this phase.
3. If prior phases not activated: tell user to activate them first.
4. Update lifecycle to reflect both acceptance and activation.

## skill: `squad-plan-activate`
---
description: Activate an accepted plan by creating the epic and task issues on GitHub.
---

`/squad plan activate` [phase {N}] — creates real GitHub issues/milestones. Irreversible.

**Acknowledge:** Phase: `🤖 Squad is activating Phase {N}…` Full: `🤖 Squad is activating the team…`

##### Step 1: Validate

**Phase-specific:**
1. Check the latest `impl-phases-accepted` artifact's `phases` array contains requested phase. If not: stop.
2. Check ordering: prior phase must be in the latest `phases-activated` artifact's `phases` array. If not: stop.
3. Check not already activated.

**No phase:**
1. Find an `impl-accepted` artifact or fully accepted `impl-phases-accepted` state. If none: stop.
2. Check for an `activated` artifact: if it exists, only create missing issues (idempotent).

##### Hallucination Guard

After EVERY `create-issue` call: verify returned issue number, stop on failure, NEVER predict issue numbers.

##### Output Budget Awareness

Count expected issues before starting. If total > 50: recommend phased activation (`/squad plan activate phase {N}`) and proceed with the current phase only. If total > 30: use compact issue bodies (scope + acceptance criteria only; omit elaboration).

##### Label Pre-flight

**Roster binding gate — run this before any `create-issue` call.**

1. Run Team Guard Step TG-2; its `ROSTER_MEMBER:` lines are the **certified roster
   set** — the only valid source for a `squad:{agent}` label this run. Do not re-read
   team.md or recall a name.
2. If TG-2 emitted a `ROSTER_UNREADABLE:` line, STOP: report that named reason in the
   activation summary and mint no `squad:{agent}` label. Never print a roster-provenance
   sentence for a read that did not happen, and never fall back to a preset or
   remembered roster.
3. Reproduce the certified `ROSTER_MEMBER:` lines verbatim in the summary as the
   provenance of the labels applied — the summary may name only values TG-2 emitted.
4. For every `Agent` value, mint `squad:{agent}` only when its lowercased form matches
   a certified `ROSTER_MEMBER:` name. The special value `@copilot` maps to the
   existing `squad:copilot` routing label — never `squad:@copilot`.
5. A value matching no certified name and not `@copilot` MUST NOT become a
   `squad:{agent}` label: apply only `squad` for that issue and record the value under a
   `Non-roster agent values` heading, naming the certified set it should come from.
6. Completeness: when the plan names at least one roster `Agent`, at least one
   `squad:{agent}` label MUST be applied across the created issues. Zero labels on a
   plan with roster owners is a binding failure, not a pass — report it, don't proceed
   silently.
7. **Correspondence — the label must match *this* issue's own row.** Steps 4-6 certify the
   *vocabulary*: that each value is a roster Name. They do not check that the right issue
   received the right value. **A label can be simultaneously certified and wrong.** Before
   each `create-issue` call, re-read the agent from that issue's own source — a task's own
   `Agent` cell, an epic's derived task-set — and never from the row above it, the parent
   epic, or the previous call. Verify per issue; membership across the run is not evidence.
8. **Report what was applied, not what was intended.** The activation summary may name a
   `squad:{agent}` label for an issue only after that issue's `create-issue` call returned
   successfully carrying it. Never state a label that was skipped, omitted, deferred, or
   assumed. Whenever an `Agent` value did not become a label — multi-owner epic, uncertified
   name, unavailable label — the `Non-roster agent values` heading is **required**, and must
   name the value and the issue it applied to. Omitting the heading while omitting the label
   reports a clean run that did not happen.

Then verify labels `squad` and each roster-bound `squad:{agent}` exist. If missing, record them in the activation summary as a prerequisite gap (label creation requires `issues: write` + `create-label` safe-output — not configured in this workflow). Continue activation — `create-issue` will apply any existing labels normally; unavailable labels are omitted and reported, not silently applied.

##### Transient Failure Handling

On `5xx` response from `create-issue`: wait briefly and retry once. On second failure or `4xx`: record the issue title as skipped in the activation summary, continue with remaining issues. Never abort the full run for a single transient failure.

##### Sub-issue Fallback

When setting a `parent` sub-issue relationship returns `404` or `422` (feature disabled or repo plan): degrade gracefully — record the intended parent as a body reference (`Parent: #{issue_number}`), then continue. Never fail activation over sub-issue API unavailability.

##### Step 2: Create Issues — Full Hierarchy

Root → Epics → Tasks. Phase-specific: filter to matching phase heading.

**2a. Create Milestones:** Check for existing, create missing. Record IDs. On failure: document in root issue body instead.

**2b. Create Epic Issues:** `create-issue` per epic (dedup by title `[Epic] {name}` if already exists from prior phase).
- Title: `[Epic] {name}`
- Labels: `squad` (0075ca), `squad:{agent}` (e4e669) where `{agent}` is **derived from this epic's own tasks**: collect the `Agent` values of every implementation-plan row whose `Epic` cell names this epic. Exactly one distinct roster value → mint `squad:{that agent}`; exactly `@copilot` → mint `squad:copilot`. Two or more → multi-owner epic: apply only `squad` and record it under `Non-roster agent values`. Never mint a single agent label for a multi-owner epic, and never choose one of several.
- Body: outcome, stories, epic-level acceptance criteria, context (parent, initiative, milestone, deps)
- Parent: sub-issue of root intent issue
- Milestone: assigned

**⚠️ DO NOT STOP after epics. Tasks MUST follow immediately.**

**2c. Create Task Issues:** `create-issue` per task in dependency order.

> **⚠️ ATOMIC CONTRACT — strictly one task at a time:**
> For each task: compose ONLY that task's body → call `create-issue` immediately → verify the returned issue number → then move to the next task.
> **DO NOT** compose or buffer multiple task bodies before making calls. One compose → one call → one verify, repeated per task.

- Title: task title
- Labels: `squad` (0075ca), `squad:{agent}` (e4e669) where `{agent}` is **this task's own `Agent` cell**, lowercased — read from the implementation-plan row whose `#` matches this task. Map `@copilot` to `squad:copilot`. Never inherit the parent epic's agent, and never carry the previous task's value forward: re-read the `Agent` cell for every task, because consecutive tasks under one epic routinely have different agents. No `size:*` labels unless policy says so.
- Body: one sentence describing scope; 1-2 acceptance criteria; one compact context line (parent epic, size, deps)
- Parent: sub-issue of EPIC (not root)
- Milestone: same as parent epic
- Size: Project field if available, else body line

**2d. Self-Validation:** Compare created/recognized task count vs expected (use the plan's declared total — not the safe-output cap). If created count is below expected: call `report_incomplete` immediately with `created={N}`, `expected={M}`, and the last verified issue number — never noop. Post: `N of M issues created so far — rerun the identical activation command to continue.` Re-runs are idempotent via title match. Never surface the `create-issue` or `add-comment` safe-output caps as the reason for a partial run.

Labels must have descriptions and intentional colors.

##### Step 3: Native Dependency Edges

Add `blockedBy` via API for tasks and epics. Graceful fallback. Never fail activation over edge creation.

##### Step 4: Post Activation Record

**LAST action** — only after Steps 2+3 complete.

Phase artifact: `data: {"squad_artifact":"phases-activated","schema_version":"1","origin_issue":{issue_number},"phases":[{accumulated}]}` → `## ✅ Phase {N} Activated — {count} issues` + issue table + remaining phases table.

Every phase and full activation artifact body MUST include an `Activation bindings:` fenced JSON block containing a non-empty array built only from successful `create-issue` results. Emit one object per created/recognized task:

`{"task":"{plan # cell}","issue":{created task issue number},"epic":"{Epic cell}","epic_issue":{created epic issue number},"agent":"{raw Agent cell}","epic_agents":["{all distinct lowercased Agent cells for this epic across the full accepted plan}"],"label":"squad:{lowercased Agent cell}","epic_label":"squad:{sole lowercased epic task agent}"}`. For `@copilot`, use `squad:copilot`. Every binding for one epic MUST carry the same complete `epic_agents` set, including agents assigned in other activation phases.

For a multi-owner epic, omit `epic_label` and set `"epic_omission_reason":"multi-owner"` on each of its task bindings. For a task whose agent is not certified by TG-2, omit `label` and set `"omission_reason":"non-roster"`; if that task is the epic's sole owner, likewise omit `epic_label` and set `"epic_omission_reason":"non-roster"`. Never omit a created task from `bindings`, never infer an issue number, and never emit an empty array. The deterministic post-activation workflow treats missing, empty, malformed, or unresolved bindings as a failure. The safe-output schema deliberately uses one uniform task-binding shape because gh-aw's data schema dialect does not support conditional `if`/`then` or `allOf`; the checker enforces activation-only presence and cross-row epic consistency.

Phase artifact: `data: {"squad_artifact":"phases-activated","schema_version":"1","origin_issue":{issue_number},"phases":[{accumulated}]}` → `## ✅ Phase {N} Activated — {count} issues` + issue table + remaining phases table + the `Activation bindings:` JSON array.

Full artifact: `data: {"squad_artifact":"activated","schema_version":"1","origin_issue":{issue_number},"phases":[]}` → `## ✅ Plan Activated — {epic_count} epics, {task_count} tasks` + hierarchy summary, created epics table, created tasks table, dependency order + the `Activation bindings:` JSON array.

Terminal (last phase): emit `data: {"squad_artifact":"activated","schema_version":"1","origin_issue":{issue_number},"phases":[{all_phases}]}` with an "All Phases Activated" heading and the accumulated `Activation bindings:` JSON array.

##### Step 5: Update Lifecycle

Phase: `🔄 Phase {N} of {total} activated`. Next: accept/activate next phase.
Full/last: `✅ Done`, state = Activated. Terminal — no next action needed.
