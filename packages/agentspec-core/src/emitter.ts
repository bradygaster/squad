import type { EmitContext, Model, Type } from "@typespec/compiler";
import { navigateProgram } from "@typespec/compiler";
import { StateKeys, AGENTSPEC_PROTOCOL_VERSION, reportDiagnostic } from "./lib.js";
import type { AgentManifestData } from "./types.js";

export async function $onEmit(ctx: EmitContext): Promise<void> {
  const { program } = ctx;
  const outputDir = ctx.emitterOutputDir;

  const agentSet: Set<Type> = program.stateSet(StateKeys.agentSet);
  const writeOps: Promise<void>[] = [];

  await program.host.mkdirp(outputDir);

  navigateProgram(program, {
    model: (model) => {
      // CRITICAL: filter by stateSet — built-in types like string/int32 must be skipped
      if (!agentSet.has(model)) return;

      const agentState = program.stateMap(StateKeys.agent).get(model) as
        | { id: string; description: string }
        | undefined;

      if (!agentState) return;

      // Security: reject agent IDs with path traversal sequences
      if (agentState.id.includes('..') || agentState.id.includes('/') || agentState.id.includes('\\')) {
        reportDiagnostic(program, {
          code: "path-traversal",
          target: model,
          messageId: "default",
          format: {},
        });
        return;
      }

      const manifest = buildManifest(program, model, agentState);
      const fileName = `${agentState.id}-agent-manifest.json`;
      const outputPath = `${outputDir}/${fileName}`;

      writeOps.push(program.host.writeFile(outputPath, JSON.stringify(manifest, null, 2)));
    },
  });

  await Promise.all(writeOps);
}

function buildManifest(
  program: EmitContext["program"],
  model: Model,
  agentState: { readonly id: string; readonly description: string }
): AgentManifestData {
  const role = program.stateMap(StateKeys.role).get(model) as string | undefined;
  const agentVersion = program.stateMap(StateKeys.version).get(model) as string | undefined;
  const instructions = program.stateMap(StateKeys.instruction).get(model) as string | undefined;
  const capabilities = (program.stateMap(StateKeys.capabilities).get(model) ?? []) as ReadonlyArray<{
    readonly id: string;
    readonly description?: string;
    readonly level?: string;
  }>;
  const boundary = program.stateMap(StateKeys.boundary).get(model) as
    | { readonly handles: string; readonly doesNotHandle: string }
    | undefined;
  const tools = (program.stateMap(StateKeys.tools).get(model) ?? []) as ReadonlyArray<{
    readonly id: string;
    readonly description?: string;
  }>;
  const knowledge = (program.stateMap(StateKeys.knowledge).get(model) ?? []) as ReadonlyArray<{
    readonly source: string;
    readonly description?: string;
  }>;
  const memory = (program.stateMap(StateKeys.memory).get(model) as string | undefined) ?? "none";
  const sensitivityRaw = program.stateMap(StateKeys.sensitivity).get(model) as string | undefined;
  const sensitivity = (sensitivityRaw ?? "internal") as "public" | "internal" | "restricted";
  const conversationStarters = (program.stateMap(StateKeys.conversationStarters).get(model) ?? []) as string[];
  const inputModes = (program.stateMap(StateKeys.inputModes).get(model) ?? ["text"]) as string[];
  const outputModes = (program.stateMap(StateKeys.outputModes).get(model) ?? ["text"]) as string[];

  return {
    $schema: "https://agentspec.dev/schemas/agent-manifest/0.1.json",
    specVersion: AGENTSPEC_PROTOCOL_VERSION,
    id: agentState.id,
    description: agentState.description,
    ...(role !== undefined && { role }),
    ...(agentVersion !== undefined && { agentVersion }),
    sensitivity,
    behavior: {
      ...(instructions !== undefined && { instructions }),
      capabilities: capabilities.map((c) => ({
        id: c.id,
        ...(c.description && { description: c.description }),
        ...(c.level && { level: c.level }),
      })),
      ...(boundary !== undefined && {
        boundaries: {
          handles: boundary.handles,
          doesNotHandle: boundary.doesNotHandle,
        },
      }),
    },
    runtime: {
      tools: tools.map((t) => ({ id: t.id, ...(t.description && { description: t.description }) })),
      knowledge: knowledge.map((k) => ({ source: k.source, ...(k.description && { description: k.description }) })),
      memory,
    },
    communication: {
      conversationStarters,
      inputModes,
      outputModes,
    },
  };
}
