# Optional before-Design-Review workflow

This project-only Copilot extension registers **squad-design-review** through the
host-injected `@github/copilot-sdk/extension` module. Nothing changes by default:
the existing `.squad/ceremonies.md` Design Review is still Markdown-driven.
An explicit user request or explicit ceremony opt-in is required; the automatic
Markdown trigger and workflow availability are not opt-in.

## Trust and installation

Review this extension's source before trusting it: extension JavaScript executes
outside agent permission prompts. From a trusted clone, copy only this extension
directory and `.github/skills/squad-design-review/SKILL.md` into the corresponding
project locations. Enable experimental workflows and reload/restart the host.
Squad init/upgrade do **not** install this optional extension. No npm installation
is needed. No global configuration, generated coordinator instructions, SDK API,
watch dispatch, or ceremony schema changes are included.

## Input

The coordinator supplies the actual charter and context for exactly two distinct,
selected named specialists in order: design researcher/reviewer, then challenger.
This first slice accepts explicit trusted input only; it does not read an assumed
`.squad` directory or resolve `stateRoot`. Resolve roster identity and effective
team context before invocation. Labels identify stages, not people.

```json
{
  "task": "Review a small read-only parser design.",
  "specialists": [
    {
      "name": "parser-designer",
      "charter": "Design parser interfaces; report risks; do not implement.",
      "context": "marker-designer-2162: input is a string; invalid input returns an error.",
      "contextMarker": "marker-designer-2162"
    },
    {
      "name": "parser-challenger",
      "charter": "Independently challenge contracts and edge cases; do not implement.",
      "context": "marker-challenger-2162: empty input must be rejected.",
      "contextMarker": "marker-challenger-2162"
    }
  ]
}
```

No extra input fields are accepted. Task is at most 2,000 characters; each
charter/context is at most 6,000; names are at most 80 ASCII letters/digits/`_`/`-`;
markers are at most 120 characters and must occur in their respective context.
Do not supply secrets. Task, context and previous reviews are untrusted reference
data; a supplied charter cannot grant additional capabilities.

## Execution and outputs

1. Design research/review covers task requirements, interfaces/contracts, risks
   and edge cases, and assigned action items.
2. Challenge receives the validated review and independently accepts or rejects.
3. Deterministic outcome synthesis combines validated evidence and design
   contracts/action items. It produces an advisory specification for later code
   synthesis, **not code changes or implementation authorization**.

Each stage uses the actual host custom-agent API with `tools: []`, with no shell,
file writes, GitHub, network, publication, delegation or workflow-launch tools.
Identity and charter are explicitly injected into its prompt. There are at most
two sequential agent calls, no schema retries, and no invented AI-credit ceiling.
Missing/null/malformed/mismatched output or explicit rejection stops before the
next stage. The runtime may fail/cancel independently; exceptions propagate.

Results contain `status: completed | rejected`, runtime `runId`, `advisoryOnly`,
validated stages and evidence. Completed results additionally contain
`requirements`, `contracts`, `risks`, and named `actionItems`. Never equate a
runtime-completed run whose result is rejected with ceremony acceptance.
Neither accepted specialist output nor a caller boolean is human approval.

## Run and verify

After reviewing/trusting only your known project source and granting deliberate
read-only permissions, use a file argument (avoids Windows JSON quoting):

```powershell
copilot --experimental workflow run squad-design-review --args @input.json --silent --output-format json
```

Read the JSON runtime envelope, including real run ID/status, **and** ceremony
result. `--result-file` alone cannot prove runtime status or identity. On launch
failure, rejection, pause, timeout, error or unknown status, stop: no automatic
fallback/replacement run. This slice does not implement scheduling, recovery,
approval prompts or publication. CLI/app support varies in this experimental API;
CLI evidence does not establish app testing.

Run the exact shipped-source deterministic tests without dependencies:

```powershell
node --check .github\extensions\squad-design-review\extension.mjs
node --check .github\extensions\squad-design-review\workflow.mjs
node --test test\squad-design-review.test.mjs
```
