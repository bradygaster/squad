# Squad Demo Video Script
## Retro Snake Game ΓÇö End-to-End

**Runtime target:** 6ΓÇô8 minutes
**Recording approach:** Screen-record the full session in one take. Record voiceover separately after, synced to the footage. This lets you nail the narration without time pressure during the build.

---

## PRE-RECORDING SETUP

- Empty folder, nothing in it
- Terminal open, Copilot CLI ready
- Browser open but off-screen (for the final reveal)

---

## ACT 1 ΓÇö ZERO TO HERO (0:00ΓÇô0:45)

### On Screen
Start in a completely empty folder. Type each command live:

```bash
mkdir snake-game && cd snake-game
git init -b main
npx bradygaster/squad
```

Show the `npx` output as Squad installs ΓÇö the `.github/agents/squad.agent.md` file drops in. That's it. One file. That's the entire starting point.

Pause on the file tree for a beat. One folder, one file. This is the "before" shot.

### Voiceover
> Empty folder. `git init`. One `npx` command. That's the setup ΓÇö that's all of it. Squad is a single agent definition that lives in `.github/agents/`. There's no code, no config, no boilerplate. When I open Copilot and talk to Squad, it's not going to write the code itself. It's going to build me a team that writes the code.

---

## ACT 2 ΓÇö THE PROMPT (0:45ΓÇô1:30)

### On Screen
Open Copilot CLI. Select Squad from the agent list. Paste the prompt:

```
Build a browser-based Snake game using vanilla HTML, CSS, and JavaScript. No frameworks. Requirements:
- Canvas-based rendering at 60fps
- Arrow key and WASD controls
- Score tracking with localStorage high scores
- Progressive speed increase every 5 points
- A retro CRT-style visual effect using CSS filters
- Mobile support via touch swipe controls
- Sound effects using the Web Audio API

Start building immediately ΓÇö I want to play this in 20 minutes.
```

Hit enter. Watch Squad start working ΓÇö it identifies the project, proposes a team with cast names from a fictional universe, and asks for confirmation.

### Voiceover
> I'm giving it a single prompt ΓÇö a retro Snake game with canvas rendering, CRT effects, sound, mobile touch controls. I didn't ask for a plan. I asked it to start building. Squad's first move is to figure out who it needs.

---

## ACT 3 ΓÇö THE TEAM REVEAL (1:30ΓÇô2:30)

### On Screen
Squad proposes the team. You'll see something like:

```
≡ƒÅù∩╕Å  Dallas    ΓÇö Lead          Scope, decisions, architecture
ΓÜ¢∩╕Å  Ripley    ΓÇö Frontend Dev  Canvas, rendering, game UI
≡ƒöº  Kane      ΓÇö Backend Dev   Game logic, audio, input systems
≡ƒº¬  Lambert   ΓÇö Tester        Tests, edge cases, quality
≡ƒôï  Scribe    ΓÇö (silent)      Memory, decisions, session logs
```

(Names will vary ΓÇö Squad picks from a fictional universe each time. The Alien universe is one of 14 options.)

Say "yes" or just tell it to start. Squad creates the entire `.ai-team/` directory ΓÇö charters, routing, decisions file, casting registry, everything.

### Voiceover
> Each team member gets a persistent identity ΓÇö a charter that defines what they own, how they think, and where their boundaries are. These names come from a fictional universe, picked deterministically based on the project shape. They're not decorative. They're persistent identifiers that follow the team across sessions. And notice Scribe at the bottom ΓÇö silent, always present. Scribe is on every team. It never talks to you, but it's doing critical work behind the scenes: logging every session, merging decisions, keeping the team's shared memory consistent.

---

## ACT 4 ΓÇö THE BUILD BEGINS (2:30ΓÇô3:30)

### On Screen
Squad launches all agents in parallel. You'll see the fan-out:

```
≡ƒÅù∩╕Å Dallas analyzing project structure...
ΓÜ¢∩╕Å Ripley building canvas renderer and CRT effects...
≡ƒöº Kane setting up game loop, input handling, audio...
≡ƒº¬ Lambert writing test cases from requirements...
≡ƒôï Scribe logging everything...
```

All background. All simultaneous. This is the moment to cut away.

### Voiceover
> Here's what's happening: Squad didn't send one agent to work and wait for it to finish. It launched everyone at once ΓÇö as background agents. The lead is analyzing the architecture. The frontend dev is building the canvas renderer. The backend dev is wiring up game logic and audio. And the tester ΓÇö the tester is already writing test cases, right now, from the requirements alone, before any code exists. They'll adjust when the implementation lands. That's anticipatory work. It's not waiting. It's getting ahead.

---

## ACT 5 ΓÇö THE README WALKTHROUGH (3:30ΓÇô5:30)

### On Screen
While agents are building, switch to the Squad repo README (or the project's README if one was generated). Scroll slowly from the top. Hit these sections in order, pausing on each:

1. **"What is Squad?"** ΓÇö linger on "It's not a chatbot wearing hats"
2. **"Agents Work in Parallel"** ΓÇö the fan-out diagram matches what's happening right now
3. **"Knowledge compounds across sessions"** ΓÇö the maturity table (First session ΓåÆ Mature project)
4. **"How It Works ΓÇö The Key Insight"** ΓÇö each agent gets its own context window
5. **"Context Window Budget"** ΓÇö the token table showing 94% left for actual work
6. **"Memory Architecture"** ΓÇö charter / history / decisions / log
7. **"What Gets Created"** ΓÇö the `.ai-team/` directory structure
8. **"Growing the Team"** ΓÇö adding and removing members
9. **"Reviewer Protocol"** ΓÇö agents can reject work

### Voiceover (synced to what's on screen)

**On "What is Squad?":**
> Squad gives you a team that persists. These agents aren't disposable ΓÇö they live in your repo as files. Charters, histories, shared decisions. Anyone who clones the repo gets the team, with everything it's learned.

**On "Agents Work in Parallel":**
> This is exactly what's happening right now while I'm talking. Every agent that can usefully start work ΓÇö starts. No sequencing, no waiting. The coordinator's job is to launch aggressively and collect results later.

**On "Knowledge compounds":**
> This is where it gets interesting over time. After a few sessions, the frontend dev knows your component library. The backend dev knows your auth strategy. The tester knows your edge case patterns. They stop asking questions they've already answered. That knowledge is stored in each agent's personal history file ΓÇö and it's append-only. It only grows.

**On "Context Window Budget":**
> This is the design trick that makes it work. The coordinator is tiny ΓÇö about 1.5% of the context window. Even a veteran agent with weeks of accumulated knowledge only uses about 4%. That leaves 94% of the context window for actually reasoning about your code. Most agent frameworks burn half their context on identity and instructions. Squad doesn't.

**On "Memory Architecture":**
> Four layers. The charter is who you are ΓÇö written once, never self-modified. History is what you've learned ΓÇö personal, append-only. Decisions are the shared brain ΓÇö every agent reads from the same file before starting work. And the log is Scribe's domain ΓÇö a searchable archive of every session.

**On "Growing the Team":**
> The team isn't static. Need a DevOps person? Ask for one. They get cast from the same universe, seeded with all existing decisions, and they're immediately productive. Need to remove someone? They don't get deleted. They move to alumni. Their knowledge is preserved. If you need them back, they remember everything.

---

## ACT 6 ΓÇö AGENTS COMPLETE (5:30ΓÇô6:30)

### On Screen
Flip back to the Copilot CLI. The agents should be finishing. Squad collects results and shows you what each agent built:

```
ΓÜ¢∩╕Å Ripley ΓÇö Built canvas renderer with CRT scanline effect, game board, score display
≡ƒöº Kane ΓÇö Implemented game loop, snake movement, collision detection, Web Audio sounds
≡ƒº¬ Lambert ΓÇö Wrote 14 test cases covering movement, scoring, speed progression, edge wrapping
≡ƒÅù∩╕Å Dallas ΓÇö Defined project structure, documented architecture decisions
```

Show the `list_agents` output if there are still background agents running. This is the moment to show the parallel execution in action.

### Voiceover
> While I was walking through the README, four agents were working simultaneously in background processes. Here's what came back. The frontend dev built the full canvas renderer with the CRT effect. The game logic agent wired up movement, collision, and audio. The tester wrote fourteen test cases ΓÇö from requirements ΓÇö before the code was even finished. And the lead documented the architecture. Meanwhile, Scribe ΓÇö silently ΓÇö logged everything and merged their decisions into the shared decisions file.

---

## ACT 7 ΓÇö THE ARTIFACTS & SECOND WAVE (6:30ΓÇô7:30)

### On Screen
Switch to an editor and open the files the agents just created. Show these in order, pausing on each:

1. `.ai-team/decisions.md` ΓÇö scroll through real decisions the agents wrote during the build. Architecture choices, file structure, naming conventions. These aren't templates ΓÇö they're decisions made minutes ago.
2. One agent's `history.md` (e.g., `.ai-team/agents/ripley/history.md` or whatever name was cast) ΓÇö scroll through what it learned. Canvas setup, CRT filter values, rendering approach. This is persistent memory.
3. Back in Copilot, ask Squad to do a second pass: "Add a pause menu and a game-over screen." Watch it fan out again ΓÇö same agents, same names, but now they already know the codebase. The second wave launches faster because no one needs to rediscover the architecture.

### Voiceover
> Now let's look at what they left behind ΓÇö and I don't mean the code. This is `decisions.md`. These are real architectural decisions the team made while building ΓÇö canvas dimensions, input handling strategy, audio approach. Every agent read this file before starting work, and every agent wrote back to it. It's the shared brain.
>
> And here ΓÇö this is Ripley's history file. Look at what it learned: the CRT filter values, the rendering pipeline, the sprite dimensions. Next session, Ripley won't ask about any of this. It remembers.
>
> Now watch this. I'm going to ask for a second feature ΓÇö a pause menu and game-over screen. Same team. Same names. But this time, they already know the codebase. They don't need to rediscover the architecture ΓÇö they read their own history files and the shared decisions before starting. That's the compounding effect in action. The second wave is faster because the first wave made the team smarter.

---

## ACT 8 ΓÇö THE PAYOFF (7:30ΓÇô8:00)

### On Screen
Open the Snake game in a browser. Play it. The CRT effect should be visible. Move the snake. Score some points. Let the speed increase kick in. If sound works, let it play.

### Voiceover
> The team of agents Squad was able to build - a group of specialists coordinating through shared decisions and collaborating to convert a user's idea into reality in minutes?

 The team is in the repo now. Tomorrow, I can open Copilot, talk to the same agents by name, and they'll remember everything ΓÇö the canvas setup, the audio patterns, the CRT filter values. The more you use Squad, the less you have to explain. That's the whole idea.

---

## KEY THEMES TO WEAVE IN (reference card)

Use these as touchstones ΓÇö don't force them, but make sure each gets at least one mention:

| Theme | Where it fits naturally |
|-------|----------------------|
| **Agents learn and persist** | Act 5 (knowledge compounds), Act 7 (history.md) |
| **Shared decisions** | Act 5 (memory architecture), Act 7 (decisions.md on screen) |
| **Scribe is on every team** | Act 3 (team reveal), Act 6 (silent logging) |
| **Team grows with the repo** | Act 5 (growing the team section) |
| **Background vs foreground agents** | Act 4 (all launched as background), Act 6 (list_agents) |
| **Parallel fan-out** | Act 4 (the launch), Act 7 (second wave) |
| **Context window efficiency** | Act 5 (token budget table) |
| **It's all in git** | Act 3 (commit this folder), Act 8 (closing line) |
| **Not a chatbot wearing hats** | Act 5 (opening line of "What is Squad?") |
| **Anticipatory work** | Act 4 (tester writing tests before code exists) |

---

## RECORDING TIPS

1. **Don't rush the prompt paste.** Let the viewer read it for a second before hitting enter.
2. **The README scroll is the heart of the video.** This is where you tell the story. Take your time.
3. **Show `list_agents` at least once** while agents are running ΓÇö it's the visual proof of parallelism.
4. **Open real files** (`decisions.md`, `history.md`, a charter) ΓÇö these are the artifacts that make Squad tangible, not abstract.
5. **End on the game.** The final shot should be the snake moving on screen with the CRT glow. That's your thumbnail.
6. **Voiceover tone:** Conversational, not scripted-sounding. You're showing someone something cool, not presenting to a board. Think "hey, look at this" energy.
