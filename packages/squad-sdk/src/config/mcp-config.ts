export type McpConfigMode = 'copilot-file' | 'agent-frontmatter' | 'none';

export interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export function buildMcpServerSpecs(isGitHub: boolean, cliVersion?: string): McpServerSpec[] {
  const pkgSpec = cliVersion && cliVersion !== '0.0.0'
    ? `@bradygaster/squad-cli@${cliVersion}`
    : '@bradygaster/squad-cli';
  const servers: McpServerSpec[] = [
    {
      name: 'squad_state',
      command: 'npx',
      args: ['-y', pkgSpec, 'state-mcp'],
    },
  ];

  servers.push(isGitHub
    ? {
        name: 'EXAMPLE-github',
        command: 'npx',
        args: ['-y', '@anthropic/github-mcp-server'],
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      }
    : {
        name: 'EXAMPLE-azure-devops',
        command: 'npx',
        args: ['-y', '@azure/devops-mcp-server'],
        env: {
          AZURE_DEVOPS_ORG: '${AZURE_DEVOPS_ORG}',
          AZURE_DEVOPS_PAT: '${AZURE_DEVOPS_PAT}',
        },
      });

  return servers;
}

export function buildMcpConfigJson(servers: McpServerSpec[]): Record<string, unknown> {
  return {
    mcpServers: Object.fromEntries(servers.map(({ name, ...server }) => [name, server])),
  };
}

function yamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function yamlEnvValue(value: string): string {
  if (/^\$\{[A-Z0-9_]+\}$/.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildMcpFrontmatterBlock(servers: McpServerSpec[]): string {
  const lines = ['mcp-servers:'];

  for (const server of servers) {
    lines.push(`  ${server.name}:`);
    lines.push('    type: local');
    lines.push(`    command: ${server.command}`);
    lines.push(`    args: [${server.args.map(yamlSingleQuoted).join(', ')}]`);
    lines.push('    tools: ["*"]');

    if (server.env && Object.keys(server.env).length > 0) {
      lines.push('    env:');
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`      ${key}: ${yamlEnvValue(value)}`);
      }
    }
  }

  return lines.join('\n');
}

function findFrontmatterEnd(content: string): number {
  if (!content.startsWith('---')) {
    return -1;
  }

  const closingDelimiter = /\r?\n---(?=\r?\n|$)/g;
  closingDelimiter.lastIndex = 3;
  return closingDelimiter.exec(content)?.index ?? -1;
}

function contentLineEnding(content: string): '\r\n' | '\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

export function injectMcpFrontmatter(content: string, servers: McpServerSpec[]): string {
  const closingStart = findFrontmatterEnd(content);
  if (closingStart === -1) {
    return content;
  }

  const newline = contentLineEnding(content);
  const frontmatterBlock = buildMcpFrontmatterBlock(servers).replace(/\n/g, newline);

  return content.slice(0, closingStart)
    + newline
    + frontmatterBlock
    + content.slice(closingStart);
}

export function hasMcpFrontmatter(content: string): boolean {
  const frontmatterEnd = findFrontmatterEnd(content);
  if (frontmatterEnd === -1) {
    return false;
  }
  return content.slice(0, frontmatterEnd).includes('mcp-servers:');
}
