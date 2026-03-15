/**
 * Tests for GitHubAgentSource (M5-4, Issue #127)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  GitHubAgentSource,
  type GitHubFetcher,
  type AgentManifest,
  type AgentDefinition,
  parseCharterMetadata,
} from '@bradygaster/squad-sdk/config';

// --- Mock fetcher helper ---

function makeFetcher(
  dirs: Array<{ name: string; type: 'file' | 'dir' }> = [],
  files: Record<string, string> = {},
): GitHubFetcher {
  return {
    listDirectory: vi.fn(async () => dirs),
    getFileContent: vi.fn(async (_o, _r, path) => files[path] ?? null),
  };
}

const CHARTER_AGENT1 = `## Identity
**Name:** Agent1
**Role:** Prompt Engineer

## Model
**Preferred:** claude-sonnet-4.5

## Tools
- edit
- grep
`;

const CHARTER_AGENT2 = `## Identity
**Name:** Agent2
**Role:** Code Architect
`;

// --- Tests ---

describe('GitHubAgentSource', () => {
  describe('constructor', () => {
    it('should parse owner/repo format', () => {
      const source = new GitHubAgentSource('acme/squad-team');
      expect(source.name).toBe('github');
      expect(source.type).toBe('github');
    });

    it('should throw on invalid repo format', () => {
      expect(() => new GitHubAgentSource('invalid')).toThrow('Invalid repo format');
      expect(() => new GitHubAgentSource('')).toThrow('Invalid repo format');
      expect(() => new GitHubAgentSource('a/b/c')).toThrow('Invalid repo format');
    });

    it('should accept optional ref and pathPrefix', () => {
      const fetcher = makeFetcher();
      const source = new GitHubAgentSource('acme/repo', {
        ref: 'develop',
        pathPrefix: 'custom/agents',
        fetcher,
      });
      expect(source.type).toBe('github');
    });
  });

  describe('listAgents', () => {
    it('should return manifests for agent directories with charters', async () => {
      const fetcher = makeFetcher(
        [
          { name: 'agent1', type: 'dir' },
          { name: 'agent2', type: 'dir' },
        ],
        {
          '.squad/agents/agent1/charter.md': CHARTER_AGENT1,
          '.squad/agents/agent2/charter.md': CHARTER_AGENT2,
        },
      );
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const agents = await source.listAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe('Agent1');
      expect(agents[0].role).toBe('Prompt Engineer');
      expect(agents[0].source).toBe('github');
      expect(agents[1].name).toBe('Agent2');
    });

    it('should skip files (non-directories)', async () => {
      const fetcher = makeFetcher(
        [
          { name: 'agent1', type: 'dir' },
          { name: 'README.md', type: 'file' },
        ],
        { '.squad/agents/agent1/charter.md': CHARTER_AGENT1 },
      );
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const agents = await source.listAgents();
      expect(agents).toHaveLength(1);
    });

    it('should skip directories without charter.md', async () => {
      const fetcher = makeFetcher(
        [{ name: 'empty-agent', type: 'dir' }],
        {},
      );
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const agents = await source.listAgents();
      expect(agents).toHaveLength(0);
    });

    it('should return empty array with default fetcher (no config)', async () => {
      const source = new GitHubAgentSource('acme/repo');
      const agents = await source.listAgents();
      expect(agents).toEqual([]);
    });

    it('should use custom pathPrefix', async () => {
      const fetcher = makeFetcher(
        [{ name: 'agent1', type: 'dir' }],
        { 'custom/path/agent1/charter.md': CHARTER_AGENT1 },
      );
      const source = new GitHubAgentSource('acme/repo', {
        pathPrefix: 'custom/path',
        fetcher,
      });

      const agents = await source.listAgents();
      expect(agents).toHaveLength(1);
      expect(fetcher.listDirectory).toHaveBeenCalledWith('acme', 'repo', 'custom/path', undefined);
    });

    it('should pass branch ref to fetcher', async () => {
      const fetcher = makeFetcher([], {});
      const source = new GitHubAgentSource('acme/repo', { ref: 'develop', fetcher });

      await source.listAgents();
      expect(fetcher.listDirectory).toHaveBeenCalledWith('acme', 'repo', '.squad/agents', 'develop');
    });
  });

  describe('getAgent', () => {
    it('should return full agent definition', async () => {
      const fetcher = makeFetcher([], {
        '.squad/agents/agent1/charter.md': CHARTER_AGENT1,
      });
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const agent = await source.getAgent('agent1');

      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('Agent1');
      expect(agent!.role).toBe('Prompt Engineer');
      expect(agent!.charter).toBe(CHARTER_AGENT1);
      expect(agent!.model).toBe('claude-sonnet-4.5');
      expect(agent!.tools).toEqual(['edit', 'grep']);
      expect(agent!.source).toBe('github');
    });

    it('should include history when available', async () => {
      const fetcher = makeFetcher([], {
        '.squad/agents/agent1/charter.md': CHARTER_AGENT1,
        '.squad/agents/agent1/history.md': '# History\n- Created team',
      });
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const agent = await source.getAgent('agent1');
      expect(agent!.history).toBe('# History\n- Created team');
    });

    it('should return null when charter not found', async () => {
      const fetcher = makeFetcher([], {});
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const agent = await source.getAgent('nonexistent');
      expect(agent).toBeNull();
    });

    it('should use directory name when charter has no name', async () => {
      const fetcher = makeFetcher([], {
        '.squad/agents/my-agent/charter.md': '# Just a charter\nSome content.',
      });
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const agent = await source.getAgent('my-agent');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('my-agent');
      expect(agent!.role).toBe('agent');
    });
  });

  describe('getCharter', () => {
    it('should return raw charter content', async () => {
      const fetcher = makeFetcher([], {
        '.squad/agents/agent1/charter.md': CHARTER_AGENT1,
      });
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const charter = await source.getCharter('agent1');
      expect(charter).toBe(CHARTER_AGENT1);
    });

    it('should return null when charter missing', async () => {
      const fetcher = makeFetcher([], {});
      const source = new GitHubAgentSource('acme/repo', { fetcher });

      const charter = await source.getCharter('missing');
      expect(charter).toBeNull();
    });
  });

  describe('parseCharterMetadata', () => {
    it('should extract name and role from Identity section', () => {
      const meta = parseCharterMetadata(CHARTER_AGENT1);
      expect(meta.name).toBe('Agent1');
      expect(meta.role).toBe('Prompt Engineer');
    });

    it('should extract model preference', () => {
      const meta = parseCharterMetadata(CHARTER_AGENT1);
      expect(meta.model).toBe('claude-sonnet-4.5');
    });

    it('should extract tools list', () => {
      const meta = parseCharterMetadata(CHARTER_AGENT1);
      expect(meta.tools).toEqual(['edit', 'grep']);
    });

    it('should handle empty content', () => {
      const meta = parseCharterMetadata('');
      expect(meta.name).toBeUndefined();
      expect(meta.role).toBeUndefined();
    });
  });
});
