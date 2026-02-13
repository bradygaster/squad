# Proposal 026: Scripted End-to-End Demos

**Status:** Draft
**Authored by:** Verbal (Prompt Engineer)
**Date:** 2026-02-09
**Requested by:** bradygaster

---

## Summary

Production-quality demo recordings where every keystroke, pause, expected output, voiceover cue, and cut point is scripted in advance. No improvisation. No retakes from unexpected output. No "let me just..." moments. Every second of footage is planned, verified, and repeatable.

This proposal defines what "100% scripted" means, establishes a structured demo script format, evaluates recording tools, proposes five end-to-end demo scenarios, and describes how recorded sessions flow into docs, README, and social content.

---

## Problem

Proposal 004 (Demo Script Overhaul) gave Brady a beat-by-beat recording blueprint — voiceover cues, on-screen descriptions, action steps. That was a major upgrade from the bullet-point outline. But it still has gaps that cost recording time:

1. **Input is approximate.** "Paste the prompt" and "Type `copilot`" are action steps, but they don't specify keystroke timing, typing speed, or pause duration. During recording, Brady makes micro-decisions about pacing that create inconsistency across takes.

2. **Output is assumed.** The script says "Squad proposes a team" but doesn't specify what the expected output looks like. If the output differs from expectations (different names, different formatting, error messages), Brady has to improvise or abort the take.

3. **No verification step.** There's no way to confirm that a demo will produce the expected output before recording. Brady discovers problems during recording, not before.

4. **No automation path.** The current format is human-readable prose. It can't be fed to a recording tool for automated capture. Every recording requires Brady to manually execute every step.

5. **Single scenario.** We have one demo (Snake game). Brady wants a library of demos covering different Squad capabilities — issues workflow, export/import, status checks, PRD intake.

---

## 1. What "100% Scripted" Means

A fully scripted demo has **six layers** at every step:

| Layer | What it contains | Why it matters |
|-------|-----------------|----------------|
| **Input** | Exact characters to type, including pauses between keystrokes | Eliminates pacing decisions during recording |
| **Expected output** | Regex or substring patterns the terminal should produce | Enables pre-flight verification — run the script, confirm output matches before recording |
| **Timing** | Millisecond-level pause durations, typing speed (chars/sec), hold durations on output | Makes recordings consistent across takes and demos |
| **Voiceover cues** | What Brady says during this step, synced to timing marks | Voiceover is recorded separately but timing aligns to footage |
| **Annotations** | On-screen callouts, highlights, zoom targets | Post-production knows exactly where to add visual emphasis |
| **Cut points** | Where editors can safely cut, splice, or time-shift | Reduces editing time; editors don't have to find safe cut points |

**The test:** A scripted demo can be dry-run as an automated test. Run the script, compare output to expected patterns, flag mismatches. If the dry run passes, recording will succeed on the first take.

---

## 2. Demo Script Format

Each demo is a sequence of **steps**. Each step is a structured block:

```yaml
- step: 3
  title: "Install Squad"
  input:
    text: "npx github:bradygaster/squad"
    typing_speed: 40  # chars per second (human-realistic)
    pre_delay: 500     # ms before typing starts
    post_delay: 2000   # ms after Enter before next step
  expected_output:
    patterns:
      - "squad.agent.md"          # substring match
      - "Squad is ready"          # substring match
      - "\\.(github|ai-team)"    # regex match
    timeout: 15000  # ms to wait for output
  timing:
    hold_on_output: 3000  # ms to pause on output for viewer reading
    speed_factor: 1.0      # 1.0 = realtime, 2.0 = double speed
  voiceover: >
    One npx command. That's the entire install. Squad drops a single
    agent file into .github/agents/ and some templates. No config,
    no YAML, no boilerplate.
  annotations:
    - type: highlight
      target: "squad.agent.md"
      label: "This is the coordinator"
  cut_point:
    safe_to_cut_after: true
    transition: "hold"  # hold | fade | hard-cut
    notes: "Can splice to next step after output settles"
```

### Format Design Decisions

- **YAML over Markdown.** The script must be machine-parseable for dry-run verification and potential automation. YAML is readable by humans and parseable by tools.
- **Timing in milliseconds.** Specific enough for automation tools, easily converted to human-readable seconds for Brady's reference.
- **Regex + substring for output matching.** Substring for simple cases ("Squad is ready"), regex for variable content (agent names change per casting universe).
- **Voiceover is inline.** Brady can read the script top-to-bottom and know exactly what to say at each step. No cross-referencing separate voiceover documents.

### Companion: Human-Readable View

Each YAML script also generates a **Brady-readable cheat sheet** — a simplified view showing only:
1. What to type
2. How long to wait
3. What to say
4. Where to cut

This is what Brady has on a second monitor during recording. The YAML is the source of truth; the cheat sheet is the recording aid.

---

## 3. Recording Tools — Evaluation

### Candidates

| Tool | Approach | Output | Scripting | Pros | Cons |
|------|----------|--------|-----------|------|------|
| **`vhs`** (Charm) | Declarative `.tape` files | GIF, MP4, WebM | Native — typed DSL with `Type`, `Sleep`, `Enter` | Deterministic, version-controllable, CI-friendly | No audio, limited output verification |
| **`asciinema`** | Terminal recording + replay | asciicast, GIF (via agg) | Record-then-replay; scripting via `expect` | Lightweight, great replay UX, embeddable | No native scripting, replay-only, no MP4 |
| **`terminalizer`** | Terminal recording | GIF, YAML config | Record-then-edit YAML | Customizable styling, large install base | Stale maintenance, slow GIF rendering |
| **Custom Node.js** | stdin/stdout replay | Raw terminal data | Full control | Exact output matching, verification built-in | Build cost, maintenance burden |

### Recommendation: `vhs` by Charm

**Why vhs wins:**

1. **Declarative scripting is the format.** A `.tape` file *is* a scripted demo. `Type "npx github:bradygaster/squad"`, `Sleep 3s`, `Enter`. Our YAML script format maps directly to tape instructions. The translation is mechanical.

2. **Deterministic output.** Same tape file → same recording every time. No variance from human typing speed, mouse position, or timing drift. Brady can review a GIF before committing to a full recording session.

3. **Multiple output formats.** GIF for README embeds, MP4 for video editing, WebM for web. One tape file produces all three. This feeds directly into the docs pipeline (Section 5).

4. **CI-friendly.** Tape files can run in GitHub Actions. We can verify that demos still produce expected output after code changes. A demo that breaks is a failing CI check, not a surprise during recording week.

5. **Version-controllable.** Tape files are text. They live in the repo alongside the demo scripts. Changes are diffable, reviewable, and tied to the code they demo.

**What vhs doesn't do (and how we compensate):**

- **No voiceover.** Voiceover is recorded separately per Proposal 004's approach. vhs produces the visual footage; Brady records audio as a separate pass. This is actually better — it decouples visual and audio quality.
- **No output verification.** vhs doesn't assert on output. We add a dry-run step: run the tape commands via a Node.js script that checks output patterns before recording. The tape file is the recording; the YAML script is the verification spec.
- **No mouse interaction.** Squad demos are terminal-first. Mouse is only needed for browser reveals (playing the Snake game). Those moments are recorded manually and spliced in during editing.

### vhs Tape File Example

```tape
# Demo 1: First Squad Session
# Duration: ~3 minutes

Output demo-first-session.gif
Output demo-first-session.mp4

Set FontSize 16
Set Width 1200
Set Height 800
Set Theme "Catppuccin Mocha"

# Step 1: Create project
Type "mkdir my-project && cd my-project"
Enter
Sleep 1s

# Step 2: Init git
Type "git init -b main"
Enter
Sleep 1s

# Step 3: Install Squad
Type "npx github:bradygaster/squad"
Enter
Sleep 8s

# Step 4: Show file tree
Type "find . -type f"
Enter
Sleep 3s

# Step 5: Launch Copilot
Type "copilot"
Enter
Sleep 2s

# ... (continues for each step)
```

---

## 4. Proposed Demo Scenarios

Five end-to-end demos covering Squad's core capabilities. Each is self-contained and demonstrates a different value proposition.

---

### Demo 1: First Squad Session

**Title:** "Empty Folder to Working App in 3 Minutes"
**Duration:** ~3 minutes
**Value prop:** Squad's core workflow — install, prompt, parallel build, results

**Key Beats:**

| Beat | Timestamp | What happens | What makes it impressive |
|------|-----------|-------------|------------------------|
| 1 | 0:00–0:20 | `mkdir` → `git init` → `npx github:bradygaster/squad` | Three commands. That's it. |
| 2 | 0:20–0:50 | Open Copilot, select Squad, paste prompt (Snake game) | One prompt, not a conversation |
| 3 | 0:50–1:20 | Team reveal — named agents, roles, universe theme | Agents have *names*, not labels |
| 4 | 1:20–1:50 | Parallel fan-out — all agents launch simultaneously | Visual proof of parallelism |
| 5 | 1:50–2:30 | Quick file inspection — `decisions.md`, one `history.md` | Agents coordinated without you |
| 6 | 2:30–3:00 | Open browser, play the Snake game | It works. They built it. |

**What makes it impressive:** The speed. Three minutes from nothing to a working game built by five agents working in parallel. The viewer's mental model of "AI writes code" shifts to "AI runs a team."

**Pre-requisites:**
- Clean empty directory
- Node.js, git, Copilot CLI installed
- Browser ready off-screen
- Snake game prompt on clipboard

---

### Demo 2: GitHub Issues Workflow

**Title:** "Issue to Merged PR — Squad Handles the Whole Loop"
**Duration:** ~4 minutes
**Value prop:** Squad integrates with GitHub's native workflow — issues, branches, PRs, reviews

**Key Beats:**

| Beat | Timestamp | What happens | What makes it impressive |
|------|-----------|-------------|------------------------|
| 1 | 0:00–0:30 | Show existing project with Squad team already set up | Team *persists* — no re-setup |
| 2 | 0:30–1:10 | Create a GitHub issue: "Add dark mode toggle" | Real issue, real repo |
| 3 | 1:10–1:50 | Tell Squad: "Pick up issue #12" — team analyzes, plans | Agents read the issue themselves |
| 4 | 1:50–2:40 | Agents work in parallel — frontend builds toggle, tester writes tests, lead reviews | Coordination through decisions.md |
| 5 | 2:40–3:20 | Squad creates branch, commits, opens PR with summary | PR description references issue, agent work |
| 6 | 3:20–4:00 | Show PR diff, linked issue, review comments | Full GitHub-native workflow |

**What makes it impressive:** Squad isn't a standalone tool — it works *inside* the developer's existing workflow. Issues → branches → PRs → reviews. The agents don't bypass GitHub; they use it.

**Pre-requisites:**
- Existing project with `.ai-team/` directory and established team
- GitHub repo with issues enabled
- Pre-created issue #12 (or appropriate number) with "Add dark mode toggle" description
- Team should have at least 2 sessions of history (agents "know" the codebase)

---

### Demo 3: Export/Import Portability

**Title:** "Your Squad Remembers YOU"
**Duration:** ~2 minutes
**Value prop:** Teams are portable — export from one project, import into another, all knowledge transfers

**Key Beats:**

| Beat | Timestamp | What happens | What makes it impressive |
|------|-----------|-------------|------------------------|
| 1 | 0:00–0:20 | Show established project with rich `.ai-team/` — history, decisions, skills | This team has been working for weeks |
| 2 | 0:20–0:50 | Run `squad --export` — show the JSON output, highlight key sections | One command captures everything |
| 3 | 0:50–1:10 | Create a brand new empty project, `git init` | Fresh start |
| 4 | 1:10–1:30 | Run `squad --import squad-export.json` — team materializes | Same names, same knowledge, new repo |
| 5 | 1:30–2:00 | Ask an agent a question about the old project's conventions — it answers correctly | The knowledge transferred. It *remembers*. |

**What makes it impressive:** The "it remembers" moment. The agent in the new project knows conventions, patterns, and preferences from the old project. This isn't "start over with AI" — it's "bring your team with you."

**Pre-requisites:**
- Source project with rich team history (3+ sessions, multiple decisions, skills)
- `squad-export.json` pre-generated (or generate live)
- Empty target directory
- Both directories visible (split terminal or quick switch)

---

### Demo 4: "Where Are We?" Instant Team Status

**Title:** "One Question. Full Team Status. Zero Context Switching."
**Duration:** ~1 minute
**Value prop:** Squad gives you instant project awareness — what every agent knows, what's in flight, what's decided

**Key Beats:**

| Beat | Timestamp | What happens | What makes it impressive |
|------|-----------|-------------|------------------------|
| 1 | 0:00–0:10 | Open Copilot with Squad in an existing project mid-build | Drop in, no warm-up |
| 2 | 0:10–0:30 | Type: "Where are we?" — Squad summarizes team status | Instant synthesis across all agents |
| 3 | 0:30–0:50 | Output shows: per-agent status, recent decisions, open items, blockers | One prompt replaces reading 5 files |
| 4 | 0:50–1:00 | Brief: "What did Ripley do last session?" — specific agent recall | Named agent, specific memory |

**What makes it impressive:** Speed and synthesis. One question replaces `cat`-ing five history files and a decisions file. The coordinator synthesizes across all agents instantly. This is the "project standup in 10 seconds" moment.

**Pre-requisites:**
- Existing project mid-build (at least 2 sessions completed)
- Multiple agents with populated history files
- Recent decisions in `decisions.md`
- Ideally some work in-progress (background agents or recent completions)

---

### Demo 5: PRD Intake → Decomposition → Parallel Execution

**Title:** "From Product Spec to Running Code — One Prompt"
**Duration:** ~3 minutes
**Value prop:** Squad handles the full lifecycle — intake a PRD, decompose into tasks, assign to specialists, execute in parallel

**Key Beats:**

| Beat | Timestamp | What happens | What makes it impressive |
|------|-----------|-------------|------------------------|
| 1 | 0:00–0:30 | Show a PRD document (markdown, 1-2 pages) — a recipe sharing app | Real product spec, not a toy prompt |
| 2 | 0:30–1:00 | Paste PRD into Squad. Lead analyzes, decomposes into work items | Automatic task decomposition |
| 3 | 1:00–1:30 | Lead proposes assignment — frontend, backend, tester, each with scope | Intelligent routing based on charter expertise |
| 4 | 1:30–2:20 | Fan-out — all agents start simultaneously. Show parallel output | Same parallelism, but from a *document*, not a prompt |
| 5 | 2:20–2:40 | Show `decisions.md` — API contracts, data models, shared agreements | Agents negotiated contracts without you |
| 6 | 2:40–3:00 | Show partial results — scaffolded app, test cases, architecture doc | PRD → working scaffold in 3 minutes |

**What makes it impressive:** The input is a *product document*, not a developer prompt. This shows Squad bridging the gap between product thinking and engineering execution. PMs write the PRD; Squad decomposes and builds. The decomposition step — lead breaking a PRD into agent-scoped work items — is the moment that sells enterprise use.

**Pre-requisites:**
- PRD document pre-written (markdown, 1-2 pages, covering a recipe sharing app or similar)
- PRD on clipboard for paste
- Clean project directory with Squad installed (or install live)
- Enough time budget for agents to produce visible output (~2 min of background work)

---

## 5. Demos → Docs Pipeline

Recorded demos should produce assets for multiple channels from a single recording session.

### Asset Flow

```
tape file (.tape)
  ├── vhs render → GIF (README embed, docs)
  ├── vhs render → MP4 (video editing, YouTube)
  ├── vhs render → WebM (web embed)
  └── manual recording + voiceover → Full video (YouTube, social)

Full video
  ├── Trim to 60s → Social clip (Twitter/X, LinkedIn)
  ├── Trim to key beat → GIF (docs, issue templates)
  ├── Screenshot key frame → Thumbnail (YouTube, social)
  └── Extract voiceover text → Blog post / tutorial
```

### Where Assets Land

| Asset | Format | Destination | Purpose |
|-------|--------|-------------|---------|
| Install GIF | GIF (15s) | README "Quick Start" section | Shows three-command install at a glance |
| Fan-out GIF | GIF (10s) | README "Agents Work in Parallel" section | Visual proof of parallelism |
| "Where are we?" GIF | GIF (15s) | README or docs | Shows instant status synthesis |
| Full demo video | MP4 (3-7min) | YouTube, GitHub Releases page | Primary content piece |
| Social clips | MP4 (30-60s) | Twitter/X, LinkedIn, Reddit | Shareable "wait what" moments |
| Key frame screenshots | PNG | Thumbnails, blog headers, social cards | Visual identity |
| Export/Import GIF | GIF (20s) | docs/portability section | Shows team portability |

### Maintenance Rule

**If a demo breaks, the CI breaks.** Tape files run in CI as smoke tests. If a code change makes a demo's expected output no longer match, the build fails. This ensures demos stay current with the product — no stale GIFs in the README showing features that work differently now.

---

## 6. Pre-requisites for Each Demo

### Shared Pre-requisites (All Demos)

- [ ] Node.js ≥18 installed, `npx --version` returns cleanly
- [ ] Git installed, `git init` works without prompts
- [ ] GitHub Copilot CLI installed, `copilot` launches cleanly
- [ ] Terminal: solid dark background, ≥16pt font, no scrollback history
- [ ] Screen recording software running (OBS or similar) at native resolution
- [ ] `vhs` installed (`brew install vhs` / `go install github.com/charmbracelet/vhs@latest`)
- [ ] Microphone OFF during terminal recording (voiceover recorded separately)

### Per-Demo Setup

| Demo | Repo State | Test Data | Special Setup |
|------|-----------|-----------|---------------|
| 1: First Session | Empty directory, nothing | Snake game prompt on clipboard | Browser ready off-screen for finale |
| 2: Issues Workflow | Existing project with 2+ sessions of team history | GitHub issue pre-created (#12 "Add dark mode") | GitHub CLI (`gh`) authenticated, repo pushed to GitHub |
| 3: Export/Import | Source project with 3+ sessions, rich history | `squad-export.json` pre-generated (or generate live) | Two terminal panes or tabs visible |
| 4: Where Are We? | Mid-build project with multiple agents, recent decisions | N/A — uses existing state | Keep it fast — rehearse to hit <60s |
| 5: PRD Intake | Clean directory with Squad installed | PRD document (1-2 pages, markdown) on clipboard | PRD should be realistic — recipe app, dashboard, etc. |

### Dry-Run Checklist (Before Any Recording)

1. **Run the tape file** (or manually execute steps) end-to-end once
2. **Compare output** to expected patterns in the YAML script
3. **Time the run** — confirm it fits the target duration (±30s)
4. **Check for surprises** — unexpected errors, different casting universe, slow network
5. **Reset state** — delete created directories, clear terminal, re-stage test data
6. **Record**

---

## Trade-offs

**What we gain:**
- Demos are repeatable — same script, same result, every time
- Brady can rehearse from a cheat sheet and record in 1-2 takes
- Tape files enable automated GIF/MP4 generation for docs
- CI integration catches stale demos before they embarrass us
- Five demos cover Squad's full value surface, not just the Snake game

**What we give up:**
- Scripting overhead — each demo requires YAML authoring, output pattern definition, and dry-run verification before the first recording
- Rigidity — fully scripted demos can feel mechanical if voiceover isn't conversational
- vhs limitations — no mouse interaction, no browser content (those moments need manual recording + splice)

**Mitigation:**
- The YAML script format is write-once, update-rarely. The upfront cost pays back across all future recordings.
- Voiceover is recorded separately with conversational tone (per Proposal 004's approach). The automation handles visuals; Brady handles personality.
- Browser moments (playing the Snake game, showing GitHub PRs) are clearly marked as manual-record segments with splice points defined.

---

## Alternatives Considered

**Option 1: Keep the current Proposal 004 beat format, just add more demos**
Pros: Lower effort. Cons: Still has the pacing/verification gaps. Every new demo inherits the same problems. Doesn't scale.

**Option 2: Full OBS macro scripting**
Pros: Can automate everything including browser interactions. Cons: OBS macros are fragile, non-portable, and not version-controllable. Tying demos to a specific recording setup defeats portability.

**Option 3: asciinema + expect scripts**
Pros: Great replay experience, lightweight. Cons: Output format is asciicast (not GIF/MP4 natively), scripting via `expect` is brittle for complex interactions, no native CI integration.

**Option 4: This proposal (vhs + YAML verification + structured scripts)**
Best balance of automation, portability, and production quality. vhs handles deterministic recording, YAML handles verification, and the structured format scales to any number of demos.

---

## Success Criteria

- [ ] Brady can record any of the five demos in ≤2 takes using only the cheat sheet
- [ ] Each tape file produces a clean GIF and MP4 without manual intervention
- [ ] At least 3 demo GIFs are embedded in the README or docs
- [ ] CI runs tape files as smoke tests — broken demos fail the build
- [ ] "Where are we?" demo is under 60 seconds and feels instant
- [ ] PRD intake demo shows decomposition as a visible, impressive step

---

## Implementation Sequence (When Approved)

This is a proposal — implementation is deferred until Brady reviews and approves. Suggested order:

1. **Write Demo 1 YAML script** (First Session) — it's the foundation, reuses existing Snake game scenario
2. **Create the vhs tape file** for Demo 1 — validate the format, generate first GIF
3. **Add CI smoke test** — tape file runs in GitHub Actions, output patterns verified
4. **Write Demos 4 and 3** (shortest first — "Where are we?" at 1min, Export/Import at 2min)
5. **Write Demo 2** (Issues workflow — requires GitHub integration setup)
6. **Write Demo 5** (PRD intake — requires PRD document authoring)
7. **Embed GIFs in README** — replace static diagrams with recorded demos where applicable
8. **Record full videos** with voiceover — Brady's recording session

---

## Revisions

None yet.
