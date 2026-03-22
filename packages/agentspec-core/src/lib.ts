import { createTypeSpecLibrary } from "@typespec/compiler";

// ─── Protocol version ─────────────────────────────────────────────────────────
// Bumps only on breaking schema changes — independent of npm package semver.
export const AGENTSPEC_PROTOCOL_VERSION = "0.1.0";

// ─── State keys ───────────────────────────────────────────────────────────────

export const StateKeys = {
  /** stateMap: Model → { id, description } */
  agent: Symbol.for("@agentspec/core::agent"),
  /** stateSet: Set<Model> — used by navigateProgram filter to skip built-ins */
  agentSet: Symbol.for("@agentspec/core::agentSet"),
  /** stateMap: Model → string */
  role: Symbol.for("@agentspec/core::role"),
  /** stateMap: Model → string */
  version: Symbol.for("@agentspec/core::version"),
  /** stateMap: Model → string */
  instruction: Symbol.for("@agentspec/core::instruction"),
  /** stateMap: Model → CapabilityEntry[] */
  capabilities: Symbol.for("@agentspec/core::capabilities"),
  /** stateMap: Model → BoundaryState */
  boundary: Symbol.for("@agentspec/core::boundary"),
  /** stateMap: Model → ToolEntry[] */
  tools: Symbol.for("@agentspec/core::tools"),
  /** stateMap: Model → KnowledgeEntry[] */
  knowledge: Symbol.for("@agentspec/core::knowledge"),
  /** stateMap: Model → string (MemoryStrategy value) */
  memory: Symbol.for("@agentspec/core::memory"),
  /** stateMap: Model → string[] */
  conversationStarters: Symbol.for("@agentspec/core::conversationStarters"),
  /** stateMap: Model → string[] (InputMode values) */
  inputModes: Symbol.for("@agentspec/core::inputModes"),
  /** stateMap: Model → string[] (OutputMode values) */
  outputModes: Symbol.for("@agentspec/core::outputModes"),
  /** stateMap: Model → string (SensitivityLevel value) */
  sensitivity: Symbol.for("@agentspec/core::sensitivity"),
} as const;

// ─── Library definition ───────────────────────────────────────────────────────

const libDef = {
  name: "@agentspec/core",
  diagnostics: {
    "pii-in-decorator": {
      severity: "warning",
      messages: {
        default: "Possible PII or sensitive value detected in decorator argument. " +
          "Do not commit secrets, email addresses, phone numbers, or internal URLs. " +
          "All decorator values are serialized to plaintext artifacts in git history.",
      },
    },
    "path-traversal": {
      severity: "error",
      messages: {
        default: "Agent ID contains path traversal sequences ('..', '/', or '\\'). Manifest will not be emitted.",
      },
    },
  },
} as const;

export const $lib = createTypeSpecLibrary(libDef);
export const { reportDiagnostic } = $lib;
