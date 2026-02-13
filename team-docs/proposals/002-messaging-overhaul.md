# Proposal 002: Messaging Overhaul — "Throw a Squad at It"

**Status:** Approved ✅ Shipped  
**Authors:** McManus (DevRel) + Verbal (Prompt Engineer)  
**Date:** 2026-02-07  
**Context:** Brady greenlit complete messaging overhaul. Cultural hook: "throw a squad at it" (internal lingo at his company for spinning up teams to solve important problems).

---

## The Problem

Squad's current messaging is *functional* but not *magnetic*. We explain what it is and how it works, but we don't grab devs by the collar and make them feel the need. The README has good bones — tight Quick Start, real context math, personality ("not a chatbot wearing hats") — but it's missing:

1. **A punchline.** We need a tagline that lands before they scroll.
2. **Value prop clarity.** "Why Squad?" isn't answered — we show architecture before emotion.
3. **Casting as a feature.** It's mentioned once as "persistent thematic cast." That's a crime. Casting is what makes Squad feel alive.
4. **Polish gaps.** Examples use Go (Brady wants them gone). Sample prompts doc is hidden. Install output is silent.

This proposal fixes all of it. McManus polish meets Verbal edge.

---

## 1. New Tagline / Headline

### Current (README line 3):
```markdown
**AI agent teams for any project.** A team that grows with your code.
```

### Proposed:
```markdown
**Throw a squad at it.**

AI agent teams that live in your repo. Describe what you're building. Get specialists — frontend, backend, tester, lead — that persist across sessions, share decisions, and get smarter the more you use them.
```

**Rationale:**
- Opens with the cultural hook Brady requested — "throw a squad at it" is memorable, actionable, opinionated.
- Drops "grows with your code" (abstract) for "get smarter the more you use them" (concrete).
- Keeps core value props (persistent, specialists, decision-sharing) in the first 30 words.

**Verbal's take:** This is the kind of phrasing that devs *repeat*. "Just throw a squad at it" becomes shorthand for the entire product. It's confident, not apologetic. It's the kind of thing that spreads.

**McManus's take:** First impression is everything. "Throw a squad at it" tells devs exactly what this does — and makes them want it — before they even know the mechanics.

---

## 2. README Structure Changes

### Current flow:
1. What is Squad?
2. Quick Start
3. Agents Work in Parallel
4. How It Works (architecture)
5. What Gets Created
6. Growing the Team
7. Reviewer Protocol

### Proposed flow:

#### **A. Hero section** (above the fold)
- New tagline
- Single sentence: "It's not a chatbot wearing hats — it's a team."
- 2-minute demo GIF/video (to be created) showing parallel agent execution

#### **B. Quick Start** (unchanged, 3 steps)
Keep this tight. It works.

#### **C. Why Squad? (NEW SECTION)**
Positioned immediately after Quick Start. Emotional case before technical case.

```markdown
## Why Squad?

**Traditional AI agents are chatbots pretending to be teams.** One model, one context, wearing different hats. You ask for backend work, it answers as "Backend Bot." You ask for tests, it answers as "Tester Bot." It's the same agent, roleplaying.

**Squad is different.** Each team member runs in its own context window, reads only its own knowledge, and persists across sessions. When you ask Squad to build a login page:
- The Lead analyzes requirements
- The Frontend builds the UI
- The Backend sets up auth endpoints
- The Tester writes test cases from the spec

**All at once. In parallel. For real.**

Each agent writes what it learned to its own `history.md`. Team-wide decisions go to `decisions.md`. Knowledge compounds. After a few sessions, your team stops asking questions they've already answered.

And it's all in git. Clone the repo → get the team → with all their accumulated knowledge.

**TL;DR:** Squad is what you wish your last AI agent could do. But actually.
```

**Rationale:**
- Frames Squad against the default (single-agent roleplaying), which every dev has tried and been frustrated by.
- Shows parallel execution immediately after the hook, reinforcing the tagline.
- Ends with the knowledge persistence angle (competitive moat).
- Voice is confident, direct, slightly aggressive. No apologies.

#### **D. Agents Work in Parallel** (polish pass)
Current version is good. Add one line at the top:

```markdown
Squad doesn't work on a human schedule. It works on a "throw everything at the problem and catch up when you're ready" schedule.
```

#### **E. How It Works** (unchanged)
Architecture explanation stays. Mermaid diagram is solid. Context budget table is gold.

#### **F. Casting System (NEW SECTION — elevated from buried mention)**
Insert after "How It Works," before "What Gets Created."

```markdown
## The Cast System — Agents with Identity

Squad doesn't call your backend developer `Backend_Agent_7829`. It gives them a name. A persistent name. From a thematic universe.

When you initialize a team, Squad picks a universe (The Usual Suspects, Ocean's Eleven, Alien, etc.) and casts roles:
- **Keaton** (The Usual Suspects) → Lead
- **Verbal** → Prompt Engineer
- **McManus** → DevRel
- **Fenster** → Core Dev
- **Hockney** → Tester

Names persist. Stored in `.ai-team/casting/registry.json`. If you clone the repo, you get the same cast. If Keaton made a decision 3 months ago, it's still Keaton. Not "the Lead agent" or "Agent A." **Keaton.**

**Why it matters:**
- Agents feel real. "McManus wrote the docs" is memorable. "Documentation Agent" is not.
- You can reference past work naturally: "Keaton, what did you decide about auth last week?"
- Your team has personality. Not just functionality.

**Cultural fit:** Squad's core team (the one building Squad itself) is cast from *The Usual Suspects*. We eat our own dog food. If it's good enough for us, it's good enough for your project.
```

**Rationale:**
- Casting is Squad's secret weapon. Burying it is criminal.
- Frames casting as an identity feature, not a cosmetic Easter egg.
- Uses Squad's own team as social proof ("we use it ourselves").
- Positions casting as part of the "agents feel alive" philosophy.

#### **G. What Gets Created** (unchanged)
File tree is clear. Keep it.

#### **H. Growing the Team** (unchanged)
Alumni archive explanation is good. Keep it.

#### **I. Reviewer Protocol** (unchanged)
Keep as-is. This is a real differentiator (no self-review of rejected work).

#### **J. Install** (unchanged, but link to troubleshooting)

#### **K. Troubleshooting (NEW SECTION)**
Add before "Status."

```markdown
## Troubleshooting

**Squad agent doesn't appear in `/agents` list?**
- Restart Copilot CLI: `exit` then `copilot` again.
- Verify `.github/agents/squad.agent.md` exists.
- Check GitHub Copilot CLI version: `copilot --version` (requires 1.220.0+).

**Team isn't spawning?**
- Check `.ai-team/team.md` exists. If not, say: "Initialize the team."
- Verify `.ai-team/decisions.md` exists (Squad needs shared memory).

**Agents aren't learning across sessions?**
- Commit `.ai-team/` to git. If it's in `.gitignore`, agents can't persist.
```

**Rationale:**
- First-time setup pain is silent. Troubleshooting section reduces "it doesn't work" drop-off.

---

## 3. Example Updates

### Current state:
- `docs/sample-prompts.md` has 16 examples. One uses Go (SaaS backend modernization).

### Brady's constraints:
- "No Go examples."
- "Don't touch the modernization exercise — it's well-positioned."

### Proposed changes:

#### **A. Replace Go example**
Current example: "SaaS Backend Modernization (Node.js → Go)"

**Option 1 (Recommended):** Replace with **Python → Node.js modernization**
```markdown
### SaaS Backend Modernization (Python → Node.js)
I'm modernizing a SaaS backend. The current stack is Python/Flask. 
I want to move to Node.js/Express with TypeScript. Set up the team 
and create a migration plan with backward compatibility.
```

**Option 2:** Replace with **Java → Kotlin modernization** (if Brady's team is JVM-heavy)

**Rationale:**
- Python/Node and Java/Kotlin are more common enterprise migration paths than Go.
- Keeps "modernization" framing (Brady wants this preserved).
- Still demonstrates Squad's value for large refactors.

#### **B. Link `sample-prompts.md` from README**
Add after Quick Start section:

```markdown
**Not sure where to start?** See [16 ready-to-use prompts](docs/sample-prompts.md) — from pomodoro timers to .NET migrations.
```

**Rationale:**
- Sample prompts are high-value onboarding content. They're hidden.
- Linking them from README increases conversion ("I can see myself using this for X").

---

## 4. "Why Squad?" Section

See Section 2C above. Key elements:
- Frames Squad against single-agent roleplaying (the default experience)
- Emphasizes parallel execution (competitive differentiator)
- Highlights knowledge persistence (moat)
- Voice is confident, direct, slightly edgy

---

## 5. Casting System Elevation

See Section 2F above. Key elements:
- Positioned as a headline feature, not a footnote
- Explains the mechanic (persistent names from thematic universes)
- Shows social proof (Squad's own team uses it)
- Frames casting as part of "agents feel alive" philosophy

---

## Implementation Plan

### Phase 1: Core Messaging (McManus + Verbal)
1. Update README with new tagline, "Why Squad?", Casting section
2. Add Troubleshooting section
3. Replace Go example in `sample-prompts.md`
4. Link sample prompts from README

**Estimated effort:** 2-3 hours  
**Blocker:** None  
**Reviewer:** Keaton (final approval on messaging changes)

### Phase 2: Visual Assets (McManus)
1. Record 2-minute demo GIF showing parallel execution
2. Embed in README hero section

**Estimated effort:** 4-6 hours (includes scripting, recording, editing)  
**Blocker:** Needs production-ready Squad setup  
**Reviewer:** Verbal (agent experience must feel magical)

### Phase 3: Install Output Visibility (Fenster)
1. Update `index.js` to explain what gets created during install
2. Add post-install message with next steps

**Estimated effort:** 1-2 hours  
**Blocker:** None  
**Reviewer:** McManus (DevEx polish)

---

## Success Metrics

**Qualitative:**
- Devs repeat "throw a squad at it" in conversations (meme-ability test)
- First-time users reference casting by name ("Keaton decided X") within first session
- README feels *magnetic*, not just informative

**Quantitative:**
- Time-to-first-spawn drops (fewer "how do I start?" questions)
- Sample prompts link click-through rate (track via GitHub Insights)
- Troubleshooting section reduces "it doesn't work" issues (anecdotal, via GitHub Issues)

---

## Open Questions

1. **Demo video format:** GIF (README-embeddable, silent) or YouTube link (narrated, higher fidelity)?
   - McManus leans GIF (fewer clicks to value)
   - Verbal leans YouTube (can show more advanced patterns)

2. **Casting universe selection:** Should users pick their universe, or does Squad auto-select?
   - Current: Squad auto-selects based on project vibe
   - Proposal: Keep auto-select as default, allow override via `squad config --universe oceans-eleven`

3. **"Why Squad?" tone:** Too aggressive?
   - Current draft: "Traditional AI agents are chatbots pretending to be teams."
   - Softer alternative: "Most AI agents simulate collaboration. Squad delivers it."
   - **Recommendation:** Keep aggressive. Squad's brand is confident, not apologetic.

---

## Appendix: Voice & Tone Guidance

This overhaul establishes Squad's voice more explicitly. For future messaging:

### Do:
- Be direct. No hedging ("might," "potentially," "could be useful").
- Show, don't abstract. "Keaton decided X" beats "the Lead agent made a decision."
- Use confidence. "Squad is what you wish your last AI agent could do. But actually."
- Embrace personality. Casting isn't a gimmick. It's a feature.

### Don't:
- Apologize for being experimental. Frame it as "ahead of the curve."
- Compare to GitHub Copilot Chat directly. (They're complementary, not competitive.)
- Use corporate-safe hedging. "Best-in-class," "innovative solution," "paradigm shift" — all banned.

**If it sounds like something a B2B landing page would say, rewrite it.**

---

## Endorsements

**McManus:** This is the polish Squad needed from day one. Casting elevation alone is a 10x messaging win. The "Why Squad?" section answers the question I've been asking since I read the README. Ship it.

**Verbal:** "Throw a squad at it" is the kind of phrasing that makes Squad feel inevitable. Casting as a feature (not an Easter egg) is the right move. The industry will copy this in 6 months. We should be there first. Let's go.

---

**Next step:** Keaton approval → Implementation → Ship.
