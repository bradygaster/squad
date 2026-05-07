import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { HookPipeline } from '@bradygaster/squad-sdk/hooks';
import { validateConfig, type SquadConfig } from '@bradygaster/squad-sdk/config';
import type {
  SquadPostToolUseHookInput,
  SquadPreToolUseHookInput,
  SquadPermissionHandler,
  SquadSessionConfig,
  SquadSessionHooks,
} from '@bradygaster/squad-sdk/adapter';
import { FSStorageProvider } from '../sdk-local.js';

const storage = new FSStorageProvider();

const CONTEXT_FILES: Array<{ path: string; heading: string }> = [
  { path: join('.squad', 'guardrails.md'), heading: 'Repo Guardrails' },
  { path: join('.squad', 'codex.md'), heading: 'Codex Profile' },
  { path: join('.squad', 'shared-knowledge.md'), heading: 'Shared Knowledge' },
  { path: join('.squad', 'routing.md'), heading: 'Routing' },
  { path: join('.squad', 'identity', 'now.md'), heading: 'Current Focus' },
  { path: join('.squad', 'identity', 'wisdom.md'), heading: 'Team Wisdom' },
];

export interface BuildShellSessionConfigOptions {
  teamRoot: string;
  agentName: string;
  systemPrompt: string;
  onPermissionRequest?: SquadPermissionHandler;
  extraContext?: string;
}

function readOptionalFile(filePath: string): string | null {
  try {
    if (!storage.existsSync(filePath)) return null;
    const content = storage.readSync(filePath)?.trim();
    return content ? content : null;
  } catch {
    return null;
  }
}

async function loadRuntimeConfig(teamRoot: string): Promise<SquadConfig | null> {
  const tsConfigPath = join(teamRoot, 'squad.config.ts');
  const jsConfigPath = join(teamRoot, 'squad.config.js');
  const jsonConfigPath = join(teamRoot, 'squad.config.json');

  try {
    if (storage.existsSync(tsConfigPath)) {
      const module = await import(pathToFileURL(tsConfigPath).href);
      const config = module.default ?? module.squadConfig;
      return validateConfig(config) ? config : null;
    }

    if (storage.existsSync(jsConfigPath)) {
      const module = await import(pathToFileURL(jsConfigPath).href);
      const config = module.default ?? module.squadConfig;
      return validateConfig(config) ? config : null;
    }

    if (storage.existsSync(jsonConfigPath)) {
      const raw = storage.readSync(jsonConfigPath);
      if (!raw) return null;
      const config = JSON.parse(raw);
      return validateConfig(config) ? config : null;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveSkillDirectories(teamRoot: string): string[] | undefined {
  const candidates = [
    join(teamRoot, '.copilot', 'skills'),
    join(teamRoot, '.squad', 'skills'),
  ];

  const skillDirectories = Array.from(
    new Set(candidates.filter(candidate => storage.existsSync(candidate) && storage.isDirectorySync(candidate))),
  );

  return skillDirectories.length > 0 ? skillDirectories : undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function buildSessionHooks(
  teamRoot: string,
  agentName: string,
): Promise<SquadSessionHooks | undefined> {
  const runtimeConfig = await loadRuntimeConfig(teamRoot);
  if (!runtimeConfig?.hooks) return undefined;

  const pipeline = new HookPipeline(runtimeConfig.hooks);

  return {
    onPreToolUse: async (
      input: SquadPreToolUseHookInput,
      invocation: { sessionId: string },
    ) => {
      const result = await pipeline.runPreToolHooks({
        toolName: input.toolName,
        arguments: normalizeObject(input.toolArgs),
        agentName,
        sessionId: invocation.sessionId,
      });

      if (result.action === 'block') {
        return {
          permissionDecision: 'deny',
          permissionDecisionReason: result.reason,
        };
      }

      if (result.action === 'modify') {
        return {
          permissionDecision: 'allow',
          modifiedArgs: result.modifiedArguments,
        };
      }

      return { permissionDecision: 'allow' };
    },
    onPostToolUse: async (
      input: SquadPostToolUseHookInput,
      invocation: { sessionId: string },
    ) => {
      const result = await pipeline.runPostToolHooks({
        toolName: input.toolName,
        arguments: normalizeObject(input.toolArgs),
        result: input.toolResult,
        agentName,
        sessionId: invocation.sessionId,
      });

      if (result.result !== input.toolResult) {
        return {
          modifiedResult: result.result as typeof input.toolResult,
        };
      }

      return undefined;
    },
  };
}

function buildRuntimeContext(teamRoot: string, extraContext?: string): string {
  const sections: string[] = [
    '## Runtime Capability Contract',
    '- Use the full capability surface exposed by the current host session, including sub-agents, skills, prompts, hooks, tools, and MCP integrations when available.',
    '- Do not self-impose extra limitations beyond explicit host-enforced policy, repository guardrails, and configured Squad hooks.',
  ];

  for (const file of CONTEXT_FILES) {
    const content = readOptionalFile(join(teamRoot, file.path));
    if (content) {
      sections.push(`## ${file.heading}\n${content}`);
    }
  }

  if (extraContext?.trim()) {
    sections.push(`## Session Context\n${extraContext.trim()}`);
  }

  return sections.join('\n\n');
}

export async function buildShellSessionConfig(
  options: BuildShellSessionConfigOptions,
): Promise<SquadSessionConfig> {
  const runtimeContext = buildRuntimeContext(options.teamRoot, options.extraContext);
  const hooks = await buildSessionHooks(options.teamRoot, options.agentName);
  const skillDirectories = resolveSkillDirectories(options.teamRoot);

  return {
    streaming: true,
    systemMessage: {
      mode: 'append',
      content: `${options.systemPrompt}\n\n${runtimeContext}`,
    },
    workingDirectory: options.teamRoot,
    onPermissionRequest: options.onPermissionRequest,
    skillDirectories,
    hooks,
  };
}
