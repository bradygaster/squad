# Configuration Reference

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this:**
```
squad init
```
That's it. Squad works out of the box. Everything below is optional.

---

## squad.config.ts

For typed configuration with autocomplete, create this at your project root:

```typescript
import { defineConfig } from '@bradygaster/squad-sdk';

export default defineConfig({
  team: {
    name: 'my-squad',
    root: '.squad',
    description: 'My project team',
  },
  agents: {
    backend: { model: 'claude-sonnet-4', tools: ['route', 'memory', 'decision'] },
    frontend: { model: 'gpt-4.1', tools: ['route', 'skill'] },
  },
  routing: {
    workTypes: [
      { pattern: /\bAPI|backend\b/i, targets: ['backend'], tier: 'standard' },
      { pattern: /\bUI|CSS|React\b/i, targets: ['frontend'], tier: 'standard' },
    ],
  },
  models: {
    default: 'claude-sonnet-4',
    fallbackChains: {
      premium: ['claude-opus-4', 'gpt-4.1'],
      standard: ['claude-sonnet-4', 'gpt-4.1'],
      fast: ['claude-haiku-3.5', 'gpt-4.1-mini'],
    },
  },
});
```

`defineConfig()` merges your partial config with sensible defaults. You get full type inference and editor autocomplete.

---

## .squad/ Directory

```
.squad/
├── team.md              # Who's on the team
├── routing.md           # Work routing rules
├── decisions.md         # Architectural decisions (shared memory)
├── directives.md        # Permanent team rules
├── casting-state.json   # Agent names + universe theme
├── model-config.json    # Per-agent model overrides
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # Role, expertise, voice
│   │   └── history.md   # What this agent has done
│   └── ...
├── skills/              # Reusable knowledge files
├── decisions/inbox/     # Pending decisions (Scribe merges these)
├── log/                 # Session logs
└── orchestration-log/   # Coordinator state
```

Commit this directory. It's your team's brain. Anyone who clones the repo gets the full team with all their knowledge.

---

## Routing Rules

Control which agent gets which work. Edit `.squad/routing.md` or configure in `squad.config.ts`:

```markdown
# Routing Rules

**Frontend changes** → Trinity
**Backend API work** → Morpheus
**Database migrations** → Morpheus
**Test writing** → Tank
**Architecture decisions** → Neo
```

Or programmatically:

```typescript
routing: {
  workTypes: [
    { pattern: /\bAPI|backend\b/i, targets: ['backend'], tier: 'standard' },
    { pattern: /\bUI|React\b/i, targets: ['frontend'], tier: 'standard' },
    { pattern: /\bstatus|help\b/i, targets: [], tier: 'direct' },
  ],
  issueLabels: [
    { labels: ['bug', 'backend'], targets: ['backend'] },
  ],
}
```

---

## Model Configuration

17 models across three tiers. Squad picks the right one, or you override:

| Tier | Models | Use Case |
|------|--------|----------|
| **premium** | claude-opus-4, gpt-4.1 | Architecture, code review |
| **standard** | claude-sonnet-4, gpt-4.1 | Most work |
| **fast** | claude-haiku-3.5, gpt-4.1-mini | Triage, logging, quick tasks |

Per-agent overrides in `model-config.json`:

```json
{
  "neo": "claude-opus-4",
  "tank": "claude-haiku-3.5"
}
```

Resolution order: user override → charter → task auto-select → config default.

---

## Resolution Order

Squad finds `.squad/` by walking up:

1. Current directory (`./.squad/`)
2. Parent directories (up to project root)
3. Personal squad directory (platform-specific: `~/.config/squad/` on Linux, `~/Library/Application Support/squad/` on macOS, `%APPDATA%\squad\` on Windows)
4. Global CLI default (fallback)

First match wins.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SQUAD_CLIENT` | Detected client (`cli` or `vscode`) |
| `COPILOT_TOKEN` | Auth token for SDK usage |

---

## See Also

- [CLI Reference](cli.md) — Commands and shell interactions
- [SDK Reference](sdk.md) — Programmatic API
