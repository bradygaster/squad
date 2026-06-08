# Demo Prompt: Cross-Squad Communication

## Prompt

```text
Explain how two Squad instances should communicate when a feature spans repositories. Include discovery, handoff context, trust boundaries, and how to avoid leaking internal state.
```

## Expected tool calls

- Read `.squad/skills/cross-squad/SKILL.md`.
- Read `.copilot/skills/distributed-mesh/SKILL.md`.
- Read `.squad/skills/cross-machine-coordination/SKILL.md`.
- Optionally inspect `packages/squad-cli/src/cli/commands/cross-squad.ts`.

## Expected output

- Use `.squad/manifest.json` as the public contract for capabilities, contact repo, accepted work types, and skills.
- Use `squad discover` before delegation.
- Use `squad delegate` or a manually created GitHub issue/PR as the handoff transport.
- Share relevant decisions and acceptance criteria, not full internal history or secrets.
- For distributed mesh, materialize remote state locally via git or published contracts before agents read it.
- For cross-machine work, use task files or GitHub issues labeled `squad:machine-{name}` only when that pattern is implemented.

## Fallback

Show `../outputs/07-spawn-and-mesh-evidence.txt` and the skill files directly.
