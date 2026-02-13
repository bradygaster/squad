---
title: "VS Code Parity Smoke Test"
version: "1.0"
date: 2026-02-08
author: McManus (DevRel)
status: draft
estimated_time: "45–60 minutes"
prerequisites:
  - VS Code with GitHub Copilot extension (latest)
  - GitHub Copilot Chat enabled (agent mode available)
  - Node.js 22+
  - Git installed
  - Internet access (for npx)
---

# 001 — VS Code Parity Smoke Test

**Purpose:** Validate that Squad works end-to-end in VS Code Copilot Chat with the same fidelity as the Copilot CLI. This is a QA eval — not a demo. Be honest. Mark failures.

**Tester:** ______________________  
**Date run:** ______________________  
**VS Code version:** ______________________  
**Copilot extension version:** ______________________  
**OS:** ______________________  
**Node version:** ______________________

---

## Section 1: Setup — Fresh Install

**Goal:** Verify `npx github:bradygaster/squad` installs correctly in a brand-new repo.

### Steps

1. Create a new empty directory and navigate into it:
   ```bash
   mkdir squad-eval-test && cd squad-eval-test
   git init -b main
   ```
2. Run the installer:
   ```bash
   npx github:bradygaster/squad
   ```
3. Observe the terminal output.
4. Open the folder in VS Code:
   ```bash
   code .
   ```

### Expected Result

- Terminal shows green checkmarks for each file created:
  - `✓ .github/agents/squad.agent.md (v0.x.x)`
  - `✓ .ai-team-templates/`
  - `✓ .ai-team/skills/ (starter skills)`
  - `✓ .ai-team/ceremonies.md`
  - `✓ .gitattributes (merge=union rules)`
- "Squad is ready." message with next steps printed.
- The following files and directories exist:
  - `.github/agents/squad.agent.md`
  - `.ai-team-templates/` (contains charter.md, history.md, roster.md, routing.md, skill.md, etc.)
  - `.ai-team/decisions/inbox/` (empty dir)
  - `.ai-team/orchestration-log/` (empty dir)
  - `.ai-team/casting/` (empty dir)
  - `.ai-team/skills/` (contains starter skills)
  - `.ai-team/ceremonies.md`
  - `.gitattributes` with `merge=union` rules

### Verdict

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 2: Init Flow — Team Creation via VS Code Copilot Chat

**Goal:** Verify the coordinator creates a full team when prompted in VS Code agent mode.

### Steps

1. Open Copilot Chat in VS Code (Ctrl+Shift+I or the sidebar icon).
2. Switch to **Agent mode** (not Ask or Edit mode — look for the mode selector at the top of the chat panel).
3. Select **Squad** from the agents list (type `@squad` or pick from the dropdown).
4. Type the following prompt and send:
   ```
   I'm building a task management API with Express and PostgreSQL. Set up the team.
   ```
5. Wait for Squad to respond. It should:
   - Identify you by your git config name
   - Ask what you're building (or proceed if you already said)
   - Propose a team with cast names from a fictional universe
6. Confirm the team by typing:
   ```
   Yes, looks good.
   ```
7. Wait for Squad to create all files.

### Expected Result

- Squad addresses you by name (from `git config user.name`).
- Team proposed with 4–5 agents + Scribe:
  - A Lead role
  - A Backend Dev role
  - At least one Frontend or API role
  - A Tester role
  - Scribe (always present, always named "Scribe")
- Cast names come from a recognizable fictional universe (Alien, The Usual Suspects, Ocean's Eleven, etc.)
- After confirmation, these files are created in `.ai-team/`:
  - `team.md` (roster with all agents listed)
  - `routing.md` (who handles what)
  - `decisions.md` (initialized, may have first decision)
  - `ceremonies.md` (already existed from install)
  - `casting/registry.json` (agent-to-name mappings)
  - `casting/policy.json` (casting config)
  - `casting/history.json` (universe selection)
  - `agents/{name}/charter.md` for each agent
  - `agents/{name}/history.md` for each agent (seeded with project context)
  - `agents/scribe/charter.md`
- `.gitattributes` has `merge=union` rules.
- Squad says something like "✅ Team hired. Try: '{AgentName}, set up the project structure'"

### Verdict

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 3: Agent Spawning — Individual Agent Interaction

**Goal:** Verify that addressing an agent by name spawns them in character.

### Steps

1. In the same Copilot Chat session (or a new one with Squad selected), type:
   ```
   {LeadName}, what's your plan for the API architecture?
   ```
   (Replace `{LeadName}` with the actual cast name from Section 2.)
2. Wait for the response.
3. Then try addressing the tester:
   ```
   {TesterName}, what test framework should we use?
   ```
4. Wait for the response.

### Expected Result

- Each agent responds **in character** — using first person, referencing their expertise, staying within their domain.
- The Lead talks about architecture, scope, and decisions — NOT about writing tests.
- The Tester talks about test frameworks, coverage, quality — NOT about architecture decisions.
- Responses reference the project context (Express, PostgreSQL, task management API) — they know what the project is.
- The agent's history.md should be updated with learnings after the interaction.

### Verdict

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 4: Multi-Agent Work — Parallel Fan-Out

**Goal:** Verify that a "Team, do X" prompt spawns multiple agents in parallel.

### Steps

1. In Copilot Chat with Squad selected, type:
   ```
   Team, set up the initial project structure — package.json, folder layout, database schema, and a health check endpoint.
   ```
2. Watch the response. Look for evidence of parallel agent launches.
3. After work completes, check:
   - Were multiple agents mentioned as working?
   - Did actual files get created in the repo?
   - Were decisions written to `.ai-team/decisions.md`?

### Expected Result

- Squad fans out to multiple agents (Lead for structure, Backend for endpoints, Tester for test stubs — at minimum 2 agents).
- Evidence of parallel execution: multiple agents listed as working, or multiple tool calls spawning agents.
- Real files are created in the repo (package.json, folders, source files, etc.).
- `.ai-team/decisions.md` has new entries from this session.
- Agent `history.md` files are updated with what they learned.

### Verdict

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 5: Scribe — Silent Logging and Decision Merging

**Goal:** Verify Scribe operates silently, logs sessions, and merges decisions.

### Steps

1. After completing Section 4, check:
   ```
   Does .ai-team/log/ contain any session log files?
   ```
2. Open `.ai-team/decisions.md` and review:
   - Are there decisions from the multi-agent work?
   - Do they have attribution (who made the decision)?
3. Check `.ai-team/decisions/inbox/`:
   - Were there any drop-box files? (They may have been merged already.)
4. In Copilot Chat, type:
   ```
   Where are we? What has the team decided so far?
   ```
5. Squad should summarize the current state using decisions.md.

### Expected Result

- Scribe **never talks to you directly** — no messages from "Scribe" in the chat.
- `.ai-team/log/` contains at least one session log file.
- `.ai-team/decisions.md` contains decisions with:
  - Who made the decision
  - What was decided
  - Why
- "Where are we?" query returns a coherent summary of team state and decisions.

### Verdict

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 6: Upgrade — Updating an Existing Installation

**Goal:** Verify `npx github:bradygaster/squad upgrade` updates Squad-owned files without touching team state.

### Steps

1. Note the current contents of:
   - `.ai-team/agents/` (team state)
   - `.ai-team/decisions.md` (team decisions)
   - `.ai-team/casting/registry.json` (casting state)
2. Run the upgrade command:
   ```bash
   npx github:bradygaster/squad upgrade
   ```
3. Verify the output.
4. Check that team state is untouched:
   - `.ai-team/agents/` — same files, same content
   - `.ai-team/decisions.md` — same content
   - `.ai-team/casting/registry.json` — same content
5. Check that Squad-owned files were updated:
   - `.github/agents/squad.agent.md` — version stamp updated
   - `.ai-team-templates/` — overwritten with latest

### Expected Result

- Output shows `✓ upgraded coordinator from X.X.X to Y.Y.Y` (or "Already up to date").
- Output shows `✓ upgraded .ai-team-templates/`.
- Output says `.ai-team/ untouched — your team state is safe`.
- **No changes** to any file inside `.ai-team/agents/`, `.ai-team/decisions.md`, or `.ai-team/casting/`.
- `.github/agents/squad.agent.md` has the new version in its YAML frontmatter.

### Verdict

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 7: Export / Import

**Goal:** Verify the export and import commands produce valid, usable snapshots.

### Export

### Steps

1. Run:
   ```bash
   npx github:bradygaster/squad export
   ```
2. Check the output.
3. Open `squad-export.json` and inspect its structure.

### Expected Result

- Output: `✓ Exported squad to squad-export.json`
- Warning about reviewing agent histories before sharing.
- `squad-export.json` is valid JSON containing:
  - `version: "1.0"`
  - `exported_at` (ISO timestamp)
  - `squad_version` (matches installed version)
  - `casting` object (with registry, policy, history)
  - `agents` object (keys are agent names, values have `charter` and `history`)
  - `skills` array (contents of any SKILL.md files)

### Verdict (Export)

- [ ] Pass  [ ] Fail

### Import

### Steps

1. Create a new test directory:
   ```bash
   mkdir ../squad-import-test && cd ../squad-import-test
   git init -b main
   npx github:bradygaster/squad
   ```
2. Copy the export file:
   ```bash
   cp ../squad-eval-test/squad-export.json .
   ```
3. Run import (requires `--force` since a squad already exists):
   ```bash
   npx github:bradygaster/squad import squad-export.json --force
   ```
4. Verify the output and check `.ai-team/` contents.

### Expected Result

- Output shows the agent count, skills count, and universe name.
- Existing `.ai-team/` is archived to `.ai-team-archive-{timestamp}/`.
- New `.ai-team/` created with:
  - Agent directories matching the export
  - Casting state preserved
  - Skills imported
  - Agent histories have `📌 Imported from...` prefix
  - `decisions.md` exists (may be empty — project-specific decisions are not carried over)
  - `team.md` exists

### Verdict (Import)

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 8: Skills — Creation and Persistence

**Goal:** Verify that agents create skills during work and that skills persist across sessions.

### Steps

1. Switch back to the original test project:
   ```bash
   cd ../squad-eval-test
   ```
2. Open VS Code and Copilot Chat with Squad selected.
3. Ask the team to do substantial work that would produce a reusable pattern:
   ```
   {BackendName}, build the CRUD endpoints for tasks — create, read, update, delete. Use Express Router and follow REST conventions.
   ```
4. After the work completes, check `.ai-team/skills/`:
   ```
   ls .ai-team/skills/
   ```
5. If skills were created, open a `SKILL.md` file and inspect its format.
6. Start a **new** Copilot Chat session (close and reopen chat). Ask:
   ```
   {BackendName}, add a "projects" resource with the same CRUD pattern.
   ```
7. Check: does the agent reference or apply the skill from the previous session?

### Expected Result

- After substantial work, agents may create skills in `.ai-team/skills/{skill-name}/SKILL.md`.
  - Note: Skill creation is not guaranteed on every interaction — it happens when an agent identifies a genuinely reusable pattern.
- If skills exist, `SKILL.md` files follow the template format (YAML frontmatter with `name`, `description`, `confidence`, etc.).
- In the new session, agents should read existing skills before starting work — you may see evidence of this in their approach.
- Starter skills from the initial install should still be present.

### Verdict

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 9: Edge Cases

**Goal:** Verify graceful handling of bad input, missing files, and unusual conditions.

### Test 9a: Bad Input to CLI

1. Run with an unknown command:
   ```bash
   npx github:bradygaster/squad foobar
   ```
2. Expected: Should not crash. May treat as default init or show an error.

### Verdict (9a)

- [ ] Pass  [ ] Fail

### Test 9b: Export with No Team

1. In a new empty directory (with no `.ai-team/team.md`):
   ```bash
   mkdir ../squad-edge-test && cd ../squad-edge-test
   git init -b main
   npx github:bradygaster/squad export
   ```
2. Expected: `✗ No squad found — run init first` error message.

### Verdict (9b)

- [ ] Pass  [ ] Fail

### Test 9c: Import with Invalid JSON

1. Create a file with invalid JSON:
   ```bash
   echo "not json" > bad-import.json
   npx github:bradygaster/squad import bad-import.json
   ```
2. Expected: `✗ Invalid JSON in import file:` error message.

### Verdict (9c)

- [ ] Pass  [ ] Fail

### Test 9d: Import with Missing File

1. Run:
   ```bash
   npx github:bradygaster/squad import nonexistent.json
   ```
2. Expected: `✗ Import file not found: nonexistent.json` error message.

### Verdict (9d)

- [ ] Pass  [ ] Fail

### Test 9e: Double Init (Idempotency)

1. Go back to the eval project and run init again:
   ```bash
   cd ../squad-eval-test
   npx github:bradygaster/squad
   ```
2. Expected: Existing files skipped with dim "already exists" messages. No data lost. No errors.

### Verdict (9e)

- [ ] Pass  [ ] Fail

### Test 9f: Addressing a Non-Existent Agent

1. In Copilot Chat with Squad selected, type:
   ```
   Gandalf, build me a login page.
   ```
   (Use a name that is NOT on the team roster.)
2. Expected: Squad should either route the request to the correct agent, ask for clarification, or explain that no agent by that name exists.

### Verdict (9f)

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Section 10: VS Code–Specific Behavior

**Goal:** Verify VS Code integration points work correctly.

### Test 10a: Agent Mode Availability

1. Open VS Code with the test project.
2. Open Copilot Chat.
3. Switch to Agent mode.
4. Verify Squad appears in the agents list.

### Expected Result

- Squad is listed as an available agent.
- Selecting it shows the description from `squad.agent.md` frontmatter: "Your AI team. Describe what you're building, get a team of specialists that live in your repo."

### Verdict (10a)

- [ ] Pass  [ ] Fail

### Test 10b: File Operations

1. Ask Squad to create or modify files:
   ```
   {BackendName}, create a README.md for this project.
   ```
2. Verify the file appears in VS Code's explorer.
3. Verify the file can be opened, edited, and saved normally.

### Expected Result

- Agent creates files using VS Code's tool capabilities (edit/create tools).
- Files appear in the explorer immediately.
- No permission errors or path issues.

### Verdict (10b)

- [ ] Pass  [ ] Fail

### Test 10c: Terminal Integration

1. Ask an agent to run a command:
   ```
   {TesterName}, run the tests.
   ```
2. Check if terminal output is visible.

### Expected Result

- Agent can execute shell commands via VS Code's integrated terminal.
- Output is captured and reported back in the chat.
- No "tool not available" errors.

### Verdict (10c)

- [ ] Pass  [ ] Fail

### Test 10d: Multi-Session Persistence

1. Close VS Code completely.
2. Reopen VS Code with the same project folder.
3. Open Copilot Chat, select Squad, and ask:
   ```
   Where are we? What does the team know?
   ```

### Expected Result

- Squad recognizes the existing team (reads `.ai-team/team.md`).
- Enters Team Mode (not Init Mode).
- Summarizes decisions and current state from `.ai-team/decisions.md`.
- Agent names are consistent with previous session.

### Verdict (10d)

- [ ] Pass  [ ] Fail

### Test 10e: Tool Availability

1. During any agent interaction, observe which tools agents use.
2. Note any "tool not available" errors.

### Expected Result

- Agents can use: `task` (for spawning), `powershell`/terminal, `view`, `edit`, `create`, `grep`, `glob`.
- No critical tools are missing compared to CLI.
- If any tools behave differently, note the specifics.

### Verdict (10e)

- [ ] Pass  [ ] Fail

**Notes:** _________________________________________________________________

---

## Results Summary

| Section | Topic | Pass/Fail |
|---------|-------|-----------|
| 1 | Setup — Fresh Install | |
| 2 | Init Flow — Team Creation | |
| 3 | Agent Spawning — Individual Agents | |
| 4 | Multi-Agent Work — Parallel Fan-Out | |
| 5 | Scribe — Logging & Decisions | |
| 6 | Upgrade | |
| 7a | Export | |
| 7b | Import | |
| 8 | Skills | |
| 9a | Edge: Bad CLI input | |
| 9b | Edge: Export with no team | |
| 9c | Edge: Import invalid JSON | |
| 9d | Edge: Import missing file | |
| 9e | Edge: Double init | |
| 9f | Edge: Non-existent agent name | |
| 10a | VS Code: Agent mode available | |
| 10b | VS Code: File operations | |
| 10c | VS Code: Terminal integration | |
| 10d | VS Code: Multi-session persistence | |
| 10e | VS Code: Tool availability | |

**Total Passed:** _____ / 20  
**Total Failed:** _____ / 20

---

## Tester Questionnaire

Complete this section after running through the full eval.

### 1. Overall Experience Rating

How would you rate the overall Squad experience in VS Code?

| 1 — Broken | 2 — Frustrating | 3 — Okay | 4 — Good | 5 — Excellent |
|:-:|:-:|:-:|:-:|:-:|
| [ ] | [ ] | [ ] | [ ] | [ ] |

### 2. What was the most impressive thing?

_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________

### 3. What felt broken or confusing?

_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________

### 4. Would you use this? Why or why not?

_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________

### 5. What's missing?

_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________

### 6. Bugs or unexpected behavior?

List any bugs, errors, or surprising behavior you encountered. Be specific — include what you typed, what you expected, and what actually happened.

_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________

### 7. Net Promoter Score

How likely are you to recommend Squad to a colleague?

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:--:|
| [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

**Why did you give that score?**

_____________________________________________________________________________
_____________________________________________________________________________

### 8. CLI vs VS Code Parity

Did you notice any differences between how Squad works in the CLI vs VS Code?

_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________

### 9. Performance Notes

How did response times feel? Were there any noticeably slow interactions?

_____________________________________________________________________________
_____________________________________________________________________________

### 10. One thing you'd change

If you could change one thing about Squad, what would it be?

_____________________________________________________________________________
_____________________________________________________________________________

---

*Eval created by McManus (DevRel). Version 1.0. File: `team-docs/human-evals/001-vscode-parity-smoke-test.md`*
