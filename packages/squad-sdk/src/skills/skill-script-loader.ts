/**
 * Skill Script Loader
 *
 * Runtime loader for executable skill handlers from backend skill directories.
 * Backend skills in `.copilot/skills/{name}/scripts/` contain `.js` handler files
 * that replace built-in tool handlers in ToolRegistry.
 *
 * Supports:
 * - Loading concern-specific handler scripts (tasks, decisions, memories, logging)
 * - Dynamic import() of handler scripts with lifecycle hooks
 * - Path containment validation for security
 * - Partial implementations (missing handlers are silently skipped)
 */

import { existsSync, readdirSync, realpathSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trace, SpanStatusCode } from '../runtime/otel-api.js';
import type {
  LoadResult,
  SkillHandler,
  HandlerLifecycle,
} from './handler-types.js';
import type { SquadTool, SquadToolHandler, SquadToolResult } from '../adapter/types.js';

const tracer = trace.getTracer('squad-sdk');

// --- OTel Handler Wrapping ---

/**
 * Wrap a skill handler with OTel span instrumentation.
 * Mirrors the wrapping applied to built-in tools by defineTool() so skill-dispatched
 * calls appear in traces, distinguished by 'tool.skill_dispatched: true'.
 *
 * This is intentionally a local copy — skill handlers and tool handlers have different
 * signatures and concerns; they should not share implementation.
 */
function wrapSkillHandlerWithSpan<TArgs>(
  name: string,
  skillHandler: SkillHandler<TArgs>,
  backendConfig: Record<string, unknown>,
): SquadToolHandler<TArgs> {
  return async (args, _invocation) => {
    const span = tracer.startSpan('squad.skill.call', {
      attributes: { 'tool.name': name, 'tool.skill_dispatched': true },
    });
    const startTime = Date.now();
    try {
      const result = await skillHandler(args, backendConfig) as SquadToolResult;
      const durationMs = Date.now() - startTime;
      span.addEvent('squad.skill.result', typeof result === 'string'
        ? { 'result.type': 'unknown', 'result.length': result.length, 'duration_ms': durationMs, 'success': true }
        : { 'result.type': result.resultType ?? 'unknown', 'result.length': (result.textResultForLlm ?? '').length, 'duration_ms': durationMs, 'success': result.resultType !== 'failure' },
      );
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.addEvent('squad.skill.error', {
        'error.type': err instanceof Error ? err.constructor.name : 'unknown',
        'error.message': err instanceof Error ? err.message : String(err),
        'duration_ms': durationMs,
      });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  };
}

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
 * Resolve a skill path relative to project/team roots with containment validation.
 *
 * Algorithm:
 * 1. Absolute paths used as-is
 * 2. With teamRoot: resolve `.copilot/` paths from projectRoot and strip legacy `.squad/` paths relative to teamRoot
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
  /** Resolve symlinks; fall back to the logical path if it doesn't exist yet (write case). */
  function realOrLogical(p: string): string {
    try { return realpathSync(p); } catch { return p; }
  }

  /** True if `p` is equal to `root` or directly inside it. */
  function isContained(p: string, root: string): boolean {
    const r = path.resolve(root);
    return p === r || p.startsWith(r + path.sep);
  }

  // 1. Absolute paths used as-is
  if (path.isAbsolute(skillPath)) {
    const resolved = path.resolve(skillPath);
    const real = realOrLogical(resolved);
    const inside = (teamRoot ? isContained(real, teamRoot) || isContained(real, projectRoot) : isContained(real, projectRoot));
    if (!inside) throw new Error(`Path escapes containment: ${skillPath} is outside project and team roots`);
    return resolved;
  }

  // 2. With teamRoot: resolve .copilot/ paths from projectRoot, legacy .squad/ paths from teamRoot
  if (teamRoot) {
    if (skillPath.startsWith('.copilot/')) {
      const resolved = path.resolve(projectRoot, skillPath);
      const real = realOrLogical(resolved);
      if (!isContained(real, projectRoot)) throw new Error(`Path escapes containment: ${skillPath} resolves outside project root`);
      return resolved;
    }

    const stripped = skillPath.startsWith('.squad/') ? skillPath.slice(7) : skillPath;
    const resolved = path.resolve(teamRoot, stripped);
    const real = realOrLogical(resolved);
    if (!isContained(real, teamRoot)) throw new Error(`Path escapes containment: ${skillPath} resolves outside team root`);
    return resolved;
  }

  // 3. Without teamRoot: resolve relative to projectRoot
  const resolved = path.resolve(projectRoot, skillPath);
  const real = realOrLogical(resolved);
  if (!isContained(real, projectRoot)) throw new Error(`Path escapes containment: ${skillPath} resolves outside project root`);
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
   *
   * @warning **Security note:** `backendConfig` is for non-secret runtime configuration (URLs, feature
   * flags, timeouts). Do NOT put credentials, tokens, or secrets in `backendConfig` — this config is
   * part of the skill definition and will be committed to the repository. Handler scripts run with full
   * process trust and can access the filesystem and the network. Only load skills from trusted sources.
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

      // c. Get the tool's schema — outside the import try block so schema errors are attributed correctly
      const schema = this.getToolSchema(toolName);
      if (!schema) {
        console.warn(`[SkillScriptLoader] Tool schema not found for ${toolName}, skipping`);
        continue;
      }

      // d. Dynamic import — errors here mean the script itself is broken
      try {
        const scriptUrl = toFileUrl(scriptPath);
        const module = await import(scriptUrl);

        // b. Validate: module.default must be a function
        if (typeof module.default !== 'function') {
          throw new Error(`Handler script ${scriptName} does not export a default function`);
        }

        // e. Create SquadTool entry — wrap with OTel span instrumentation at load time
        // so skill-dispatched calls appear in traces with 'tool.skill_dispatched: true'.
        const tool: SquadTool<any> = {
          name: toolName,
          description: schema.description,
          parameters: schema.parameters,
          handler: wrapSkillHandlerWithSpan(toolName, module.default as SkillHandler<any>, backendConfig),
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
