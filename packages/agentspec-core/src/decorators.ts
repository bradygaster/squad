import type {
  DecoratorContext,
  Model,
} from "@typespec/compiler";
import { StateKeys } from "./lib.js";
import { checkForPii } from "./diagnostics.js";

/** Extract a plain string from a valueof enum param.
 * TypeSpec 0.56+ passes an EnumValue { valueKind, value: EnumMember } at runtime. */
function enumName(v: unknown): string {
  if (typeof v === "string") return v;
  const obj = v as Record<string, unknown>;
  if (obj.valueKind === "EnumValue") {
    return (obj.value as { name: string }).name;
  }
  if (typeof obj.name === "string") return obj.name;
  return String(v);
}

export const namespace = "AgentSpec";

// ─── State key types ─────────────────────────────────────────────────────────

export interface AgentState {
  readonly id: string;
  readonly description: string;
}

export interface CapabilityEntry {
  readonly id: string;
  readonly description?: string;
  readonly level?: string;
}

export interface ToolEntry {
  readonly id: string;
  readonly description?: string;
}

export interface KnowledgeEntry {
  readonly source: string;
  readonly description?: string;
}

export interface BoundaryState {
  readonly handles: string;
  readonly doesNotHandle: string;
}

// ─── Decorator implementations ───────────────────────────────────────────────

export function $agent(
  ctx: DecoratorContext,
  target: Model,
  id: string,
  description: string
): void {
  ctx.program.stateMap(StateKeys.agent).set(target, { id, description });
  ctx.program.stateSet(StateKeys.agentSet).add(target);
}

export function $role(
  ctx: DecoratorContext,
  target: Model,
  title: string
): void {
  ctx.program.stateMap(StateKeys.role).set(target, title);
}

export function $version(
  ctx: DecoratorContext,
  target: Model,
  semver: string
): void {
  ctx.program.stateMap(StateKeys.version).set(target, semver);
}

export function $instruction(
  ctx: DecoratorContext,
  target: Model,
  text: string
): void {
  checkForPii(ctx.program, text, target);
  ctx.program.stateMap(StateKeys.instruction).set(target, text);
}

export function $capability(
  ctx: DecoratorContext,
  target: Model,
  id: string,
  description?: string,
  level?: string
): void {
  const map = ctx.program.stateMap(StateKeys.capabilities);
  const existing: CapabilityEntry[] = map.get(target) ?? [];
  map.set(target, [...existing, { id, description, level }]);
}

export function $boundary(
  ctx: DecoratorContext,
  target: Model,
  handles: string,
  doesNotHandle: string
): void {
  ctx.program.stateMap(StateKeys.boundary).set(target, { handles, doesNotHandle });
}

export function $tool(
  ctx: DecoratorContext,
  target: Model,
  id: string,
  description?: string
): void {
  const map = ctx.program.stateMap(StateKeys.tools);
  const existing: ToolEntry[] = map.get(target) ?? [];
  map.set(target, [...existing, { id, description }]);
}

export function $knowledge(
  ctx: DecoratorContext,
  target: Model,
  source: string,
  description?: string
): void {
  checkForPii(ctx.program, source, target);
  if (description !== undefined) checkForPii(ctx.program, description, target);
  const map = ctx.program.stateMap(StateKeys.knowledge);
  const existing: KnowledgeEntry[] = map.get(target) ?? [];
  map.set(target, [...existing, { source, description }]);
}

export function $memory(
  ctx: DecoratorContext,
  target: Model,
  strategy: unknown
): void {
  ctx.program.stateMap(StateKeys.memory).set(target, enumName(strategy));
}

export function $conversationStarter(
  ctx: DecoratorContext,
  target: Model,
  prompt: string
): void {
  checkForPii(ctx.program, prompt, target);
  const map = ctx.program.stateMap(StateKeys.conversationStarters);
  const existing: string[] = map.get(target) ?? [];
  map.set(target, [...existing, prompt]);
}

export function $inputMode(
  ctx: DecoratorContext,
  target: Model,
  mode: unknown
): void {
  const map = ctx.program.stateMap(StateKeys.inputModes);
  const existing: string[] = map.get(target) ?? [];
  map.set(target, [...existing, enumName(mode)]);
}

export function $outputMode(
  ctx: DecoratorContext,
  target: Model,
  mode: unknown
): void {
  const map = ctx.program.stateMap(StateKeys.outputModes);
  const existing: string[] = map.get(target) ?? [];
  map.set(target, [...existing, enumName(mode)]);
}

export function $sensitivity(
  ctx: DecoratorContext,
  target: Model,
  level: unknown
): void {
  ctx.program.stateMap(StateKeys.sensitivity).set(target, enumName(level));
}
