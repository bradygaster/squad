/**
 * MCP config location guidance.
 *
 * Copilot CLI reads `.mcp.json` (cwd up to the repo root), `.github/mcp.json`
 * and `~/.copilot/mcp-config.json`. It does not read a project-level
 * `.copilot/mcp-config.json`, which is why Squad moved `squad_state` to
 * `.mcp.json` (see `mcp-root.ts`). The coordinator's MCP guide and its
 * "add the server" fallback must point users at a file the host loads.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const MCP_GUIDES = [
  'templates/mcp-config.md',
  '.squad-templates/mcp-config.md',
  'packages/squad-cli/templates/mcp-config.md',
  'packages/squad-sdk/templates/mcp-config.md',
];

const COORDINATORS = [
  'templates/squad.agent.md.template',
  '.squad-templates/squad.agent.md',
  'packages/squad-cli/templates/squad.agent.md.template',
  'packages/squad-sdk/templates/squad.agent.md.template',
  '.github/agents/squad.agent.md',
];

describe('MCP config locations in coordinator templates', () => {
  it.each(MCP_GUIDES)('%s names the repo-root .mcp.json as the shared location', (rel) => {
    const guide = read(rel);
    expect(guide).toMatch(/\*\*Repository-level:\*\* `\.mcp\.json` at the repo root/);
    expect(guide).not.toMatch(/\*\*Repository-level:\*\* `\.copilot\/mcp-config\.json`/);
    expect(guide).toContain('`.vscode/mcp.json`');
    expect(guide).toContain('`~/.copilot/mcp-config.json`');
  });

  it.each(COORDINATORS)('%s does not tell users to add servers to .copilot/mcp-config.json', (rel) => {
    const coordinator = read(rel);
    expect(coordinator).not.toContain('Add it to `.copilot/mcp-config.json`');
    expect(coordinator).toContain('Add it to `.mcp.json` next to `squad_state`');
  });
});
