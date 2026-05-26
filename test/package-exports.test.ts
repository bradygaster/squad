import { describe, it, expect } from 'vitest';

describe('SDK package exports', () => {
  it('exports VERSION from root', async () => {
    const sdk = await import('@bradygaster/squad-sdk');
    expect(sdk.VERSION).toBeDefined();
    expect(typeof sdk.VERSION).toBe('string');
  });

  it('exports from /config subpath', async () => {
    const config = await import('@bradygaster/squad-sdk/config');
    expect(config).toBeDefined();
    // config barrel re-exports schema, routing, models, etc.
    expect(config.DEFAULT_CONFIG).toBeDefined();
    expect(config.buildMcpServerSpecs).toBeDefined();
    expect(config.injectMcpFrontmatter).toBeDefined();
    expect(config.hasMcpFrontmatter).toBeDefined();
  });

  it('MCP config helpers build GitHub and Azure DevOps server specs', async () => {
    const config = await import('@bradygaster/squad-sdk/config');

    const githubServers = config.buildMcpServerSpecs(true);
    expect(githubServers.map((server: { name: string }) => server.name)).toEqual(['squad_state', 'EXAMPLE-github']);
    expect(githubServers[0]).not.toHaveProperty('env');
    expect(githubServers[1]).toMatchObject({
      command: 'npx',
      args: ['-y', '@anthropic/github-mcp-server'],
      env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
    });

    const versionedServers = config.buildMcpServerSpecs(true, '1.2.3');
    expect(versionedServers[0].args).toEqual(['-y', '@bradygaster/squad-cli@1.2.3', 'state-mcp']);

    const adoServers = config.buildMcpServerSpecs(false);
    expect(adoServers.map((server: { name: string }) => server.name)).toEqual(['squad_state', 'EXAMPLE-azure-devops']);
    expect(adoServers[1]).toMatchObject({
      command: 'npx',
      args: ['-y', '@azure/devops-mcp-server'],
      env: {
        AZURE_DEVOPS_ORG: '${AZURE_DEVOPS_ORG}',
        AZURE_DEVOPS_PAT: '${AZURE_DEVOPS_PAT}',
      },
    });
  });

  it('MCP config helpers build portable JSON config', async () => {
    const config = await import('@bradygaster/squad-sdk/config');
    const mcpConfig = config.buildMcpConfigJson(config.buildMcpServerSpecs(true));

    expect(mcpConfig).toMatchObject({
      mcpServers: {
        squad_state: {
          command: 'npx',
          args: ['-y', '@bradygaster/squad-cli', 'state-mcp'],
        },
        'EXAMPLE-github': {
          command: 'npx',
          args: ['-y', '@anthropic/github-mcp-server'],
          env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
        },
      },
    });
    expect((mcpConfig as { mcpServers: Record<string, unknown> }).mcpServers.squad_state).not.toHaveProperty('env');
  });

  it('MCP frontmatter helpers only detect and inject frontmatter blocks', async () => {
    const config = await import('@bradygaster/squad-sdk/config');
    const bodyOnly = 'mcp-servers:\n  fake: true\n';
    expect(config.hasMcpFrontmatter(bodyOnly)).toBe(false);
    expect(config.injectMcpFrontmatter(bodyOnly, config.buildMcpServerSpecs(true))).toBe(bodyOnly);

    const agent = '---\nname: Squad\ndescription: Test\n---\n\nBody mentions mcp-servers: only here.\n';
    expect(config.hasMcpFrontmatter(agent)).toBe(false);

    const injected = config.injectMcpFrontmatter(agent, config.buildMcpServerSpecs(true));
    expect(config.hasMcpFrontmatter(injected)).toBe(true);
    expect(injected).toContain('mcp-servers:\n  squad_state:');
    expect(injected).toContain('\n---\n\nBody mentions mcp-servers: only here.\n');
  });

  it('MCP frontmatter helpers support CRLF frontmatter delimiters', async () => {
    const config = await import('@bradygaster/squad-sdk/config');
    const agent = '---\r\nname: Squad\r\ndescription: Test\r\n---\r\n\r\nBody.\r\n';

    expect(config.hasMcpFrontmatter(agent)).toBe(false);

    const injected = config.injectMcpFrontmatter(agent, config.buildMcpServerSpecs(true));
    expect(config.hasMcpFrontmatter(injected)).toBe(true);
    expect(injected).toContain('mcp-servers:\r\n  squad_state:');
    expect(injected).toContain('\r\n---\r\n\r\nBody.\r\n');
  });

  it('exports from /resolution subpath', async () => {
    const resolution = await import('@bradygaster/squad-sdk/resolution');
    expect(resolution.resolveSquad).toBeDefined();
  });

  it('exports from /parsers subpath', async () => {
    const parsers = await import('@bradygaster/squad-sdk/parsers');
    expect(parsers).toBeDefined();
    expect(parsers.parseTeamMarkdown).toBeDefined();
  });

  it('exports from /types subpath', async () => {
    // types subpath uses export type only — no runtime values
    // just verify the module resolves without error
    const types = await import('@bradygaster/squad-sdk/types');
    expect(types).toBeDefined();
  });

  it('exports from /agents subpath', async () => {
    const agents = await import('@bradygaster/squad-sdk/agents');
    expect(agents).toBeDefined();
  });

  it('exports from /skills subpath', async () => {
    const skills = await import('@bradygaster/squad-sdk/skills');
    expect(skills).toBeDefined();
  });

  it('exports from /tools subpath', async () => {
    const tools = await import('@bradygaster/squad-sdk/tools');
    expect(tools).toBeDefined();
  });
});
