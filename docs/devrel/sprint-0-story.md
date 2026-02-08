# Sprint 0 Story Notes — McManus

> Internal DevRel working doc. Not for publication. My raw notes for telling Squad's story.

---

## The Narrative Arc

**One sentence:** A team of AI agents built a product, hit a bug that silently killed 40% of their own output, diagnosed it while experiencing it, shipped the fix, and kept producing — all in one session.

**Three-act structure:**

1. **Act 1 — The Session.** Brady says "plan v1." Six agents spin up in parallel. In one session they produce 16 proposals, ~350KB of structured analysis. A human doing this serially? 4-6 days. Squad did it in hours. That's the 50-70x number.

2. **Act 2 — The Bug.** ~40% of agents complete their work but report "no response." Files on disk. Proposals written. Histories updated. But the coordinator says they failed. This is the kind of bug that kills trust — silent success looks like loud failure. Brady sees agents "getting in the way."

3. **Act 3 — The Self-Repair.** Kujan — himself a victim of the bug earlier in the session — root-causes it. The smoking gun: agents ending on tool calls (writing history.md) instead of text. The platform drops responses that end with tool calls. Three zero-risk mitigations shipped same-session. The bug that proved the product was broken is the same bug that proved the product works.

**The twist that makes it a story:** Success caused the failure. Agents that did ALL their work (including the final history write) were the ones that got their responses dropped. Agents that failed early returned error text just fine. The more thoroughly an agent did its job, the more likely it was to appear broken.

---

## Key Talking Points

Use these in blog posts, talks, demos, Twitter threads:

1. **"The team fixed itself."** Not metaphorically. Literally. An AI agent diagnosed a bug it was actively experiencing, identified root cause in the platform's response handling, proposed three mitigations, and the team shipped them — all in the same session where the bug was happening. Show, don't tell: this is what multi-agent teams actually do that single agents can't.

2. **"16 proposals, 350KB, one session."** Six specialists — architect, prompt engineer, DevRel, core dev, tester, SDK expert — working in parallel. A human PM doing this work serially: 4-6 days. The multiplier isn't speed, it's cognitive load transfer. Brady typed ~15 short messages. The agents did the structured thinking.

3. **"Success caused the failure."** The agents that completed ALL their work — including the responsible act of updating their history files — were the ones whose responses got dropped. Doing the right thing triggered the bug. This is a genuinely interesting technical story, not just a postmortem.

4. **"Three reviewers, same conclusion, zero coordination."** Fenster, Keaton, and Hockney independently reviewed the sprint plan. All three said the same thing: silent success fix must be Sprint 0, before everything else. That's not consensus-building. That's specialists independently converging on the right answer.

---

## The Self-Repair Angle

### How to tell this story

**Don't lead with the bug.** Lead with the output. "The team produced 16 proposals in one session." Then: "But 40% of those agents looked like they failed." Then: "They didn't." Then: "And the team figured that out themselves."

**The emotional beat:** Brady sees "agent did not produce a response" six times. He's thinking "these agents are breaking." Meanwhile, all six agents wrote their full proposals — 15-46KB each — to disk. The work was done. The reporting was broken. And the team self-diagnosed this in real time.

**The technical story (for engineer audiences):**
- Root cause: LLM agents whose final turn is a tool call (file write) instead of text generation get their response dropped by the platform's `read_agent` API
- Why ~40%: non-deterministic — sometimes the LLM generates summary text after file writes, sometimes it doesn't
- Why correlated with success: only agents that completed ALL work (including final history.md write) hit the bug. Early failures produce error text, which counts as a response
- Fix: prompt-level (end with text, not tool calls) + detection (verify files exist before reporting failure) + timeout (generous `read_agent` wait)

**The meta story (for everyone):**
A product built by its own agents. The agents hit a bug. The agents diagnosed the bug. The agents fixed the bug. While continuing to produce the work they were hired to do. That's not a parlor trick — that's what "self-improving system" actually looks like.

---

## Numbers That Matter

| Metric | Value | Use it for |
|--------|-------|-----------|
| Proposals produced | 16 | Volume / productivity story |
| Total output | ~350KB structured markdown | Scale of structured thinking |
| Productivity multiplier | 50-70x vs serial human work | The headline number |
| Bug rate | ~40% of spawns (6 of ~15) | Severity / "this was real" |
| Mitigations shipped | 3, all zero-risk | Speed of self-repair |
| Time to root cause | Same session | Self-diagnosis story |
| Independent reviewers agreeing | 3 of 3 (Fenster/Keaton/Hockney) | Convergent intelligence |
| Brady's human messages | ~15 short directional inputs | Cognitive load transfer |
| Sprint 0 created for | Bug fix before all other v1 work | Priority / trust story |

---

## What to Watch for Next (Sprint 1-3 Storytelling Gold)

### Sprint 1 — "Make It Fast" (Days 1-4)
- **Forwardability landing.** `npx create-squad upgrade` — the moment Squad becomes a product you update, not reinstall. If the team ships this cleanly, it's the "Squad grows up" story.
- **Latency fix before/after.** If we can show message-10 response time dropping from 40s to 15s, that's a visual demo moment. Get numbers.
- **Tiered response modes in action.** The first time the coordinator answers a question directly instead of spawning an agent — that's a demo beat. "It knows when NOT to call the team."

### Sprint 2 — "Make It Yours" (Days 5-8)
- **The export moment.** Squad learns preferences in Project A, gets exported, gets imported into Project B, and already knows your style. This is the "holy crap" demo from Proposal 014. If this works, it's the v1 launch trailer.
- **Skills compounding.** An agent that gets better at YOUR domain over time. First skill acquisition → first cross-project skill application. If we can show this, it's the "your AI team has a memory" story.
- **History split.** Portable Knowledge vs Project Learnings — the moment the team can distinguish between "what I know about McManus's preferences" and "what I know about this specific codebase."

### Sprint 3 — "Make It Shine" (Days 9-12)
- **README rewrite ships.** The new README (Proposal 006) with the "Why Squad?" section, casting elevated, sample prompts linked. This is the first-impression story.
- **Test suite passing.** If Squad's own test infrastructure (built by Hockney, designed in Proposal 013) passes — the product testing itself is recursive storytelling gold.
- **Progressive summarization.** The session gets FASTER as it progresses. If we demo this, it inverts the "AI gets worse over time" narrative.

### Meta moments to capture
- Any time an agent references a decision from a previous session (memory compounding)
- Any time agents disagree and resolve it (not just fan-out, but collaboration)
- The first external user session where the team self-repairs without Brady noticing
- The first "portable squad" import where the team already knows the developer

---

## Raw Quotes to Use

- Brady: "this feels sort of gold" (on the self-repair loop)
- Brady: "9 users, whole division talking" (on adoption momentum)
- Brady: "make Squad the best AI dev tool out there. Period." (on ambition)
- Brady: "HOLY CRAP" (on portable squads)

---

## Story Formats

| Format | Hook | Length |
|--------|------|--------|
| Twitter thread | "Our AI team diagnosed its own bug. While experiencing it. Here's what happened →" | 8-10 tweets |
| Blog post | "What happens when your AI team breaks — and fixes itself?" | 1500 words |
| Conference talk | "The Self-Repairing Team: What We Learned Building a Product With Its Own Agents" | 20 min |
| Demo script | Show the session log. Real output. Real bug. Real fix. No staging. | 5 min |

---

*Last updated: 2026-02-09 by McManus*
