# Showing Memory Tools in an Advanced Squad Session

Use two complementary demos: one for Copilot's visible memory tool call, and one for Squad's local governed memory CLI. The first proves the agent can call a memory tool in the live chat UI. The second gives deterministic command-line evidence you can inspect even if the live UI hides tool details.

## Memory surfaces to explain first

| Surface | What belongs there | Stage proof |
| --- | --- | --- |
| Agent history | Role-specific working context and prior activity. | Agent `history.md` or state backend inspection. |
| Decisions | Approved team decisions that should guide future work. | `.squad/decisions.md` or state backend equivalent. |
| Decision inbox | New candidate decisions before Scribe merges them. | `.squad/decisions/inbox/*.md` or `outputs/effects/decision-inbox-entry.md`. |
| Skills | Repeatable procedures agents load before acting. | `.squad/skills/*/SKILL.md`, `.copilot/skills/*/SKILL.md`, or template skills. |
| Governed memory CLI | Classified, searchable, auditable memory entries. | `memory provider`, `classify`, `write`, `search`, and `audit` output. |
| Copilot memory tools | Durable memory call in the live chat environment. | Visible `store_memory` or `vote_memory` tool card. |

Say this before the demo: "Memory is not one bucket. Some memory is procedural, some is approved team state, some is local governed memory, and some may be provider-backed only when provider status proves it."

## Demo A: visible Copilot memory tool call

### 1. Start with a before prompt

```text
Create a demo snippet for showing Squad worktree isolation.
```

Expected result: a normal answer. It may not include a full proof structure yet.

### 2. Give an explicit durable directive

```text
Going forward, remember that in this repository, every advanced demo snippet should include:
1. the exact prompt,
2. expected tool calls,
3. expected output,
4. a fallback if the live demo fails.
```

Expected tool call: `store_memory` if the memory is new, or `vote_memory` if an equivalent memory is already present.

What to expand in the UI:

```json
{
  "subject": "demo snippets",
  "fact": "Advanced demo snippets should include the exact prompt, expected tool calls, expected output, and a fallback path.",
  "citations": "User input: \"Going forward, remember that in this repository...\"",
  "scope": "repository"
}
```

The exact JSON may differ, but it should include a concise fact, user-input citation, durable reason, and `repository` scope. If it tries to store secrets, temporary preferences, raw logs, sensitive personal data, or duplicates, that is the wrong behavior.

### 3. Show the effect

Ask:

```text
Create a demo snippet for showing Squad worktree isolation.
```

Expected effect: the answer now includes exact prompt, expected tool calls, expected output, and fallback.

### 4. Show duplicate governance

Ask:

```text
Remember that every advanced demo snippet should include the exact prompt, expected tool calls, expected output, and fallback.
```

Expected behavior: if the same memory is already present in the prompt, the assistant should use `vote_memory` rather than storing a duplicate.

## Demo B: deterministic Squad memory CLI proof

This demo uses a throwaway root at `docs/advanced-squad-session/demo-root` and the local CLI.

### Commands

```powershell
cd C:\Users\tamirdresher\source\repos\squad-advanced-squad-session-slides
$env:SKIP_BUILD_BUMP='1'
npm run build -w packages/squad-sdk
npm run build -w packages/squad-cli

cd .\docs\advanced-squad-session\demo-root
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory provider --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory classify "Always include exact prompts, expected tool calls, expected output, and fallback paths in advanced demo snippets." --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory write --content "Advanced Squad demo snippets include the exact prompt, expected tool calls, expected output, and a fallback path." --class DECISION --title "Advanced demo snippet structure" --author pao --load-guidance ALWAYS --approved --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory search --query "advanced demo snippet" --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory audit --log-level info
```

### What each command proves

| Command | Proof |
| --- | --- |
| `memory provider` | Shows provider status. In the checked-in capture, the provider is local and does not fake Copilot memory persistence. |
| `memory classify` | Shows governance classification before writing: class, allowed status, destination, and load guidance. |
| `memory write` | Shows `stored=true`, class, load guidance, provider, and path. |
| `memory search` | Shows the stored entry is retrievable. |
| `memory audit` | Shows write/search activity was recorded. |

### Implementation checkpoints for a 500-level audience

When explaining the CLI proof, map each command to the implementation path:

| Implementation point | Source-backed detail |
| --- | --- |
| Initialization | `LocalMemoryStore.ensureInitialized()` creates `.squad/memory/local`, `policy-inbox`, `semantic-inbox`, `tombstones`, `config.json`, `index.json`, and `audit.jsonl`. |
| Classification | `classify()` rejects `FORBIDDEN` and `TRANSIENT` entries before provider calls. |
| Destination routing | `destinationPath()` sends `DECISION` to `decisions/inbox`, `POLICY` to `memory/policy-inbox`, and `LOCAL` to `memory/local`. |
| Index safety | `withIndexLock()` serializes read-modify-write and `writeIndex()` uses an `index.json.tmp` rename. |
| Audit safety | `audit.jsonl` records action metadata; diagnostics intentionally avoid raw memory content and raw search text. |
| Provider boundary | `provider=copilot` fails closed locally unless a real host-injected client is supplied; do not claim provider-backed memory without `provider` output proving it. |

### Effect files to show

| File | What to point at |
| --- | --- |
| `outputs/01-memory-provider-status.txt` | `defaultProvider=local`; never claim provider-backed memory unless this proves it. |
| `outputs/02-memory-classify.txt` | `class=POLICY`, `allowed=true`, destination, and load guidance. |
| `outputs/03-memory-write.txt` | `stored=true`, `class=DECISION`, `loadGuidance=ALWAYS`, and the decision inbox path. |
| `outputs/04-memory-search.txt` | Search returns the stored memory by id/title/path. |
| `outputs/05-memory-audit.txt` | Audit log records the write and search. |
| `outputs/effects/memory-index.json` | Portable copy of the local memory index containing the active entry. |
| `outputs/effects/decision-inbox-entry.md` | Portable copy of the persisted decision content. |
| `outputs/effects/memory-audit.jsonl` | Portable copy of the audit trail. |

When you regenerate the demo locally, the same effects are also visible under `demo-root/.squad/`. That directory is typically ignored by Git, so the deck checks in sanitized copies under `outputs/effects/`.

## State backends and memory placement

State backends determine where `.squad/` state such as decisions, histories, logs, and skills is persisted.

| Backend | Where state lives | Inspection path |
| --- | --- | --- |
| `local` | Regular files in `.squad/` inside the working tree. | `cat .squad/decisions.md`, inspect folders directly. |
| `orphan` | Dedicated `squad-state` branch. | `git ls-tree --name-only -r squad-state`, `git show squad-state:decisions.md`. |
| `two-layer` | Git notes for commit-scoped why plus orphan branch for durable state. | Inspect notes refs and orphan branch; use `squad notes promote` for flagged notes. |
| `external` | Global project storage with a thin `.squad/config.json` marker. | Resolve the external state directory from config. |

For the deck, use `outputs/08-state-backends-evidence.txt` as the quick fallback and the full docs at `docs/src/content/docs/features/state-backends.md` for deeper questions.

## What not to store

Do not store:

- Secrets, credentials, tokens, or private keys.
- Temporary preferences or one-off task choices.
- Raw logs, stack dumps, or unfiltered transcripts.
- Sensitive personal data.
- Duplicate facts that should be handled with `vote_memory`.

Do store durable team conventions, approved decisions, reusable demo requirements, and cited facts with a clear scope and future use.

## Talk track

Say this plainly:

> "Memory is not magic. We prove it by showing provider status, classification, the write path, the search result, the audit record, and the file that changed. If any link is missing, we label it as representative rather than claiming a real memory write."
