import { withAdditionalMcpConfig } from '../core/copilot-invocation.js';
import {
  applyPermissionProfileArgs,
  type PermissionProfile,
  type SandboxProvider,
} from '../core/execution-config.js';

function splitFlags(flags: string | undefined): string[] {
  if (!flags) return [];
  return flags.trim().split(/\s+/).filter(Boolean);
}

export interface SandboxCommandOptions {
  sandbox?: SandboxProvider;
  permissionProfile?: PermissionProfile;
  teamRoot?: string;
  baseArgs: string[];
  sandboxFlags?: string;
}

export function buildSandboxCommand(options: SandboxCommandOptions): { cmd: string; args: string[] } {
  const sandbox = options.sandbox ?? 'copilot';
  const permissionProfile = options.permissionProfile ?? 'yolo';

  if (sandbox === 'sandcastle') {
    const args = [...splitFlags(options.sandboxFlags), ...options.baseArgs];
    return { cmd: 'sandcastle', args: applyPermissionProfileArgs(args, permissionProfile) };
  }

  const withMcp = withAdditionalMcpConfig('copilot', options.baseArgs, options.teamRoot);
  return { cmd: 'copilot', args: applyPermissionProfileArgs(withMcp, permissionProfile) };
}
