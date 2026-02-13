# Proposal 004: Demo Script Overhaul — "Make It Pop"

**Status:** Approved ✅ Shipped  
**Authored by:** McManus (DevRel)  
**Date:** 2026-02-07  
**Requested by:** bradygaster

---

## Summary

Complete rewrite of the demo script (`docs/demo-script.md`) with a beat-by-beat format that tells Brady exactly what's on screen, what to say (voiceover), and what to physically do at every moment. The current script has good material but is disjointed — it doesn't follow the README order (Brady's feedback), it buries the action steps inside prose, and it has a dead ACT 7 reference gap. This proposal delivers a production-ready recording blueprint.

---

## Problem

The current demo script has three structural problems:

1. **The README walkthrough is out of order.** Brady asked the script to follow the README's flow. The current ACT 5 walks through README sections, but it's positioned as a "meanwhile the agents build" interlude rather than a narrative that tracks the README's structure from top to bottom.

2. **Action steps are buried.** The script tells Brady what the audience should *see*, but doesn't give him explicit "type this, press Enter, wait 3 seconds" instructions. During a recording session, ambiguity costs takes. Takes cost hours.

3. **Missing ACT 7.** The current script jumps from ACT 6 to ACT 8. There's a reference table mentioning ACT 7 content (second wave of parallel work, viewing history.md/decisions.md files), but the act itself doesn't exist. The payoff lands flat because we skip the artifact reveal.

This proposal fixes all three by rebuilding the script as a sequence of **beats** — each with explicit on-screen, voiceover, and action sections.

---

## Solution

A new demo script format with 9 beats, targeting 5–7 minutes total runtime. Every beat has three sections:

- **🎬 ON SCREEN** — exactly what the viewer sees (terminal, browser, file contents)
- **🎙️ VOICEOVER** — exactly what Brady says, written to be spoken aloud
- **👆 WHAT TO DO** — step-by-step physical actions during recording

The script follows the README order: install → prompt → team reveal → parallel work → how it works → knowledge → artifacts → payoff → closer.

The snake game scenario is preserved — it's visual, self-contained, and the CRT effect makes a great thumbnail.

---

## Trade-offs

**What we gain:**
- Brady can record in one session with zero improvisation required
- Voiceover is written conversational — no "reading a script" energy
- Every beat has a clear timestamp target, making editing predictable
- "Throw a squad at it" is woven in naturally per proposal 002

**What we give up:**
- Flexibility — a rigid beat structure leaves less room for spontaneous moments
- Length pressure — 9 beats in 5–7 minutes means some beats are tight (30–45 seconds)

**Mitigation:** Beat timestamps are targets, not hard limits. Brady can breathe. The editing notes at the end cover where to cut if it runs long.

---

## Alternatives Considered

**Option 1: Bullet-point outline (current approach)**  
Pros: Faster to write. Cons: Ambiguous during recording. Brady has to interpret intent on the fly. Costs takes.

**Option 2: Full screenplay format**  
Pros: Industry standard. Cons: Overkill for a 6-minute dev demo. Adds formatting overhead without value.

**Option 3: Beat format (this proposal)**  
Best of both — structured enough to eliminate ambiguity, lightweight enough to read in 10 minutes. Each beat is self-contained. Brady can rehearse one beat at a time.

---

## Success Criteria

- Brady can record the demo in ≤3 takes using only this script
- The finished video is 5–7 minutes
- "Throw a squad at it" appears naturally at least twice
- The thumbnail frame (CRT snake game with agent output visible) is explicitly called out
- Every README section appears in order in the demo

---

## The Script

---

## PRE-RECORDING SETUP CHECKLIST

Complete every item before hitting record. This eliminates re-takes from environment issues.

- [ ] **Clean terminal** — solid dark background, large font (≥16pt), no previous commands in scrollback
- [ ] **Empty folder ready** — a clean directory with nothing in it (e.g., `~/demos/snake-game`). Delete and recreate if reusing.
- [ ] **Git installed and configured** — `git init` must work without prompts
- [ ] **Node.js installed** — `npx` must work. Test with `npx --version`.
- [ ] **GitHub Copilot CLI ready** — `copilot` launches cleanly. Squad appears in `/agents` list after install.
- [ ] **Browser open but hidden** — Chrome/Edge with a blank tab, off-screen. You'll drag it on-screen for the finale.
- [ ] **Screen recording software running** — OBS, QuickTime, or similar. Capture terminal at native resolution.
- [ ] **Microphone OFF during screen recording** — voiceover is recorded separately. No keyboard sounds, no "um"s to edit out.
- [ ] **Editor ready** — VS Code or similar, closed but launchable. You'll open files during BEAT 7.
- [ ] **Test run completed** — run through BEATs 1–3 once to confirm `npx bradygaster/squad` works, Copilot launches, and Squad appears in `/agents`.

---

## BEAT 1: The Empty Folder (0:00–0:30)

### 🎬 ON SCREEN (what the audience sees)
A terminal. Completely empty folder. Three commands typed live — `mkdir`, `git init`, `npx bradygaster/squad`. The install output ticks through: a checkmark for `squad.agent.md`, a checkmark for templates, "Squad is ready." Then a quick file tree showing what was created: `.github/agents/squad.agent.md` and `.ai-team-templates/`.

### 🎙️ VOICEOVER (what Brady says — record separately)
> Empty folder. That's where every project starts. Three commands — make the folder, init git, run one npx command. That's the entire install. Squad drops a single agent file into `.github/agents/` and some templates. No config files, no YAML, no boilerplate. One file. That file is the coordinator — it's the one agent that knows how to build you a team.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Start with terminal visible, cursor blinking in an empty directory
2. Type `mkdir snake-game && cd snake-game` — press Enter, wait for prompt to return
3. Type `git init -b main` — press Enter, wait for "Initialized empty Git repository" message
4. Type `npx bradygaster/squad` — press Enter
5. Wait for install output to complete (checkmarks appear, "Squad is ready" prints)
6. Pause 2 seconds on the output so viewers can read it
7. Type `Get-ChildItem -Recurse -Name` (or `find . -type f` on Mac/Linux) — press Enter to show the file tree
8. Pause 3 seconds on the file tree — this is the "before" shot

---

## BEAT 2: The Prompt (0:30–1:15)

### 🎬 ON SCREEN (what the audience sees)
Copilot CLI opens. Brady selects Squad from the agents list. A prompt appears — it's a retro Snake game spec with canvas rendering, CRT effects, sound, mobile controls. The prompt sits on screen long enough to read. Then Enter is pressed.

### 🎙️ VOICEOVER (what Brady says — record separately)
> Now I open Copilot and pick Squad from the agents list. And I'm going to give it one prompt — a retro Snake game. Canvas rendering, CRT scanline effects, sound, mobile touch controls. I'm not asking for a plan. I'm not asking for an architecture review. I'm saying: build this. Throw a squad at it. Let's see what happens.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Type `copilot` — press Enter to launch Copilot CLI
2. When Copilot opens, select **Squad** from the `/agents` list (arrow keys + Enter, or type `/agent squad`)
3. Paste the following prompt (have it copied to clipboard beforehand):

```
Build a browser-based Snake game using vanilla HTML, CSS, and JavaScript. No frameworks. Requirements:
- Canvas-based rendering at 60fps
- Arrow key and WASD controls
- Score tracking with localStorage high scores
- Progressive speed increase every 5 points
- A retro CRT-style visual effect using CSS filters
- Mobile support via touch swipe controls
- Sound effects using the Web Audio API

Start building immediately — I want to play this in 20 minutes.
```

4. **Do NOT press Enter yet.** Let the prompt sit on screen for 4–5 seconds so viewers can read it.
5. Press Enter.
6. Watch Squad begin processing — it will analyze the prompt and propose a team.

---

## BEAT 3: The Team Reveal (1:15–2:00)

### 🎬 ON SCREEN (what the audience sees)
Squad proposes a team. Names from a fictional universe appear with roles and responsibilities. Something like:

```
🏗️  Dallas    — Lead          Scope, decisions, architecture
⚛️  Ripley    — Frontend Dev  Canvas, rendering, game UI
🔧  Kane      — Backend Dev   Game logic, audio, input systems
🧪  Lambert   — Tester        Tests, edge cases, quality
📋  Scribe    — (silent)      Memory, decisions, session logs
```

Brady confirms. The `.ai-team/` directory gets created — charters, routing, decisions, casting registry.

### 🎙️ VOICEOVER (what Brady says — record separately)
> So Squad didn't start writing code. Its first move was to figure out who it needs. A lead for architecture. A frontend dev for the canvas and visuals. A game logic person for movement and audio. A tester. And Scribe — Scribe is on every team, always silent, always logging. These names aren't random labels. They're persistent identities from a fictional universe. This team is cast from Alien. Next project might be Ocean's Eleven. The names stick — they follow the team across sessions. That's not decoration. That's identity.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Wait for Squad to finish proposing the team — the roster will print to the terminal
2. Pause 3–4 seconds so viewers can read the team roster
3. Type `yes` (or whatever confirmation Squad prompts for) — press Enter
4. Wait for Squad to create the `.ai-team/` directory and agent files
5. When creation completes, let the output settle for 2 seconds

---

## BEAT 4: Parallel Fan-Out (2:00–2:45)

### 🎬 ON SCREEN (what the audience sees)
Squad launches all agents simultaneously. The terminal shows parallel spawning — every agent starting work at the same time:

```
🏗️ Dallas analyzing project structure...
⚛️ Ripley building canvas renderer and CRT effects...
🔧 Kane setting up game loop, input handling, audio...
🧪 Lambert writing test cases from requirements...
📋 Scribe logging everything...
```

All at once. Not sequential. The fan-out is visible.

### 🎙️ VOICEOVER (what Brady says — record separately)
> Here's the moment. Squad just launched every agent at the same time — as background processes. The lead is scoping architecture. The frontend dev is building the canvas renderer. The game logic agent is wiring up movement and audio. And look — the tester is already writing test cases. Right now. From the requirements alone. Before any code exists. That's not waiting for implementation. That's getting ahead of it. All of this is happening in parallel. In separate context windows. No shared bloat.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Watch the terminal as Squad spawns agents — each agent's task will print as it launches
2. Let the fan-out complete — all agents should show as launched
3. Pause 2 seconds on the full list of running agents
4. **This is the cut point** — in editing, you'll cut from here to BEAT 5 while agents work in the background

---

## BEAT 5: How It Works — The Architecture (2:45–4:00)

_While agents build in the background, walk through the README. This follows the README's section order exactly._

### 🎬 ON SCREEN (what the audience sees)
Switch to the Squad README in a browser or editor. Scroll through sections in order, pausing on each:

1. **"What is Squad?"** — linger on "It's not a chatbot wearing hats"
2. **"Agents Work in Parallel"** — the fan-out diagram (matches what just happened)
3. **"How It Works — The Key Insight"** — each agent gets its own context window, mermaid architecture diagram
4. **"Context Window Budget"** — the token table showing real numbers (94% left for actual work)

### 🎙️ VOICEOVER (what Brady says — record separately)

**On "What is Squad?" (scroll slowly):**
> So what is Squad, actually? It gives you a team that persists. These agents aren't throwaway chat sessions. They live in your repo as files — charters, histories, shared decisions. Anyone who clones the repo gets the team, with everything it's learned. And it's not a chatbot wearing hats. Each team member runs in its own context.

**On "Agents Work in Parallel" (pause on the fan-out diagram):**
> This diagram? This is literally what's happening right now in the background. Every agent that can usefully start — starts. No sequencing, no waiting for permission. The coordinator launches aggressively and collects results.

**On "The Key Insight" (pause on mermaid diagram):**
> Here's the design trick. Each agent gets its own context window. The coordinator is thin — it just routes work. Each specialist loads only its charter and its history. No shared bloat. No "I'm the backend agent but I also have to remember the frontend's component library."

**On "Context Window Budget" (pause on the token table):**
> Real numbers. The coordinator uses 1.5% of the context window. Even a veteran agent with three months of accumulated knowledge only uses about 4%. That leaves 94% for actually reasoning about your code. Most agent frameworks burn half their context on identity. Squad doesn't.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Open a browser (or VS Code preview) with the Squad README visible
2. Scroll to **"What is Squad?"** — pause 5 seconds, let the camera rest on "It's not a chatbot wearing hats"
3. Scroll to **"Agents Work in Parallel"** — pause on the fan-out diagram for 4 seconds
4. Scroll to **"How It Works"** — pause on the mermaid architecture diagram for 5 seconds
5. Scroll to **"Context Window Budget"** — pause on the token table for 5 seconds, let viewers read the numbers
6. **Do not rush this section.** This is the conceptual heart of the demo. Let each section breathe.

---

## BEAT 6: Knowledge and Memory (4:00–4:45)

### 🎬 ON SCREEN (what the audience sees)
Continue scrolling the README. Land on:

1. **"Knowledge compounds across sessions"** — the maturity table (First session → Mature project)
2. **"Memory Architecture"** — the four-layer table (charter / history / decisions / log)
3. **"What Gets Created"** — the `.ai-team/` file tree
4. **"Growing the Team" + "Reviewer Protocol"** — brief pause

### 🎙️ VOICEOVER (what Brady says — record separately)

**On "Knowledge compounds" (pause on the maturity table):**
> This is where it gets really interesting over time. Look at this table. First session — the frontend dev knows your framework choice. After a few sessions, it knows your component library, your routing patterns, your state management. Mature project — it knows your design system, your performance patterns, your accessibility conventions. That knowledge lives in each agent's personal `history.md`. It's append-only. It only grows.

**On "Memory Architecture":**
> Four layers. Charter is identity — written once, never self-modified. History is personal — what this agent learned about your project. Decisions is the shared brain — every agent reads the same decisions file before starting work. And the log is Scribe's domain. Searchable archive of everything that happened.

**On "What Gets Created" (pause on file tree):**
> This is what's in your repo. Commit this folder. Your team persists. Your names persist. Anyone who clones gets the team with the same cast.

**On "Growing the Team" / "Reviewer Protocol" (quick scroll):**
> Need a DevOps person? Ask for one. They join the same universe, get seeded with all existing decisions, and they're productive immediately. And the team has standards — reviewers can reject work. No self-review allowed on rejected code. Real accountability.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Scroll to **"Knowledge compounds"** — pause on the maturity table for 6 seconds
2. Scroll to **"Memory Architecture"** — pause on the four-layer table for 4 seconds
3. Scroll to **"What Gets Created"** — pause on the file tree for 3 seconds
4. Scroll through **"Growing the Team"** and **"Reviewer Protocol"** — 2–3 seconds each, keep moving
5. After this section, you'll switch back to the terminal

---

## BEAT 7: The Artifacts (4:45–5:30)

### 🎬 ON SCREEN (what the audience sees)
Switch back to the terminal. Check on agents. Then open real files in an editor:

1. `list_agents` output showing background agents completing
2. Open `.ai-team/decisions.md` — show real decisions the agents made during the build
3. Open one agent's `history.md` — show what it learned
4. Open one agent's `charter.md` — show the identity definition

Real files. Real content written by agents minutes ago.

### 🎙️ VOICEOVER (what Brady says — record separately)
> Alright, let's check in on the team. The agents have been working this whole time. Let's see what they built — but first, let's look at the artifacts. This is `decisions.md`. These are real decisions the team made during the build — architecture choices, file structure, API patterns. Every agent read this before starting. And here's Ripley's history file — look, it already learned about the canvas setup, the CRT filter values, the rendering approach. Next session, Ripley won't ask about any of this again. It remembers.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Switch back to the terminal window
2. If Squad's output is visible showing agent completion, pause on it for 3 seconds
3. Open VS Code (or your editor) with the project folder
4. Open `.ai-team/decisions.md` — scroll slowly through the decisions, pause on 2–3 specific entries
5. Open one agent's `history.md` (e.g., `.ai-team/agents/ripley/history.md` or whatever name was cast) — scroll through learnings
6. Open the same agent's `charter.md` — show the identity, expertise, and voice definition
7. Pause 2 seconds on the charter — let viewers see that agents have defined personalities

---

## BEAT 8: The Payoff — Play the Game (5:30–6:15)

### 🎬 ON SCREEN (what the audience sees)
Open `index.html` (or whatever the snake game entry point is) in the browser. The game loads. CRT scanline effect is visible — green phosphor glow on a dark background. Brady plays the game for 15–20 seconds. The snake moves, food appears, score increments, speed increases. The CRT effect makes it look retro and polished.

**🖼️ THUMBNAIL MOMENT:** The single frame for the video thumbnail is here. The browser showing the CRT snake game in the foreground, with the terminal showing agent completion output partially visible behind it. Agents built this. The game proves it.

### 🎙️ VOICEOVER (what Brady says — record separately)
> And there it is. A working Snake game with canvas rendering, CRT effects, the whole thing. Built by a team of AI agents working in parallel while I walked you through how it works. I didn't write a line of code. I didn't manage tasks. I didn't copy-paste between chat windows. I described what I wanted and threw a squad at it.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Open the project's `index.html` file in Chrome/Edge (drag from file explorer or use `open index.html`)
2. Wait for the game to fully load — the CRT effect should be visible immediately
3. Play the game for 15–20 seconds — use arrow keys, let the score increment at least twice
4. **For the thumbnail:** Position the browser window so the terminal with agent output is partially visible behind it. Take a mental note of this frame — or screenshot it separately for the thumbnail.
5. Let the game run for a few more seconds in the background

---

## BEAT 9: The Closer (6:15–6:45)

### 🎬 ON SCREEN (what the audience sees)
Back to the terminal. Show the project file tree one final time — the full structure with `.ai-team/`, source files, everything the team built. Then show the three Quick Start commands from the README one more time. The final frame: the Squad repo URL.

### 🎙️ VOICEOVER (what Brady says — record separately)
> The team is in the repo now. Tomorrow I can open Copilot, talk to the same agents by name, and they'll remember everything — the canvas setup, the audio patterns, the CRT filter values. The more you use Squad, the less you have to explain. That's the whole idea. Three commands to install. One prompt to start. Your team gets smarter every session. Try it — `npx bradygaster/squad`. Throw a squad at it.

### 👆 WHAT TO DO (Brady's action steps during recording)
1. Switch back to the terminal
2. Type `Get-ChildItem -Recurse -Name` (or `find . -type f`) — press Enter to show the full project tree
3. Pause 4 seconds on the file tree — this is the "after" shot (compare to BEAT 1's "before")
4. Clear the terminal (optional) and type: `npx bradygaster/squad` — **do not press Enter.** Let it sit as the final call-to-action.
5. Hold this frame for 5 seconds — this is the outro shot
6. Stop recording

---

## POST-RECORDING NOTES

### Editing Cuts
- **BEAT 4 → BEAT 5:** Hard cut. Agents are spawning, then we're in the README. No transition needed — the voiceover bridges it ("while they build, let me show you how this works").
- **BEAT 6 → BEAT 7:** Soft cut. Scroll ends, switch to terminal. Consider a 0.5-second fade or just a direct cut.
- **BEAT 7 → BEAT 8:** This is the big reveal. Consider a 1-second pause (black frame or freeze) before the game appears. Let the payoff land.
- **If it runs long:** Cut time from BEAT 6 (the README walkthrough can lose "Growing the Team" and "Reviewer Protocol" without hurting the narrative). BEATS 1–4 and 8–9 are sacred — don't cut them.

### Music Suggestions
- **Lo-fi / chillhop instrumental** — low energy, doesn't compete with voiceover. Think "coding playlist" vibes.
- Start music at BEAT 1, duck it under voiceover, bring it up slightly during BEAT 4 (the parallel fan-out is visual, less talking).
- **Kill the music at BEAT 8** when the game appears. Let the game's own audio (if it works) or silence carry the payoff. Music re-enters softly for BEAT 9 closer.
- Royalty-free sources: Epidemic Sound, Artlist, or YouTube Audio Library.

### Voiceover Recording Tips
- Record in a quiet room. Closet works. No reverb.
- Speak at conversation pace — not presentation pace. Imagine you're showing a friend something cool on your laptop.
- It's OK to breathe. Pauses between beats are natural. Don't try to fill every second.
- Record each beat separately. Label files `beat-01-voiceover.wav` through `beat-09-voiceover.wav`. Easier to sync in editing.

### Thumbnail
- Frame from BEAT 8: CRT snake game in browser, foreground. Terminal with agent names/completion output partially visible behind.
- Add text overlay: **"One prompt. Five agents. Working game."** — or just **"Throw a squad at it."**
- Green CRT glow + purple Squad badge = strong color contrast for YouTube/social feeds.

---

## Why This Script Works

### The Messaging Strategy

**1. It follows the README order — on purpose.**

Brady's feedback was clear: the current script is disjointed. This script mirrors the README's structure exactly. When someone watches the demo and then reads the README, the concepts land in the same order. That's not an accident — it's reinforcement. The demo primes the concepts, the README deepens them. Same story, two formats.

**2. The hero moment is at the END, not the beginning.**

Most dev demos open with the flashy result and then explain how they got there. This script inverts it — you start with an empty folder and build toward the payoff. By the time the snake game appears in BEAT 8, the viewer understands *what built it*. The game isn't the point. The team is the point. The game is proof.

**3. "Throw a squad at it" lands twice — naturally.**

Per proposal 002, the tagline needs to feel like something Brady would actually say, not something he was told to say. It appears first in BEAT 2 (the prompt) as a casual "let's see what happens" moment, and again in BEAT 9 (the closer) as the final call-to-action. Two mentions. Both conversational. Neither forced.

**4. The README walkthrough IS the demo.**

BEATs 5–6 walk through the README while agents build in the background. This is the single smartest structural choice in the script. It accomplishes three things at once:
- Explains the architecture (educational)
- Shows parallel work happening in real time (proof)
- Drives viewers to the README for deeper reading (conversion)

The viewer isn't watching a demo *and then* reading docs. They're watching the docs come alive while the product runs.

**5. The artifacts beat (BEAT 7) makes it real.**

Opening `decisions.md` and `history.md` — files that were just written by agents minutes ago — is the "oh, this is actually real" moment. Abstract concepts ("agents share decisions") become concrete when you see the actual file. This beat converts skeptics.

**6. The thumbnail is engineered.**

The CRT snake game with agent output in the background is designed to stop a dev mid-scroll. It's visually distinct (green glow, retro aesthetic) and informationally dense (you can see agents built this). A good thumbnail is worth 10x the content behind it.

---

## Appendix: Timing Breakdown

| Beat | Title | Duration | Cumulative |
|------|-------|----------|------------|
| 1 | The Empty Folder | 0:30 | 0:30 |
| 2 | The Prompt | 0:45 | 1:15 |
| 3 | The Team Reveal | 0:45 | 2:00 |
| 4 | Parallel Fan-Out | 0:45 | 2:45 |
| 5 | How It Works | 1:15 | 4:00 |
| 6 | Knowledge and Memory | 0:45 | 4:45 |
| 7 | The Artifacts | 0:45 | 5:30 |
| 8 | The Payoff | 0:45 | 6:15 |
| 9 | The Closer | 0:30 | 6:45 |

**Total: ~6:45** — fits comfortably in the 5–7 minute target with room for natural pacing.

---

## Revisions

None yet.
