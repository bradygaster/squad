# Demo Prompt: Delegate and Presets

## Prompt

```text
Show the audience what is actually supported for delegate and presets in this Squad version.

Ground the answer in this repository. Cite the command names and source files. Do not invent commands. Include a fallback if the live command cannot run because no target squad is configured or GitHub CLI is not authenticated.
```

## Expected tool calls

- Search or inspect `CHANGELOG.md` for the 0.10.0 release notes.
- Inspect `packages/squad-cli/src/cli/commands/cross-squad.ts`.
- Inspect `packages/squad-cli/src/cli/commands/preset.ts`.
- Optionally inspect `packages/squad-sdk/src/presets/types.ts` and `packages/squad-sdk/src/presets/builtin/default/preset.json`.

## Expected output

- `squad discover` lists known squads and their capabilities.
- `squad delegate <squad-name> "<description>"` creates a cross-squad GitHub issue when the target manifest accepts issues and `gh` can create the issue.
- `squad preset init`, `list`, `show`, `apply`, and `save` are the supported preset subcommands.
- Presets capture agents and charters only. Use `squad export` for a full squad snapshot including casting state, skills, and routing.

## Fallback

Show `../outputs/06-delegate-presets-evidence.txt` and label it as source-backed evidence rather than a live command run.
