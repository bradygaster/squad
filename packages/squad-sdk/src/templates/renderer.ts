export interface TemplateTokens {
  CODING_AGENT_HANDLE: string;
  CODING_AGENT_LABEL: string;
  CODING_AGENT_ASSIGNEE: string;
}

export const RUNTIME_DEFAULTS: Record<string, TemplateTokens> = {
  copilot: {
    CODING_AGENT_HANDLE: '@copilot',
    CODING_AGENT_LABEL: 'squad:copilot',
    CODING_AGENT_ASSIGNEE: 'copilot-swe-agent[bot]',
  },
  'claude-code': {
    CODING_AGENT_HANDLE: '@claude',
    CODING_AGENT_LABEL: 'squad:claude',
    CODING_AGENT_ASSIGNEE: 'claude-code[bot]',
  },
};

export function renderTemplate(template: string, tokens: TemplateTokens): string {
  return template
    .replaceAll('{{CODING_AGENT_HANDLE}}', tokens.CODING_AGENT_HANDLE)
    .replaceAll('{{CODING_AGENT_LABEL}}', tokens.CODING_AGENT_LABEL)
    .replaceAll('{{CODING_AGENT_ASSIGNEE}}', tokens.CODING_AGENT_ASSIGNEE);
}
