/**
 * M5-1: Export command (squad export)
 * Exports Squad configuration as a portable bundle.
 */

import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import { join, basename, relative } from 'node:path';

const storage = new FSStorageProvider();

export interface ExportOptions {
  includeHistory?: boolean;
  includeSkills?: boolean;
  format?: 'json' | 'yaml';
  anonymize?: boolean;
}

export interface AgentCharter {
  name: string;
  role: string;
  content: string;
}

export interface ExportRoutingRule {
  pattern: string;
  agent: string;
  priority?: number;
}

export interface ExportMetadata {
  version: string;
  timestamp: string;
  source: string;
}

export interface ExportBundle {
  config: Record<string, unknown>;
  agents: AgentCharter[];
  skills: string[];
  routingRules: ExportRoutingRule[];
  metadata: ExportMetadata;
  history?: Record<string, unknown>[];
}

const SECRET_PATTERNS = [
  /token[=:]\s*['"]?[A-Za-z0-9_\-]{20,}/gi,
  /secret[=:]\s*['"]?[A-Za-z0-9_\-]{20,}/gi,
  /password[=:]\s*['"]?[^\s'"]{8,}/gi,
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
];

/**
 * Strip secrets and sensitive patterns from text content.
 */
export function sanitizeContent(content: string): string {
  let sanitized = content;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

/**
 * Anonymize PII and local paths from content.
 */
export function anonymizeContent(content: string): string {
  let result = sanitizeContent(content);
  // Strip absolute paths (Unix and Windows)
  result = result.replace(/(?:\/[\w.-]+){3,}/g, '/[path]');
  result = result.replace(/[A-Z]:\\(?:[\w.-]+\\){2,}/gi, '[path]\\');
  // Strip email-like patterns
  result = result.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, '[email]');
  return result;
}

function readTeamConfig(projectDir: string): Record<string, unknown> {
  const teamFile = join(projectDir, '.ai-team', 'team.md');
  if (storage.existsSync(teamFile)) {
    return { teamFile: storage.readSync(teamFile) ?? '' };
  }
  return {};
}

function readAgents(projectDir: string): AgentCharter[] {
  const agentsDir = join(projectDir, '.github', 'agents');
  if (!storage.existsSync(agentsDir)) return [];

  return storage.listSync(agentsDir)
    .filter((f: string) => f.endsWith('.md'))
    .map((f: string) => {
      const content = storage.readSync(join(agentsDir, f)) ?? '';
      const name = basename(f, '.md').replace('.agent', '');
      return { name, role: name, content };
    });
}

function readRoutingRules(projectDir: string): ExportRoutingRule[] {
  const routingFile = join(projectDir, '.ai-team', 'routing.md');
  if (!storage.existsSync(routingFile)) return [];

  const content = storage.readSync(routingFile) ?? '';
  const rules: ExportRoutingRule[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+`?([^`]+)`?\s*→\s*(\w+)/);
    if (match) {
      rules.push({ pattern: match[1]!.trim(), agent: match[2]!.trim() });
    }
  }
  return rules;
}

/**
 * Export a Squad project configuration as a bundle.
 */
export function exportSquadConfig(projectDir: string, options?: ExportOptions): ExportBundle {
  const opts: Required<ExportOptions> = {
    includeHistory: options?.includeHistory ?? false,
    includeSkills: options?.includeSkills ?? true,
    format: options?.format ?? 'json',
    anonymize: options?.anonymize ?? false,
  };

  const config = readTeamConfig(projectDir);
  let agents = readAgents(projectDir);
  let routingRules = readRoutingRules(projectDir);
  const skills: string[] = [];

  if (opts.includeSkills) {
    const skillSources = [
      { dir: join(projectDir, '.copilot', 'skills'), layout: 'nested' as const },
      { dir: join(projectDir, '.squad', 'skills'), layout: 'nested' as const },
      { dir: join(projectDir, '.ai-team', 'skills'), layout: 'flat' as const },
    ];
    const source = skillSources.find(({ dir }) => storage.existsSync(dir));
    if (source) {
      if (source.layout === 'nested') {
        const skillDirs = storage.listSync(source.dir)
          .filter((entry: string) => storage.isDirectorySync(join(source.dir, entry)) && storage.existsSync(join(source.dir, entry, 'SKILL.md')));
        skills.push(...skillDirs);
      } else {
        const skillFiles = storage.listSync(source.dir).filter((f: string) => f.endsWith('.md'));
        skills.push(...skillFiles.map((f: string) => basename(f, '.md')));
      }
    }
  }

  if (opts.anonymize) {
    agents = agents.map(a => ({
      ...a,
      content: anonymizeContent(a.content),
    }));
  }

  const bundle: ExportBundle = {
    config: opts.anonymize ? {} : config,
    agents,
    skills,
    routingRules,
    metadata: {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      source: opts.anonymize ? '[anonymized]' : projectDir,
    },
  };

  if (opts.includeHistory) {
    bundle.history = [];
  }

  return bundle;
}

/**
 * Serialize an export bundle to a string.
 */
export function serializeBundle(bundle: ExportBundle, format?: 'json' | 'yaml'): string {
  if (format === 'yaml') {
    return toSimpleYaml(bundle);
  }
  return JSON.stringify(bundle, null, 2);
}

/** Minimal YAML serializer for flat/nested objects */
function toSimpleYaml(obj: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null\n`;
  if (typeof obj === 'string') return obj.includes('\n') ? `|\n${obj.split('\n').map(l => pad + '  ' + l).join('\n')}\n` : `${obj}\n`;
  if (typeof obj === 'number' || typeof obj === 'boolean') return `${obj}\n`;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `[]\n`;
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const inner = toSimpleYaml(item, indent + 2).trimStart();
        return `${pad}- ${inner}`;
      }
      return `${pad}- ${item}\n`;
    }).join('');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `{}\n`;
    return entries.map(([k, v]) => {
      if (typeof v === 'object' && v !== null) {
        return `${pad}${k}:\n${toSimpleYaml(v, indent + 2)}`;
      }
      return `${pad}${k}: ${toSimpleYaml(v)}`;
    }).join('');
  }
  return `${obj}\n`;
}
