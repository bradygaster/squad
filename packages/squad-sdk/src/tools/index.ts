/**
 * Tool Registry — Custom Tools API (PRD 2)
 *
 * Defines Squad's custom tools registered with the SDK via defineTool().
 * Tools provide agents with typed, validated orchestration primitives:
 *   - squad_route:  Route work to another agent via session pool
 *   - squad_decide: Write a typed decision to the inbox drop-box
 *   - squad_memory: Append to agent history (learnings, updates)
 *   - squad_status: Query session pool state
 *   - squad_skill:  Read/write agent skills
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SquadTool, SquadToolResult } from '../adapter/types.js';
import { trace, SpanStatusCode } from '../runtime/otel-api.js';

const tracer = trace.getTracer('squad-sdk');

// --- Argument Sanitization ---

/** Sensitive field patterns — strip before recording as span attributes. */
const SENSITIVE_PATTERNS = /token|secret|password|key|auth/i;

/**
 * Sanitize tool arguments for OTel span attributes.
 * Strips any field whose name matches sensitive patterns (case-insensitive).
 * Returns JSON string truncated to 1024 chars.
 */
export function sanitizeArgs(args: unknown): string {
  if (args == null || typeof args !== 'object') {
    return JSON.stringify(args ?? null).slice(0, 1024);
  }
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    sanitized[k] = SENSITIVE_PATTERNS.test(k) ? '[REDACTED]' : v;
  }
  return JSON.stringify(sanitized).slice(0, 1024);
}

// --- Tool Types ---

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface RouteRequest {
  /** Target agent name */
  targetAgent: string;
  /** Task description for the target agent */
  task: string;
  /** Priority level */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Context to pass to the target session */
  context?: string;
}

export interface DecisionRecord {
  /** Decision author (agent name) */
  author: string;
  /** Decision summary */
  summary: string;
  /** Full decision body */
  body: string;
  /** Related agents or PRDs */
  references?: string[];
}

export interface MemoryEntry {
  /** Agent name */
  agent: string;
  /** Section to append to (learnings, updates, sessions) */
  section: 'learnings' | 'updates' | 'sessions';
  /** Content to append */
  content: string;
}

export interface StatusQuery {
  /** Filter by agent name */
  agentName?: string;
  /** Filter by session status */
  status?: string;
  /** Include detailed session metadata */
  verbose?: boolean;
}

export interface SkillRequest {
  /** Skill name (maps to .squad/skills/{name}/SKILL.md) */
  skillName: string;
  /** Operation: read the skill or write/update it */
  operation: 'read' | 'write';
  /** Skill content (required for write) */
  content?: string;
  /** Confidence level (required for write) */
  confidence?: 'low' | 'medium' | 'high';
}

// --- Tool Definition Helper ---

/**
 * Define a typed Squad tool with JSON schema parameters.
 * Creates a SquadTool object compatible with the adapter layer.
 */
export function defineTool<TArgs = unknown>(config: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: TArgs) => Promise<SquadToolResult> | SquadToolResult;
  /** Optional agent name for span attribution */
  agentName?: string;
}): SquadTool<TArgs> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    // TODO: Parent span context propagation — tool spans should be children of
    // agent.work spans once the agent work span lifecycle is complete.
    handler: async (args: TArgs) => {
      const span = tracer.startSpan('squad.tool.call', {
        attributes: {
          'tool.name': config.name,
          ...(config.agentName ? { 'agent.name': config.agentName } : {}),
          'tool.args': sanitizeArgs(args),
        },
      });
      const startTime = Date.now();
      try {
        const result = await config.handler(args);
        const durationMs = Date.now() - startTime;
        const resultType = typeof result === 'string' ? 'unknown' : (result.resultType ?? 'unknown');
        const resultText = typeof result === 'string' ? result : (result.textResultForLlm ?? '');
        span.addEvent('squad.tool.result', {
          'result.type': resultType,
          'result.length': resultText.length,
          'duration_ms': durationMs,
          'success': resultType !== 'failure',
        });
        return result;
      } catch (err) {
        const durationMs = Date.now() - startTime;
        span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
        span.addEvent('squad.tool.error', {
          'error.type': err instanceof Error ? err.constructor.name : 'unknown',
          'error.message': err instanceof Error ? err.message : String(err),
          'duration_ms': durationMs,
        });
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        span.end();
      }
    },
  };
}

// --- Error Sanitization ---

/**
 * Sanitize error messages before sending to LLM.
 * Strips absolute filesystem paths by replacing the squadRoot prefix with [team-root].
 */
function sanitizeErrorForLlm(error: unknown, squadRoot: string): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace(new RegExp(squadRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[team-root]');
}

// --- Tool Registry ---

export class ToolRegistry {
  private tools: Map<string, SquadTool<any>> = new Map();
  private squadRoot: string;
  private sessionPoolGetter?: () => any;

  constructor(squadRoot = '.squad', sessionPoolGetter?: () => any) {
    this.squadRoot = squadRoot;
    this.sessionPoolGetter = sessionPoolGetter;
    this.registerSquadTools();
  }

  private registerSquadTools(): void {
    // squad_route: Route work to another agent
    const squadRoute = defineTool<RouteRequest>({
      name: 'squad_route',
      description: 'Route a task to another agent in the squad. Creates a new session for the target agent with the specified task and context.',
      parameters: {
        type: 'object',
        properties: {
          targetAgent: {
            type: 'string',
            description: 'Name of the agent to route the task to',
          },
          task: {
            type: 'string',
            description: 'Description of the task for the target agent',
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'critical'],
            description: 'Priority level for the routed task',
            default: 'normal',
          },
          context: {
            type: 'string',
            description: 'Additional context to pass to the target session',
          },
        },
        required: ['targetAgent', 'task'],
      },
      handler: async (args) => {
        // Validate target agent exists (stub for now, will check roster later)
        if (!args.targetAgent || args.targetAgent.trim() === '') {
          return {
            textResultForLlm: 'Error: Target agent name is required',
            resultType: 'failure',
            error: 'Invalid target agent',
          };
        }

        // Create route request (session creation wired later)
        const routeRequest: RouteRequest = {
          targetAgent: args.targetAgent,
          task: args.task,
          priority: args.priority || 'normal',
          context: args.context,
        };

        return {
          textResultForLlm: `Task routed to ${args.targetAgent}. Priority: ${routeRequest.priority}. Session creation will be implemented when session lifecycle is in place.`,
          resultType: 'success',
          toolTelemetry: { routeRequest },
        };
      },
    });

    // squad_decide: Write a decision to the inbox
    const squadDecide = defineTool<DecisionRecord>({
      name: 'squad_decide',
      description: 'Write a decision to the team decision inbox. Decisions are stored in .squad/decisions/inbox/ for team review.',
      parameters: {
        type: 'object',
        properties: {
          author: {
            type: 'string',
            description: 'Agent name making the decision',
          },
          summary: {
            type: 'string',
            description: 'Brief summary of the decision',
          },
          body: {
            type: 'string',
            description: 'Full decision details and rationale',
          },
          references: {
            type: 'array',
            items: { type: 'string' },
            description: 'Related agents, PRDs, or issues',
          },
        },
        required: ['author', 'summary', 'body'],
      },
      handler: async (args) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(args.author)) {
          return { textResultForLlm: 'Invalid author name: must contain only letters, numbers, hyphens, and underscores', resultType: 'failure', error: 'Invalid author' };
        }
        try {
          const inboxDir = path.join(this.squadRoot, 'decisions', 'inbox');
          fs.mkdirSync(inboxDir, { recursive: true });

          const decisionId = randomUUID();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const slug = args.summary
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 50);
          const filename = path.join(inboxDir, `${args.author}-${slug}.md`);

          const content = [
            `### ${timestamp}: ${args.summary}`,
            '',
            `**By:** ${args.author}`,
            `**What:** ${args.body}`,
            args.references && args.references.length > 0
              ? `**References:** ${args.references.join(', ')}`
              : '',
            '',
            `**Why:** ${args.body}`,
            '',
          ].filter(Boolean).join('\n');

          fs.writeFileSync(filename, content, 'utf-8');

          return {
            textResultForLlm: `Decision written: ${args.author}-${slug}.md (ID: ${decisionId})`,
            resultType: 'success',
            toolTelemetry: { decisionId, filename, slug },
          };
        } catch (error) {
          return {
            textResultForLlm: `Failed to write decision: ${sanitizeErrorForLlm(error, this.squadRoot)}`,
            resultType: 'failure',
            error: String(error),
          };
        }
      },
    });

    // squad_memory: Append to agent history
    const squadMemory = defineTool<MemoryEntry>({
      name: 'squad_memory',
      description: 'Append an entry to an agent\'s history file. Used to record learnings, updates, or session notes.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'Agent name whose history to update',
          },
          section: {
            type: 'string',
            enum: ['learnings', 'updates', 'sessions'],
            description: 'Section to append to',
          },
          content: {
            type: 'string',
            description: 'Content to append to the section',
          },
        },
        required: ['agent', 'section', 'content'],
      },
      handler: async (args) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(args.agent)) {
          return { textResultForLlm: 'Invalid agent name: must contain only letters, numbers, hyphens, and underscores', resultType: 'failure', error: 'Invalid agent name' };
        }
        try {
          const historyFile = path.join(this.squadRoot, 'agents', args.agent, 'history.md');
          
          if (!fs.existsSync(historyFile)) {
            return {
              textResultForLlm: `Agent history file not found: agents/${args.agent}/history.md`,
              resultType: 'failure',
              error: 'History file does not exist',
            };
          }

          const sectionHeader = `## ${args.section.charAt(0).toUpperCase() + args.section.slice(1)}`;
          const timestamp = new Date().toISOString();
          const entry = `\n### ${timestamp}\n${args.content}\n`;

          let content = fs.readFileSync(historyFile, 'utf-8');
          
          // Find section and append
          const sectionIndex = content.indexOf(sectionHeader);
          if (sectionIndex !== -1) {
            // Find next section or end of file
            const nextSectionIndex = content.indexOf('\n## ', sectionIndex + sectionHeader.length);
            const insertIndex = nextSectionIndex === -1 ? content.length : nextSectionIndex;
            content = content.slice(0, insertIndex) + entry + content.slice(insertIndex);
          } else {
            // Section doesn't exist, append at end
            content += `\n${sectionHeader}\n${entry}`;
          }

          fs.writeFileSync(historyFile, content, 'utf-8');

          return {
            textResultForLlm: `Appended to ${args.agent} history (${args.section})`,
            resultType: 'success',
            toolTelemetry: { agent: args.agent, section: args.section },
          };
        } catch (error) {
          return {
            textResultForLlm: `Failed to update agent memory: ${sanitizeErrorForLlm(error, this.squadRoot)}`,
            resultType: 'failure',
            error: String(error),
          };
        }
      },
    });

    // squad_status: Query session pool state
    const squadStatus = defineTool<StatusQuery>({
      name: 'squad_status',
      description: 'Query the status of active sessions in the pool. Returns session metadata and current state.',
      parameters: {
        type: 'object',
        properties: {
          agentName: {
            type: 'string',
            description: 'Filter by agent name',
          },
          status: {
            type: 'string',
            description: 'Filter by session status (active, idle, completed)',
          },
          verbose: {
            type: 'boolean',
            description: 'Include detailed session metadata',
            default: false,
          },
        },
      },
      handler: async (args) => {
        const pool = this.sessionPoolGetter?.();
        
        if (!pool) {
          return {
            textResultForLlm: 'Session pool not available. Pool size: 0, Active sessions: 0',
            resultType: 'success',
            toolTelemetry: {
              poolAvailable: false,
              totalSessions: 0,
              activeSessions: 0,
            },
          };
        }

        const allSessions = Array.from((pool as any).sessions?.values() || []);
        let filteredSessions = allSessions;

        // Apply agent name filter
        if (args.agentName) {
          filteredSessions = filteredSessions.filter(
            (s: any) => s.agentName === args.agentName
          );
        }

        // Apply status filter
        if (args.status) {
          filteredSessions = filteredSessions.filter(
            (s: any) => s.status === args.status
          );
        }

        const poolInfo = {
          poolSize: pool.size,
          capacity: (pool as any).config?.maxConcurrent || 0,
          atCapacity: pool.atCapacity,
          activeSessions: pool.active().length,
          totalSessions: allSessions.length,
          filteredCount: filteredSessions.length,
        };

        // Build response
        const sessionsByAgent: Record<string, number> = {};
        const sessionsByStatus: Record<string, number> = {};

        for (const session of allSessions) {
          const s = session as any;
          sessionsByAgent[s.agentName] = (sessionsByAgent[s.agentName] || 0) + 1;
          sessionsByStatus[s.status] = (sessionsByStatus[s.status] || 0) + 1;
        }

        let textResult = `Pool status: ${poolInfo.poolSize}/${poolInfo.capacity} sessions (${poolInfo.activeSessions} active)`;
        
        if (args.agentName || args.status) {
          textResult += `\nFiltered results: ${poolInfo.filteredCount} sessions`;
        }

        if (args.verbose && filteredSessions.length > 0) {
          textResult += '\n\nSessions:';
          for (const session of filteredSessions) {
            const s = session as any;
            const uptime = s.createdAt ? Math.floor((Date.now() - s.createdAt.getTime()) / 1000) : 0;
            textResult += `\n- ${s.id.slice(0, 8)}: ${s.agentName} (${s.status}, ${uptime}s uptime)`;
          }
        }

        return {
          textResultForLlm: textResult,
          resultType: 'success',
          toolTelemetry: {
            poolInfo,
            sessionsByAgent,
            sessionsByStatus,
            filters: {
              agentName: args.agentName,
              status: args.status,
              verbose: args.verbose || false,
            },
          },
        };
      },
    });

    // squad_skill: Read/write agent skills
    const squadSkill = defineTool<SkillRequest>({
      name: 'squad_skill',
      description: 'Read or write agent skill definitions. Skills are stored in .squad/skills/{name}/SKILL.md.',
      parameters: {
        type: 'object',
        properties: {
          skillName: {
            type: 'string',
            description: 'Skill name (maps to directory name)',
          },
          operation: {
            type: 'string',
            enum: ['read', 'write'],
            description: 'Operation to perform',
          },
          content: {
            type: 'string',
            description: 'Skill content (required for write)',
          },
          confidence: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Confidence level (required for write)',
          },
        },
        required: ['skillName', 'operation'],
      },
      handler: async (args) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(args.skillName)) {
          return { textResultForLlm: 'Invalid skill name: must contain only letters, numbers, hyphens, and underscores', resultType: 'failure', error: 'Invalid skillName' };
        }
        try {
          const skillDir = path.join(this.squadRoot, 'skills', args.skillName);
          const skillFile = path.join(skillDir, 'SKILL.md');

          if (args.operation === 'read') {
            if (!fs.existsSync(skillFile)) {
              return {
                textResultForLlm: `Skill not found: ${args.skillName}`,
                resultType: 'failure',
                error: 'Skill file does not exist',
              };
            }

            const content = fs.readFileSync(skillFile, 'utf-8');
            return {
              textResultForLlm: `Skill: ${args.skillName}\n\n${content}`,
              resultType: 'success',
              toolTelemetry: { skillName: args.skillName, operation: 'read' },
            };
          } else {
            // write operation
            if (!args.content) {
              return {
                textResultForLlm: 'Error: content is required for write operation',
                resultType: 'failure',
                error: 'Missing required field: content',
              };
            }

            fs.mkdirSync(skillDir, { recursive: true });

            const skillContent = [
              `# ${args.skillName}`,
              '',
              `**Confidence:** ${args.confidence || 'medium'}`,
              `**Updated:** ${new Date().toISOString()}`,
              '',
              args.content,
            ].join('\n');

            fs.writeFileSync(skillFile, skillContent, 'utf-8');

            return {
              textResultForLlm: `Skill written: ${args.skillName} (skills/${args.skillName}/SKILL.md)`,
              resultType: 'success',
              toolTelemetry: { skillName: args.skillName, operation: 'write', confidence: args.confidence },
            };
          }
        } catch (error) {
          return {
            textResultForLlm: `Failed to ${args.operation} skill: ${sanitizeErrorForLlm(error, this.squadRoot)}`,
            resultType: 'failure',
            error: String(error),
          };
        }
      },
    });

    // Register all tools
    this.tools.set('squad_route', squadRoute);
    this.tools.set('squad_decide', squadDecide);
    this.tools.set('squad_memory', squadMemory);
    this.tools.set('squad_status', squadStatus);
    this.tools.set('squad_skill', squadSkill);
  }

  /** Get all registered tools for session config */
  getTools(): SquadTool<any>[] {
    return Array.from(this.tools.values());
  }

  /** Get tools filtered by agent's allowed tool list */
  getToolsForAgent(allowedTools?: string[]): SquadTool<any>[] {
    if (!allowedTools) return this.getTools();
    return allowedTools
      .map(name => this.tools.get(name))
      .filter((t): t is NonNullable<typeof t> => t != null);
  }

  /** Get a specific tool by name */
  getTool(name: string): SquadTool<any> | undefined {
    return this.tools.get(name);
  }

  /**
   * Replace built-in tool handlers with skill-backed versions.
   * Called post-construction after SkillScriptLoader has resolved handlers.
   * Only replaces tools that already exist — unknown tool names are silently ignored.
   * Once applied, handlers are immutable for the session.
   *
   * Skill handlers are already OTel-wrapped by SkillScriptLoader.load() — no re-wrapping here.
   */
  applySkillHandlers(tools: SquadTool<any>[]): void {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        this.tools.set(tool.name, tool);
      }
      // Unknown tool names silently ignored — skills cannot introduce new tools
    }
  }
}
