# 1037: Proposal: Context Budget Optimization & Memory Architecture for Squad
State: OPEN
URL: https://github.com/bradygaster/squad/issues/1037

## TL;DR

Squad agents get slower the more you use them. Not because of model changes — because of **state bloat**. After a few weeks of heavy usage, `.squad/` files grow until agents are burning most of their context window loading memories instead of doing work. This is a systemic problem that will hit every heavy Squad user eventually. Here's a 3-phase plan to fix it, inspired by Karpathy's wiki architecture and validated by Cloudflare's production Agent Memory system.

---

## The Problem (a.k.a. "Why Are You So Slow Today?")

Here's what happens to a Squad repo after a few weeks of active use:

| File | Typical Size | Tokens |
|------|-------------|--------|
| decisions-archive.md | 500KB – 1.6MB | 150K–478K |
| decisions.md (active) | 200KB – 500KB | 60K–143K |
| Agent histories (3-5 agents) | 400KB – 800KB combined | 115K–230K |
| routing.md + board state | 100KB – 200KB | 30K–53K |
| **Total mandatory context** | **1.2 – 3.1 MB** | **355K – 561K** |

Most models have a 200K-600K context window. You do the math. Your agents have barely anything left for actual work. And this happens *gradually* — files grow ~15-20% every two weeks, so you adapt without realizing your team is suffocating.

---

## Proposed Solution: Three-Layer Context Architecture

Inspired by [Karpathy's wiki-based memory model](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the idea that LLMs should curate knowledge at write time, so runtime loads a clean wiki instead of raw history.

### Phase 1: Index + Load Guidance (Quick Win)

Add a `.squad/index.md` file — a catalog of every `.squad/` file with explicit load-guidance tags:

- 🔴 **`[ALWAYS]`** — always loaded, total <20K tokens. Team identity, routing, current priorities.
- 🟡 **`[ON-DEMAND]`** — loaded only when the task needs it. Recent decisions, domain-specific context.
- 🟢 **`[ARCHIVE]`** — never pre-loaded. Grep when you need history.

Add a "Context Loading — Start Here" section to `copilot-instructions.md` so agents know to read `index.md` first and respect the tags.

**Plus basic hygiene:** archive old decisions, trim agent histories, keep only recent entries active.

**Expected impact: ~95% token reduction per spawn.** The 1.6MB decision archive is still there — you just don't load it every time.

### Phase 2: Workstream Isolation

Right now, a blog post agent loads infrastructure decisions and vice versa. That's wasteful.

```
.squad/workstreams/
├── content/        # Blog, marketing, social
├── infrastructure/ # K8s, CI/CD, deployment  
├── research/       # Studies, experiments
└── security/       # Compliance, privacy
```

Each workstream gets its own `now.md`, `routing.md`, `decisions.md`. Agents only load their domain. This could push from ~25K to ~9K mandatory tokens (98% reduction from unoptimized baseline).

### Phase 3: Knowledge Graph + Automated Hygiene

- Run [Graphify](https://github.com/safishamsi/graphify) on the decision archive → queryable knowledge graph instead of flat files
- Build a lint script (could be a `squad doctor` extension) that detects bloat, staleness, duplicate entries, orphaned files
- Enforce a write protocol: agents curate wiki at write time, not at runtime

---

## What Cloudflare Taught Us

Cloudflare recently [shipped a managed memory service](https://blog.cloudflare.com/introducing-agent-memory/) for Workers AI agents. Their production architecture validates this direction:

| Concept | Cloudflare's Approach | Squad Today | Opportunity |
|---------|----------------------|-------------|-------------|
| Memory types | Facts, Events, Instructions, Tasks — each with different semantics | decisions.md, history.md, now.md — all treated the same | Typed classification → smarter loading |
| Supersession | New fact gets forward pointer from old one — preserves history | Old decisions just sit in archive | Update chains → no stale facts |
| Ingestion pipeline | Extract → Verify (8 checks) → Classify → Store | Scribe merges inbox → decisions.md | Add verification + dedup at merge time |
| Retrieval | FTS + vector + HyDE + fact-key + raw (5 parallel channels, RRF fusion) | Load whole files or grep | Even basic search would be a huge improvement |
| Content dedup | SHA-256 content addressing | None | Same decision can land twice today |
| Auto-expiry | Tasks excluded from long-term memory | now.md goes stale manually | TTL on ephemeral state |

Squad already has the beginning of this — the Scribe + inbox pattern separates decision *ingestion* from *storage*, and an `index.md` would add a *retrieval* abstraction layer. What's missing: dedup at ingest, supersession chains, typed classification, and any kind of semantic retrieval.

We don't need to build Cloudflare's full vector database. But the ingestion pipeline concept (verify before storing, deduplicate, classify) could be implemented with simple conventions and a lint step.

---

## Concrete Contribution Ideas

### Quick Wins (PR-able today)
1. **`index.md` template** — generated at `squad init`, catalogs all `.squad/` files with `[ALWAYS]`/`[ON-DEMAND]`/`[ARCHIVE]` tags
2. **Load-guidance convention** — document in `squad.agent.md` so agents respect the tags (relates to #1036)
3. **"Read index.md first" in copilot-instructions.md** — one line that prevents the whole problem
4. **History archival threshold** — when `history.md` exceeds N KB, Scribe auto-archives old entries

### Needs Design Discussion
5. **Workstream isolation** — `.squad/workstreams/` as a first-class concept
6. **Memory lint / `squad doctor`** — detect bloat, staleness, and budget overruns before they bite
7. **Token budget monitoring** — warn at init time when mandatory context exceeds 30% of window
8. **Scribe archive protocol** — auto-archive stale decisions, not just accumulate forever

### Research / Long-term
9. **Graphify integration** — knowledge graph over decision archive for semantic queries. Should ship as an optional Squad extension.
10. **Write protocol** — formal convention for how agents commit to shared memory (verify → classify → store)
11. **Memory API layer** — thin abstraction between agents and `.squad/` files, inspired by Cloudflare's approach

### Why This Belongs Upstream

All of this should be built into Squad itself — not left to individual users to figure out. Every heavy Squad user will eventually hit context budget starvation; the only variable is when. The framework should handle memory management the same way it handles routing and ceremonies: as a first-class concern.

- **`squad init` should generate `index.md`** with load-guidance tags out of the box
- **`squad.agent.md` should enforce "read index.md first"** so agents never load the full archive by accident
- **Scribe's archive protocol should be default behavior**, not an opt-in discovery
- **`squad doctor` should detect bloat** before it becomes a performance problem
- **Graphify/knowledge-graph tooling** should ship as an optional Squad extension

---

## Related Upstream Issues

| Issue | What |
|-------|------|
| #1036 | Split squad.agent.md — lazy loading to reduce system-prompt overhead |
| #1017 | Coordinator drops in long sessions (context overflow) |
| #1013 | Two-layer state backend |
| #1014 | Concurrent spawn git-race |

---

## The Punchline

Your agents aren't getting dumber. They're getting *fuller*. And full agents are slow agents.

The fix isn't bigger context windows (though those help). The fix is **memory management** — the same discipline we apply to any system that accumulates state over time. Garbage collection for AI brains, basically.

Happy to dig into any of these with contributors. Pick a number from the list above and let's talk.

## Comments
### tamirdresher @ 2026-04-25T08:01:57Z
## Update: Copilot CLI Plugin System Alignment

After researching the Copilot CLI's native plugin architecture (`copilot plugin install`), I found it's **exactly the right delivery mechanism** for the features proposed above.

### What CLI Plugins Can Bundle
The `plugin.json` manifest supports:
- **Custom agents** (`.agent.md` files) — specialist personas
- **Skills** (`SKILL.md` + scripts) — callable task-specific instructions
- **Hooks** (`hooks.json`) — lifecycle automation (sessionStart, sessionEnd, preToolUse, etc.)
- **MCP servers** (`.mcp.json`) — **runtime code!** This is the key unlock.
- **LSP servers** (`lsp.json`) — language intelligence

### What This Means for Squad

A `squad-memory` plugin could ship:
```
squad-memory/
├── plugin.json              # Manifest
├── agents/
│   └── scribe.agent.md      # Enhanced Scribe with memory management
├── skills/
│   ├── memory-lint/SKILL.md  # "squad doctor" as a skill
│   └── memory-archive/SKILL.md
├── hooks.json               # Bloat check on sessionStart
└── .mcp.json                # Graphify MCP server for semantic queries
```

### Implication for #972 (Plugin Install)

The existing `squad plugin install` proposal copies `.md` files — which is now **eclipsed by the CLI's native plugin system**. Instead of building a parallel mechanism, Squad could:

1. Define Squad-specific plugin conventions on top of CLI's `plugin.json`
2. Create a Squad marketplace (`marketplace.json`) for community plugins
3. Ship core Squad functionality as CLI plugins where appropriate

**Recommended approach:** Phase 1 quick wins (index.md, load guidance) ship built-in with `squad init`. Phase 2-3 features (Graphify, memory API, advanced hygiene) ship as an official CLI plugin that users install with one command.

Two default marketplaces already exist: `github/copilot-plugins` and `github/awesome-copilot`. Squad could get listed in one of those or create its own.

cc @bradygaster — this plugin alignment could inform #972 direction too.


### m13v @ 2026-04-25T18:11:52Z
we ran a wiki-style memory architecture on two production agents last year. karpathy's write-time curation idea holds up but the failure that bit us wasn't context bloat, it was wiki drift. by month 3 we had three contradicting entries on the same business rule because nothing did read-time conflict detection. three layers is the right shape but i'd add a fourth: a freshness pass that fires on read, flags stale or conflicting entries, and either rejects them or routes back to source. otherwise you trade context bloat for context confusion.

### spereyda @ 2026-04-29T17:55:24Z
I’d like to add that the recent changes to GitHub Copilot billing make these optimizations even more critical from a cost perspective.

It might also be worth looking into using [GitHub CLI Extensions](https://htek.dev/articles/github-copilot-cli-extensions-complete-guide/) as another way to handle squad functions. 

I think moving programmatic tasks out of the agent and into hooks/tools via CLI extensions (or a plugin+MCP Server) should significantly cut down on unnecessary token consumption.
