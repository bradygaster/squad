# Squad Hooks Template Library

This directory provides ready-to-use GitHub Actions workflow templates that integrate with the Squad SDK's `defineHooks()` API.

## What Are Squad Hooks?

Squad hooks connect GitHub events (issue opened, PR merged, label applied) to Squad workflows, letting your agents react to repository activity without manual triggering.

```typescript
// squad.config.ts — SDK-first hook registration
import { defineSquad, defineHooks } from '@bradygaster/squad-sdk';

export default defineSquad({
  // ... team and agent definitions
  hooks: defineHooks({
    configFile: '.github/hooks/hooks.json',
  }),
});
```

## Template Files

| File | Trigger | Purpose |
|------|---------|---------|
| `hooks.json.example` | — | Declarative hook configuration file |
| `squad-auto-triage.yml` | `issues.opened` | Auto-label and route new issues to the right agent |
| `squad-board-sync.yml` | `pull_request.merged` | Close linked issues and update board when PRs merge |
| `squad-route.yml` | `issues.labeled` | Assign squad agents when routing labels are applied |

## Setup

### Step 1: Copy workflows

Copy the `.yml` files you need into your repository's `.github/workflows/` directory:

```bash
cp templates/hooks/squad-auto-triage.yml .github/workflows/
cp templates/hooks/squad-board-sync.yml .github/workflows/
cp templates/hooks/squad-route.yml .github/workflows/
```

### Step 2: Create your hooks configuration

```bash
mkdir -p .github/hooks
cp templates/hooks/hooks.json.example .github/hooks/hooks.json
```

Edit `.github/hooks/hooks.json` to match the workflows you installed.

### Step 3: Customize routing rules

In `squad-auto-triage.yml`, update the `routingRules` array with your team's actual agent names:

```javascript
const routingRules = [
  { keyword: 'bug', label: 'squad:engineer', agent: 'YourEngineerName' },
  { keyword: 'docs', label: 'squad:scribe', agent: 'YourScribeName' },
];
```

### Step 4: Create Squad labels

Run `squad init` or manually create the labels your routing rules reference:
- `squad:engineer`
- `squad:researcher`
- `squad:scribe`
- `squad:tester`
- `squad:done`

## The `hooks.json` Format

```json
{
  "hooks": [
    {
      "event": "issues.opened",
      "workflow": ".github/workflows/squad-auto-triage.yml",
      "description": "Human-readable description of what this hook does"
    }
  ]
}
```

Supported event values follow GitHub's `<resource>.<action>` convention:
- `issues.opened`, `issues.closed`, `issues.labeled`, `issues.assigned`
- `pull_request.opened`, `pull_request.merged`, `pull_request.closed`
- `push`, `release.published`

## Integration with `squad.config.ts`

When using SDK-first mode, register your hooks in `squad.config.ts`:

```typescript
import { defineSquad, defineTeam, defineAgent, defineHooks } from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({ name: 'My Squad' }),
  agents: [
    defineAgent({ name: 'keaton', role: 'Engineer' }),
  ],
  hooks: defineHooks({
    configFile: '.github/hooks/hooks.json',
    // Optional: inline hooks without a config file
    inline: [
      {
        event: 'issues.opened',
        workflow: '.github/workflows/squad-auto-triage.yml',
      }
    ]
  }),
});
```

Run `squad build` to validate your hook configuration.
