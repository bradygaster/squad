# Proposal 008: Portable Squads — Platform Feasibility

**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-08  
**Status:** Approved ✅ Shipped. Note: references `@bradygaster/create-squad`; distribution is now GitHub-only via `npx github:bradygaster/squad` per Proposal 019a.  
**Triggered by:** bradygaster — portable squads: export your team from one project, import into another

---

## Executive Summary

Brady wants users to export a squad from one project and import it into another. The squad keeps its names, personalities, and meta-knowledge about the user — but sheds project-specific context.

**My assessment:** This is buildable. The hard parts are real but bounded. The format is straightforward (JSON manifest + files). The CLI changes are small (~80 lines). The merge problem is solvable with a "refuse by default" policy. The history splitting problem is the only genuinely hard thing, and the right v0.1 answer is "don't try — let the user curate."

**What changes:** `index.js` gets two new code paths. A `.squad` file format gets defined. The casting system gets an `imported_from` field. The coordinator gets a small init flow change.

**What doesn't change:** Filesystem-backed memory. Git-cloneable state. The coordinator spec. The casting algorithm. Templates.

---

## 1. What the CLI Needs to Do

### Current state

`index.js` is 65 lines. It does one thing: copy `squad.agent.md` and templates into a target directory. It has no subcommands, no flags, no argument parsing. It's invoked as `npx @bradygaster/create-squad`.

### What needs to change

Two new operations, surfaced as positional subcommands:

```
npx @bradygaster/create-squad              # existing behavior (init)
npx @bradygaster/create-squad export       # new: export squad to .squad file
npx @bradygaster/create-squad import <file> # new: import squad from .squad file
```

**Why subcommands, not flags:**
- `--export` and `--from` would work but feel bolted-on. Subcommands are clearer for operations that are fundamentally different from init.
- `create-squad export` reads naturally: "create a squad export."
- `create-squad import my-team.squad` reads naturally: "create a squad by importing my-team."
- The existing no-argument behavior stays unchanged. Zero breaking changes.

### CLI implementation sketch

```javascript
const command = process.argv[2];

if (command === 'export') {
  exportSquad();
} else if (command === 'import') {
  const file = process.argv[3];
  if (!file) { console.error('Usage: create-squad import <file>'); process.exit(1); }
  importSquad(file);
} else {
  initSquad(); // existing behavior, extracted to a function
}
```

This adds ~80 lines (export function + import function + argument routing). `index.js` stays under 150 lines. No dependencies needed — `fs` and `path` handle everything. The `.squad` format is JSON, so no archive library required.

### Platform note

There's nothing Copilot-specific about export/import. These are pure filesystem operations that happen before any agent session starts. The CLI runs outside Copilot — it's a Node.js script. No platform constraints apply here.

---

## 2. The Export Payload

### What goes in

| File/Directory | Include? | Rationale |
|---|---|---|
| `casting/registry.json` | ✅ YES | This IS the squad identity — names, universe, creation dates |
| `casting/history.json` | ✅ YES | Universe usage history travels with the squad |
| `casting/policy.json` | ✅ YES | Allowlist + capacity config is squad infrastructure |
| `agents/*/charter.md` | ✅ YES | Identity is portable. Charter defines who the agent is. |
| `agents/*/history.md` | ⚠️ PARTIAL | Needs filtering. User preferences YES, project paths NO. (See Section 4.) |
| `team.md` | ✅ YES (cleaned) | Strip project context section, keep roster structure |
| `routing.md` | ✅ YES | Routing is team structure, not project-specific |
| `ceremonies.md` | ✅ YES | Team process config is portable |
| `decisions.md` | ❌ NO | Project-specific decisions don't transfer |
| `decisions/inbox/` | ❌ NO | Pending decisions are project-scoped |
| `orchestration-log/` | ❌ NO | Session logs are project history |
| `log/` | ❌ NO | Session archives are project history |

### The format: `.squad` file

A single JSON file with a `.squad` extension. Not a tarball, not a zip. JSON because:
1. Human-readable — users can inspect and edit before importing
2. No compression library needed — keeps `index.js` dependency-free
3. Git-diffable — if someone commits a `.squad` file, changes are visible
4. Self-describing — the manifest and contents are in one place

```json
{
  "squad_format_version": "1.0",
  "exported_at": "2026-02-08T10:30:00Z",
  "exported_from": {
    "project": "Squad",
    "owner": "bradygaster"
  },
  "casting": {
    "registry": { /* contents of registry.json */ },
    "history": { /* contents of history.json */ },
    "policy": { /* contents of policy.json */ }
  },
  "agents": {
    "keaton": {
      "charter": "# Keaton — Lead\n> ...",
      "history": "# Project Context\n\n- **Owner:** ...\n\n## Learnings\n..."
    },
    "verbal": {
      "charter": "...",
      "history": "..."
    }
  },
  "team": "# Team Roster\n> ...",
  "routing": "# Work Routing\n...",
  "ceremonies": "# Ceremonies\n..."
}
```

**Why not separate files in a directory?** A single file is easier to share (Slack, email, GitHub Gist). A directory structure would need zipping, which needs a dependency. The `.squad` file IS the portable artifact.

**Size concern:** A mature squad with 6 agents, full charters, and filtered histories will be ~15-25KB of JSON. That's nothing. Even a squad with 20 agents and extensive histories would be under 100KB.

### Export implementation sketch

```javascript
function exportSquad() {
  const aiTeam = path.join(dest, '.ai-team');
  if (!fs.existsSync(path.join(aiTeam, 'team.md'))) {
    console.error('No squad found in this project. Run create-squad first.');
    process.exit(1);
  }

  const payload = {
    squad_format_version: '1.0',
    exported_at: new Date().toISOString(),
    exported_from: {
      project: path.basename(dest),
      owner: '' // could read from team.md or git config
    },
    casting: {
      registry: JSON.parse(fs.readFileSync(path.join(aiTeam, 'casting', 'registry.json'), 'utf8')),
      history: JSON.parse(fs.readFileSync(path.join(aiTeam, 'casting', 'history.json'), 'utf8')),
      policy: JSON.parse(fs.readFileSync(path.join(aiTeam, 'casting', 'policy.json'), 'utf8'))
    },
    agents: {},
    team: cleanTeamMd(fs.readFileSync(path.join(aiTeam, 'team.md'), 'utf8')),
    routing: fs.readFileSync(path.join(aiTeam, 'routing.md'), 'utf8'),
    ceremonies: fs.existsSync(path.join(aiTeam, 'ceremonies.md'))
      ? fs.readFileSync(path.join(aiTeam, 'ceremonies.md'), 'utf8')
      : null
  };

  // Collect agent charters and histories
  const agentsDir = path.join(aiTeam, 'agents');
  for (const agent of fs.readdirSync(agentsDir)) {
    const agentDir = path.join(agentsDir, agent);
    if (!fs.statSync(agentDir).isDirectory()) continue;
    payload.agents[agent] = {
      charter: fs.readFileSync(path.join(agentDir, 'charter.md'), 'utf8'),
      history: fs.existsSync(path.join(agentDir, 'history.md'))
        ? fs.readFileSync(path.join(agentDir, 'history.md'), 'utf8')
        : null
    };
  }

  const outFile = path.join(dest, `squad-export-${Date.now()}.squad`);
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`${GREEN}✓${RESET} Exported squad to ${path.basename(outFile)}`);
  console.log(`${DIM}Review the file and remove any project-specific content from agent histories before sharing.${RESET}`);
}
```

### The `cleanTeamMd` function

Strips the `## Project Context` section from `team.md` since it contains project-specific info (stack, description). The roster (names, roles, charter paths) is portable.

```javascript
function cleanTeamMd(content) {
  // Remove ## Project Context section and everything after it
  return content.replace(/## Project Context[\s\S]*$/, '').trim();
}
```

---

## 3. The Import Flow

### Happy path: importing into a fresh project

```
mkdir new-project && cd new-project
npx @bradygaster/create-squad import ../old-project/squad-export-123.squad
```

What happens:
1. CLI reads and validates the `.squad` file
2. Copies `squad.agent.md` and templates (same as normal init)
3. Creates `.ai-team/casting/` with the imported casting state
4. Creates `.ai-team/agents/*/` with imported charters and histories
5. Creates `.ai-team/routing.md` from import
6. Creates `.ai-team/ceremonies.md` from import (if present)
7. Creates `.ai-team/team.md` with imported roster + empty Project Context (to be filled by coordinator on first run)
8. Adds `imported_from` metadata to casting registry
9. Creates empty `decisions.md`, `decisions/inbox/`, `orchestration-log/`, `log/`

### The merge problem: importing into an existing squad

**v0.1 answer: refuse.**

```javascript
if (fs.existsSync(path.join(dest, '.ai-team', 'team.md'))) {
  console.error('This project already has a squad.');
  console.error('Merge is not yet supported. To replace, remove .ai-team/ first.');
  process.exit(1);
}
```

**Why refuse:**
- Universe conflict (existing squad is Alien, import is Usual Suspects) has no clean resolution
- Name collision (both squads have a "Lead" agent) requires identity decisions
- Merge semantics are ambiguous: does the imported agent replace the existing one? Coexist? Which history wins?
- The user can manually resolve by removing `.ai-team/` first — this is transparent and safe

**v0.3 answer (future):** Interactive merge with conflict resolution.

```
⚠️  This project already has a squad (Alien universe).
    The import is from The Usual Suspects universe.

Options:
  1. Replace existing squad entirely
  2. Add imported agents to existing squad (mixed universe)
  3. Cancel

> 1

Replacing squad...
✓ Backed up existing squad to .ai-team-backup-1707400000/
✓ Imported squad from squad-export-123.squad
```

But this is v0.3 work. Don't build it now. The "refuse" approach is honest and safe.

### Import implementation sketch

```javascript
function importSquad(file) {
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const aiTeam = path.join(dest, '.ai-team');
  if (fs.existsSync(path.join(aiTeam, 'team.md'))) {
    console.error('This project already has a squad.');
    console.error('To replace, remove .ai-team/ first, then import.');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Invalid .squad file — could not parse JSON.');
    process.exit(1);
  }

  if (!payload.squad_format_version || !payload.casting || !payload.agents) {
    console.error('Invalid .squad file — missing required fields.');
    process.exit(1);
  }

  // Copy coordinator + templates (same as init)
  const agentSrc = path.join(root, '.github', 'agents', 'squad.agent.md');
  const agentDest = path.join(dest, '.github', 'agents', 'squad.agent.md');
  fs.mkdirSync(path.dirname(agentDest), { recursive: true });
  fs.copyFileSync(agentSrc, agentDest);

  const templatesSrc = path.join(root, 'templates');
  const templatesDest = path.join(dest, '.ai-team-templates');
  if (!fs.existsSync(templatesDest)) {
    copyRecursive(templatesSrc, templatesDest);
  }

  // Create directory structure
  fs.mkdirSync(path.join(aiTeam, 'decisions', 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(aiTeam, 'orchestration-log'), { recursive: true });
  fs.mkdirSync(path.join(aiTeam, 'casting'), { recursive: true });
  fs.mkdirSync(path.join(aiTeam, 'log'), { recursive: true });

  // Write casting state (with imported_from annotation)
  const registry = payload.casting.registry;
  registry.imported_from = {
    project: payload.exported_from.project,
    exported_at: payload.exported_at,
    imported_at: new Date().toISOString()
  };
  fs.writeFileSync(path.join(aiTeam, 'casting', 'registry.json'), JSON.stringify(registry, null, 2));
  fs.writeFileSync(path.join(aiTeam, 'casting', 'history.json'), JSON.stringify(payload.casting.history, null, 2));
  fs.writeFileSync(path.join(aiTeam, 'casting', 'policy.json'), JSON.stringify(payload.casting.policy, null, 2));

  // Write agents
  for (const [name, agent] of Object.entries(payload.agents)) {
    const agentDir = path.join(aiTeam, 'agents', name);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'charter.md'), agent.charter);
    if (agent.history) {
      fs.writeFileSync(path.join(agentDir, 'history.md'), agent.history);
    }
  }

  // Write team/routing/ceremonies
  // Re-add empty Project Context section to team.md
  const teamMd = payload.team + '\n\n## Project Context\n\n- **Owner:** (to be filled on first session)\n- **Stack:** (to be filled on first session)\n- **Description:** (to be filled on first session)\n- **Created:** ' + new Date().toISOString().split('T')[0] + '\n';
  fs.writeFileSync(path.join(aiTeam, 'team.md'), teamMd);
  fs.writeFileSync(path.join(aiTeam, 'routing.md'), payload.routing);
  if (payload.ceremonies) {
    fs.writeFileSync(path.join(aiTeam, 'ceremonies.md'), payload.ceremonies);
  }

  // Empty decisions
  fs.writeFileSync(path.join(aiTeam, 'decisions.md'), '# Team Decisions\n\nShared brain. All agents read this before working.\n');

  const agentCount = Object.keys(payload.agents).length;
  const universe = Object.values(registry.agents)[0]?.universe || 'unknown';
  console.log(`${GREEN}✓${RESET} Imported squad: ${agentCount} agents from ${universe}`);
  console.log(`${GREEN}✓${RESET} .github/agents/squad.agent.md`);
  console.log(`${GREEN}✓${RESET} .ai-team/ (casting, agents, routing)`);
  console.log();
  console.log(`${BOLD}Squad is ready.${RESET} Your team remembers you.`);
  console.log();
  console.log(`Next steps:`);
  console.log(`  1. Open Copilot:  ${DIM}copilot${RESET}`);
  console.log(`  2. Select ${BOLD}Squad${RESET} from the /agents list`);
  console.log(`  3. Tell it about this project — the team will adapt`);
  console.log();
}
```

---

## 4. History Splitting — The Hard Problem

Agent histories contain mixed content:

```markdown
### 2026-02-07: Initial Assessment
- Brady prefers explicit error handling          ← PORTABLE (user preference)
- The API runs on port 3000                      ← NOT PORTABLE (project fact)
- Always use TypeScript strict mode              ← PORTABLE (coding convention)
- Auth middleware is in src/middleware/auth       ← NOT PORTABLE (project path)
```

### Options analysis

| Approach | Accuracy | Effort | UX | v0.1? |
|---|---|---|---|---|
| **Manual curation** | High (user decides) | Low (for us) | Medium (user does work) | ✅ YES |
| **LLM classification at export** | Medium-High | Medium | Good (automatic) | ❌ No |
| **Structural separation** | High | High (breaking change) | Good (once adopted) | ❌ No |
| **Tag-based** | High | Medium | Medium (agents must remember) | ❌ No |

### v0.1: Manual curation

Export dumps the full history. Tell the user to review it.

```
✓ Exported squad to squad-export-1707400000.squad

⚠️  Review agent histories before sharing:
   Agent histories may contain project-specific paths and facts.
   Open the .squad file, find the "history" fields, and remove
   any entries that reference this specific project's file paths
   or architecture.
```

This is honest and correct. The user knows their project better than any heuristic. The `.squad` file is human-readable JSON — they can edit it in any text editor.

### v0.2: LLM-assisted classification

This is where the Copilot platform could help. But NOT at export time (the CLI runs outside Copilot). Instead, the coordinator could do it:

**Option A: Export-time classification via a Copilot session**

```
User: "export my squad"
Coordinator: I'll prepare the export. Let me classify history entries first.
[Coordinator reads each agent's history.md]
[Coordinator marks each entry as PORTABLE or LOCAL]
[Coordinator writes a cleaned .squad file]
```

This works but requires Copilot to be running. The CLI can't do it standalone.

**Option B: Import-time adaptation**

```
User: "I imported my squad into this new project"
Coordinator: Welcome back, Brady. I see Keaton, Verbal, McManus, Fenster, and Hockney.
I notice some history entries reference your old project. Let me clean those up.
[Coordinator reads each history.md, removes/rewrites project-specific entries]
```

This is actually better — the coordinator knows the NEW project context and can make smarter decisions about what's relevant vs. stale.

**Option C: Structural separation (v0.3)**

Change the history.md format to separate portable and local knowledge from the start:

```markdown
## Portable Context
<!-- These entries travel with the squad to new projects -->
- Brady prefers explicit error handling
- Always use TypeScript strict mode
- Team convention: proposal-first for meaningful changes

## Project Context
<!-- These entries are specific to this project -->
- The API runs on port 3000
- Auth middleware is in src/middleware/auth
```

This is the cleanest long-term answer but requires:
1. Updating all existing histories (breaking for current users)
2. Updating the history.md template
3. Updating agent spawn prompts to explain the sections
4. Training agents to categorize new entries correctly (prompt engineering)

**My recommendation:** Ship v0.1 with manual curation. Add coordinator-assisted classification (Option B — import-time adaptation) in v0.2 when a user actually asks for it. Design the structural separation (Option C) but don't implement until we have evidence that manual curation is too painful.

---

## 5. Impact on the Coordinator

### Does `squad.agent.md` need changes?

**Minimal changes, all in Init Mode.**

Currently, Init Mode (line 26-50) assumes it's building a team from scratch. With imports, the coordinator may enter a session where:
- `team.md` exists (so it goes to Team Mode)
- But `team.md` has placeholder Project Context ("to be filled on first session")
- And `registry.json` has an `imported_from` field

The coordinator should detect this and do a lightweight onboarding:

```markdown
### Imported Squad Detection (Team Mode entry)

After reading team.md and registry.json, check for:
- `registry.json` has `imported_from` field
- `team.md` Project Context has "(to be filled on first session)"

If both: this is an imported squad's first session. Do:
1. Greet the user by name: "Hey {name}, your squad is here — Keaton, Verbal, and the rest."
2. Ask about the new project: "What are you building? I'll get the team oriented."
3. Fill in the Project Context section of team.md
4. Update each agent's history.md with a "New project" entry
5. Remove the `imported_from` field from registry.json (one-time flag)
```

This is ~10 lines added to `squad.agent.md`. No structural changes to the coordinator.

### Does the coordinator need to know it's working with an imported squad?

**Only on first session.** After that, the squad IS the project's squad. The `imported_from` field in the registry serves as a one-time flag that gets cleared after onboarding. No ongoing behavioral changes needed.

### Does the casting algorithm change?

**No.** The casting state arrives pre-populated. The coordinator doesn't re-cast — it uses the existing registry. If the user later adds agents (new roles), the casting algorithm runs normally with the existing universe and history.

---

## 6. Platform Constraints and Copilot SDK Considerations

### What works today (no platform changes needed)

| Capability | How it works |
|---|---|
| Export | Pure CLI/filesystem. No Copilot needed. |
| Import | Pure CLI/filesystem. No Copilot needed. |
| Imported squad detection | Coordinator reads `registry.json`, checks for `imported_from`. Standard file read. |
| First-session onboarding | Coordinator asks user about new project. Standard conversation. |
| History filtering (manual) | User edits JSON file. No tooling needed. |

### What would be better with Copilot SDK access

| Feature | What SDK could provide | Current workaround |
|---|---|---|
| LLM-powered history classification | SDK memory API with metadata tags (portable/local) | Manual curation or coordinator-assisted cleanup |
| Squad marketplace / discovery | SDK registry for publishing and discovering squads | Share `.squad` files manually (Gist, Slack, etc.) |
| Cross-project agent memory | SDK-managed persistent memory that follows the user | Filesystem export/import (what we're building) |
| Merge conflict resolution | SDK schema validation for casting state | Refuse and let user resolve manually |

### The honest assessment

The Copilot platform doesn't help or hurt here. Export/import is a CLI operation. The platform constraints we fight elsewhere (no agent persistence, stateless spawns, no warm cache) are irrelevant because this feature runs before any agents exist.

The one place where SDK access would genuinely change the game is **cross-project agent memory**. If Copilot had a per-user memory store that agents could read/write, portable squads would be trivial — the squad's identity would live in the user's Copilot profile, not in the filesystem. But that doesn't exist, and filesystem-backed memory is Squad's killer differentiator (decision from 2026-02-07: "Stay independent, optimize around Copilot"). We're not waiting for the SDK.

---

## 7. What's the Minimum Viable Version?

### v0.1: Ship this (effort: ~4 hours)

| Item | What | Effort |
|---|---|---|
| CLI: `export` subcommand | Packages `.ai-team/` state into a `.squad` JSON file | 1 hour |
| CLI: `import` subcommand | Unpacks `.squad` file into a new project | 1.5 hours |
| `cleanTeamMd` helper | Strips project context from team.md on export | 15 min |
| Import collision detection | Refuses if `.ai-team/team.md` already exists | 15 min |
| Coordinator: imported squad detection | Detects `imported_from` field, runs lightweight onboarding | 30 min |
| User messaging | Clear console output explaining what to review before sharing | 15 min |
| `package.json` update | No new dependencies needed. Add `.squad` to docs if applicable. | 15 min |

**What users get:** Export a squad from project A, import into project B, squad remembers who they are and how they work. User manually cleans project-specific history entries.

### v0.2: Smart history (effort: ~3 hours)

| Item | What |
|---|---|
| Import-time history adaptation | Coordinator scans imported histories, flags/removes project-specific entries |
| History annotation format | Agents learn to tag entries as `[portable]` or `[local]` going forward |

### v0.3: Merge support (effort: ~6 hours)

| Item | What |
|---|---|
| Interactive merge | CLI detects existing squad, offers replace/add/cancel |
| Universe reconciliation | Logic for mixed-universe squads or universe migration |
| Conflict resolution | Name collision handling, role deduplication |

### v1.0: Squad sharing (effort: depends on platform)

| Item | What |
|---|---|
| GitHub Gist integration | `create-squad export --gist` publishes to a Gist |
| Squad gallery | Community-contributed squad templates |
| Copilot SDK integration | If/when SDK provides user-level memory or agent registry |

---

## 8. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| User exports sensitive project data in history | HIGH | Clear warning on export. Human-readable JSON so user can review. |
| `.squad` file format changes break old exports | MEDIUM | `squad_format_version` field enables migration logic in future versions. |
| Imported squad doesn't adapt to new project | LOW | Coordinator detects import and runs onboarding. Agents re-read new project context. |
| Merge conflicts in existing squads | LOW (v0.1) | Refuse merges in v0.1. Users resolve manually. |
| History entries create confusion in new context | MEDIUM | Export warning + coordinator import-time cleanup (v0.2). |
| Large history files make `.squad` file unwieldy | LOW | Even extensive histories are under 100KB JSON. Not a real concern. |

---

## 9. The Philosophical Take

Portable squads are the logical extension of Squad's filesystem-backed memory. If your team's identity lives in files, those files can move. That's the whole point of "everything is a file" — portability is a property of the format, not a feature you build on top.

The hard question isn't "can we do this?" — it's "what IS the squad's identity, separated from the project?" A squad is:
- **Casting state** — names, universe, allocation history
- **Charters** — who does what, how they think, what they own
- **Routing** — how work flows between them
- **User knowledge** — preferences, conventions, communication style

A squad is NOT:
- **Project decisions** — those belong to the project
- **File paths and architecture** — those belong to the codebase
- **Session logs** — those belong to history

The `.squad` file captures exactly the first list and excludes the second. That's the right cut line.

The merge problem is where this gets philosophically interesting. Can you combine two squads? In theory, no — a squad's universe is its identity. Mixing Usual Suspects with Alien is incoherent. But adding agents from the same universe? Or migrating an entire squad? Those are tractable. We just don't need to solve them in v0.1.

---

## 10. Open Questions

1. **Should export be a CLI command or a coordinator command?** CLI is simpler and works without Copilot running. But coordinator-driven export could do LLM-assisted history filtering. Recommendation: CLI for v0.1, add coordinator-driven export in v0.2 for smart filtering.

2. **Should `.squad` files be committed to repos?** Probably not by default (they contain user preferences which may be personal). But they're not secret — they're like dotfiles. Add to `.gitignore` template? Or let users decide?

3. **What happens to Scribe in an imported squad?** Scribe is always "Scribe" and exempt from casting. The imported scribe charter should work as-is. But should Scribe's history be portable? Scribe's history is entirely project-specific (session logs). Answer: exclude Scribe history from export, include Scribe charter.

4. **Should the format support partial exports?** E.g., export just 2 of 5 agents. This is useful but adds complexity. v0.1: export the whole squad. v0.2: consider `--agents keaton,verbal` flag.

5. **File extension:** `.squad` is clean and descriptive. Alternative: `.squad.json` makes it obvious it's JSON. Recommendation: `.squad` — it's a Squad-specific format that happens to be JSON.

---

## 11. Conclusion

Portable squads are feasible, bounded, and aligned with Squad's filesystem-first architecture. The `.squad` file format is straightforward JSON. The CLI changes are ~80 lines. The coordinator changes are ~10 lines. The merge problem is punted to v0.3 with an honest "refuse" policy.

The only genuinely hard problem is history splitting. v0.1 punts this to the user (manual curation with clear messaging). v0.2 adds LLM-assisted classification. v0.3 adds structural separation. This is the right progression — ship the simple thing, learn from real usage, then optimize.

**What I'd build first:** The export command. It's the most useful standalone — even without import, users can backup their squad state, share it in a Gist, or diff it over time. Import builds on export.

**What I wouldn't build yet:** Merge support, automatic history classification, or Squad marketplace. These are real features but they're premature. Ship export/import, see how people use it, then decide.

---

**Review requested from:** Keaton (architecture), Fenster (implementation), bradygaster (product direction)  
**Approved by:** bradygaster  
**Implemented:** Wave 2 — Export CLI shipped  
**Retrospective:** [Pending]
