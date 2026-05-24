export interface AgentRunnerDefinition {
  id: string;
  name: string;
  targetDir: string;
  shortcut: string;
}

export const KNOWN_AGENT_RUNNERS: AgentRunnerDefinition[] = [
  { id: 'copilot', name: 'GitHub Copilot Workspace', targetDir: '.copilot', shortcut: 'c' },
  { id: 'antigravity', name: 'Antigravity IDE', targetDir: '.squad', shortcut: 'a' }
];

export const DEFAULT_AGENT_RUNNER = KNOWN_AGENT_RUNNERS[0]!;

export function getAgentRunnerDir(runnerId?: string): string {
  if (!runnerId) return DEFAULT_AGENT_RUNNER.targetDir;
  const known = KNOWN_AGENT_RUNNERS.find(r => r.id === runnerId);
  return known ? known.targetDir : '.squad'; // Custom runners default to .squad
}
