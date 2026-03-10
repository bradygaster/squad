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

import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  LoadResult,
  SkillHandler,
  HandlerLifecycle,
} from './handler-types.js';
import type { SquadTool, SquadToolHandler, SquadToolInvocation } from '../adapter/types.js';

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
   * Load handler scripts from a backend skill directory by scanning `scripts/` for `.js` files.
   *
   * Algorithm:
   * 1. Check for `scripts/` directory — return null if missing (triggers markdown fallback)
   * 2. Scan scripts/ for all .js files (excluding lifecycle.js)
   * 3. For each file, derive tool name: prepend 'squad_' to the filename stem
   *    a. import() the script using toFileUrl (with Windows path normalization)
   *    b. Validate: module.default must be a function — if not, THROW (not silent skip)
   *    c. Get the tool's schema via this.getToolSchema(toolName)
   *    d. If schema not found → skip with warning (tool not registered in ToolRegistry)
   *    e. Produce a SquadTool entry with wrapSkillHandler()
   * 4. Load scripts/lifecycle.js if present (import() it)
   *    Extract init and dispose named exports if they are functions
   * 5. Return { tools, lifecycle } or { tools } if no lifecycle
   *
   * @param skillPath - Resolved absolute path to the skill directory
   * @param backendConfig - Backend configuration to pass to handlers
   * @returns LoadResult with tools and optional lifecycle, or null if no scripts/ directory
   */
  async load(
    skillPath: string,
    backendConfig: Record<string, unknown>,
  ): Promise<LoadResult | null> {
    // 1. Check for scripts/ directory
    const scriptsDir = path.join(skillPath, 'scripts');
    if (!existsSync(scriptsDir)) {
      return null; // Triggers markdown fallback
    }

    // 2. Scan scripts/ for handler files — everything except lifecycle.js
    const scriptFiles = readdirSync(scriptsDir).filter(
      (f) => f.endsWith('.js') && f !== 'lifecycle.js',
    );

    const tools: SquadTool<any>[] = [];

    // 3. Load each discovered handler script
    for (const scriptName of scriptFiles) {
      // Derive tool name from filename: create_issue.js → squad_create_issue
      const toolName = 'squad_' + scriptName.slice(0, -3);
      const scriptPath = path.join(scriptsDir, scriptName);

      try {
        // a. Dynamic import with Windows path normalization
        const scriptUrl = toFileUrl(scriptPath);
        const module = await import(scriptUrl);

        // b. Validate: module.default must be a function
        if (typeof module.default !== 'function') {
          throw new Error(`Handler script ${scriptName} does not export a default function`);
        }

        // c. Get the tool's schema
        const schema = this.getToolSchema(toolName);
        if (!schema) {
          console.warn(`[SkillScriptLoader] Tool schema not found for ${toolName}, skipping`);
          continue;
        }

        // e. Create SquadTool entry
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
