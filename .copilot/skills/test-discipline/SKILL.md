---
name: test-discipline
description: Design assertions that prove the actual contract and fail on realistic regressions
domain: quality
confidence: high
source: current regression tests and retained quality incident lessons
---

## Context

Use this skill whenever a change affects an API, public interface, workflow contract, generated
artifact, or user-observable behavior. A passing status-only test is not evidence that the
intended artifact or contract is correct.

## Patterns

- Update tests in the same change as an API, signature, export, or public-interface change.
- Make assertions name and inspect the offending artifact, output, or configuration field—not just
  an exit code or broad success status.
- Mutation-test critical gates by changing the real source or emitted artifact and proving the
  assertion turns red.
- Exercise every caller path for a changed parser, normalizer, or helper; isolated unit coverage
  can miss the integration path that invokes it differently.
- Reproduce working-tree-only failures locally when the contract depends on index, filesystem,
  line-ending, or generated-output state.
- Keep expected inventory arrays synchronized with the files they enumerate.

## Examples

`test/gh-aw-deps-worker-workflow.test.ts` compiles a mutated workflow source and inspects the
compiled safe-output contract. `test/scripts/crlf-worktree-repair.test.ts` constructs the actual
index/blob/worktree state that the repair script must handle.

## Anti-Patterns

- Calling a test sufficient because it observes only a successful process exit
- Mutating a hand-built fixture instead of the source or artifact protected by the gate
- Testing a helper while omitting production callers
- Treating a local checkout defect as something CI alone can validate
