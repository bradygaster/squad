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

function extractSandcastleArgs(baseArgs: string[]): string[] {
  const args: string[] = [];

  for (let i = 0; i < baseArgs.length; i += 1) {
    const token = baseArgs[i];
    if (!token) continue;

    if (token === '-p' || token === '--prompt') {
      const value = baseArgs[i + 1];
      if (value) {
        args.push('--prompt', value);
        i += 1;
      }
      continue;
    }

    if (token === '--prompt-file') {
      const value = baseArgs[i + 1];
      if (value) {
        args.push('--prompt-file', value);
        i += 1;
      }
      continue;
    }

    if (token.startsWith('--prompt=')) {
      const value = token.slice('--prompt='.length);
      if (value) args.push('--prompt', value);
      continue;
    }

    if (token.startsWith('--prompt-file=')) {
      const value = token.slice('--prompt-file='.length);
      if (value) args.push('--prompt-file', value);
      continue;
    }
  }

  return args;
}

export function buildSandboxCommand(options: SandboxCommandOptions): { cmd: string; args: string[] } {
  const sandbox = options.sandbox ?? 'copilot';
  const permissionProfile = options.permissionProfile ?? 'yolo';

  if (sandbox === 'sandcastle') {
    const args = [
      ...splitFlags(options.sandboxFlags),
      ...extractSandcastleArgs(options.baseArgs),
    ];
    return { cmd: 'sandcastle', args };
  }

  const withMcp = withAdditionalMcpConfig('copilot', options.baseArgs, options.teamRoot);
  return { cmd: 'copilot', args: applyPermissionProfileArgs(withMcp, permissionProfile) };
}
