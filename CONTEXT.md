# Squad Runtime Context

Shared language for how Squad chooses and configures execution environments for agent work.

## Language

**Sandbox Provider**:
The execution environment family used for an agent session, with a stable behavior and security model.
_Avoid_: runner, shell mode, host mode

**Sandcastle Sandbox**:
A Sandbox Provider backed by Sandcastle for isolated execution, selected as a first-class option rather than an ad hoc flag bundle.
_Avoid_: custom flags, one-off command override

**Sandbox Selector**:
A dedicated user-facing option for choosing a Sandbox Provider, independent from raw Copilot flag passthrough.
_Avoid_: hidden flag parsing, implicit provider inference

**Permission Profile**:
A separate user-facing option that controls tool-consent behavior for a session, independent from Sandbox Provider selection.
_Avoid_: sandbox-implies-permissions, bundled execution mode

**Sandbox Availability Policy**:
The rule applied when a selected Sandbox Provider cannot be used. Default policy is fail fast with a clear error.
_Avoid_: silent fallback, best-effort provider swap

**Sandbox Coverage**:
The requirement that Sandbox Selector behavior applies uniformly to every Squad-managed Copilot spawn path.
_Avoid_: partial command support, path-specific semantics

**Sandbox Provider Enum**:
The canonical allowed Sandbox Provider values are `copilot` and `sandcastle`.
_Avoid_: free-form provider strings, implicit provider aliases

**Sandbox Precedence**:
When multiple sources specify sandbox, resolution order is CLI flag, then config file, then environment variable, then default `copilot`.
_Avoid_: source-order ambiguity, hidden precedence rules

**Sandcastle Profile Scope**:
Version 1 exposes Sandcastle as a single default profile. Provider-internal engine selection is deferred to a later version.
_Avoid_: multi-axis v1 configuration, premature engine-specific UX

**Sandbox Override Conflict Policy**:
Selecting a sandbox and specifying a custom agent command override at the same time is invalid by default and fails fast.
_Avoid_: override-bypasses-sandbox, silent command precedence

**Permission Profile Enum**:
The canonical allowed Permission Profile values are `interactive`, `yolo`, and `autopilot`.
_Avoid_: free-form approval flags, implicit permission modes

**Execution Surface Flags**:
The canonical CLI options are `--sandbox <copilot|sandcastle>` and `--permission-profile <interactive|yolo|autopilot>`.
_Avoid_: command-specific naming drift, hidden aliases

**Execution Surface Environment Variables**:
The canonical environment variable options are `SQUAD_SANDBOX` and `SQUAD_PERMISSION_PROFILE`.
_Avoid_: undocumented env aliases, mismatched naming with CLI flags

**Execution Error Codes**:
Fail-fast execution configuration errors use stable machine-readable codes: `SQUAD_SANDBOX_UNAVAILABLE`, `SQUAD_SANDBOX_OVERRIDE_CONFLICT`, `SQUAD_SANDBOX_INVALID_VALUE`, and `SQUAD_PERMISSION_PROFILE_INVALID_VALUE`.
_Avoid_: message-only error contracts, unstable code names

**Execution Telemetry Dimensions**:
Each Squad-managed spawn records low-cardinality execution config fields: `sandbox_provider`, `permission_profile`, `source_of_truth`, and `conflict_blocked`.
_Avoid_: high-cardinality payloads, opaque precedence telemetry
