# Shared Knowledge

Durable facts for future agents and sessions. Keep entries short, factual, and reusable.

## Repository

- This repo uses `.squad/` for shared team routing, memory, decisions, and guardrails.
- Root `AGENTS.md` is the Codex-native bootstrap file when present.
- `.squad/codex.md` defines how Codex should use Squad state.

## Agent Operation

- Load `.squad/codex.md`, `.squad/shared-knowledge.md`, `.squad/routing.md`, and `.squad/identity/now.md` before substantial Codex work.
- Use `.squad/routing.md` to map work to Squad members.
- Codex host environments may expose different sub-agent role names; preserve Squad member identity in delegated prompts.

## Safety

- The worktree may contain user changes. Always inspect status before editing.
- Do not revert unrelated modifications.
- Keep shared memory concise. Add only facts that will help future work.
