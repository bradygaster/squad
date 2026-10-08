---
name: action-skill-contracts
description: Author deterministic skills for operations that change state or invoke external tools
domain: prompt-architecture, operations
confidence: high
source: retained prompt-architecture lessons reconciled with current skill conventions
---

## Context

Use this skill when authoring or revising a skill that can mutate files, state, repositories, or
external systems. Informational reference skills need not carry operational ceremony.

## Patterns

- Start with an explicit `## SCOPE`: activation conditions, allowed targets, and exclusions.
- Provide an ordered, deterministic workflow. State required inputs, the intended side effect, and
  the exact validation after each consequential operation.
- Define STOP conditions for missing prerequisites, ambiguous scope, failed verification, and
  unavailable tools. A failed precondition must not look like success.
- Point to a current canonical implementation or workflow when a procedure depends on repository
  behavior; do not copy volatile values into prose.
- Keep one skill focused on one operational boundary. Link to related skills rather than combining
  unrelated governance, release, and documentation procedures.

## Examples

`archival-integrity` defines a verified append-before-trim transaction. `gh-aw-enlistment` limits
mutations through an explicit allowlist and ends with strict compilation.

## Anti-Patterns

- Vague verbs such as “handle,” “ensure,” or “fix” without an observable success condition
- Side effects that proceed after a failed validation
- Treating a dated incident workaround as a permanent procedure without reconciling source
- Adding action ceremony to a purely explanatory skill
