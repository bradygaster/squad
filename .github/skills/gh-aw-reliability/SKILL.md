---
name: gh-aw-reliability
description: Validate GitHub Agentic Workflow contracts through compiled artifacts and realistic mutations
domain: github-agentic-workflows, testing
confidence: high
source: current workflow gates and regression tests
---

## Context

Use this skill when creating or changing Squad GitHub Agentic Workflow sources, safe outputs,
authorization, or prompt inputs. Prompt prose can look correct while the compiled workflow does
nothing or authorizes the wrong action.

## Patterns

- Treat workflow source, compiled lock output, and declared safe outputs as a single contract.
- Strict-compile the workflow and inspect the emitted artifact; a zero exit code alone is not
  enough when a specific handler, input, or protected-file rule is required.
- Enumerate all call sites when changing parsing, normalization, ownership binding, or command
  routing.
- Bind authorization, labels, and mutable actions to committed provenance rather than an
  unverified working-tree claim.
- Fail closed when the compiler, required tool, or evidence needed to prove the contract is
  unavailable.
- Test a realistic mutation of the live source and prove the relevant gate fails.

## Examples

`test/gh-aw-deps-worker-workflow.test.ts` mutates a real worker source, runs the compiler, then
asserts on the compiled protected-files contract. `test/gh-aw-activate-roster-binding.test.ts`
checks roster-derived authorization behavior.

## Anti-Patterns

- Validating only prompt text or a hand-built configuration object
- Letting unavailable workflow tooling silently skip a protection gate
- Testing one parser helper while leaving an alternate command-dispatch caller untested
- Minting labels or authorization from role prose instead of committed roster evidence
