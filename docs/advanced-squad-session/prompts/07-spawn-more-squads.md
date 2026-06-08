# Demo Prompt: Spawning More Squads

## Prompt

```text
Plan a safe fan-out for a complex issue using Squad. Use a bounded spawn workflow: include WHY context, success criteria, escalation path, and a maximum of three cycles. Also explain when to use SubSquads, personal squads, or presets instead of ad-hoc sub-agents.
```

## Expected tool calls

- Read `packages/squad-cli/templates/skills/iterative-retrieval/SKILL.md` for the max-3-cycle protocol.
- Read `packages/squad-cli/src/cli/commands/streams.ts` for `squad subsquads` commands.
- Read `.squad/skills/personal-squad/SKILL.md` for personal squad behavior.
- Read `packages/squad-cli/src/cli/commands/preset.ts` for preset behavior.

## Expected output

A scale ladder:

1. Use `task` and `read_agent` for one-off parallel analysis.
2. Use the `iterative-retrieval` skill for bounded sub-agent cycles with WHY, success criteria, and escalation.
3. Use `squad subsquads <list|status|activate>` for configured SubSquads / multi-Codespace lanes.
4. Use `squad preset apply` or personal squads to bootstrap reusable team shapes.

## Fallback

Show `../outputs/07-spawn-and-mesh-evidence.txt`. If someone asks about `squad worktree spawn`, say the changelog mentions historical worktree spawning, but this deck uses currently grounded command sources: `task`, `squad subsquads`, personal squads, and presets.
