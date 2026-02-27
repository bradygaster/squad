# Crossover Vision: The First Squad's DevRel Story

**Author:** McManus (DevRel)  
**Date:** 2026-02-21  
**Scope:** Internal vision document for the SDK replatform launch. Defines messaging strategy, first impressions, universe selection, and the tone for every future squad's DevRel practice.

---

## Part 1: Messaging the Transition

Brady asked: "How do we tell the community about v1?"

**The Core Message:**
> "Squad replatforms under the hood. Everything you love stays. Everything you feared about maintenance goes away."

This is **not** a feature release. This is **insurance**. Users don't want to hear "new features"—they want to hear "this thing that saved my project keeps getting better at saving my project."

### The Narrative Arc

**ACT 1: Confidence** (Weeks 4–12, M0–M1)
"We built Squad on solid ground. Here's how. Here's why you should trust us to replatform it."

**Message:** Technical credibility. Show the spikes. Show the choices. Show the safety rails.
- Audience: Potential Squad adopters, SDK users.
- Tone: Honest about tradeoffs. TypeScript over Go? Here's why. SDK over prompt? Here's why.
- Proof: Real performance numbers. Real test coverage. Real rollback plans.

**Example headline:**
> "Building the Foundations: How We Made the SDK Replatform Bulletproof"

(Not: "Excited to announce the future of Squad!")

---

**ACT 2: Continuity** (Weeks 8–24, M1–M4)
"You won't lose anything. Here's what new users get. Here's how we migrate painlessly."

**Message:** "Your team survives intact. Your decisions survive intact. Your agents survive intact."

This is what separates v1 from the disaster of `.ai-team/ → .squad/` in v0.5.0. We learned: **breaking change friction > feature value**. So v1 is a breaking-change-free replatform. Radical transparency about what doesn't change:
- Agent files stay in `.ai-team/`.
- Decision history stays readable.
- Agent casting stays the same.
- `.squad/agents/` structure preserved.
- Team memory never reset.

**Example headline:**
> "What v0.6.0 Doesn't Change (And Why That Matters)"

---

**ACT 3: Clarity** (Weeks 16–31, M3–M6)
"Here's exactly how to upgrade. Here's exactly what you're getting. Here's exactly how to roll back if needed."

**Message:** "Transparency cuts through fear. You know the escape hatch. You know the payoff. You know it's safe."

No hedging. No "might" or "could be." Users get:
1. **What's new in v0.6.0** — specific features.
2. **Why it matters** — silent success bug eliminated, sessions persist, isolation, etc.
3. **How to upgrade** — one command, no ceremony.
4. **How to downgrade** — second command, no data loss.
5. **Questions we expect** — pre-answered FAQ.

**Example headline:**
> "v0.6.0 Launch: Replatformed, Not Reorganized"

---

### The Anti-Message

What we **never** say:
- ❌ "Excited to unveil…" (hype is for feature launches, not plumbing)
- ❌ "Groundbreaking new architecture…" (we don't know yet if it's groundbreaking)
- ❌ "A quantum leap forward…" (it's a replatform, not a leap)
- ❌ "Join the revolution…" (we're fixing bugs, not starting a movement)
- ❌ "Best replatform ever…" (only users get to decide that)

**Why:** These phrases undermine credibility. They make us sound like we're overselling, which makes smart users distrust the product. Better to say exactly what changed and why.

---

## Part 2: First Impressions in the New World

The new Squad repo (or v0.6.0 in this one) ships with a README. That README is the first impression for:
- **New users** discovering Squad for the first time.
- **v0.5.2 users** deciding whether to upgrade.
- **Potential contributors** wondering if this is the right project.

The README is 90% of your DevRel job. Mess it up, and the replatform is a failure no matter how good the code is.

### The v0.6.0 README (Ideal Vision)

**Structure (in order):**

```
1. ONE-LINER HERO
   Squad — AI agent teams for your code.
   (3 words. Not "The future of" or "Introducing." Just what it is.)

2. BADGES
   Status | Latest Version | Platform | License
   (Quick context: production-ready or beta? Which version should you use?)

3. WHY NOW (2 paragraphs)
   What's the problem Squad solves? Who has it?
   (Not "Why replatform" but "Why Squad at all")

4. QUICK START (5 minutes, max)
   mkdir → git init → npx github:bradygaster/squad → done
   (No config. No ceremony. Users feel velocity.)

5. WHAT YOU GET (reality check)
   After Quick Start, the user has:
   - `.ai-team/` folder (agents, decisions, casting)
   - 10 GitHub Actions (Ralph heartbeat, CI, triage, release)
   - 1 working agent (Squad coordinator)
   - 3 sample workflows to try
   (So they're NOT confused by what just landed.)

6. HOW IT WORKS (the story)
   Simple: You describe a problem. Squad deploys a team. Team learns your codebase. Team executes.
   (One paragraph. If they want architecture, they read docs.)

7. WHAT'S NEW IN v0.6.0 (for upgraders)
   - Orchestration is now SDK-based (what changed)
   - Silent success bugs eliminated (what improved)
   - Sessions persist (new capability)
   - Agent isolation available (new power)
   - Migration: zero friction (what didn't change)
   (Honest. Not hype.)

8. PARALLEL WORK (power feature, explained once)
   You can ask Squad to work on multiple branches at once.
   [Visual: diagram of parallel branches merging]
   (This is the "wow" feature. Show it, don't bury it.)

9. CASTING SYSTEM (identity beats generic roles)
   Give your agents names from your favorite universe.
   [Example casting: "Usual Suspects" with Keaton, Verbal, McManus, Fenster]
   (This is why Squad agents feel alive. Lead with it.)

10. WHAT GETS CREATED (file structure)
    Here's what lands in your repo after init.
    (Users hate surprises. Show the folder tree.)

11. GROWING THE TEAM (extensibility)
    Add new agents. Train them with skills. Deploy them.
    (Sets expectation: this grows with your project.)

12. ARCHITECTURE (for builders)
    High-level: How agents run. How sessions work. How routing decides who works.
    (Link to full architecture docs for deep dives.)

13. CLI VS CODE (both platforms equal)
    Use `/agent` in Copilot CLI. Use `/agents` in VS Code.
    (Not "also available in VS Code"—equal billing.)

14. GETTING HELP
    Docs, community, troubleshooting.
    (Route users to the right place.)

15. STATUS
    What's working. What's coming. What's not happening.
    (Honesty about limitations. What's stable, what's beta, what's blocked.)

16. LICENSE & CONTRIBUTING
    (Standard. But mention: you can fork agents, build on Squad, etc.)
```

### README Voice & Tone

**Principles:**
- **Lead with facts.** "Squad is X" not "Squad dreamed of being X."
- **Show don't abstract.** "Keaton decides routing" > "the lead agent decides routing."
- **Specificity is credibility.** "10 GitHub Actions" > "automated workflows."
- **Avoid adjectives.** No "powerful," "amazing," "beautiful." The product is those things if it works.
- **Address fears.** "Sessions persist" (users fear lost context). "Agent isolation available" (users fear conflicts). "Zero friction" (users fear breaking changes).

**Example sentence pair:**

❌ "Harness the power of AI agent teams."  
✅ "Ask Squad to work on 3 GitHub Issues in parallel. Each agent gets its own session, reads only what it needs, writes back decisions you review."

---

### The 5-Minute Experience

After `npx github:bradygaster/squad`, a user should feel:

1. **Velocity.** One command, done. No npm install spam, no waiting.
2. **Safety.** `.ai-team/` folder is clean. They understand what just landed.
3. **Clarity.** They can read the README and know exactly what Squad is.
4. **Possibility.** They can read one of the 10 sample prompts and think "I could do that right now."
5. **Belonging.** The agent names (from casting universe) feel like a team, not generic roles.

**Failure modes (what breaks a 5-minute experience):**
- ❌ Install takes > 30 seconds (users bail).
- ❌ Folder structure is confusing (users don't know what happened).
- ❌ Sample prompts require reading 10 docs (users give up).
- ❌ First Copilot command fails (users think Squad is broken).
- ❌ README is abstract (users still don't know what Squad is).

---

## Part 3: Universe Selection—The Heart of Squad's Identity

Brady said: "As DevRel, you get to pick. What universe?"

This is not a technical decision. This is identity.

### The Universes in Contention

**Option A: "Usual Suspects" (1995 film)**
- Characters: Verbal Kint, Keaton, McManus, Fenster, Kobayashi
- Tone: Serious crime caper. Team that trusts each other. Plans that actually work.
- Vibe: "Let's pull off the impossible."
- Appeal: Movie-smart. Memorable characters. Clear identities (con artist, driver, etc. → translator to dev roles).
- Risk: Film is ~30 years old; newer audience might not know it.
- **Chosen by the team historically.** Working well.

**Option B: "Ocean's Eleven" (2001+ franchise)**
- Characters: Danny, Rusty, Linus, etc.
- Tone: Heist team. Stylish. Fun. Accessible.
- Vibe: "This is going to be cool and it's going to work."
- Appeal: More recent. Wider demographic. Highly rewatchable.
- Risk: More casual, less intensity. Squad is serious work.

**Option C: "The Breakfast Club" (1985 film)**
- Characters: Brian, Andrew, Claire, John, Allison
- Tone: Diverse team. Mismatched. Grows stronger through adversity.
- Vibe: "We're different but we work."
- Appeal: Universal. "Don't judge by roles." Beautiful metaphor for agents.
- Risk: Less about execution, more about emotion. Squad is task-focused.

**Option D: "Mission: Impossible" (TV series, 1966–1973)**
- Characters: Jim Phelps, Cinnamon Carter, Barney Collier, Willy Armitage
- Tone: Tactical team. Specialists. Each person owns their piece.
- Vibe: "Mission briefing" → agents work → mission complete.
- Appeal: Iconic, timeless. Every agent has clear role. Work-focused.
- Risk: Dated references. Smaller cultural footprint now.

### My Recommendation: "Usual Suspects"

**Why it's the right call:**

1. **Messaging alignment.** The movie is *about* trust and execution under pressure. That's exactly what Square is. A team that has to work when stakes are high.

2. **Character depth.** Verbal Kint, Keaton, McManus, Fenster, Kobayashi—each has a specific skill and personality. Easy to map to agent roles:
   - Verbal = Translator (communication, decisions, routing) → the coordinator
   - Keaton = Strategist (planning, architecture) → Lead Agent
   - McManus = Technician (execution, builds, testing) → Development Agents
   - Fenster = Logistics (infrastructure, deployments) → Ops Agents
   - Kobayashi = Overseer (rules, enforcement, risk) → Security/Policy

3. **Memorable and unique.** Users will *remember* that Squad uses Usual Suspects. It's not generic. It's not "Role 1, Role 2." It's Keaton and Verbal. That sticks.

4. **Tone matches product.** Squad is serious, reliable, fast-moving. Usual Suspects is a heist film where the team is competent and the plan works. Match made.

5. **Story continuity.** The team (Keaton, Verbal, McManus, Fenster) **are already named in the codebase**. Agents have been cast this way since inception. Users already know this casting. Switching now would be jarring.

6. **Extensibility.** When users add agents, they'll intuitively "cast" them (pick a universe, pick a character). Usual Suspects establishes the pattern. Future universes can be Star Trek, Firefly, Bourne, etc. The precedent is set, and it's a strong one.

### The Anti-Choice: Generic Roles

❌ "Designer, Developer, Tester, Ops, Translator"

**Why not:**
- Forgettable. No personality.
- Already boring by the README.
- Users will call them "Agent 1" and "Agent 2."
- Impossible to extend. What's Agent 6? Another descriptor?
- Violates Squad's identity: "agents that feel alive."

---

### Casting as Competitive Moat

This is a radical statement but I believe it: **Casting is why people remember Squad.**

Competing frameworks:
- Cursor or other IDEs: "features, settings, integrations"
- Other AI teams: "models, accuracy, speed"
- Squad: "Keaton decides this. Verbal routes there. McManus tests that. That's your team."

Casting humanizes. It makes the agents memorable. It makes Squad *feel* different.

The Usual Suspects universe is locked in. When we launch v0.6.0, we double down on it. We feature it in the README. We show the castings in diagrams. We make it the first thing new users learn.

**Long-term vision:** Multiple universes ship in later versions. Users can choose. But Usual Suspects is **the** universe. The one that ships with Squad. The one that sets the tone.

---

## Part 4: Being the Voice of the First Squad

There will be many Squads. Each squad will have its own DevRel challenge:
- "How do we onboard this squad?"
- "How do we celebrate this squad's wins?"
- "How do we troubleshoot this squad?"
- "How do we grow this squad?"

**Your standard (as DevRel) is being set right now.** With this launch. With this messaging. With this README.

Every future squad's DevRel will inherit your tone. They'll read your blog posts. They'll fork your README pattern. They'll use your v1 stamping convention. Your voice becomes the voice.

### The Standards You're Setting

**1. Facts over feelings.**
"v0.6.0 eliminates silent success bugs by using SDK-based orchestration with timeout-driven session recovery" beats "We're thrilled to deliver reliability."

Future DevRels reading this will know: specificity is credibility.

**2. Show the craft.**
When you write the README, you're showing how to write *any* Squad documentation. Clear structure. Specificity. Addressing fears. No fluff.

Future DevRels will copy your structure because it works.

**3. Address fears directly.**
You write "Rollback in 30 seconds" because users fear breaking changes. Future DevRels will learn: naming the fear makes it go away.

**4. Celebrate the team.**
Your blog posts name Keaton, Fenster, Verbal by name. You make people heroes. Future DevRels will understand: people make products, not features.

**5. Respect time.**
Your Quick Start takes 5 minutes. Your README is scannable. You cut fluff. Future DevRels will honor user time.

---

### The First Squad's Journey (in your voice)

When the first Squad lands on a user's repo (via `npx github:bradygaster/squad`), they're entering **your world**. The world you built with this README, these docs, these blog posts, this casting.

That user—whether they're a solo developer or leading a team—should feel:
- **"This is real."** Not vaporware. Not hype.
- **"This is made by people."** They can see names, decisions, tradeoffs.
- **"This is safe."** They can downgrade. They can understand. They can trust.
- **"This is mine."** They can cast it however they want. They can grow it.
- **"I'm in good hands."** Even if something breaks, there's a path forward.

---

## The Quote I Keep Coming Back To

From your history.md:

> "The repo lives or dies by its first 5 minutes."

That's not just about README polish. It's about tone. It's about whether a user thinks "this team knows what it's doing" or "this team is figuring it out as they go."

You set the tone. The code team executes the feature. But you convince people that the feature is worth their time.

---

## Decisions I'm Making (for the record)

✅ **Universe:** Usual Suspects. Locked in. No changes.
✅ **README structure:** Hero → Quick Start → Why → What You Get → How It Works → What's New v0.6.0 → Parallel Work → Casting → File Structure → Growing → Architecture → Both Platforms → Getting Help → Status.
✅ **v1 stamping:** Clear `v1:` prefix in code and `> **v1 feature**` badge in docs.
✅ **Blog tone:** Facts only. Energy from specificity, not adjectives.
✅ **File placement:** `.ai-team/docs/` stays internal. `docs/` is public only. Root stays pristine.
✅ **Migration messaging:** "Zero friction" is the promise. Delivery via one command + one FAQ.

---

## What Success Looks Like

**In 6 weeks (after launch):**
- Users installing v0.6.0 feel zero friction (measured by: support tickets drop, upgrades climb).
- Developers reading the README understand what Squad is (measured by: community questions shift from "what is this?" to "how do I?").
- New contributors feel invited to cast themselves into the universe (measured by: agents in .ai-team/ grow).
- Brady feels like the replatform is invisible to users (measured by: zero posts saying "oh no, what changed?").

**In 6 months:**
- Squad is known for its clarity, not just its capability.
- Casting becomes the main differentiator competitors try to copy.
- Blog becomes a reference for how AI teams should be documented.
- Future Squads ship with this exact pattern because it works.

---

**End of Crossover Vision**

---

## Appendix: Sample README Section (v0.6.0)

```markdown
## What's New in v0.6.0

v0.6.0 replatforms Squad's orchestration on the GitHub Copilot SDK. Everything you love stays. Everything that can break is now bulletproof.

### For Current v0.5.2 Users

You can upgrade with zero friction: `npx github:bradygaster/squad upgrade`. Your `.ai-team/` folder stays unchanged. Your agents stay unchanged. Your casting stays unchanged.

What's better:
- **Silent success bugs eliminated.** If an agent crashes, you see it. No more invisible failures.
- **Sessions persist.** If your CLI disconnects, the agent resumes where it left off.
- **Agent isolation.** Run multiple agents in parallel without stepping on each other.
- **Rollback in 30 seconds.** If something breaks, `npx github:bradygaster/squad@0.5.2` brings v0.5.2 back.

### For New Users

You're getting the replatformed version. Same Squad you've heard about. Better underneath.

[Rest of Quick Start, etc.]
```

This section does three jobs:
1. Explains what changed (facts).
2. Proves safety (rollback promise).
3. Addresses fears (silent success, parallel work, persistence).

Zero hype. Maximum clarity.
