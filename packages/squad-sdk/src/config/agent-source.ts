/**
 * Agent Source Registry
 * Pluggable agent discovery and loading
 */

import * as path from 'path';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';
import type { SquadState } from '../state/squad-state.js';

export interface AgentSource {
  readonly name: string;
  readonly type: 'local' | 'github' | 'marketplace';
  listAgents(): Promise<AgentManifest[]>;
  getAgent(name: string): Promise<AgentDefinition | null>;
  getCharter(name: string): Promise<string | null>;
}

export interface AgentManifest {
  name: string;
  role: string;
  version?: string;
  source: string;
}

export interface AgentDefinition extends AgentManifest {
  charter: string;
  model?: string;
  tools?: string[];
  skills?: string[];
  history?: string;
}

/** Directories to scan for agents, in priority order. */
const AGENT_DIRS = ['.squad/agents', '.ai-team/agents'] as const;

/**
 * Parse charter.md content to extract agent metadata.
 */
export function parseCharterMetadata(content: string): {
  name?: string;
  role?: string;
  model?: string;
  skills?: string[];
  tools?: string[];
} {
  const result: ReturnType<typeof parseCharterMetadata> = {};

  const identityMatch = content.match(/##\s+Identity\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (identityMatch) {
    const section = identityMatch[1]!;
    const nameMatch = section.match(/\*\*Name:\*\*\s*(.+)/i);
    if (nameMatch) result.name = nameMatch[1]!.trim();

    const roleMatch = section.match(/\*\*Role:\*\*\s*(.+)/i);
    if (roleMatch) result.role = roleMatch[1]!.trim();

    const expertiseMatch = section.match(/\*\*Expertise:\*\*\s*(.+)/i);
    if (expertiseMatch) {
      result.skills = expertiseMatch[1]!.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  const modelMatch = content.match(/##\s+Model\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (modelMatch) {
    const preferredMatch = modelMatch[1]!.match(/\*\*Preferred:\*\*\s*(.+)/i);
    if (preferredMatch) result.model = preferredMatch[1]!.trim();
  }

  const toolsMatch = content.match(/##\s+Tools?\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (toolsMatch) {
    result.tools = toolsMatch[1]!
      .split('\n')
      .map(line => {
        const m = line.match(/^\s*[-*]\s+`?([^`\s]+)`?/);
        return m ? m[1]!.trim() : null;
      })
      .filter((t): t is string => t !== null);
  }

  return result;
}

export class LocalAgentSource implements AgentSource {
  readonly name = 'local';
  readonly type = 'local' as const;

  constructor(
    private basePath: string,
    private storage: StorageProvider = new FSStorageProvider(),
    private state?: SquadState,
  ) {}

  /**
   * Resolve the agents directory, preferring .squad/agents over .ai-team/agents.
   */
  private async resolveAgentsDir(): Promise<string | null> {
    for (const dir of AGENT_DIRS) {
      const fullPath = path.join(this.basePath, dir);
      if (await this.storage.isDirectory(fullPath)) return fullPath;
    }
    return null;
  }

  async listAgents(): Promise<AgentManifest[]> {
    // Use SquadState agents collection when available
    if (this.state) {
      try {
        const names = await this.state.agents.list();
        const manifests: AgentManifest[] = [];

        for (const entryName of names) {
          try {
            const content = await this.state.agents.get(entryName).charter();
            const meta = parseCharterMetadata(content);
            manifests.push({
              name: meta.name || entryName,
              role: meta.role || 'agent',
              source: 'local',
            });
          } catch {
            continue;
          }
        }

        return manifests;
      } catch {
        // Fall through to raw StorageProvider path
      }
    }

    // Fallback: raw StorageProvider scan
    const agentsDir = await this.resolveAgentsDir();
    if (!agentsDir) return [];

    const manifests: AgentManifest[] = [];
    let entries: string[];
    try {
      entries = await this.storage.list(agentsDir);
    } catch {
      return [];
    }

    for (const entryName of entries) {
      const entryPath = path.join(agentsDir, entryName);
      if (!(await this.storage.isDirectory(entryPath))) continue;
      const charterPath = path.join(entryPath, 'charter.md');
      const content = await this.storage.read(charterPath);
      if (!content) continue;
      const meta = parseCharterMetadata(content);
      manifests.push({
        name: meta.name || entryName,
        role: meta.role || 'agent',
        source: 'local',
      });
    }

    return manifests;
  }

  async getAgent(name: string): Promise<AgentDefinition | null> {
    // Use SquadState agents collection when available
    if (this.state) {
      try {
        const handle = this.state.agents.get(name);
        const charter = await handle.charter();
        const meta = parseCharterMetadata(charter);

        // Read history via raw storage (history parsing is more granular in shadow module)
        const agentsDir = await this.resolveAgentsDir();
        const history = agentsDir
          ? await this.storage.read(path.join(agentsDir, name, 'history.md'))
          : undefined;

        return {
          name: meta.name || name,
          role: meta.role || 'agent',
          source: 'local',
          charter,
          model: meta.model,
          tools: meta.tools,
          skills: meta.skills,
          history,
        };
      } catch {
        // Agent not found via state, fall through
      }
    }

    // Fallback: raw StorageProvider
    const agentsDir = await this.resolveAgentsDir();
    if (!agentsDir) return null;

    const charterPath = path.join(agentsDir, name, 'charter.md');
    const charter = await this.storage.read(charterPath);
    if (!charter) return null;

    const meta = parseCharterMetadata(charter);

    // Optionally read history.md
    const history = await this.storage.read(path.join(agentsDir, name, 'history.md'));

    return {
      name: meta.name || name,
      role: meta.role || 'agent',
      source: 'local',
      charter,
      model: meta.model,
      tools: meta.tools,
      skills: meta.skills,
      history,
    };
  }

  async getCharter(name: string): Promise<string | null> {
    // Use SquadState agents collection when available
    if (this.state) {
      try {
        return await this.state.agents.get(name).charter();
      } catch {
        return null;
      }
    }

    // Fallback: raw StorageProvider
    const agentsDir = await this.resolveAgentsDir();
    if (!agentsDir) return null;

    return await this.storage.read(path.join(agentsDir, name, 'charter.md')) ?? null;
  }
}

/**
 * Pluggable fetcher interface for GitHub API calls (enables testing).
 */
export interface GitHubFetcher {
  /** List directory entries at a path in a repo. */
  listDirectory(owner: string, repo: string, path: string, ref?: string): Promise<Array<{ name: string; type: 'file' | 'dir' }>>;
  /** Fetch file content (UTF-8 string) at a path in a repo. */
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string | null>;
}

/** Parse "owner/repo" format into components. */
function parseOwnerRepo(repo: string): { owner: string; repo: string } {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format "${repo}": expected "owner/repo"`);
  }
  return { owner: parts[0], repo: parts[1] };
}

export class GitHubAgentSource implements AgentSource {
  readonly name = 'github';
  readonly type = 'github' as const;

  private owner: string;
  private repoName: string;
  private branch?: string;
  private pathPrefix: string;
  private fetcher: GitHubFetcher;

  constructor(repo: string, options?: { ref?: string; pathPrefix?: string; fetcher?: GitHubFetcher }) {
    const parsed = parseOwnerRepo(repo);
    this.owner = parsed.owner;
    this.repoName = parsed.repo;
    this.branch = options?.ref;
    this.pathPrefix = options?.pathPrefix ?? '.squad/agents';
    this.fetcher = options?.fetcher ?? createDefaultFetcher();
  }

  async listAgents(): Promise<AgentManifest[]> {
    const entries = await this.fetcher.listDirectory(
      this.owner, this.repoName, this.pathPrefix, this.branch,
    );
    const dirs = entries.filter(e => e.type === 'dir');
    const manifests: AgentManifest[] = [];

    for (const dir of dirs) {
      const charterPath = `${this.pathPrefix}/${dir.name}/charter.md`;
      const content = await this.fetcher.getFileContent(
        this.owner, this.repoName, charterPath, this.branch,
      );
      if (!content) continue;
      const meta = parseCharterMetadata(content);
      manifests.push({
        name: meta.name || dir.name,
        role: meta.role || 'agent',
        source: 'github',
      });
    }

    return manifests;
  }

  async getAgent(name: string): Promise<AgentDefinition | null> {
    const charterPath = `${this.pathPrefix}/${name}/charter.md`;
    const charter = await this.fetcher.getFileContent(
      this.owner, this.repoName, charterPath, this.branch,
    );
    if (!charter) return null;

    const meta = parseCharterMetadata(charter);

    let history: string | undefined;
    const historyPath = `${this.pathPrefix}/${name}/history.md`;
    const historyContent = await this.fetcher.getFileContent(
      this.owner, this.repoName, historyPath, this.branch,
    );
    if (historyContent) history = historyContent;

    return {
      name: meta.name || name,
      role: meta.role || 'agent',
      source: 'github',
      charter,
      model: meta.model,
      tools: meta.tools,
      skills: meta.skills,
      history,
    };
  }

  async getCharter(name: string): Promise<string | null> {
    const charterPath = `${this.pathPrefix}/${name}/charter.md`;
    return this.fetcher.getFileContent(
      this.owner, this.repoName, charterPath, this.branch,
    );
  }
}

/** Default fetcher that returns empty results when no real fetcher is configured. */
function createDefaultFetcher(): GitHubFetcher {
  return {
    async listDirectory(): Promise<Array<{ name: string; type: 'file' | 'dir' }>> {
      return [];
    },
    async getFileContent(): Promise<string | null> {
      return null;
    },
  };
}

export class MarketplaceAgentSource implements AgentSource {
  readonly name = 'marketplace';
  readonly type = 'marketplace' as const;

  constructor(private apiEndpoint: string) {}

  async listAgents(): Promise<AgentManifest[]> {
    return [];
  }

  async getAgent(name: string): Promise<AgentDefinition | null> {
    return null;
  }

  async getCharter(name: string): Promise<string | null> {
    return null;
  }
}

export class AgentRegistry {
  private sources: Map<string, AgentSource> = new Map();

  register(source: AgentSource): void {
    this.sources.set(source.name, source);
  }

  unregister(name: string): boolean {
    return this.sources.delete(name);
  }

  getSource(name: string): AgentSource | undefined {
    return this.sources.get(name);
  }

  async listAllAgents(): Promise<AgentManifest[]> {
    const results = await Promise.all(
      Array.from(this.sources.values()).map(s => s.listAgents())
    );
    return results.flat();
  }

  async findAgent(name: string): Promise<AgentDefinition | null> {
    for (const source of this.sources.values()) {
      const agent = await source.getAgent(name);
      if (agent) return agent;
    }
    return null;
  }

  async getCharter(name: string): Promise<string | null> {
    for (const source of this.sources.values()) {
      const charter = await source.getCharter(name);
      if (charter) return charter;
    }
    return null;
  }
}
