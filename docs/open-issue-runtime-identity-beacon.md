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

Therefore the reliable identity beacon must be a GitHub Copilot CLI host capability captured at the **agent-selection step** and persisted in host/session metadata before any `.agent.md` file access. An identity value derived only after successfully reading `.github/agents/squad.agent.md` is not sufficient: it disappears in exactly the empty/missing-payload case that must become `UNKNOWN`/halt.

Squad-provided MCP state tools cannot close this gap either; if the coordinator payload is wholly absent, no instruction inside that absent payload can tell the model to call any `squad_state_*` identity tool.

## Host-owned pre-ingestion state machine

The host must evaluate this state machine outside the prompt. A single pre-read field is insufficient; the state machine needs three distinct fields plus an attach-integrity result computed on the assembled artifact.

### Fields

1. `selected_agent_id`
   - Immutable selection record created at agent-selection time **before any file access**.
   - Carries raw host identity, for example:
     - `custom_agent.name = "squad"`
     - `custom_agent.file = ".github/agents/squad.agent.md"`
     - `custom_agent.role = "root-coordinator"`
     - `agent_version = "<resolved Squad agent/template version>"`
     - `client_id = "<host client identifier>"`
     - `client_version = "<host client version>"`
   - Must include host timestamp or monotonic order (for example, `selected_at` / `selection_order`).
   - `agent_version`, `client_id`, and `client_version` key the trusted expected-SHA registry used by attach integrity.

2. `payload_read_status`
   - Separate READ-dimension transition recorded by the host **after** the `.agent.md` read attempt.
   - Enum committed here: `LOADED`, `TRUNCATED`, `EMPTY`, `ABSENT`.
   - `TRUNCATED` is reserved for a partial **file read** proven by expected/actual byte counts, expected EOF evidence, or equivalent host read evidence.
   - A completed file read whose prompt attachment is clipped is `payload_read_status=LOADED` plus `prompt_attach_status=ATTACHED_PARTIAL`; do not encode attach clipping as read truncation.
   - Important: `LOADED` only proves the source file was read; it does **not** prove the full payload reached the assembled prompt.
   - Must include host timestamp or monotonic order.

3. `prompt_attach_status`
   - Records what actually reached the assembled prompt.
   - Attach enum: `ATTACHED_FULL`, `ATTACHED_PARTIAL`, `NOT_ATTACHED`.
   - Integrity subfield: `attach_integrity` enum `INTACT`, `BOUNDARY_MISSING`, `PARTIAL`, `SHA_MISMATCH`.
   - `expected_sha` MUST come from a trusted host-side registry keyed by (`agent_version`, `client_id`, `client_version`); it must NEVER be derived from the attached or assembled bytes.
   - `attached_sha` is computed by the host over the **assembled artifact**.
   - `INTACT` means both boundary markers (HEAD canary and EOF canary) are present in the assembled artifact **and** `attached_sha == expected_sha` from trusted provenance (for the current Squad artifact, the expected SHA is `525a919f2b8c3c2586dcb2862de3cff63c85128cd63702e96c83be83d0ed631f` when that registry key applies).
   - `BOUNDARY_MISSING` / `PARTIAL` means the host read may have succeeded but prompt assembly dropped a boundary or tail; this is attach-dimension clipping and fails closed even when `payload_read_status=LOADED`.
   - `SHA_MISMATCH` means `attached_sha != expected_sha`; the wrong or mutated payload was attached, so this is a HALT.
   - Must include host timestamp or monotonic order, `attached_sha` when available, and the trusted `expected_sha` registry key/provenance.

### Frozen transition invariants

1. `selected_agent_id` is emitted before `payload_read_status`.
2. `payload_read_status` is emitted before `prompt_attach_status` / `attach_integrity`.
3. `attach_integrity` is computed by the host on the **assembled artifact**, outside the prompt, using both `attached_sha` and the boundary-marker check; `expected_sha` comes only from the trusted host-side registry keyed by (`agent_version`, `client_id`, `client_version`).
4. Any missing event in the ordered sequence resolves to `UNKNOWN`; absent evidence never resolves to success.
5. `selected + missing` must never collapse into `not selected`.

### Decision function

Evaluated outside the prompt. This mapping fails closed: absent or partial evidence never resolves to success.

| Host state | Outcome |
|---|---|
| `selected_agent_id` set + `payload_read_status=LOADED` + `prompt_attach_status=ATTACHED_FULL` + `attach_integrity=INTACT` | `LOADED`; this is the sole success state for selected Squad |
| `selected_agent_id` set + `payload_read_status=EMPTY` or `payload_read_status=ABSENT` | `UNKNOWN`/halt; empty or absent read evidence is not success |
| `selected_agent_id` set + `prompt_attach_status=ATTACHED_PARTIAL` or `prompt_attach_status=NOT_ATTACHED` | `UNKNOWN`/halt; partial or absent attach evidence is not success |
| `selected_agent_id` set + `payload_read_status=TRUNCATED` | `HALT`; partial file read proven in the READ dimension |
| `selected_agent_id` set + `attach_integrity=SHA_MISMATCH` | `HALT`; wrong or mutated payload attached |
| `selected_agent_id` set + `attach_integrity=BOUNDARY_MISSING` or `attach_integrity=PARTIAL` | `UNKNOWN`/halt unless the host can additionally prove a read-dimension `TRUNCATED`; attach clipping is not success |
| `selected_agent_id` absent because a Squad coordinator was independently proven not selected | `SKIP`; safe non-Squad classification is based on host selection state, not canary absence |
| Any missing event in the expected ordered sequence | `UNKNOWN`; absent evidence never resolves to success |

## Four-fixture acceptance test

Each fixture must assert the final outcome **and** the raw ordered event sequence: selection record -> read result -> attach status/integrity. Each fixture must include the attached-artifact SHA when available and explicitly preserve `UNKNOWN` for absent or partial evidence. A separate read-truncation fixture may assert `payload_read_status=TRUNCATED -> HALT`, but attach clipping must remain `LOADED + ATTACHED_PARTIAL`, not read `TRUNCATED`.

| Fixture | Setup | Required ordered event sequence | Expected outcome |
|---|---|---|---|
| A. Full Squad payload | Select `--agent squad`; inject full `squad.agent.md` with HEAD and EOF canaries | `selected_agent_id` set with `agent_version`, `client_id`, `client_version` -> `payload_read_status=LOADED` -> `prompt_attach_status=ATTACHED_FULL`, `attach_integrity=INTACT`, `attached_sha` equals trusted-registry `expected_sha` | `LOADED`; normal Squad behavior may proceed |
| B. Head-only / assembly-clipped Squad payload | Select `--agent squad`; source read succeeds, but assembled prompt contains HEAD canary without EOF canary | `selected_agent_id` set with registry keys -> `payload_read_status=LOADED` -> `prompt_attach_status=ATTACHED_PARTIAL`, `attach_integrity=BOUNDARY_MISSING` or `PARTIAL`, `attached_sha` recorded when available | `UNKNOWN`/halt; fail closed because attach evidence is partial |
| C. Missing/empty Squad payload | Select `--agent squad`; suppress, empty, or fail reading the coordinator payload entirely | `selected_agent_id` set -> `payload_read_status=EMPTY` or `payload_read_status=ABSENT` -> `prompt_attach_status=NOT_ATTACHED`; no attached SHA | `UNKNOWN`/halt; no silent continuation |
| D. Proven non-Squad | Select a host-proven non-Squad/default agent with no Squad coordinator payload | Squad `selected_agent_id` absent; non-Squad/default selection evidence emitted by host; no Squad coordinator payload attached | `SKIP`; safe non-Squad classification is based on host beacon, not canary absence |

## In-Squad vs upstream split

**In Squad's control:** install and upgrade the custom-agent file, pass/advise `--agent squad`, keep canary payload-integrity wording accurate, write/load `.mcp.json`, document Cases 1-4, and consume the future host state machine when exposed.

**Upstream Copilot CLI capability required:** the host-owned state machine above, evaluated before and outside prompt ingestion, plus the trusted expected-SHA registry keyed by (`agent_version`, `client_id`, `client_version`). The `.agent.md` file must not be able to overwrite, suppress, or fabricate `selected_agent_id`, `payload_read_status`, `prompt_attach_status`, `attach_integrity`, `expected_sha`, or `attached_sha`.
