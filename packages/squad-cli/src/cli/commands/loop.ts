/**
 * Loop command — prompt-driven continuous work loop.
 *
 * Reads a loop.md file (YAML frontmatter + prompt body) and runs it on a
 * fixed interval without requiring GitHub issues.  Think of it as Ralph in
 * "free-run" mode: the prompt IS the work driver.
 */

import path from 'node:path';
import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { fatal } from '../core/errors.js';
import { GREEN, RED, DIM, BOLD, RESET, YELLOW } from '../core/output.js';
import {
  CapabilityRegistry,
  createDefaultRegistry,
} from './watch/index.js';
import type { WatchCapability, WatchContext, WatchPhase, CapabilityResult } from './watch/types.js';
import type { WatchConfig } from './watch/config.js';
import { createPlatformAdapter } from '@bradygaster/squad-sdk/platform';
import { parseRoster } from '@bradygaster/squad-sdk/ralph/triage';

const storage = new FSStorageProvider();

// ── Types ────────────────────────────────────────────────────────

export interface LoopFrontmatter {
  /** Safety gate — must be explicitly set to true. */
  configured: boolean;
  /** Minutes between cycles (default: 10). */
  interval: number;
  /** Max minutes per cycle (default: 30). */
  timeout: number;
  /** Human description shown in status output. */
  description?: string;
}

export interface LoopConfig {
  /** Path to loop file (default: loop.md in cwd). */
  filePath?: string;
  /** Override interval from frontmatter. */
  interval?: number;
  /** Override timeout from frontmatter. */
  timeout?: number;
  /** Extra flags passed to `gh copilot`. */
  copilotFlags?: string;
  /** Fully override the agent command (e.g., `gh copilot --yolo`). */
  agentCmd?: string;
  /** Capability overrides, keyed by capability name. */
  capabilities: Record<string, boolean | Record<string, unknown>>;
}

// ── Frontmatter Parser ───────────────────────────────────────────

/**
 * Parse a loop.md string into validated frontmatter + prompt body.
 *
 * Frontmatter is the YAML block between the first two `---` delimiters.
 * Only simple `key: value` pairs are supported — no yaml dependency needed.
 */
export function parseLoopFile(content: string): { frontmatter: LoopFrontmatter; prompt: string } {
  const lines = content.split('\n');

  let frontmatterLines: string[] = [];
  let bodyStart = 0;

  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') {
        bodyStart = i + 1;
        break;
      }
      frontmatterLines.push(lines[i] ?? '');
    }
  }

  // Parse simple key: value pairs from frontmatter
  const raw: Record<string, string> = {};
  for (const line of frontmatterLines) {
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (match) {
      raw[match[1]!] = match[2]!.trim();
    }
  }

  // Extract and validate configured field
  const configuredRaw = raw['configured'];
  const configured = configuredRaw === 'true';

  // Parse numeric fields with defaults
  const intervalRaw = raw['interval'];
  const interval = intervalRaw ? parseInt(intervalRaw, 10) : 10;

  const timeoutRaw = raw['timeout'];
  const timeout = timeoutRaw ? parseInt(timeoutRaw, 10) : 30;

  // Strip surrounding quotes from description
  let description = raw['description'];
  if (description) {
    description = description.replace(/^["']|["']$/g, '');
  }

  const frontmatter: LoopFrontmatter = {
    configured,
    interval: isNaN(interval) ? 10 : interval,
    timeout: isNaN(timeout) ? 30 : timeout,
    description,
  };

  const prompt = lines.slice(bodyStart).join('\n').trim();

  return { frontmatter, prompt };
}

// ── Boilerplate Generator ────────────────────────────────────────

/** Returns the content of a starter loop.md for --init. */
export function generateLoopFile(): string {
  return `---
configured: false
interval: 10
timeout: 30
description: "My squad work loop"
---

# Squad Work Loop

> ⚠️ Set \`configured: true\` in the frontmatter above to activate this loop.
> Run with: \`squad loop\`

## What to do each cycle

Describe what your squad should do every time the loop wakes up. Be specific —
the more context you give, the better your squad performs.

Examples:
- Check for new messages in a Teams channel and summarize action items
- Review recent pull requests and flag anything needing attention
- Run a health check on staging and report anomalies
- Scan the inbox for anything that needs a response today

<!-- Replace this section with your actual loop instructions. -->

## Monitoring (optional)

If you want your squad to watch external channels, enable monitor capabilities:

\`\`\`bash
squad loop --monitor-email --monitor-teams
\`\`\`

## Personality (optional)

If your squad has a specific voice or style, describe it here so each cycle
stays consistent.

Example: "Be concise. Use bullet points. Flag blockers clearly."

## Tips

- **Be specific.** Vague prompts produce vague results.
- **Set boundaries.** Tell the squad what NOT to do (e.g., "Don't send messages to anyone but me").
- **Start small.** Begin with one task per cycle, then expand.
- **Use frontmatter.** \`interval\` controls how often the loop runs. \`timeout\` caps each cycle.
`;
}

// ── Agent Command Builder ────────────────────────────────────────

function buildLoopAgentCommand(
  prompt: string,
  options: { agentCmd?: string; copilotFlags?: string },
): { cmd: string; args: string[] } {
  if (options.agentCmd) {
    const parts = options.agentCmd.trim().split(/\s+/);
    return { cmd: parts[0]!, args: [...parts.slice(1), '--message', prompt] };
  }
  const args = ['copilot', '--message', prompt];
  if (options.copilotFlags) {
    args.push(...options.copilotFlags.trim().split(/\s+/));
  }
  return { cmd: 'gh', args };
}

// ── Capability Phase Runner ──────────────────────────────────────

async function runPhase(
  phase: WatchPhase,
  enabled: WatchCapability[],
  context: WatchContext,
  config: WatchConfig,
): Promise<void> {
  const phaseCapabilities = enabled.filter(c => c.phase === phase);
  const ts = new Date().toLocaleTimeString();
  for (const cap of phaseCapabilities) {
    try {
      const capConfig = config.capabilities[cap.name];
      const capContext: WatchContext = {
        ...context,
        config: typeof capConfig === 'object' && capConfig !== null
          ? (capConfig as Record<string, unknown>)
          : { enabled: !!capConfig },
      };
      const result: CapabilityResult = await cap.execute(capContext);
      if (!result.success) {
        console.log(`${YELLOW}⚠${RESET} [${ts}] ${cap.name}: ${result.summary}`);
      }
    } catch (e) {
      console.log(`${YELLOW}⚠${RESET} [${ts}] ${cap.name} crashed: ${(e as Error).message}`);
    }
  }
}

// ── Preflight Capabilities ───────────────────────────────────────

async function preflightLoopCapabilities(
  registry: CapabilityRegistry,
  config: WatchConfig,
  context: WatchContext,
): Promise<WatchCapability[]> {
  const enabled: WatchCapability[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  // Loop only activates pre-scan and housekeeping phases
  const allowedPhases: WatchPhase[] = ['pre-scan', 'housekeeping'];

  for (const cap of registry.all()) {
    if (!allowedPhases.includes(cap.phase)) continue;

    const capConfig = config.capabilities[cap.name];
    if (!capConfig) continue;

    const capContext: WatchContext = {
      ...context,
      config: typeof capConfig === 'object' && capConfig !== null
        ? (capConfig as Record<string, unknown>)
        : {},
    };

    try {
      const result = await cap.preflight(capContext);
      if (result.ok) {
        enabled.push(cap);
      } else {
        skipped.push({ name: cap.name, reason: result.reason ?? 'preflight failed' });
      }
    } catch (e) {
      skipped.push({ name: cap.name, reason: (e as Error).message });
    }
  }

  if (enabled.length > 0) {
    console.log(`${GREEN}✅${RESET} Capabilities: ${enabled.map(c => c.name).join(', ')}`);
  }
  for (const s of skipped) {
    console.log(`${YELLOW}⚠️${RESET}  ${s.name} skipped: ${s.reason}`);
  }

  return enabled;
}

// ── Main Entry Point ─────────────────────────────────────────────

/**
 * Run the loop command.
 *
 * @param dest     - Working directory (typically process.cwd()).
 * @param options  - CLI-parsed config overrides.
 */
export async function runLoop(dest: string, options: LoopConfig): Promise<void> {
  // Detect squad directory (must exist)
  const squadDirInfo = detectSquadDir(dest);
  const teamMd = path.join(squadDirInfo.path, 'team.md');
  const teamRoot = path.dirname(squadDirInfo.path);

  if (!storage.existsSync(teamMd)) {
    fatal('No squad found — run `squad init` first.');
  }

  // Locate loop.md
  const loopFilePath = options.filePath
    ? path.resolve(dest, options.filePath)
    : path.join(dest, 'loop.md');

  if (!storage.existsSync(loopFilePath)) {
    console.log(`\n💤 No loop.md found. Create one with: ${BOLD}squad loop --init${RESET}`);
    return;
  }

  // Parse loop file
  const content = storage.readSync(loopFilePath) ?? '';
  const { frontmatter, prompt } = parseLoopFile(content);

  if (!frontmatter.configured) {
    console.log(
      `\n⚠️  loop.md found but not configured. Set ${BOLD}configured: true${RESET} in the frontmatter to enable the loop.`,
    );
    return;
  }

  if (!prompt) {
    fatal('loop.md has no prompt body. Add instructions after the frontmatter `---` block.');
  }

  // CLI overrides take precedence over frontmatter
  const interval = options.interval ?? frontmatter.interval;
  const timeoutMinutes = options.timeout ?? frontmatter.timeout;
  const description = frontmatter.description ?? 'Squad Loop';

  if (isNaN(interval) || interval < 1) {
    fatal('interval must be a positive number of minutes');
  }

  if (isNaN(timeoutMinutes) || timeoutMinutes < 1) {
    fatal('timeout must be a positive number of minutes');
  }

  // Build WatchConfig for capability system
  const watchConfig: WatchConfig = {
    interval,
    execute: false,
    maxConcurrent: 1,
    timeout: timeoutMinutes,
    copilotFlags: options.copilotFlags,
    agentCmd: options.agentCmd,
    capabilities: options.capabilities,
  };

  // Create platform adapter for capability context (best-effort — loop doesn't require it)
  let adapter;
  try {
    adapter = createPlatformAdapter(teamRoot);
  } catch {
    // If no platform config exists, create a minimal stub so capabilities still work
    adapter = { type: 'github' as const } as ReturnType<typeof createPlatformAdapter>;
  }

  // Parse roster for context
  const teamContent = storage.readSync(teamMd) ?? '';
  const roster = parseRoster(teamContent);

  const baseContext: WatchContext = {
    teamRoot,
    adapter,
    round: 0,
    roster: roster.map(r => ({ name: r.name, label: r.label, expertise: [] as string[] })),
    config: {},
    agentCmd: options.agentCmd,
    copilotFlags: options.copilotFlags,
  };

  // Preflight capabilities (pre-scan + housekeeping only)
  const registry = createDefaultRegistry();
  const enabledCapabilities = await preflightLoopCapabilities(registry, watchConfig, baseContext);

  // Startup banner
  console.log(`\n${BOLD}🔄 Squad Loop${RESET} — ${description}`);
  console.log(`${DIM}Running every ${interval} minute(s). Ctrl+C to stop.${RESET}`);
  if (options.copilotFlags) {
    console.log(`${DIM}Copilot flags: ${options.copilotFlags}${RESET}`);
  }
  console.log();

  let round = 0;
  let roundInProgress = false;
  let currentChild: ChildProcess | null = null;

  async function executeRound(): Promise<void> {
    round++;
    const ts = new Date().toLocaleTimeString();
    const roundContext: WatchContext = { ...baseContext, round };

    // Phase 1: pre-scan (self-pull)
    await runPhase('pre-scan', enabledCapabilities, roundContext, watchConfig);

    // Core: run the loop prompt
    const timeoutMs = timeoutMinutes * 60_000;
    const { cmd, args } = buildLoopAgentCommand(prompt, {
      agentCmd: options.agentCmd,
      copilotFlags: options.copilotFlags,
    });
    console.log(`${GREEN}▶${RESET} [${ts}] Round ${round} — running loop prompt`);

    await new Promise<void>((resolve) => {
      const child = execFile(cmd, args, { cwd: teamRoot, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 }, (err) => {
        currentChild = null;
        if (err) {
          const execErr = err as Error & { killed?: boolean };
          const msg = execErr.killed
            ? `Timed out after ${timeoutMinutes}m`
            : execErr.message;
          console.error(`${RED}✗${RESET} [${new Date().toLocaleTimeString()}] Round ${round} failed: ${msg}`);
        } else {
          console.log(`${GREEN}✓${RESET} [${new Date().toLocaleTimeString()}] Round ${round} complete`);
        }
        resolve();
      });
      currentChild = child;
    });

    // Phase 2: housekeeping (monitor-email, monitor-teams, retro, decision-hygiene)
    await runPhase('housekeeping', enabledCapabilities, roundContext, watchConfig);
  }

  // Run immediately, then on interval
  await executeRound();

  return new Promise<void>((resolve) => {
    const intervalId = setInterval(
      async () => {
        if (roundInProgress) return;
        roundInProgress = true;
        try {
          await executeRound();
        } catch (e) {
          console.error(`${RED}✗${RESET} Round error: ${(e as Error).message}`);
        } finally {
          roundInProgress = false;
        }
      },
      interval * 60 * 1000,
    );

    // Graceful shutdown
    let isShuttingDown = false;
    const shutdown = () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      clearInterval(intervalId);
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      // Kill any in-flight child process so we don't wait for it to finish
      if (currentChild) {
        currentChild.kill();
        currentChild = null;
      }
      console.log(`\n${DIM}🔄 Squad Loop — stopped${RESET}`);
      resolve();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
