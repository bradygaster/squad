/**
 * In-Copilot Installation Path (M4-6, Issue #106)
 *
 * Detects the Copilot runtime environment and provides
 * platform-specific installation + scaffolding instructions.
 * Wires into initSquad() from M2-6 for project creation.
 *
 * @module cli/copilot-install
 */

import { initSquad } from '@bradygaster/squad-sdk/config';
import type { InitOptions, InitResult } from '@bradygaster/squad-sdk/config';

// ============================================================================
// Types
// ============================================================================

/** Recognised Copilot environments. */
export type CopilotEnvironment = 'cli' | 'vscode' | 'web' | 'unknown';

/** Configuration for in-Copilot installation. */
export interface InstallConfig {
  /** Project name */
  projectName?: string;
  /** Project description */
  projectDescription?: string;
  /** Agent names to scaffold */
  agents?: string[];
  /** Config format */
  configFormat?: 'typescript' | 'json';
}

/** Result of an in-Copilot installation. */
export interface CopilotInstallResult {
  /** Whether the installation succeeded */
  success: boolean;
  /** Detected environment */
  environment: CopilotEnvironment;
  /** Files created during installation */
  createdFiles: string[];
  /** Human-readable installation instructions that were applied */
  instructions: string[];
}

/** Single install instruction step. */
export interface InstallStep {
  /** Step description */
  description: string;
  /** Shell command to run (if applicable) */
  command?: string;
}

// ============================================================================
// Environment Detection
// ============================================================================

/** Indicators used for environment detection. */
export interface EnvironmentIndicators {
  env: Record<string, string | undefined>;
  argv: string[];
}

/**
 * Detect which Copilot environment is active.
 *
 * Heuristics (checked in order):
 * 1. `VSCODE_PID` or `VSCODE_IPC_HOOK` → vscode
 * 2. `CODESPACES` or `GITHUB_CODESPACE_TOKEN` → web
 * 3. `COPILOT_CLI` env var → cli
 * 4. `--copilot-cli` argv flag → cli
 * 5. Otherwise → unknown
 */
export function detectCopilotEnvironment(
  indicators?: EnvironmentIndicators,
): CopilotEnvironment {
  const env = indicators?.env ?? process.env;
  const argv = indicators?.argv ?? process.argv;

  if (env['VSCODE_PID'] || env['VSCODE_IPC_HOOK']) {
    return 'vscode';
  }
  if (env['CODESPACES'] === 'true' || env['GITHUB_CODESPACE_TOKEN']) {
    return 'web';
  }
  if (env['COPILOT_CLI'] || argv.includes('--copilot-cli')) {
    return 'cli';
  }
  return 'unknown';
}

// ============================================================================
// Install Instructions
// ============================================================================

/**
 * Return platform-specific install steps for a detected environment.
 */
export function getInstallInstructions(env: CopilotEnvironment): InstallStep[] {
  switch (env) {
    case 'cli':
      return [
        { description: 'Install the Squad SDK globally', command: 'npm install -g @bradygaster/squad' },
        { description: 'Initialise a new Squad project', command: 'squad init' },
        { description: 'Start the Squad orchestrator', command: 'squad start' },
      ];
    case 'vscode':
      return [
        { description: 'Install Squad SDK as a project dependency', command: 'npm install @bradygaster/squad' },
        { description: 'Run Squad init via the VS Code terminal', command: 'squad init' },
        { description: 'Reload the VS Code window to activate Squad agents' },
      ];
    case 'web':
      return [
        { description: 'Install Squad SDK in the Codespace', command: 'npm install @bradygaster/squad' },
        { description: 'Initialise Squad scaffolding', command: 'squad init' },
        { description: 'Squad agents are available in the Codespace Copilot Chat' },
      ];
    case 'unknown':
    default:
      return [
        { description: 'Install Node.js 20+ if not already installed' },
        { description: 'Install the Squad SDK', command: 'npm install @bradygaster/squad' },
        { description: 'Initialise a new Squad project', command: 'squad init' },
      ];
  }
}

// ============================================================================
// In-Copilot Install
// ============================================================================

/**
 * Run a full "install Squad from inside Copilot" flow.
 *
 * Generates `.squad/` scaffolding via initSquad() from M2-6
 * and returns environment-aware instructions.
 *
 * @param env - Detected Copilot environment
 * @param projectDir - Root directory of the project
 * @param config - Optional install configuration
 * @returns CopilotInstallResult
 */
export async function installFromCopilot(
  env: CopilotEnvironment,
  projectDir: string,
  config?: InstallConfig,
): Promise<CopilotInstallResult> {
  const projectName = config?.projectName ?? 'my-squad-project';
  const agents = (config?.agents ?? ['lead', 'developer']).map((name) => ({
    name,
    role: name,
  }));

  const initOptions: InitOptions = {
    teamRoot: projectDir,
    projectName,
    projectDescription: config?.projectDescription,
    agents,
    configFormat: config?.configFormat ?? (env === 'web' ? 'json' : 'typescript'),
  };

  let initResult: InitResult;
  try {
    initResult = await initSquad(initOptions);
  } catch (err) {
    return {
      success: false,
      environment: env,
      createdFiles: [],
      instructions: [`Installation failed: ${(err as Error).message}`],
    };
  }

  const instructions = getInstallInstructions(env).map((s) => s.description);

  return {
    success: true,
    environment: env,
    createdFiles: initResult.createdFiles,
    instructions,
  };
}
