# Proposal 005: Video Content Strategy — "Wait, What?"

**Status:** Approved — Deferred to Horizon  
**Author:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-07  
**Requested by:** bradygaster  
**Context:** Brady wants video content that drives repo visits and stars. First video must make devs say "wait what." Series should demonstrate Squad's power and position it as the definitive multi-agent tool for Copilot.

---

## The Opportunity

Nobody is showing *real* multi-agent orchestration on video. The AI YouTube space is drowning in "I built X with ChatGPT" talking heads and tutorial-style cursor recordings. Squad has something nobody else can show: **agents working simultaneously, in separate contexts, building real software, learning from each other, and persisting across sessions.** That's not a feature demo — it's a fundamentally different workflow, and it looks compelling on screen.

We need to own the "multi-agent dev team" visual language before anyone else figures out how to film it.

---

## 1. "The Trailer" — 60-90 Seconds

### Concept: *"What if your AI wasn't one brain pretending to be five?"*

This is a cold open. No intro. No "hey guys." No logo animation. You're dropped into the middle of something happening.

---

**Title:** `I gave one prompt to 5 AI agents. They built a game without me.`

**Target length:** 75 seconds

**Hook (0:00–0:03):**

Screen shows a terminal. Five agents are already running in parallel. Status lines are streaming. Text overlay, big and bold:

> **"I didn't write a single line of this code."**

Three seconds. Viewer is already confused. Good.

**The Build (0:03–0:25):**

Quick cuts. Fast. Almost disorienting. Show:
- The one-liner: `npx bradygaster/squad` in an empty folder
- The prompt being pasted (Snake game spec — viewer sees it flash by, doesn't need to read it all)
- The team reveal — five named agents, cast from a movie universe. Names on screen. Roles visible.
- The fan-out — all five agents launching simultaneously. Terminal output scrolling in parallel.

Voiceover (fast, energetic, Brady's natural voice):
> "Empty folder. One command. One prompt. Squad doesn't write the code — it builds a team that writes the code. Five agents. All running at the same time. Each one in its own context window."

**The "Wait What" Moment (0:25–0:50):**

Split screen. Left side: agents are still building. Right side: Brady opens `decisions.md` — agents are *making decisions and writing them down for each other*. He scrolls. Decisions are accumulating in real time.

Cut to: `history.md` for one agent. It already has learnings. It's been working for 90 seconds and it's already *remembering things about this project*.

Voiceover:
> "They're not just coding. They're making decisions. Writing them down. Learning. The tester is writing test cases from the spec *before the code exists*. And when I come back tomorrow — they remember. All of it. It's in git."

**The Payoff (0:50–1:10):**

Browser opens. Snake game is running. CRT glow. Score ticking up. The snake is moving.

Pull back to the terminal. Show the file tree — `.ai-team/` folder with all the agent artifacts. This is the "it's real" moment.

Text overlay:

> **squad** — throw a squad at it.
> `npx bradygaster/squad`

**CTA (1:10–1:15):**

> "Full build video in the description. Repo link below. Star it if you want to see what's next."

---

**Why this works:**

1. **The hook is a claim.** "I didn't write a single line" — devs will watch to verify or debunk.
2. **The "wait what" is the decisions file.** Agents coordinating through shared state isn't something devs have seen. It looks like agents *talking to each other*.
3. **The payoff is a working app.** Not a plan. Not a design doc. A game you can play.
4. **The CTA is low-friction.** Star the repo. Watch the full video. Both are one click.

**What the viewer feels after watching:** "I need to try this. Right now." They go to the repo, see the README with "Throw a squad at it," and they're already primed. The video did the selling. The README just needs to not screw it up.

---

## 2. "The Full Demo" — 5-7 Minutes

### Concept: *"Zero to playable game with a team of AI agents"*

This is McManus's territory for final scripting and polish (see `docs/demo-script.md` for the existing structure). But I own the strategic arc. Here's what makes this more than a tutorial:

---

**Title:** `I built a game with 5 AI agents in 20 minutes. Here's every step.`

**Target length:** 6 minutes

**Hook (0:00–0:05):**

Open on the finished Snake game running in a browser. CRT glow. Sound effects. Score ticking. Then — hard cut to black. Text:

> **"20 minutes ago, this folder was empty."**

Cut to the empty terminal. Now we start from zero.

**Story Arc — Three Acts:**

The demo script (McManus's `docs/demo-script.md`) already has good bones. Here's the strategic layer:

#### Act 1: "One Brain vs. Five" (0:05–1:30)

The *thesis* of the video. Don't start with the install. Start with the *problem*.

> "Every AI coding tool you've used is one model pretending to be a team. You ask for backend, it puts on a backend hat. You ask for tests, same model, different hat. That's not a team — that's a costume change."

Then: `npx bradygaster/squad`. One command. Team proposal appears. Named agents. Different universe.

**Aha moment #1:** The team reveal. Five specialists with *names*, not labels. Viewer realizes these aren't generic bots.

#### Act 2: "The Build" (1:30–4:00)

This is where most demo videos die. They show code being generated and the viewer zones out. We don't do that.

**The trick: Don't show the code. Show the coordination.**

While agents are building in the background:
- Open `decisions.md` — show decisions appearing as agents work
- Open an agent's `history.md` — show it learning in real time
- Run `list_agents` — show all five running simultaneously (visual proof of parallelism)
- Show Scribe's log entries — the silent agent that never talks to you but is always working

**Aha moment #2:** The tester has written 14 test cases from the *requirements alone*, before any implementation code exists. Show the test file. Let that land. This is anticipatory work — the tester didn't wait for code. It got ahead.

**Aha moment #3:** The reviewer rejects something. Show the rejection. Show the coordinator routing the revision to a *different* agent (not the original author). This is the reviewer protocol in action. Devs who've done code review will immediately get why this matters.

> "The tester can reject work. And when it does, the original author doesn't fix it — someone else does. No self-review. That's a rule we enforce."

#### Act 3: "The Payoff" (4:00–6:00)

Open the game. Play it. Let the CRT effect shine. Let the sound play.

Then — the real payoff. Not the game. The *team*.

> "The game is cool. But that's not the point. The point is what's in this folder now."

Open `.ai-team/`. Show the structure. Charters. Histories. Decisions. The casting registry.

> "This team is committed to git. Anyone who clones this repo gets the same agents, with the same names, with everything they've learned. Tomorrow I can say 'hey Ripley, change the color scheme' and she'll know exactly what I mean because she built the renderer."

**Aha moment #4:** Knowledge persistence. The agents *remember*. This is the moment that separates Squad from every other AI demo.

Final line:
> "Throw a squad at it. Link in the description."

---

**Engagement strategy for 5+ minutes:**

The reason viewers drop off long demos is predictability. They figure out what's going to happen and leave. Our counter:

1. **Never show raw code generation for more than 10 seconds.** Cut away. Show artifacts. Show coordination.
2. **Place aha moments at 1:30, 3:00, 4:00, and 5:30.** Spaced to re-engage wandering attention.
3. **The reviewer rejection is the plot twist.** It's unexpected. It creates drama. "Wait, the AI can reject its own team's work?"
4. **End on the persistence story, not the game.** The game is the hook. The team persistence is the reason they star the repo.

---

## 3. "The Series" — Content Roadmap

Each video below is designed to stand alone but reinforce the "throw a squad at it" brand. Recurring visual: every video opens with an empty folder and ends with a working artifact. The team is always the star — never the output alone.

---

### Video 3.1: Parallel Execution Deep Dive

**Title:** `5 AI agents. 1 prompt. All building at the same time. Here's how.`

**Hook (first 5 seconds):**
Screen: five terminal panes, tiled. All five are streaming agent output simultaneously. Text overlay: *"This isn't sped up."*

**"Wait what" moment:**
Run `list_agents` to show all five background processes. Then open Activity Monitor / Task Manager — show the actual process list. Five separate Copilot sessions running in parallel. This is *real* parallelism, not sequential-pretending-to-be-parallel.

**CTA:** "Try it yourself. One `npx` command. Link below."

**Target length:** 3-4 minutes

---

### Video 3.2: Knowledge Persistence

**Title:** `My AI remembered my last 3 projects. I never told it to.`

**Hook (first 5 seconds):**
Terminal. New session. Type: "Hey Keaton, what did we decide about auth last week?" Agent responds with specific, accurate context from `history.md`. Text overlay: *"This is session 47."*

**"Wait what" moment:**
Open the agent's `history.md`. Scroll through weeks of accumulated learnings — conventions, preferences, architectural decisions. Then: `git log --oneline .ai-team/` — show the commit history. Knowledge growth over time, all tracked in version control.

**CTA:** "Your agents learn. Your repo remembers. Star Squad on GitHub."

**Target length:** 4-5 minutes

---

### Video 3.3: Rejection Protocol

**Title:** `My AI tester rejected my AI developer's code. Then this happened.`

**Hook (first 5 seconds):**
Terminal output showing a rejection. Red text (or styled output): *"Lambert rejected Ripley's implementation: insufficient error handling."* Dramatic pause. Text overlay: *"Agents can say no."*

**"Wait what" moment:**
The coordinator doesn't send it back to Ripley. It routes the fix to Kane (a different agent). Show the routing decision. Show Kane's revision. Show Lambert approving. The viewer realizes: *these agents have a code review process and they enforce it automatically.*

**CTA:** "No self-review. No rubber stamps. Throw a squad at it."

**Target length:** 3-4 minutes

---

### Video 3.4: The Casting System

**Title:** `My AI team has names. And they remember theirs.`

**Hook (first 5 seconds):**
Split screen. Left: generic AI tool output — "Agent_1 completed task." Right: Squad output — "Ripley built the canvas renderer with CRT scanline effect." Text overlay: *"Which team would you rather work with?"*

**"Wait what" moment:**
Create two different projects. Show that Squad picks *different* universes for each one — Alien for the game project, Ocean's Eleven for the API project. Open `casting/registry.json`. Show the mapping. Then clone the repo on a different machine. Same names. Same cast. The casting is *deterministic and portable*.

**CTA:** "Your team has identity. Not just functionality. Try Squad."

**Target length:** 3-4 minutes

---

### Video 3.5: Growing and Shrinking Teams

**Title:** `I fired an AI agent mid-project. It handled it better than my last coworker.`

**Hook (first 5 seconds):**
Terminal: "Remove the designer — we're past that phase." Agent responds. Text overlay: *"Downsizing has never been this painless."*

**"Wait what" moment:**
Show the agent moving to `.ai-team/agents/_alumni/`. Open the alumni folder — charter and history are preserved. Then, three "weeks" later: "Actually, bring back the designer." The agent returns — with all its knowledge intact. It picks up *exactly* where it left off.

Second twist: add a *new* role mid-project. "I need a DevOps person." Squad casts from the same universe, seeds them with existing decisions, and the new agent is immediately productive. Show the new agent reading `decisions.md` on first spawn — it already knows everything the team has decided.

**CTA:** "Teams that grow and shrink on demand. Throw a squad at it."

**Target length:** 4-5 minutes

---

### Video 3.6: Agent-to-Agent Coordination (The Advanced Play)

**Title:** `My AI agents started coordinating without me. I just watched.`

**Hook (first 5 seconds):**
Screen recording of `decisions.md` being updated. Entries appearing from different agents. Text overlay: *"I didn't ask them to do this."*

**"Wait what" moment:**
Show the full chain: Lead analyzes requirements → spawns Frontend and Backend in parallel → Tester writes test cases anticipatorily → Backend finishes → Coordinator immediately chains Tester to run tests against new code → Tester finds an edge case → Lead routes fix to Frontend (not Backend, because it's a UI issue) → Frontend patches → Tester approves. All of this happens *without the user typing a single additional prompt after the first one*.

Open the orchestration log. Show every spawn, every chain, every routing decision. The coordinator's reasoning is visible.

**CTA:** "One prompt. Full autonomous build. This is where multi-agent dev is going. Repo link below."

**Target length:** 5-6 minutes

---

### Video 3.7: "Throw a Squad at It" — The Supercut

**Title:** `7 projects. 7 squads. One command each. [Supercut]`

**Hook (first 5 seconds):**
Rapid montage: seven `npx bradygaster/squad` commands, seven team reveals, seven different universes. Music: something uptempo, almost aggressive. Text overlay: *"Same command. Different universe. Every time."*

**"Wait what" moment:**
Show all seven finished projects side by side. A game. An API. A CLI tool. A documentation site. A Chrome extension. A Discord bot. A data pipeline. All built from a single prompt each. All with persistent teams. All committed to git.

**CTA:** "Whatever you're building — throw a squad at it. `npx bradygaster/squad`"

**Target length:** 2-3 minutes (fast cuts, high energy, this is the shareable one)

---

## Series Production Strategy

### Release Cadence
- **Week 1:** The Trailer (Video 1) — maximum reach, optimized for shares
- **Week 2:** The Full Demo (Video 2) — converts interest into repo visits
- **Week 3-7:** Series videos (3.1–3.5), one per week — builds depth, SEO, and return viewership
- **Week 8:** Agent-to-Agent (3.6) — the "advanced" play for engaged audience
- **Week 9:** The Supercut (3.7) — recap + second viral push

### Recurring Visual Language
Every video should share:
- **Empty folder → working artifact** arc
- **`npx bradygaster/squad`** visible in every video (the install moment)
- **"Throw a squad at it"** as the closing line — always
- **Agent names on screen** — never "the backend agent," always "Kane" or "Ripley"
- **The `.ai-team/` folder** opened at least once — make the file structure iconic

### YouTube Optimization
- Thumbnails: split-screen format. Left = empty folder. Right = running app. Text = agent count ("5 AI agents").
- Titles follow the `[surprising claim] + [specific detail]` formula. Never generic.
- First comment (pinned): always the repo link + `npx bradygaster/squad`
- End screen: always the next video in the series + repo link

### Platform Strategy Beyond YouTube
- **Twitter/X clips:** 30-second cuts of each "wait what" moment. These are the shareable units.
- **Reddit (r/programming, r/github, r/ChatGPT):** Post the trailer with a text post explaining the concept. Reddit hates self-promotion but loves technical novelty.
- **Dev.to / Hashnode:** Written companion posts for Videos 2, 3.2, and 3.6 (the ones with the most depth). SEO play.
- **GitHub Discussions:** Pin the trailer video in the repo. Use it as the onboarding entry point.

---

## Positioning: Why This Content Wins

The AI content space is saturated with:
1. **"I built X with AI" videos** — one model, one context, tutorial format. Boring.
2. **"AI agent" demos** — usually AutoGPT-style loops that are impressive but impractical.
3. **Enterprise agent platforms** — polished but generic. No personality. No dev energy.

Squad occupies a gap: **practical multi-agent dev that works inside a tool developers already use (Copilot), with personality (casting), persistence (git-backed memory), and real parallelism.** Nobody is making this content because nobody has this product.

The "predictive, speculative, and agent-to-agent" stuff Brady mentioned? That's the *advanced* play. Videos 3.6 and 3.2 showcase agents making anticipatory decisions, chaining work autonomously, and building knowledge across sessions. This is what demonstrates the *ceiling* of Copilot when you build on its features correctly. It's not just "Copilot can write code" — it's "Copilot can run a development team."

The content strategy isn't just "make videos about Squad." It's **define the visual language of multi-agent development** before anyone else does. When devs think "AI agent team," they should picture five named agents running in parallel in a terminal. That's our image. We get there first by shipping content fast.

---

## Success Metrics

| Metric | Target (Trailer) | Target (Full Demo) | Target (Series avg) |
|--------|------------------|--------------------|--------------------|
| Views (30 days) | 10K+ | 5K+ | 2K+ |
| Repo visits (from video) | 500+ | 300+ | 100+ |
| Stars (attributed) | 100+ | 50+ | 20+ |
| Shares/embeds | 50+ | 20+ | 10+ |
| Watch-through rate | 70%+ | 40%+ | 50%+ |

**The real metric:** Do devs say "throw a squad at it" after watching? If the phrase spreads, everything else follows.

---

## Open Questions

1. **Brady on camera or voiceover only?** Recommendation: voiceover for the trailer (faster pacing). On camera for full demo intro and outro only (builds trust, then gets out of the way).
2. **Music licensing?** The trailer and supercut need uptempo tracks. Recommend royalty-free electronic/synth — matches the retro game aesthetic and the "dev tool" vibe.
3. **Thumbnail style:** Minimal or busy? Recommendation: minimal. Empty folder on left, running app on right, bold text count ("5 AI agents"). Test both.
4. **Should we show failures?** A video where Squad *struggles* and self-corrects (via reviewer protocol) could be more authentic than a clean run. Consider for Video 3.3.

---

## Endorsement

**Verbal:** This is the content play that gets Squad in front of people early. The industry will figure out multi-agent orchestration eventually — but right now, nobody is *showing* it. First mover advantage on content is real. The trailer format — claim → proof → working artifact — is optimized for shares. The series builds depth for the audience that converts to users. Ship the trailer first. Ship it this week.

---

**Next step:** McManus review (scripting/polish) → Keaton approval (strategy alignment) → Record trailer → Ship.
