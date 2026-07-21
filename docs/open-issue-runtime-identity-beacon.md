# Runtime identity beacon for coordinator canary cases 3 & 4

Date: 2026-07-21
Related: PR #1517, `docs/canary-identity-matrix.md`, issue #1461

## Problem

The current dual canary can only report on the coordinator prompt when that prompt is visible to the model. If both canaries are absent, the in-prompt observation is identical for two different situations:

1. the Squad coordinator custom agent was selected, but its `squad.agent.md` payload failed to inject entirely; and
2. the running agent is a proven non-Squad agent that should not receive the Squad coordinator payload.

A prompt-contained check cannot classify the first situation because the instructions that would perform the check are absent too.

## Two-state reclassification recap

The dual canary should be treated as a two-state payload-integrity detector within an independently-known Squad coordinator session:

- HEAD present + EOF present: coordinator payload loaded fully.
- HEAD present + EOF absent: coordinator payload loaded but was truncated; halt.

`HEAD absent + EOF absent` is externally unobservable from inside the missing payload. It is not a success state and cannot prove safe non-Squad discrimination.

## Owning runtime surface

Repository inspection shows Squad installs `.github/agents/squad.agent.md` and points users or wrapper processes at `copilot --agent squad`, but this repo does not own the custom-agent resolver or the file-read / prompt-assembly path.

Observed boundary:

- `squad init` installs/advises the custom-agent path and invocation (`packages/squad-cli/src/cli/core/templates.ts:31-36`, `packages/squad-cli/src/cli/core/init.ts:142-155`, `packages/squad-cli/src/cli/core/init.ts:515-518`).
- `squad upgrade` refreshes `.github/agents/squad.agent.md` from the template (`packages/squad-cli/src/cli/core/upgrade.ts:1048`, `packages/squad-cli/src/cli/core/upgrade.ts:1102-1108`, `packages/squad-cli/src/cli/core/upgrade.ts:1124-1137`).
- `packages/squad-cli` passes through `copilotFlags`, `agentCmd`, or `--agent <config.agent>` to the `copilot` process, but does not read/assemble `.github/agents/*.agent.md` into model messages (`packages/squad-cli/src/cli/commands/watch/agent-spawn.ts:95-140`, `packages/squad-cli/src/cli/commands/loop.ts:136-148`, `packages/squad-cli/src/cli/commands/watch/index.ts:608-615`, `packages/squad-cli/src/cli/commands/copilot-bridge.ts:72-84`).
- The SDK wrapper also confirms that the Copilot CLI `--agent` flag is the path that reads on-disk agent definitions (`src/Squad.Agents.AI/SquadAgent.cs:249-282`, `src/Squad.Agents.AI/SquadAgentOptions.cs:87-112`, `src/Squad.Agents.AI/README.md:155-165`).

Therefore the reliable identity beacon must be a GitHub Copilot CLI host capability captured at the **agent-selection step** and persisted in host/session metadata before any `.agent.md` file access. Squad-provided MCP state tools cannot close this gap; if the coordinator payload is wholly absent, no instruction inside that absent payload can tell the model to call any `squad_state_*` identity tool.

## Host-owned pre-ingestion state machine

The host must evaluate this state machine outside the prompt. The state machine has ordered selection/read/attach events, then two orthogonal integrity verdicts: transport integrity for enforcement and release integrity for reporting/provenance.

### Ordered fields

1. `selected_agent_id`
   - Immutable selection record created at agent-selection time **before any file access**.
   - Carries raw host identity and registry keys, for example:
     - `custom_agent.name = "squad"`
     - `custom_agent.file = ".github/agents/squad.agent.md"`
     - `custom_agent.role = "root-coordinator"`
     - `agent_version = "<resolved Squad agent/template version>"`
     - `client_id = "<host client identifier>"`
     - `client_version = "<host client version>"`
   - Must include host timestamp or monotonic order (for example, `selected_at` / `selection_order`).

2. `payload_read_status`
   - Separate READ-dimension transition recorded by the host **after** the `.agent.md` read attempt.
   - Enum: `LOADED`, `TRUNCATED`, `EMPTY`, `ABSENT`.
   - `TRUNCATED` is reserved for a partial **file read** proven by expected/actual byte counts, expected EOF evidence, or equivalent host read evidence.
   - A completed file read whose prompt attachment is clipped is `payload_read_status=LOADED` plus `prompt_attach_status=ATTACHED_PARTIAL`; do not encode attach clipping as read truncation.
   - Must record `source_sha_after_read` when bytes were read.

3. `prompt_attach_status`
   - Records what actually reached the assembled prompt.
   - Enum: `ATTACHED_FULL`, `ATTACHED_PARTIAL`, `NOT_ATTACHED`.
   - Must record `attached_sha` when bytes were attached, computed by the host over the **assembled artifact**.

### Transport integrity (enforcement axis)

`transport_integrity ∈ { INTACT, PARTIAL, UNKNOWN }`

This axis detects read/assembly loss and is enforced fail-closed. It compares `source_sha_after_read` to `attached_sha` **and** requires independent source completeness proof. Hash equality alone is insufficient: a partial host read can match an equally partial attachment.

- `INTACT`: source proven fully read by EOF/boundary evidence or expected byte length; `attached_sha == source_sha_after_read`; attached artifact contains required boundaries (HEAD and EOF canaries).
- `PARTIAL`: read or assembly truncation detected, including missing EOF/boundary, short byte length, partial file read, or attach clipping.
- `UNKNOWN`: insufficient evidence to prove transport integrity.

Policy: `PARTIAL` => `HALT_CORRUPT` (proven read/assembly loss). `UNKNOWN` => `UNKNOWN_HALT` (insufficient evidence; halts for safety but is not classified as proven corruption). Both stop the session, but the distinction is required for telemetry so missing evidence does not inflate the corruption count.

### Release integrity (reporting/provenance axis)

`release_integrity ∈ { VERIFIED, MISMATCH, UNREGISTERED }`

This axis compares `source_sha_after_read` with an optional trusted, preferably signed or release-bound manifest keyed by (`agent_version`, `client_id`, `client_version`). The expected SHA provenance rule applies here only: expected release SHAs must come from the trusted host-side manifest and must NEVER be derived from attached or assembled bytes.

- `VERIFIED`: `source_sha_after_read` matches the trusted manifest entry.
- `MISMATCH`: `source_sha_after_read` differs from the trusted manifest entry for that version (wrong or mutated release).
- `UNREGISTERED`: no manifest entry exists, the version key is unknown, the artifact is user-local, or the Squad artifact is newly updated/unpublished.

Policy: no manifest entry or unknown version key => `UNREGISTERED`, never `MISMATCH`, and never accept `attached_sha` as fallback. `UNREGISTERED` is surfaced distinctly and does **not** by itself halt a healthy session. Only `MISMATCH` escalates/halts as a proven wrong release.

### Frozen transition invariants

1. `selected_agent_id` is emitted before `payload_read_status`.
2. `payload_read_status` is emitted before `prompt_attach_status`.
3. `transport_integrity` is computed by the host on source/read/assembled artifacts, outside the prompt, using `source_sha_after_read`, `attached_sha`, boundary markers, and independent source completeness proof.
4. `release_integrity` is computed separately from a trusted manifest keyed by (`agent_version`, `client_id`, `client_version`) and `source_sha_after_read`.
5. Any missing event in the ordered sequence resolves to `UNKNOWN`; absent evidence never resolves to success.
6. `selected + missing` must never collapse into `not selected`.

### Decision function

Evaluated outside the prompt:

| Host state | Outcome |
|---|---|
| `selected_agent_id` set + `transport_integrity=INTACT` + `release_integrity=VERIFIED` | `LOADED` |
| `selected_agent_id` set + `transport_integrity=INTACT` + `release_integrity=UNREGISTERED` | `LOADED_WITH_REPORT`; unregistered-local / unregistered-release report; MUST NOT halt |
| `selected_agent_id` set + `transport_integrity=INTACT` + `release_integrity=MISMATCH` | `HALT_RELEASE_MISMATCH`; proven wrong or mutated release |
| `selected_agent_id` set + `transport_integrity=PARTIAL` | `HALT_CORRUPT`; proven read/assembly transport loss dominates release status |
| `selected_agent_id` set + `transport_integrity=UNKNOWN` | `UNKNOWN_HALT`; insufficient transport evidence dominates release status and is not proven corruption |
| `selected_agent_id` absent because a Squad coordinator was independently proven not selected | `SKIP`; safe non-Squad classification is based on host selection state, not canary absence |
| Any missing event in the expected ordered sequence | `UNKNOWN_HALT`; absent evidence never resolves to success and is not proven corruption |

## Acceptance tests

Each fixture must assert the final outcome **and** the raw ordered event sequence: selection record -> read result -> attach result -> `transport_integrity` -> `release_integrity`. Each fixture records both verdict axes and artifact SHAs when available.

| Fixture | Setup | Required ordered evidence | Expected outcome |
|---|---|---|---|
| 1. Full payload, registered | Select `--agent squad`; full `squad.agent.md` read and attached; manifest entry exists | `selected_agent_id` set -> `payload_read_status=LOADED`, `source_sha_after_read` -> `prompt_attach_status=ATTACHED_FULL`, `attached_sha` -> `transport_integrity=INTACT` -> `release_integrity=VERIFIED` | `LOADED` |
| 2. Head-only / oversized-prompt clip | Select `--agent squad`; source may read fully, but assembled prompt loses tail/EOF | ordered events emitted; `prompt_attach_status=ATTACHED_PARTIAL` or missing boundary; `transport_integrity=PARTIAL`; release verdict still recorded if possible | `HALT_CORRUPT` |
| 3. Missing/empty Squad payload | Select `--agent squad`; suppress, empty, or fail reading coordinator payload | `selected_agent_id` set -> `payload_read_status=EMPTY` or `ABSENT` -> `prompt_attach_status=NOT_ATTACHED` -> `transport_integrity=UNKNOWN`; release usually `UNREGISTERED`/unavailable | `UNKNOWN_HALT` |
| 4. Proven non-Squad | Host proves Squad coordinator was not selected | Squad `selected_agent_id` absent; non-Squad/default selection evidence emitted by host | `SKIP` |
| 5. WRONG-VERSION | Full source read and full attachment, but source SHA differs from trusted manifest for (`agent_version`, `client_id`, `client_version`) | `transport_integrity=INTACT`; `release_integrity=MISMATCH`; source/attached SHA recorded | `HALT_RELEASE_MISMATCH` |
| 6. LEGITIMATE UNREGISTERED-LOCAL | Healthy user-local custom agent or freshly-updated/unpublished Squad artifact with no manifest entry | `transport_integrity=INTACT`; `release_integrity=UNREGISTERED`; source/attached SHA recorded | `LOADED_WITH_REPORT`; MUST NOT false-halt |

Fixtures 5 and 6 exist to measure whether safety halts protect users without an unacceptable healthy-session false-halt rate. Telemetry must keep `HALT_CORRUPT` separate from `UNKNOWN_HALT` so missing evidence is not counted as proven corruption. Fixture 6 is especially important: registry staleness or local customization must not be converted into a release `MISMATCH` or transport failure.

## Caveman telemetry join protocol (not started)

When Caveman joins, pin the static identity **before execution**:

- artifact SHA: `525a919f2b8c3c2586dcb2862de3cff63c85128cd63702e96c83be83d0ed631f`
- client, client version, model, tokenizer
- raw usage/cache objects
- fresh-vs-continued condition

Run one fresh session and one continued session. Join telemetry only on the exact static identity above. Caveman remains **NOT-STARTED**.

## In-Squad vs upstream split

**In Squad's control:** install and upgrade the custom-agent file, pass/advise `--agent squad`, keep canary payload-integrity wording accurate, write/load `.mcp.json`, document Cases 1-4, and consume the future host state machine when exposed.

**Upstream Copilot CLI capability required:** the host-owned state machine above, evaluated before and outside prompt ingestion, plus the optional trusted/signed release manifest keyed by (`agent_version`, `client_id`, `client_version`). The `.agent.md` file must not be able to overwrite, suppress, or fabricate `selected_agent_id`, `payload_read_status`, `prompt_attach_status`, `source_sha_after_read`, `attached_sha`, `transport_integrity`, or `release_integrity`.
