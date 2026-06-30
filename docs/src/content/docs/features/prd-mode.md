# PRD Mode
**Try this to ingest an existing PRD:**
```
Read the PRD at docs/product-spec.md and summarize the key requirements
```
**Try this to turn an existing spec into next steps:**
```
Read docs/product-spec.md and suggest implementation slices or GitHub issues
```
Squad can **read an existing PRD or spec** and help you reason about it in chat. Today, this is an ingestion workflow — not a dedicated PRD authoring system or a built-in persistent work-item tracker.
---
## What works today
Squad can:
- Read a PRD you paste into chat
- Read a PRD from a file path you provide
- Summarize requirements, risks, and open questions
- Suggest implementation slices, milestones, or issue breakdowns
There is **no special CLI command or router for PRD mode** in the current implementation. The feature works because you can point Squad at an existing document and ask for analysis.
---
## How to use it
Paste the PRD directly into chat:
```
> Here's the PRD for the new onboarding flow:
>
> [paste the document]
```
Or reference a file that already exists in the repo:
```
> Read the PRD at docs/product-spec.md and call out the main requirements
```
---
## What to expect
A good PRD-ingestion session usually produces:
1. A summary of the product goals and constraints
2. A list of ambiguities or missing decisions
3. A suggested implementation breakdown you can turn into issues or milestones
4. Follow-up prompts for the lead, reviewers, or implementers
This is best thought of as **spec reading and decomposition assistance**.
---
## What it does not do today
Be careful not to over-read the feature:
- It does **not** provide a dedicated “write a PRD for me” product mode
- It does **not** maintain a first-class backlog with stored WI-1 / WI-2 style identifiers
- It does **not** persist dependency graphs or a PRD-specific board you can query later with commands like “show me the work items”
If you want durable tracking, use the decomposition output to create GitHub issues, project-board items, or other repo artifacts explicitly.
---
## Tips
- Start from a real document — a PRD, spec, RFC, or issue write-up already in the repo.
- Ask for gaps and risks, not just summaries.
- After Squad suggests slices, promote the useful ones into GitHub issues or project-board items.
- Combine with [GitHub Issues Mode](github-issues.md) when you want the decomposition turned into tracked work.
## Sample Prompts
```
read the PRD at docs/product-spec.md and summarize the key requirements
```
Ingests an existing PRD and produces a concise requirements summary.
```
read docs/product-spec.md and list open questions, risks, and assumptions
```
Finds the places where the spec is incomplete or needs decisions.
```
read docs/product-spec.md and suggest an implementation breakdown
```
Proposes slices you can convert into issues, milestones, or workstreams.
```
the PRD changed — re-read docs/product-spec.md and tell me what changed materially
```
Re-ingests the updated document and highlights changes in the requirements.
