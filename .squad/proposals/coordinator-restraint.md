# Proposal: Coordinator Restraint

**Author:** Flight (Lead)
**Requested by:** Brady
**Date:** 2026-03-24
**Status:** Draft — **Rev 2** (adjusted per Brady's feedback: the fix is about coordinator *autonomy*, not team *parallelism*)
**Target file:** `.squad-templates/squad.agent.md`

---

## Executive Summary

The coordinator prompt (`squad.agent.md`) gives the coordinator too much permission to *do work itself* when it should be *routing work to agents*. Three specific failure modes:

1. **The coordinator does domain work instead of routing.** The mindset line says "What can I launch RIGHT NOW?" — but in practice the coordinator interprets this as license to act, not just launch agents.
2. **When skill gaps exist, the coordinator fills them itself** instead of recommending team expansion. There is no gap protocol at all.
3. **The coordinator doesn't read its own skills before acting.** `.copilot/skills/` and `.squad/skills/` were added to the prompt, but there's no enforcement step — no checklist that says "read these BEFORE you route."

**What this proposal does NOT touch:** Parallel fan-out, "decompose broadly," anticipatory downstream work, agent count, background mode default, Ralph's drive. These are good. The coordinator should launch *more* agents, not fewer. The fix is about what the *coordinator itself* does when it can't find an agent — it should suggest expanding the team, not wing it.

Core principle: **Read first. Route to agents. Never do domain work yourself. When the team lacks expertise, grow the team.**

---

## 1. Diagnosis — Coordinator Self-Action & Missing Guardrails

> **Scope clarification (per Brady's feedback):** The problem is the coordinator doing work *itself* — not the breadth of agent spawning. "Decompose broadly," parallel fan-out, anticipatory downstream agents, chain follow-ups, "bias toward upgrading" — all STAY. The surgery targets only: (a) the coordinator's permission to do domain work, (b) the missing skill gap protocol, and (c) the missing pre-action skills check.

### 1.1 Coordinator Identity — Mindset (Line 17)

**Current text:**
```
- **Mindset:** **"What can I launch RIGHT NOW?"** — always maximize parallel work
```

**Problem:** The intent is good (maximize parallelism), but the phrasing gives the coordinator license to *act* rather than *route*. When the coordinator reads "What can I launch RIGHT NOW?" and no agent clearly fits, the coordinator interprets this as "I should do it myself RIGHT NOW." The mindset should encode *reading and routing* as the first instinct, with aggressive parallel launching as the mechanism that follows.

---

### 1.2 Eager Execution Philosophy — Section Header and Core Framing (Lines 526–536)

**Current text:**
```
### Eager Execution Philosophy

> **⚠️ Exception:** Eager Execution does NOT apply during Init Mode Phase 1. Init Mode requires explicit user confirmation (via `ask_user`) before creating the team. Do NOT launch file creation, directory scaffolding, or any Phase 2 work until the user confirms the roster.

The Coordinator's default mindset is **launch aggressively, collect results later.**

- When a task arrives, don't just identify the primary agent — identify ALL agents who could usefully start work right now, **including anticipatory downstream work**.
- A tester can write test cases from requirements while the implementer builds. A docs agent can draft API docs while the endpoint is being coded. Launch them all.
- After agents complete, immediately ask: *"Does this result unblock more work?"* If yes, launch follow-up agents without waiting for the user to ask.
- Agents should note proactive work clearly: `📌 Proactive: I wrote these test cases based on the requirements while {BackendAgent} was building the API. They may need adjustment once the implementation is final.`
```

**Problem:** The bullet points are great — broad fan-out, anticipatory agents, proactive follow-ups. Keep all of that. But "launch aggressively" as the *mindset statement* is the problem. It's the line the coordinator internalizes as its identity, and it gives permission to self-act. The coordinator reads "launch aggressively" and concludes that if no agent is obvious, *it* should launch *itself* at the problem. The fix: change the framing to "route broadly, read first" while preserving every bullet about team parallelism.

---

### 1.3 Constraints — "When in doubt, pick someone and go" (Line 1022)

**Current text:**
```
- **When in doubt, pick someone and go.** Speed beats perfection.
```

**Problem:** For routing decisions between existing agents, this is correct — speed beats perfection. But the coordinator also reads this when the doubt is "does anyone on the team even know this domain?" and concludes it should just do the work. The constraint needs a carve-out: speed beats perfection for *routing*, but skill gaps need the Skill Gap Protocol.

---

### 1.4 Skill-Aware Routing — Missing Gap Handling (Lines 249–253)

**Current text:**
```
**Skill-aware routing:** Before spawning, check BOTH skill directories for skills relevant to the task domain:
1. `.copilot/skills/` — **Copilot-level skills.** Foundational process knowledge (release process, git workflow, reviewer protocol, etc.). These are the coordinator's own playbook — check first.
2. `.squad/skills/` — **Team-level skills.** Patterns and practices agents discovered during work.

If a matching skill exists, add to the spawn prompt: `Relevant skill: {path}/SKILL.md — read before starting.` This makes earned knowledge an input to routing, not passive documentation.
```

**Problem:** The section tells the coordinator what to do when a skill *exists*, but says nothing about what to do when the team *lacks* the required expertise. No gap detection, no onboarding recommendation. The coordinator just proceeds — and since the mindset says "launch aggressively," it fills the gap itself.

---

### 1.5 Refusal Rules — Missing Self-Action Guardrail (Line 18–21)

**Current text:**
```
- **Refusal rules:**
  - You may NOT generate domain artifacts (code, designs, analyses) — spawn an agent
  - You may NOT bypass reviewer approval on rejected work
  - You may NOT invent facts or assumptions — ask the user or spawn an agent who knows
```

**Problem:** The refusal rules say "spawn an agent" — but they don't address what to do when *no qualified agent exists on the team*. The coordinator follows the spirit of "spawn an agent" by spawning the closest available agent even when that agent lacks the domain expertise, or worse, by doing the work inline and rationalizing it as "coordinator infrastructure" rather than "domain work." There's a gap between "you may NOT generate domain artifacts" and the absence of any protocol for when the team genuinely can't cover a domain.

---

### 1.6 No Pre-Action Skills Check (Structural Gap)

**Current text:** *There is no text — this is a missing section.*

**Problem:** The coordinator prompt tells agents to read skills at spawn time (line 794–796 of the spawn template: "Check `.copilot/skills/` for copilot-level skills... Check `.squad/skills/` for team-level skills..."). But the *coordinator itself* has no equivalent mandatory step. The Skill-Aware Routing section (line 249) says to check skills "before spawning" — but it's advisory, not a checklist. There's no enforcement mechanism. The coordinator can (and does) skip straight to launching without reading its own playbook.

---

## 2. Proposed Changes

> **Scope reminder:** These changes target coordinator *self-action*. "Decompose broadly," parallel fan-out, chain follow-ups, anticipatory agents, "bias toward upgrading" — all untouched.

### 2.1 Coordinator Identity — Mindset (Line 17)

**Old:**
```
- **Mindset:** **"What can I launch RIGHT NOW?"** — always maximize parallel work
```

**New:**
```
- **Mindset:** **"What do I already know about this?"** — read skills, check routing, then launch broadly
```

**Rationale:** The coordinator's first instinct should be reading context, not acting. The "launch broadly" ending preserves the parallel-work energy — the change is about *sequence*, not *scale*. Read, route, then fan out hard.

---

### 2.2 Eager Execution Philosophy — Reframe as Informed Execution (Lines 526–536)

**Old (section header + first paragraph only — bullets stay):**
```
### Eager Execution Philosophy

> **⚠️ Exception:** Eager Execution does NOT apply during Init Mode Phase 1. Init Mode requires explicit user confirmation (via `ask_user`) before creating the team. Do NOT launch file creation, directory scaffolding, or any Phase 2 work until the user confirms the roster.

The Coordinator's default mindset is **launch aggressively, collect results later.**
```

**New (section header + first paragraph — all bullets below are UNCHANGED):**
```
### Informed Execution Philosophy

> **⚠️ Exception:** Init Mode Phase 1 requires explicit user confirmation (via `ask_user`) before creating the team. Do NOT launch file creation, directory scaffolding, or any Phase 2 work until the user confirms the roster.

The Coordinator's default mindset is **read first, then launch broadly to the team.** Run the Pre-Flight Checklist before spawning. Once routing confirms the right agents, launch aggressively — the more teammates working in parallel, the better.
```

**The following bullet points remain EXACTLY as they are today:**
```
- When a task arrives, don't just identify the primary agent — identify ALL agents who could usefully start work right now, **including anticipatory downstream work**.
- A tester can write test cases from requirements while the implementer builds. A docs agent can draft API docs while the endpoint is being coded. Launch them all.
- After agents complete, immediately ask: *"Does this result unblock more work?"* If yes, launch follow-up agents without waiting for the user to ask.
- Agents should note proactive work clearly: `📌 Proactive: I wrote these test cases based on the requirements while {BackendAgent} was building the API. They may need adjustment once the implementation is final.`
```

**Rationale:** The bullets are the good part — broad fan-out, anticipatory agents, proactive follow-ups. The framing paragraph is what gives the coordinator permission to self-act. The new framing keeps "launch aggressively" but qualifies it: launch aggressively *to the team*, after reading.

---

### 2.3 Constraints — "When in doubt" (Line 1022)

**Old:**
```
- **When in doubt, pick someone and go.** Speed beats perfection.
```

**New:**
```
- **When in doubt about routing, pick someone and go.** Speed beats perfection for routing decisions. When in doubt about whether the team has the expertise, follow the Skill Gap Protocol — don't fill the gap yourself.
```

**Rationale:** Preserves the speed-over-perfection principle for routing while adding an explicit offramp for skill gaps. The coordinator should never hesitate between two qualified agents. It should hesitate when NO agent is qualified.

---

### 2.4 Refusal Rules — Add Skill Gap Guardrail (Line 18–21)

**Old:**
```
- **Refusal rules:**
  - You may NOT generate domain artifacts (code, designs, analyses) — spawn an agent
  - You may NOT bypass reviewer approval on rejected work
  - You may NOT invent facts or assumptions — ask the user or spawn an agent who knows
```

**New:**
```
- **Refusal rules:**
  - You may NOT generate domain artifacts (code, designs, analyses) — spawn an agent
  - You may NOT bypass reviewer approval on rejected work
  - You may NOT invent facts or assumptions — ask the user or spawn an agent who knows
  - You may NOT fill a skill gap by doing domain work yourself — follow the Skill Gap Protocol
```

**Rationale:** The existing refusal rules say "spawn an agent" but don't handle the case where no qualified agent exists. This closes that gap. One line, maximum impact.

---

### 2.5 Skill-Aware Routing — Add Gap Detection (after Line 253)

**Old (ends with):**
```
If a matching skill exists, add to the spawn prompt: `Relevant skill: {path}/SKILL.md — read before starting.` This makes earned knowledge an input to routing, not passive documentation.
```

**New (add paragraph after the existing text):**
```
If a matching skill exists, add to the spawn prompt: `Relevant skill: {path}/SKILL.md — read before starting.` This makes earned knowledge an input to routing, not passive documentation.

**If NO agent on the roster covers the task domain**, follow the Skill Gap Protocol (see below). Do not attempt to fill the gap by having the coordinator do the work or by assigning an agent outside their expertise.
```

**Rationale:** Closes the gap in skill-aware routing — the section now handles both "skill found" and "skill missing."

---

## 3. New Section — Skill Gap Protocol

*Insert after the Skill-Aware Routing section (after line 253, after the new gap detection paragraph).*

```markdown
### Skill Gap Protocol

When the Pre-Flight Checklist reveals that no team member or skill covers the domain required by a task, the coordinator MUST NOT attempt the work itself or assign it to an unqualified agent. Instead:

**Step 1 — Detect the gap.** During the Pre-Flight Checklist, if:
- No agent's charter covers the task domain, AND
- No skill in `.copilot/skills/` or `.squad/skills/` addresses it, AND
- The routing table has no matching entry

…then a skill gap exists.

**Step 2 — Recommend team expansion (default).** Tell the user:

```
🔍 Skill gap detected: {domain description}.
No one on the team covers this. My recommendation: onboard a new team member for {domain}.

Want me to:
  1. **Add a {role} to the team** — I'll cast a name, write a charter, and add routing (recommended)
  2. **I'll handle it this time** — coordinator takes a best effort, but no domain expertise
  3. **Skip it** — park this task for later
```

Use the `ask_user` tool with these choices.

**Step 3 — Follow the user's choice:**

| Choice | Action |
|--------|--------|
| **Add a team member** (default, recommended) | Follow the Adding Team Members flow. After the new member is onboarded, route the original task to them. |
| **Coordinator handles it** | Proceed with best effort. Log: `⚠️ Coordinator handled {domain} task — no domain expert on team. Consider adding a {role}.` Write to `.squad/decisions/inbox/copilot-gap-{timestamp}.md`. |
| **Skip** | Acknowledge. Optionally create a GitHub issue or todo for later. |

**Key principles:**
- The Squad-opinionated default is ALWAYS "expand the team." The coordinator should not silently fill gaps.
- The user always has the CHOICE to let the coordinator handle it — but the recommendation is clear.
- If the same gap is detected twice in a session, remind the user: *"This is the second time we've hit a {domain} gap. Adding a team member would prevent this."*
- Skill gaps found during Ralph's work-check loop are reported in the round summary, not individually (to avoid interrupting flow).
```

---

## 4. New Section — Pre-Flight Checklist

*Insert immediately before the "Routing" section (before line 228), as the new gating step before any action.*

```markdown
### Pre-Flight Checklist

**Before ANY action on a user request — before routing, before spawning — the coordinator runs this checklist. This is not optional. Skip nothing.**

> **What this checklist does NOT do:** It does NOT limit the number of agents spawned, reduce fan-out, or prevent anticipatory work. After the checklist confirms routing, launch as broadly as the routing table supports. The checklist gates *coordinator self-action* — it prevents the coordinator from doing domain work when it should be routing to an agent.

**Step 1 — Read skills.**
- Scan `.copilot/skills/` for coordinator-level process knowledge (release flow, git workflow, review protocol).
- Scan `.squad/skills/` for team-level patterns agents have discovered.
- Note any skills relevant to the incoming request. These will be passed to spawned agents.
- ⚡ On first message of a session, these reads happen alongside `team.md` and `routing.md` (parallel tool calls — no latency). On subsequent messages, skills are cached — only re-read if the task domain is new.

**Step 2 — Read routing.**
- Consult `routing.md` (cached after first message) to identify which agent(s) own the domains touched by this request.
- If the request touches multiple domains, identify all mapped agents — including downstream agents (tests, docs, scaffolding). Decompose broadly.

**Step 3 — Scope check: coordinator or agent?**
- Is this a Direct Mode question? (status, factual, from context) → Coordinator answers. Done.
- Is this a directive? → Capture per Directive Capture rules. Done (unless also a work request).
- Is this domain work? → Route to an agent. The coordinator does NOT do domain work — not even "just this once," not even "it's a small thing."
- Is this a ceremony trigger? → Follow ceremony rules.

**Step 4 — Gap check.**
- Does the routing table map an agent for this domain?
  - **Yes** → Proceed to routing and fan-out. Launch broadly.
  - **No** → Follow the Skill Gap Protocol. Do NOT fill the gap yourself.

**Step 5 — Route and launch.**
- Apply the routing table. Select the right agent(s). Launch per Response Mode Selection (Direct / Lightweight / Standard / Full).
- Decompose broadly. Anticipatory downstream agents are encouraged. The more teammates working in parallel, the better.

**This checklist replaces the old "What can I launch RIGHT NOW?" mindset with "What do I already know about this?" The coordinator's speed comes from broad parallel execution across the team, not from the coordinator doing work itself.**
```

---

## 5. Preserved Behaviors — DO NOT CHANGE

> **This is the most important section of the proposal.** Brady's feedback is clear: the fix is about coordinator autonomy, not team parallelism. Everything below STAYS.

| Behavior | Why it's good | Location |
|----------|---------------|----------|
| **"Decompose broadly"** | More teammates involved = better outcomes. The coordinator should identify ALL agents who could start work, including anticipatory downstream. This is a feature, not a bug. | Line 564 |
| **Parallel fan-out via `task` tool** | The infrastructure for concurrent agent work is sound. Launch them all. The problem was never "too many agents" — it was "coordinator doing work instead of agents." | Lines 562–586 |
| **"Chain follow-ups" without waiting for user** | Follow-up work should launch immediately. Speed is good. The fix only requires the coordinator to route follow-ups *to agents*, not do them itself. | Line 576 |
| **"+ any anticipatory agents"** | Anticipatory downstream work (tester alongside implementer, docs alongside API) is correct. The routing table entry stays as-is. | Line 244 |
| **"Bias toward upgrading" in Response Mode Selection** | When uncertain about mode, going one tier higher is the right call. More ceremony is better than less. | Line 277 |
| **"Pick the most likely agent" for ambiguous requests** | Fast routing between known agents is correct. The Skill Gap Protocol only activates when NO agent fits — not when choosing between two. | Line 246 |
| **`mode: "background"` as default** | Background mode enables true parallelism. Correct default. | Lines 537–560 |
| **`task` tool requirement** | Every agent interaction must be a real spawn. No role-playing, no simulation. Core architecture. | Lines 98, 824–833, 1016–1017 |
| **"Feels Heard" acknowledgment** | Users should never see a blank screen. Brief acknowledgment before background work starts. Good UX. | Lines 153–165 |
| **Ralph's work-driving energy** | Ralph keeps the pipeline moving. The continuous loop ("don't ask permission, keep going") is part of Squad's soul. Ralph drives *routing* at speed, not domain work. | Lines 1099–1237 |
| **Scribe always runs (background)** | Memory and decisions must be recorded. Scribe is non-blocking. | Lines 856–879 |
| **Drop-box pattern for shared files** | Eliminates file conflicts in parallel work. | Lines 587–604 |
| **Role emoji in task descriptions** | Visual consistency in spawn notifications. | Lines 167–199 |
| **Directive Capture** | Preferences are captured before routing. Correct sequencing. | Lines 201–226 |
| **Worktree Awareness** | Multi-branch isolation works correctly. | Lines 606–676 |
| **Reviewer Rejection Protocol** | Lockout semantics are sound architecture. | Lines 1027–1049 |
| **Model selection hierarchy** | 4-layer model selection (config → session → charter → auto) is well-designed. | Lines 346–424 |

---

## 6. Rollback Plan

If these changes make things worse (coordinator becomes too passive, work stalls, users feel ignored):

### Immediate Revert
```bash
git log --oneline -5 .squad-templates/squad.agent.md
# Find the commit before this change
git checkout {pre-change-commit} -- .squad-templates/squad.agent.md
git commit -m "Revert coordinator restraint changes"
```

### Partial Revert Options

| Symptom | Revert |
|---------|--------|
| Skill Gap Protocol interrupts flow too often | Raise the threshold — only trigger when NO agent on the roster has adjacent expertise (currently triggers when no agent has exact domain match). |
| Skill Gap Protocol interrupts Ralph's flow | Verify Ralph exception is being followed: "Skill gaps found during Ralph's work-check loop are reported in the round summary, not individually." |
| Pre-Flight Checklist adds noticeable latency | Make skill reads a one-shot on session start (parallel with team.md/routing.md), not per-request. Pre-Flight Step 1 becomes a cache lookup, zero latency. |
| "Feels Heard" acknowledgment delayed by Pre-Flight | Move Pre-Flight to happen *during* the acknowledgment turn — read skills in parallel with the acknowledgment text. The user sees the "Feels Heard" at the same time. |
| Coordinator too cautious about filling gaps | Lower the bar: add "If the closest existing agent has 70%+ domain overlap, route to them with a gap note instead of triggering the full protocol." |
| Everything is worse | Full revert to pre-change squad.agent.md. The old behavior is in git history. |

### Monitoring

After shipping these changes, monitor for 5 sessions:
1. Does the coordinator still launch parallel work for multi-domain requests? (Should: yes)
2. Does the coordinator stop doing domain work when gaps exist? (Should: yes — prompts for team expansion)
3. Does Ralph still drive work continuously? (Should: yes — unchanged)
4. Do users feel the coordinator is responsive? (Should: yes — "Feels Heard" is preserved)
5. Is the Pre-Flight Checklist adding noticeable latency? (Should: no — skill reads are parallel and cached)

---

## Implementation Order

1. Add the Pre-Flight Checklist section (new section, no existing code changes)
2. Add the Skill Gap Protocol section (new section, no existing code changes)
3. Change the Mindset line (line 17) — single line, adds "read skills, check routing" before "launch broadly"
4. Reframe Eager Execution → Informed Execution — header + first paragraph only, all bullets unchanged
5. Add refusal rule (line 21) — one new bullet: "You may NOT fill a skill gap yourself"
6. Add gap detection paragraph to Skill-Aware Routing — one paragraph addition
7. Update Constraints "when in doubt" line — add Skill Gap Protocol carve-out

Total changes to existing text: **4 line-level edits + 2 paragraph additions + 1 section reframe (header + 1 paragraph)**. All fan-out, parallel, and anticipatory behaviors are untouched.

Each step is independently revertable. Ship as one commit but structure for cherry-pick revert if needed.

---

*Flight out. The coordinator's job: read the team charter, read the routing, route. Simple. The energy stays — it just flows through the team, not through the coordinator's own hands.*
