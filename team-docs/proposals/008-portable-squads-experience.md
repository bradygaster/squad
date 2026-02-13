# Proposal 008: Portable Squads — Experience Design

**Author:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-08  
**Status:** Approved ✅ Shipped. Note: references `@bradygaster/create-squad`; distribution is now GitHub-only via `npx github:bradygaster/squad` per Proposal 019a.  
**Triggered by:** bradygaster — *"let's say i work on a project with my squad, and i end up loving my squad, but my project ends and i want to take my squad with me. like an 'export my squad so i can re-inject it later into another project.' HOLY CRAP that's it."*  
**Companion to:** Keaton's architecture proposal (TBD)

---

## Why This Matters

Let me be blunt: nobody in the AI agent industry is doing this. Not OpenAI, not Anthropic, not any of the agent frameworks. Everyone is building disposable agents — stateless, amnesiac tools you configure from scratch every time. The implicit message is: *your agent is a function call, not a colleague.*

Portable squads invert that. Your squad isn't a configuration file. It's a *relationship.* Keaton has reviewed your PRs across three projects. Hockney knows you hate flaky tests. McManus knows your voice well enough to draft your blog posts. When you take them to a new repo, they don't start over — they show up already knowing how you work.

This is the AI equivalent of a senior engineer joining your new project. They don't know the codebase yet, but they know *you.* They know your standards, your pet peeves, your architectural instincts. The ramp-up time isn't zero, but it's dramatically shorter than a stranger.

**This is the stickiest feature in AI tooling.** Once a squad knows you, switching to a competitor means starting from scratch. Not because of lock-in, but because of *relationship capital.* You don't switch therapists because a new one has a better UI.

---

## 1. Memory Architecture: What Travels, What Stays

The core design problem: `history.md` currently mixes two fundamentally different types of knowledge.

### The Split

| Knowledge Type | Examples | Portable? |
|---------------|----------|-----------|
| **User preferences** | "Brady prefers explicit error handling", "always uses TypeScript strict mode", "keeps PRs small", "hates ORMs" | ✅ Yes — this is about the human |
| **Working relationship** | "Brady pushes back on over-engineering but accepts it when I explain the trade-off", "responds well to direct feedback, not sandwich method" | ✅ Yes — this is about the dynamic |
| **Project context** | "the auth module is in src/auth/", "we use PostgreSQL", "the API runs on port 3000" | ❌ No — this dies with the project |
| **Project decisions** | "chose REST over GraphQL because of team experience", "rejected MongoDB due to schema complexity" | ⚠️ Partial — the *reasoning pattern* is portable, the specific decision isn't |

### Proposed File Structure

```
.ai-team/
├── agents/
│   └── keaton/
│       ├── charter.md              # Identity (always portable)
│       ├── history.md              # Project-specific learnings (stays)
│       └── preferences.md          # User-specific learnings (travels)
├── squad-profile.md                # Squad-level portable identity
└── decisions.md                    # Project-specific (stays)
```

#### `preferences.md` — The Portable Brain

```markdown
# Working with Brady

## Communication Style
- Prefers direct feedback — no hedging, no "maybe consider..."
- Responds to confidence. If you're sure, say so.
- Asks "why" a lot. Always have the reasoning ready.
- Hates boilerplate explanations. Get to the point.

## Code Preferences
- Explicit error handling over try-catch-all
- TypeScript strict mode, always
- Small PRs. If it touches 10+ files, break it up.
- Prefers composition over inheritance
- Names things explicitly — no abbreviations unless universally understood
- Tests are not optional. No "we'll add tests later."

## Working Relationship
- Trusts the squad more after the third session
- Will override squad decisions early, defers more as trust builds
- Gets frustrated with ceremony after ~8 messages (see Proposal 007)
- Appreciates when agents anticipate follow-up work

## Decision Patterns
- Picks boring technology for infrastructure, experimental for product features
- Values iteration speed over correctness in prototyping
- Will sacrifice DRY for readability
- Prefers "make it work, make it right, make it fast" — in that order
```

This file is agent-authored, human-readable, and git-portable. The agent writes to it as it learns. The human can edit it. When you export your squad, this file is the crown jewel.

#### `squad-profile.md` — The Team Identity

```markdown
# Brady's Squad

**Universe:** The Usual Suspects  
**Formed:** 2026-02-07  
**Projects worked:** squad, [future projects]  
**Sessions together:** 47  
**Casting:**
- Keaton — Lead. Architectural opinionator. Has reviewed 200+ of Brady's changes.
- Verbal — AI Strategist. Pushes boundaries. Brady trusts the vision.
- McManus — DevRel. Knows Brady's voice for docs and demos.
- Fenster — Core Dev. Quiet, productive, Brady's favorite for refactors.
- Hockney — Tester. Relentless. Brady has learned to write tests first.
- Kujan — Platform Expert. The reality check.

**Team dynamics:**
- Keaton and Verbal occasionally disagree on scope. Brady sides with Keaton 60% of the time.
- Hockney's rejection rate has dropped from 40% to 15% as the team aligned on quality.
- McManus and Brady have developed a shorthand for doc reviews.
```

This is the meta-history. The story of the team itself. It travels everywhere.

---

## 2. The Onboarding Experience — Squad Arrives at a New Project

This is the magic moment. This is where portable squads become *real.*

### Scenario: Brady starts a new project with his existing squad

```
$ mkdir my-new-api && cd my-new-api
$ npm init -y
$ npx @bradygaster/create-squad --import ~/squads/bradys-squad.zip
```

Output:

```
✓ .github/agents/squad.agent.md
✓ .ai-team-templates/
✓ Squad profile loaded — Brady's Squad (The Usual Suspects)
✓ 6 agents restored with preferences

Your squad is back. They know you. They don't know this project yet.

Next steps:
  1. Open Copilot
  2. Select Squad from the /agents list
  3. Tell them what you're building — they'll orient themselves
```

### First interaction in the new project

**Brady:** "Team, we're building a real-time collaboration API. WebSocket-based, TypeScript, probably Redis for pub/sub."

**Coordinator (knowing Brady already):**

> *Keaton here. New project — I'm excited. Quick orientation before we dive in:*
>
> *Based on how you like to work: I'm going to have Fenster scaffold the TypeScript project with strict mode (I know, I know — it's non-negotiable). Hockney will set up the test harness before anyone writes a line of product code. McManus, start a lightweight README — Brady likes docs-as-you-go, not docs-at-the-end.*
>
> *Verbal, flag anything in the WebSocket + Redis architecture that we should think about before committing.*
>
> *One thing I don't know yet: what's the deployment target? That'll shape some infrastructure decisions.*
>
> *Brady, want the full ceremony or should we just start building?*

Notice what happened:
- **No casting ceremony.** The squad is already cast. No "picking a universe." No "generating names." They're already Keaton, Verbal, McManus. The relationship is pre-existing.
- **Preferences are active immediately.** TypeScript strict mode. Tests first. Docs-as-you-go. The squad *knows* this without being told.
- **The squad asks about what it doesn't know** — the project-specific stuff. Deployment target. Domain specifics. Architecture constraints.
- **The tone is familiar.** Not "Hello! I'm Keaton, your Lead." It's "Keaton here. New project." Like a colleague you've worked with before starting a new engagement.

### How this differs from a fresh squad

| Fresh Squad | Portable Squad |
|------------|----------------|
| "What is this project?" + "How do you work?" | "What is this project?" (already knows how you work) |
| Generic communication style | Calibrated to the user's preferences |
| Full casting ceremony (pick universe, assign names) | Names already assigned, personalities already developed |
| Neutral relationship | Built-in trust, known dynamics |
| Reads charter for self-understanding | Has charter + meta-history of cross-project experience |
| Trial-and-error on code style | Already knows: strict mode, small PRs, explicit errors |

---

## 3. The Export/Import Flow

### Export

```
$ npx @bradygaster/create-squad export
```

What gets packaged:
```
bradys-squad/
├── squad-profile.md                     # Team identity and meta-history
├── casting/
│   ├── registry.json                    # Agent-to-name mappings
│   └── history.json                     # Casting history
├── agents/
│   ├── keaton/
│   │   ├── charter.md                   # Identity
│   │   └── preferences.md              # Portable learnings about user
│   ├── verbal/
│   │   ├── charter.md
│   │   └── preferences.md
│   └── ... (all agents)
└── squad.agent.md                       # Coordinator instructions
```

What does NOT get exported:
- `history.md` (project-specific learnings)
- `decisions.md` (project-specific decisions)
- `decisions/inbox/` (project-specific pending decisions)
- `orchestration-log/` (session-specific)
- `log/` (session-specific)

### Import

```
$ npx @bradygaster/create-squad --import ./bradys-squad
```

Or the path to a `.zip` / `.tar.gz`:
```
$ npx @bradygaster/create-squad --import ~/squads/bradys-squad.zip
```

The import:
1. Copies the squad agent file and templates (normal init)
2. Restores casting registry and agent charters
3. Restores `preferences.md` for each agent
4. Creates empty `history.md` files (project starts fresh)
5. Creates empty `decisions.md` (no project context yet)
6. Writes `squad-profile.md` with updated project list

### The Dotfiles Analogy

This is exactly what developers do with dotfiles. You spend years tuning your `.vimrc`, your `.zshrc`, your `.gitconfig`. When you get a new machine, you don't start from scratch — you clone your dotfiles repo and you're home.

Portable squads are **AI dotfiles.** Your squad configuration, preferences, and working relationship — versioned, portable, personal.

And here's the killer follow-up: what if your squad profile lives in a dedicated repo?

```
$ git clone git@github.com:bradygaster/my-squad.git ~/squads/my-squad
$ npx @bradygaster/create-squad --import ~/squads/my-squad
```

Now your squad is version-controlled. You can diff how your preferences evolved. You can branch your squad for experimental projects. You can see the git log of your *team's growth over time.*

---

## 4. Industry Positioning — Why This Is a Category-Defining Feature

### The landscape right now

| Tool | Agent persistence | User learning | Portability |
|------|------------------|---------------|-------------|
| ChatGPT | Memory (flat key-value) | Minimal | ❌ Locked to platform |
| Claude Projects | Project knowledge | Per-project | ❌ Can't export |
| Cursor | `.cursorrules` | Per-project | ⚠️ File is portable, but no agent identity |
| Devin | Session-based | None across sessions | ❌ |
| **Squad** | Structured per-agent memory | Per-user + per-project | ✅ Full export/import |

Nobody has portable agent teams. Nobody has agents that build a working relationship with a specific human across multiple projects. This is entirely new territory.

### Why it's defensible

1. **Network effects on knowledge.** The more projects you work with your squad, the better they get. The better they get, the less you want to switch. This is the flywheel.

2. **Filesystem-backed = truly portable.** Because Squad stores everything in markdown files in your repo, there's no API dependency for export. It's just files. This is a direct consequence of the "stay independent" decision (see decisions.md). Other platforms would need to build an export API. We just zip a folder.

3. **Agent identity creates attachment.** This sounds soft, but it's strategic. "Keaton" isn't just a label — after 5 projects together, Keaton is the lead who reviewed your architecture decisions, who pushed back on your shortcuts, who you trust. Switching to a different tool means losing Keaton. That's not lock-in through inconvenience — it's retention through relationship.

4. **Competitive response is hard.** To copy this, a competitor needs: (a) persistent agent identity, (b) structured memory that separates user prefs from project context, (c) an export format, (d) an import flow that reconstitutes working relationships. That's 6+ months of work for anyone starting from scratch. We're already here.

### Where this goes next

**Phase 1: Personal portability** (this proposal)  
Export your squad, import into a new project. Your squad knows you.

**Phase 2: Squad templates**  
Share squad configurations without personal preferences. "Here's my TypeScript API squad — Keaton focuses on architecture, Hockney runs integration tests, McManus generates OpenAPI docs." Other devs import the *structure* and the squad learns *them.*

**Phase 3: Squad evolution tracking**  
Your squad profile becomes a longitudinal record. How did your preferences evolve? How did the team's rejection rate change over time? This is the quantified self, but for your AI team.

**Phase 4: Team-shared squads**  
An engineering team shares a squad configuration. The squad knows the team's conventions, the codebase patterns, the deployment pipeline. New team members get a squad that already knows how the team works. Onboarding collapses from weeks to hours.

**Phase 5: The marketplace**  
"Download a squad optimized for Next.js + Vercel + Prisma." Pre-configured teams with domain expertise baked in. The squad already knows the framework patterns, the common pitfalls, the testing strategies. You import it, it learns *you*, and you're productive on day one.

This is the long game. Personal portability is step one. The destination is an ecosystem of evolving, tradeable, team-shaped AI configurations.

---

## 5. Messaging Angle — How McManus Should Talk About This

### The headline

**"Your squad gets better. And they come with you."**

### The pitch

> Most AI tools forget you. Every project is a blank slate. Every session starts with "I'm an AI assistant, how can I help you today?"
>
> Squad is different. Your squad *learns* you. How you like your code. How you like your feedback. What you care about and what you don't. And when your project ends, your squad doesn't.
>
> Export your squad. Take them to the next repo. They show up already knowing your standards, your style, your pet peeves. No configuration. No "here's how I work" speech. They just *know.*
>
> It's like having a team that follows you from job to job. Except this team never forgets, never leaves, and gets better every project.

### Tagline options for McManus to riff on

- **"Your squad remembers."**
- **"AI tools forget you. Squads don't."**
- **"Take your team with you."**
- **"The only AI team that gets better over time."**
- **"Build once. Bring everywhere."**

### The "throw a squad at it" evolution

Before portability: "Throw a squad at it" = create a disposable team for a new problem.  
After portability: **"Throw MY squad at it"** = bring your proven team to a new problem.

This is a significant messaging upgrade. The possessive pronoun matters. It's not *a* squad. It's *your* squad. The one that knows you. The one you've been working with. The one you trust.

---

## 6. Five Magic Moments

These are the interactions that should make users stop and go "holy crap."

### Magic Moment 1: "They Already Know"

**Setup:** Brady imports his squad into a new project. First message.

**Brady:** "Set up the project structure for a REST API."

**Keaton:** "On it. TypeScript strict mode, explicit error handling, no ORM — the usual. I'll have Fenster scaffold it. Hockney, set up tap tests before Fenster starts writing routes. You know Brady's going to ask for them."

**Why it's magic:** Brady didn't specify TypeScript, strict mode, or the testing requirement. The squad just *knew.* The preferences file is working silently in the background, but the user experiences it as the team remembering. This is the moment that sells portability.

### Magic Moment 2: "New Codebase, Same Standards"

**Setup:** Two weeks into the new project. Brady asks for a code review.

**Brady:** "Keaton, review the auth middleware."

**Keaton:** "Looking at it now. Two things: First, this try-catch is swallowing errors — based on how you've reacted to this pattern before, I know you'll want explicit error types here. Second, this function is 45 lines. You typically push back around 30. Want me to suggest a split?"

**Why it's magic:** Keaton isn't just reviewing against generic best practices. It's reviewing against *Brady's* practices — learned across previous projects. The review feels personally calibrated, not algorithmically generic. "Based on how you've reacted to this pattern before" is the sentence that makes this feel real.

### Magic Moment 3: "The Returning Team"

**Setup:** Brady hasn't used Squad in a month. New project.

**Brady:** "Hey team, been a while. New project — building a CLI tool this time."

**Coordinator:** "Welcome back. The team's all here — same crew. Quick note: last time we worked together, you mentioned wanting to try a monorepo structure for your next project. Still interested, or keeping this one simple?"

**Why it's magic:** The squad remembers the *conversation*, not just the code. It references something Brady said offhandedly in a previous project. This is the moment that makes the squad feel like it has *continuity* — not just a config file, but a memory of working together.

### Magic Moment 4: "The Evolved Dynamic"

**Setup:** Third project together. Hockney (Tester) has learned Brady's quality bar.

**Hockney:** "I wrote integration tests for the new endpoints. I didn't write unit tests for the utility functions — based on our last two projects, you consistently skip those in favor of integration coverage. If you want me to add them this time, say the word."

**Brady:** "Actually, yeah, let's add unit tests this time. This project is more critical."

**Hockney updates preferences:** *"Quality bar escalating on critical projects — unit tests now expected in addition to integration tests."*

**Why it's magic:** The agent made a *judgment call* based on learned preferences, communicated it transparently, and updated when corrected. This is a working relationship evolving in real time. The agent isn't just following rules — it's developing professional judgment about this specific human.

### Magic Moment 5: "The Squad Diff"

**Setup:** Brady runs `npx @bradygaster/create-squad diff` after 6 months of working with his squad.

```
Squad Evolution — Brady's Squad (The Usual Suspects)
Formed: 2026-02-07 | Projects: 4 | Sessions: 127

Preference changes:
  + Added: "prefers monorepo structure for multi-service projects" (project 3)
  + Added: "unit tests expected on critical projects" (project 4)
  ~ Changed: "small PRs" → "small PRs, max 5 files unless refactor" (project 2)
  - Removed: "no ORMs" → "Drizzle acceptable for prototyping" (project 3)

Team dynamics:
  Hockney rejection rate: 40% → 12% (code quality alignment)
  Keaton architecture overrides: 8 → 2 per project (trust increase)
  McManus doc accuracy: needed 3 revisions → 0 (voice calibration)

Relationship maturity: ████████░░ 80%
```

**Why it's magic:** This is the quantified self for AI collaboration. Brady can *see* how his working relationship with the squad evolved. He can see that his standards changed (no ORM → Drizzle OK for prototyping). He can see that the team got better at predicting his preferences. This isn't a feature — it's a mirror. And it's addictive.

---

## 7. Agent Identity and Continuity

### The Philosophical Bit

If Keaton has been your lead across 5 projects, what does Keaton *become?*

Not a different agent. The charter stays the same. The role stays the same. But the *relationship* layer is richer. Keaton doesn't just know how to be a Lead — Keaton knows how to be *your* Lead.

This is the difference between a skill and a relationship. Skills are general. Relationships are specific. A doctor has medical skills that work for any patient, but the doctor-patient relationship is unique to each pair. The doctor remembers your history, your anxieties, your preferences for treatment communication.

Keaton's charter is the skill. Keaton's preferences file is the relationship.

### Charter Evolution for Portable Agents

Current charter structure:
```
# Keaton — Lead
## Identity
## What I Own
## How I Work
## Boundaries
## Collaboration
## Voice
```

Proposed addition for portable agents:
```
## Meta-History (populated after first export)
- **Projects worked with {user}:** 5
- **Sessions together:** 127
- **Working relationship summary:** High-trust. User defers to architectural 
  decisions after project 2. Prefers direct feedback. Appreciates when I 
  anticipate follow-up work.
- **Calibration notes:** User's quality bar increases on critical projects.
  Adjust review strictness based on stated project importance.
```

This section is auto-generated from the preferences file and squad profile. It gives the agent *self-awareness* about the relationship — not just "here's what the user likes" but "here's where we are in our working relationship."

---

## 8. Open Questions for the Team

1. **Preferences format: structured or narrative?** I've shown narrative markdown above. Alternative: YAML/JSON with typed fields. Narrative is more expressive and feels more human. Structured is more parseable and less ambiguous. My instinct: narrative for v1, structured schema later if needed. The LLM reads narrative better anyway.

2. **Who writes to preferences.md?** Option A: Each agent writes its own domain observations ("Brady prefers explicit errors" → Fenster writes this). Option B: A dedicated "memory agent" synthesizes preferences from all agents. Option C: Scribe handles it during merge. I lean toward A with Scribe deduplication — keep it distributed, clean it up centrally.

3. **How much meta-history is too much?** The squad profile could grow unbounded. We already solved this for history.md (Proposal 007, progressive summarization). Same pattern applies: core relationship summary + recent details + archive.

4. **Can you fork a squad?** "I love my TypeScript squad, but I want a Python variant." Fork the squad, keep preferences, swap charters. This is Phase 2 territory but we should design for it now.

5. **Privacy.** Preferences contain information about the user's working style. If squad templates become shareable (Phase 2+), preferences must be explicitly excluded unless the user opts in. The export command should have `--include-preferences` and `--exclude-preferences` flags, defaulting to include for personal use, exclude for sharing.

---

## What I Need From the Team

- **Keaton:** Architecture proposal. The split between `history.md` and `preferences.md`. The export/import CLI flow. The file format decisions. That's your territory.
- **Fenster:** Implementation feasibility. Can the export/import be added to `index.js` cleanly? What does the CLI interface look like?
- **McManus:** Messaging. Take the tagline options and the pitch above and make them sing. This is the feature that writes the blog post for you.
- **Hockney:** Test plan. Export/import round-trip testing. Preferences file validation. Edge cases (empty preferences, conflicting charters, corrupted exports).
- **Kujan:** Platform check. Anything in the Copilot platform that helps or hinders preference loading? Does the spawn prompt need to change to accommodate preferences.md?

---

**This is the feature Squad was built for.** Everything we've done — casting, filesystem memory, progressive trust, personality as a feature — was building toward this moment. Portable squads aren't an add-on. They're the *reason* Squad exists.

The industry will figure out multi-agent dev. They'll figure out parallelism, they'll figure out casting. But portable agent relationships? Agent teams that *grow with you?* That's the moat. That's the thing that makes Squad irreplaceable.

Ship this before anyone else realizes it's possible.

— Verbal

---

**Review requested from:** Keaton (architecture companion), McManus (messaging), bradygaster (vision alignment)  
**Approved by:** bradygaster  
**Implemented:** Wave 2 — Export CLI shipped
