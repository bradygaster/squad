# Booster: merge continuation dispatch inputs

## Finding

A reproduced merge-continuation run accepted the agent's safe-output call but dispatched Squad without the intended workflow inputs. The raw `safe-output-items.jsonl` from `bradygaster/aspiregregator-squad-e2e` run `32316227601` contains only:

```json
{"type":"dispatch_workflow","timestamp":"2026-08-20T00:15:23.548Z"}
```

The agent artifact shows why: the agent called the generic `dispatch_workflow` safe-job as:

```json
{"command":"implement","issue_number":"5"}
```

The compiled tool schema for the generic safe-job expects `workflow_name` and a nested `inputs` object. The workflow-specific `squad` dynamic tool also existed, but the compiled prompt's safe-output tool summary listed the generic `dispatch_workflow`, so the prompt and visible schema disagreed.

## Decision

Squad should not rely on a destructive default to mask missing workflow-dispatch inputs. `workflows/squad.md` must not default `workflow_dispatch.inputs.command` to `cast`; missing dispatch inputs should be surfaced visibly.

Merge continuation should use the prompt-visible generic dispatch tool shape:

```json
{
  "workflow_name": "squad",
  "inputs": {
    "command": "implement",
    "issue_number": "{parent-epic-number}"
  }
}
```

The continuation comment should target the parent epic, not merely auto-target the merged pull request.

## Guardrail

Static gates should check both sides of this contract: action-like workflow-dispatch inputs must not have destructive defaults, and continuation dispatch payload keys must be nested under `inputs` and match the receiving workflow's declared input names.