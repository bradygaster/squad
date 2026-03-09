/**
 * Skill Script Loader
 *
 * Runtime loader for executable skill handlers from backend skill directories.
 * Backend skills in `.squad/skills/{name}/scripts/` contain `.js` handler files
 * that replace built-in tool handlers in ToolRegistry.
 *
 * Supports:
 * - Loading concern-specific handler scripts (tasks, decisions, memories, logging)
 * - Dynamic import() of handler scripts with lifecycle hooks
 * - Path containment validation for security
 * - Partial implementations (missing handlers are silently skipped)
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  Concern,
  ConcernMap,
  LoadResult,
  SkillHandler,
  HandlerLifecycle,
} from './handler-types.js';
import type { SquadTool, SquadToolHandler, SquadToolInvocation } from '../adapter/types.js';

// --- Concern → Tool Name Mapping ---

/**
 * Maps concerns to their corresponding Squad tool names.
 * Tool names follow the convention: squad_{operation}
 */
const CONCERN_TOOL_MAP: Record<Concern, string[]> = {
  tasks: ['squad_create_issue', 'squad_update_issue', 'squad_list_issues', 'squad_close_issue'],
  decisions: ['squad_create_decision', 'squad_list_decisions', 'squad_merge_decision'],
  memories: ['squad_create_memory', 'squad_list_memories'],
  logging: ['squad_create_log', 'squad_list_logs'],
};

// --- Helpers ---

/**
 * Normalize path separators for consistent module cache keys on Windows.
 * pathToFileURL() can create different URLs from different path separator styles,
 * leading to duplicate module instances. Always normalize before conversion.
 */
function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return pathToFileURL(normalized).href;
}

/**
 * Wrap a SkillHandler (args, config) to SquadToolHandler (args, invocation).
 * Bridges the skill script signature to the Squad tool handler signature.
 */
function wrapSkillHandler<T>(
  skillHandler: SkillHandler<T>,
  backendConfig: Record<string, unknown>,
): SquadToolHandler<T> {
  return (args: T, _invocation: SquadToolInvocation) => {
    return skillHandler(args, backendConfig);
  };
}

/**
 * Resolve a skill path relative to project/team roots with containment validation.
 *
 * Algorithm:
 * 1. Absolute paths used as-is
 * 2. With teamRoot: strip leading `.squad/` prefix to avoid double-nesting, resolve relative to teamRoot
 * 3. Without teamRoot: resolve relative to projectRoot
 * 4. Path containment check: final path must be within projectRoot or teamRoot
 * 5. Reject paths with `..` segments that escape the boundary (throw Error)
 *
 * @param skillPath - Path from skill configuration (absolute or relative)
 * @param projectRoot - Project root directory (absolute)
 * @param teamRoot - Team root directory (absolute, optional)
 * @returns Resolved absolute path
 * @throws Error if path escapes containment boundaries
 */
export function resolveSkillPath(
  skillPath: string,
  projectRoot: string,
  teamRoot?: string,
): string {
  // 1. Absolute paths used as-is
  if (path.isAbsolute(skillPath)) {
    const resolved = path.resolve(skillPath);
    // Validate containment
    if (teamRoot) {
      const inTeam = resolved.startsWith(path.resolve(teamRoot) + path.sep) || resolved === path.resolve(teamRoot);
      const inProject = resolved.startsWith(path.resolve(projectRoot) + path.sep) || resolved === path.resolve(projectRoot);
      if (!inTeam && !inProject) {
        throw new Error(`Path escapes containment: ${skillPath} is outside project and team roots`);
      }
    } else {
      const inProject = resolved.startsWith(path.resolve(projectRoot) + path.sep) || resolved === path.resolve(projectRoot);
      if (!inProject) {
        throw new Error(`Path escapes containment: ${skillPath} is outside project root`);
      }
    }
    return resolved;
  }

  // 2. With teamRoot: strip leading .squad/ prefix, resolve relative to teamRoot
  if (teamRoot) {
    const stripped = skillPath.startsWith('.squad/') ? skillPath.slice(7) : skillPath;
    const resolved = path.resolve(teamRoot, stripped);
    const inTeam = resolved.startsWith(path.resolve(teamRoot) + path.sep) || resolved === path.resolve(teamRoot);
    if (!inTeam) {
      throw new Error(`Path escapes containment: ${skillPath} resolves outside team root`);
    }
    return resolved;
  }

  // 3. Without teamRoot: resolve relative to projectRoot
  const resolved = path.resolve(projectRoot, skillPath);
  const inProject = resolved.startsWith(path.resolve(projectRoot) + path.sep) || resolved === path.resolve(projectRoot);
  if (!inProject) {
    throw new Error(`Path escapes containment: ${skillPath} resolves outside project root`);
  }
  return resolved;
}

// --- SkillScriptLoader ---

export class SkillScriptLoader {
  constructor(
    private getToolSchema: (toolName: string) => { description: string; parameters: Record<string, unknown> } | undefined,
  ) {}

  /**
   * Load handler scripts for a specific concern from a backend skill directory.
   *
   * Algorithm:
   * 1. Check for `scripts/` directory — return null if missing (triggers markdown fallback)
   * 2. Get tool names for this concern from CONCERN_TOOL_MAP
   * 3. For each tool name:
   *    a. Compute script filename: toolName.replace('squad_', '') + '.js'
   *    b. Compute full script path
   *    c. If file doesn't exist → skip (partial implementations are fine)
   *    d. import() the script using toFileUrl (with Windows path normalization)
   *    e. Validate: module.default must be a function — if not, THROW (not silent skip)
   *    f. Get the tool's schema via this.getToolSchema(toolName)
   *    g. If schema not found → skip with warning (tool not registered yet)
   *    h. Produce a SquadTool entry with wrapSkillHandler()
   * 4. Load scripts/lifecycle.js if present (import() it)
   *    Extract init and dispose named exports if they are functions
   * 5. Return { tools, lifecycle } or { tools } if no lifecycle
   *
   * @param skillPath - Resolved absolute path to the skill directory
   * @param concern - The concern to load handlers for
   * @param backendConfig - Backend configuration to pass to handlers
   * @returns LoadResult with tools and optional lifecycle, or null if no scripts/ directory
   */
  async load<C extends Concern>(
    skillPath: string,
    concern: C,
    backendConfig: Record<string, unknown>,
  ): Promise<LoadResult | null> {
    // 1. Check for scripts/ directory
    const scriptsDir = path.join(skillPath, 'scripts');
    if (!existsSync(scriptsDir)) {
      return null; // Triggers markdown fallback
    }

    // 2. Get tool names for this concern
    const toolNames = CONCERN_TOOL_MAP[concern];
    if (!toolNames) {
      throw new Error(`Unknown concern: ${concern}`);
    }

    const tools: SquadTool<any>[] = [];

    // 3. Load each tool's handler script
    for (const toolName of toolNames) {
      // a. Compute script filename
      const scriptName = toolName.replace('squad_', '') + '.js';
      const scriptPath = path.join(scriptsDir, scriptName);

      // c. Skip if file doesn't exist
      if (!existsSync(scriptPath)) {
        continue;
      }

      try {
        // d. Dynamic import with Windows path normalization
        const scriptUrl = toFileUrl(scriptPath);
        const module = await import(scriptUrl);

        // e. Validate: module.default must be a function
        if (typeof module.default !== 'function') {
          throw new Error(`Handler script ${scriptName} does not export a default function`);
        }

        // f. Get the tool's schema
        const schema = this.getToolSchema(toolName);
        if (!schema) {
          console.warn(`[SkillScriptLoader] Tool schema not found for ${toolName}, skipping`);
          continue;
        }

        // h. Create SquadTool entry
        const tool: SquadTool<any> = {
          name: toolName,
          description: schema.description,
          parameters: schema.parameters,
          handler: wrapSkillHandler(module.default as SkillHandler<any>, backendConfig),
        };

        tools.push(tool);
      } catch (err) {
        // Failed imports are fatal (validation errors, syntax errors, etc.)
        throw new Error(`Failed to load handler script ${scriptName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 4. Load lifecycle.js if present
    let lifecycle: HandlerLifecycle | undefined;
    const lifecyclePath = path.join(scriptsDir, 'lifecycle.js');
    if (existsSync(lifecyclePath)) {
      try {
        const lifecycleUrl = toFileUrl(lifecyclePath);
        const lifecycleModule = await import(lifecycleUrl);

        // Extract init and dispose named exports if they are functions
        const init = typeof lifecycleModule.init === 'function' ? lifecycleModule.init : undefined;
        const dispose = typeof lifecycleModule.dispose === 'function' ? lifecycleModule.dispose : undefined;

        if (init || dispose) {
          lifecycle = { init, dispose };
        }
      } catch (err) {
        throw new Error(`Failed to load lifecycle.js: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 5. Return result
    return lifecycle ? { tools, lifecycle } : { tools };
  }
}
