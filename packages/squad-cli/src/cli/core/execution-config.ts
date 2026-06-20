/**
 * Execution config resolver for Squad-managed agent spawns.
 *
 * Provides first-class sandbox + permission-profile resolution with precedence:
 * CLI > config > env > defaults.
 */

import { execFileSync } from 'node:child_process';

export type SandboxProvider = 'copilot' | 'sandcastle';
export type PermissionProfile = 'interactive' | 'yolo' | 'autopilot';
export type ExecutionSource = 'cli' | 'config' | 'env' | 'default';

export type ExecutionErrorCode =
  | 'SQUAD_SANDBOX_UNAVAILABLE'
  | 'SQUAD_SANDBOX_OVERRIDE_CONFLICT'
  | 'SQUAD_SANDBOX_INVALID_VALUE'
  | 'SQUAD_PERMISSION_PROFILE_INVALID_VALUE';

export class ExecutionConfigError extends Error {
  readonly code: ExecutionErrorCode;

  constructor(code: ExecutionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ResolvedExecutionConfig {
  sandbox: SandboxProvider;
  permissionProfile: PermissionProfile;
  sandboxSource: ExecutionSource;
  permissionProfileSource: ExecutionSource;
  sourceOfTruth: ExecutionSource;
  conflictBlocked: boolean;
}

export interface ResolveExecutionConfigInput {
  cliSandbox?: string;
  configSandbox?: string;
  envSandbox?: string;
  cliPermissionProfile?: string;
  configPermissionProfile?: string;
  envPermissionProfile?: string;
  agentCmd?: string;
}

const DEFAULT_SANDBOX: SandboxProvider = 'copilot';
const DEFAULT_PERMISSION_PROFILE: PermissionProfile = 'yolo';

const SOURCE_ORDER: ExecutionSource[] = ['cli', 'config', 'env', 'default'];

function resolveByPrecedence(
  cliValue: string | undefined,
  configValue: string | undefined,
  envValue: string | undefined,
): { value: string | undefined; source: ExecutionSource } {
  if (cliValue !== undefined) return { value: cliValue, source: 'cli' };
  if (configValue !== undefined) return { value: configValue, source: 'config' };
  if (envValue !== undefined) return { value: envValue, source: 'env' };
  return { value: undefined, source: 'default' };
}

function normalizeSandbox(value: string | undefined): SandboxProvider {
  const lower = (value ?? DEFAULT_SANDBOX).toLowerCase();
  if (lower === 'copilot' || lower === 'sandcastle') {
    return lower;
  }
  throw new ExecutionConfigError(
    'SQUAD_SANDBOX_INVALID_VALUE',
    `Invalid sandbox value "${value}". Valid values: copilot, sandcastle.`,
  );
}

function normalizePermissionProfile(value: string | undefined): PermissionProfile {
  const lower = (value ?? DEFAULT_PERMISSION_PROFILE).toLowerCase();
  if (lower === 'interactive' || lower === 'yolo' || lower === 'autopilot') {
    return lower;
  }
  throw new ExecutionConfigError(
    'SQUAD_PERMISSION_PROFILE_INVALID_VALUE',
    `Invalid permission profile value "${value}". Valid values: interactive, yolo, autopilot.`,
  );
}

function isSandcastleAvailable(): boolean {
  try {
    execFileSync('sandcastle', ['--help'], {
      stdio: 'ignore',
      timeout: 3000,
      shell: process.platform === 'win32',
    });
    return true;
  } catch {
    return false;
  }
}

function pickSourceOfTruth(a: ExecutionSource, b: ExecutionSource): ExecutionSource {
  const rankA = SOURCE_ORDER.indexOf(a);
  const rankB = SOURCE_ORDER.indexOf(b);
  return rankA <= rankB ? a : b;
}

export function resolveExecutionConfig(input: ResolveExecutionConfigInput): ResolvedExecutionConfig {
  const sandboxResolution = resolveByPrecedence(input.cliSandbox, input.configSandbox, input.envSandbox);
  const profileResolution = resolveByPrecedence(
    input.cliPermissionProfile,
    input.configPermissionProfile,
    input.envPermissionProfile,
  );

  const sandbox = normalizeSandbox(sandboxResolution.value);
  const permissionProfile = normalizePermissionProfile(profileResolution.value);

  const explicitSandbox = sandboxResolution.source !== 'default';
  if (explicitSandbox && input.agentCmd) {
    throw new ExecutionConfigError(
      'SQUAD_SANDBOX_OVERRIDE_CONFLICT',
      'Sandbox selection conflicts with --agent-cmd. Remove one or the other.',
    );
  }

  if (sandbox === 'sandcastle' && !isSandcastleAvailable()) {
    throw new ExecutionConfigError(
      'SQUAD_SANDBOX_UNAVAILABLE',
      'Sandcastle sandbox is selected but unavailable. Install/configure sandcastle or use --sandbox copilot.',
    );
  }

  return {
    sandbox,
    permissionProfile,
    sandboxSource: sandboxResolution.source,
    permissionProfileSource: profileResolution.source,
    sourceOfTruth: pickSourceOfTruth(sandboxResolution.source, profileResolution.source),
    conflictBlocked: false,
  };
}

/**
 * Normalize permission flags so profile is deterministic even with user copilot flags.
 */
export function applyPermissionProfileArgs(args: string[], profile: PermissionProfile): string[] {
  const stripped = args.filter((a) => a !== '--yolo' && a !== '--autopilot');
  if (profile === 'interactive') return stripped;
  if (profile === 'yolo') return [...stripped, '--yolo'];
  return [...stripped, '--yolo', '--autopilot'];
}
