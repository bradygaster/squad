/**
 * Skill Source Interface & Implementations (M5-5, Issue #128)
 *
 * Pluggable skill discovery from local filesystem or GitHub repos.
 */

import * as path from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { StorageProvider } from '../storage/storage-provider.js';

import { parseFrontmatter, type SkillDefinition } from './skill-loader.js';
import type { GitHubFetcher } from '../config/agent-source.js';

// --- Interface ---

export interface SkillSource {
  readonly name: string;
  readonly type: 'local' | 'github';
  readonly priority: number;
  listSkills(): Promise<SkillManifest[]>;
  getSkill(id: string): Promise<SkillDefinition | null>;
  getContent(id: string): Promise<string | null>;
}

export interface SkillManifest {
  id: string;
  name: string;
  domain: string;
  source: string;
}

// --- Local implementation ---

export class LocalSkillSource implements SkillSource {
  readonly name = 'local';
  readonly type = 'local' as const;
  readonly priority: number;
  private storage: StorageProvider;

  constructor(private basePath: string, priority = 0, storage: StorageProvider = new FSStorageProvider()) {
    this.priority = priority;
    this.storage = storage;
  }

  private get skillsDir(): string {
    const copilotDir = path.join(this.basePath, '.copilot', 'skills');
    if (this.storage.existsSync(copilotDir)) return copilotDir;
    // Backward compat: fall back to legacy location
    return path.join(this.basePath, '.squad', 'skills');
  }

  async listSkills(): Promise<SkillManifest[]> {
    if (!this.storage.existsSync(this.skillsDir)) return [];
    let entries: string[];
    try {
      entries = this.storage.listSync(this.skillsDir);
    } catch {
      return [];
    }

    const manifests: SkillManifest[] = [];
    for (const entryName of entries) {
      if (!this.storage.isDirectorySync(path.join(this.skillsDir, entryName))) continue;
      const skillFile = path.join(this.skillsDir, entryName, 'SKILL.md');
      if (!this.storage.existsSync(skillFile)) continue;
      try {
        const raw = this.storage.readSync(skillFile) ?? '';
        const { meta } = parseFrontmatter(raw);
        manifests.push({
          id: entryName,
          name: typeof meta.name === 'string' ? meta.name : entryName,
          domain: typeof meta.domain === 'string' ? meta.domain : 'general',
          source: 'local',
        });
      } catch {
        // skip malformed
      }
    }
    return manifests;
  }

  async getSkill(id: string): Promise<SkillDefinition | null> {
    const skillFile = path.join(this.skillsDir, id, 'SKILL.md');
    if (!this.storage.existsSync(skillFile)) return null;
    try {
      const raw = this.storage.readSync(skillFile) ?? '';
      const { meta, body } = parseFrontmatter(raw);
      if (!body) return null;
      return {
        id,
        name: typeof meta.name === 'string' ? meta.name : id,
        domain: typeof meta.domain === 'string' ? meta.domain : 'general',
        content: body,
        triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
        agentRoles: Array.isArray(meta.roles) ? meta.roles : [],
      };
    } catch {
      return null;
    }
  }

  async getContent(id: string): Promise<string | null> {
    const skillFile = path.join(this.skillsDir, id, 'SKILL.md');
    if (!this.storage.existsSync(skillFile)) return null;
    try {
      const raw = this.storage.readSync(skillFile) ?? '';
      const { body } = parseFrontmatter(raw);
      return body || null;
    } catch {
      return null;
    }
  }
}

// --- GitHub implementation ---

export class GitHubSkillSource implements SkillSource {
  readonly name = 'github';
  readonly type = 'github' as const;
  readonly priority: number;

  private owner: string;
  private repoName: string;
  private branch?: string;
  private pathPrefix: string;
  private fetcher: GitHubFetcher;

  constructor(
    repo: string,
    options?: { ref?: string; pathPrefix?: string; fetcher?: GitHubFetcher; priority?: number },
  ) {
    const parts = repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repo format "${repo}": expected "owner/repo"`);
    }
    this.owner = parts[0];
    this.repoName = parts[1];
    this.branch = options?.ref;
    this.pathPrefix = options?.pathPrefix ?? '.copilot/skills';
    this.fetcher = options?.fetcher ?? {
      async listDirectory() { throw new Error('No GitHubFetcher configured'); },
      async getFileContent() { throw new Error('No GitHubFetcher configured'); },
    };
    this.priority = options?.priority ?? 0;
  }

  async listSkills(): Promise<SkillManifest[]> {
    const entries = await this.fetcher.listDirectory(
      this.owner, this.repoName, this.pathPrefix, this.branch,
    );
    const dirs = entries.filter(e => e.type === 'dir');
    const manifests: SkillManifest[] = [];

    for (const dir of dirs) {
      const skillPath = `${this.pathPrefix}/${dir.name}/SKILL.md`;
      const content = await this.fetcher.getFileContent(
        this.owner, this.repoName, skillPath, this.branch,
      );
      if (!content) continue;
      const { meta } = parseFrontmatter(content);
      manifests.push({
        id: dir.name,
        name: typeof meta.name === 'string' ? meta.name : dir.name,
        domain: typeof meta.domain === 'string' ? meta.domain : 'general',
        source: 'github',
      });
    }
    return manifests;
  }

  async getSkill(id: string): Promise<SkillDefinition | null> {
    const skillPath = `${this.pathPrefix}/${id}/SKILL.md`;
    const content = await this.fetcher.getFileContent(
      this.owner, this.repoName, skillPath, this.branch,
    );
    if (!content) return null;
    const { meta, body } = parseFrontmatter(content);
    if (!body) return null;
    return {
      id,
      name: typeof meta.name === 'string' ? meta.name : id,
      domain: typeof meta.domain === 'string' ? meta.domain : 'general',
      content: body,
      triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
      agentRoles: Array.isArray(meta.roles) ? meta.roles : [],
    };
  }

  async getContent(id: string): Promise<string | null> {
    const skillPath = `${this.pathPrefix}/${id}/SKILL.md`;
    const content = await this.fetcher.getFileContent(
      this.owner, this.repoName, skillPath, this.branch,
    );
    if (!content) return null;
    const { body } = parseFrontmatter(content);
    return body || null;
  }
}

// --- Registry ---

export class SkillSourceRegistry {
  private sources: Map<string, SkillSource> = new Map();

  register(source: SkillSource): void {
    this.sources.set(source.name, source);
  }

  unregister(name: string): boolean {
    return this.sources.delete(name);
  }

  getSource(name: string): SkillSource | undefined {
    return this.sources.get(name);
  }

  /** Sources sorted by priority descending (higher priority first). */
  private sortedSources(): SkillSource[] {
    return Array.from(this.sources.values()).sort((a, b) => b.priority - a.priority);
  }

  async listAllSkills(): Promise<SkillManifest[]> {
    const sorted = this.sortedSources();
    const results = await Promise.all(sorted.map(s => s.listSkills()));
    return results.flat();
  }

  async findSkill(id: string): Promise<SkillDefinition | null> {
    for (const source of this.sortedSources()) {
      const skill = await source.getSkill(id);
      if (skill) return skill;
    }
    return null;
  }

  async getContent(id: string): Promise<string | null> {
    for (const source of this.sortedSources()) {
      const content = await source.getContent(id);
      if (content) return content;
    }
    return null;
  }
}
