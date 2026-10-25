/**
 * `squad health` readiness checks for CI and agent dispatch.
 *
 * @module cli/commands/health
 */

import path from 'node:path';
import { readdirSync } from 'node:fs';
import { parse as parseJsonc } from 'jsonc-parser';
import {
  FSStorageProvider,
  resolveStateBackend,
  verifyStateBackend,
  type StateBackend,
  type StateBackendType,
} from '@bradygaster/squad-sdk';
import { parseCharterMarkdown } from '@bradygaster/squad-sdk/agents';
import { readCastingRegistryPair } from '@bradygaster/squad-sdk/casting';
import {
  parseRoutingRulesMarkdown,
  parseTeamMarkdown,
} from '@bradygaster/squad-sdk/parsers';
import { effectiveSquadDir } from '../core/effective-squad-dir.js';

const storage = new FSStorageProvider();

export const HEALTH_SCHEMA = 'squad-health/v1' as const;

export type HealthCheckStatus = 'pass' | 'info' | 'warn' | 'fail' | 'skip';
export type HealthCheckId =
  | 'team'
  | 'registry-charters'
  | 'routing'
  | 'state-backend'
  | 'env-vars';

export interface HealthCheckItem {
  id: HealthCheckId;
  status: HealthCheckStatus;
  message: string;
  diagnostics?: string[];
}

export interface HealthReport {
  schema: typeof HEALTH_SCHEMA;
  /** `fail` when any check failed; informational items and warnings never fail the report. */
  status: 'pass' | 'fail';
  checks: HealthCheckItem[];
}

interface CastingRegistry {
  agents: Record<string, unknown>;
}

/**
 * Built-ins are not cast registry agents. Rai and Fact Checker are available after upgrade but
 * remain explicit roster opt-ins for existing squads.
 */
const BUILTIN_AGENTS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'scribe', name: 'Scribe' },
  { id: 'ralph', name: 'Ralph' },
  { id: 'rai', name: 'Rai' },
  { id: 'fact-checker', name: 'Fact Checker' },
];

function pass(id: HealthCheckId, message: string): HealthCheckItem {
  return { id, status: 'pass', message };
}

function infoItem(id: HealthCheckId, message: string, diagnostics?: string[]): HealthCheckItem {
  return diagnostics && diagnostics.length > 0
    ? { id, status: 'info', message, diagnostics }
    : { id, status: 'info', message };
}

function warnItem(id: HealthCheckId, message: string, diagnostics?: string[]): HealthCheckItem {
  return diagnostics && diagnostics.length > 0
    ? { id, status: 'warn', message, diagnostics }
    : { id, status: 'warn', message };
}

function fail(
  id: HealthCheckId,
  message: string,
  diagnostics?: string[],
): HealthCheckItem {
  return diagnostics && diagnostics.length > 0
    ? { id, status: 'fail', message, diagnostics }
    : { id, status: 'fail', message };
}

function skip(id: HealthCheckId, message: string): HealthCheckItem {
  return { id, status: 'skip', message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredFile(filePath: string, displayPath: string): string {
  if (!storage.existsSync(filePath)) {
    throw new Error(`${displayPath} not found`);
  }
  let content: string | undefined;
  try {
    content = storage.readSync(filePath);
  } catch (error) {
    throw new Error(`${displayPath} could not be read (${errorKind(error)})`);
  }
  if (!content?.trim()) {
    throw new Error(`${displayPath} is empty`);
  }
  return content;
}

function parseJsonObject(content: string, displayPath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error(`${displayPath} contains invalid JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${displayPath} root must be a JSON object`);
  }
  return parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function errorKind(error: unknown): string {
  if (isRecord(error) && typeof error.code === 'string') {
    return error.code;
  }
  return error instanceof Error ? error.name : 'Error';
}

function normalizeAgentRef(value: string): string {
  const link = value.match(/^\[([^\]]+)\]\([^)]+\)$/);
  return (link?.[1] ?? value)
    .replace(/[`*_~]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .toLowerCase();
}

function readRegistry(squadDir: string): CastingRegistry {
  const displayPath = 'casting/registry.json';
  const pair = readCastingRegistryPair(path.join(squadDir, 'casting'));
  const parsed = pair.registry;
  if (!parsed) throw new Error(`${displayPath} is missing`);
  if (!isRecord(parsed.agents)) {
    throw new Error(`${displayPath} must contain an agents object`);
  }
  if (Object.keys(parsed.agents).length === 0) {
    throw new Error(`${displayPath} must contain at least one agent`);
  }
  return { agents: parsed.agents };
}

function checkTeam(squadDir: string): HealthCheckItem {
  try {
    const content = readRequiredFile(
      path.join(squadDir, 'team.md'),
      '.squad/team.md',
    );
    const parsed = parseTeamMarkdown(content);
    if (parsed.agents.length === 0) {
      return fail(
        'team',
        'team.md has no parseable members',
        parsed.warnings.length > 0 ? [...parsed.warnings].sort() : undefined,
      );
    }

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const agent of parsed.agents) {
      const key = normalizeAgentRef(agent.name);
      if (!key) {
        return fail('team', 'team.md contains a member with an empty name');
      }
      if (seen.has(key)) duplicates.add(agent.name);
      seen.add(key);
    }
    if (duplicates.size > 0) {
      return fail(
        'team',
        'team.md has duplicate member names',
        [...duplicates].sort().map((name) => `duplicate: ${name}`),
      );
    }

    // Built-ins whose agent directory exists but have no row anywhere in team.md (#2298).
    const agentsDir = path.join(squadDir, 'agents');
    let present = new Set<string>();
    try {
      present = new Set(readdirSync(agentsDir).map((e) => e.toLowerCase()));
    } catch {
      // no agents directory — nothing to cross-check
    }
    const rows = content
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith('|'))
      .map((line) => line.toLowerCase());
    const missingBuiltins = BUILTIN_AGENTS.filter(({ id, name }) =>
      (id === 'rai' || id === 'fact-checker') &&
      present.has(id) &&
      !rows.some((row) => row.includes(`agents/${id}/charter.md`) || row.split('|').map((c) => c.replace(/[`*_]/g, '').trim())[1] === name.toLowerCase()),
    );
    if (missingBuiltins.length > 0) {
      return infoItem(
        'team',
        `team.md is valid (${parsed.agents.length} members); ${missingBuiltins.length} optional built-in agent${missingBuiltins.length === 1 ? ' is' : 's are'} available but not configured`,
        missingBuiltins
          .map(({ id, name }) => `${name} is available but not configured — run \`squad roster add ${id}\` to opt in`)
          .sort((a, b) => a.localeCompare(b)),
      );
    }

    return pass('team', `team.md is valid (${parsed.agents.length} members)`);
  } catch (error) {
    return fail('team', errorMessage(error));
  }
}

function checkRegistryAndCharters(squadDir: string): HealthCheckItem {
  let registry: CastingRegistry;
  try {
    registry = readRegistry(squadDir);
  } catch (error) {
    return fail('registry-charters', errorMessage(error));
  }

  const diagnostics: string[] = [];
  const legacyCharters: string[] = [];
  const normalizedIds = new Map<string, string>();
  const persistentNames = new Map<string, string>();
  const agentIds = Object.keys(registry.agents).sort((a, b) =>
    a.localeCompare(b),
  );

  for (const agentId of agentIds) {
    const normalizedId = normalizeAgentRef(agentId);
    if (
      normalizedId !== agentId ||
      !/^[a-z0-9][a-z0-9-]*$/.test(agentId)
    ) {
      diagnostics.push(
        `${agentId}: registry key must be a lowercase kebab-case agent id`,
      );
      continue;
    }

    const duplicateId = normalizedIds.get(normalizedId);
    if (duplicateId) {
      diagnostics.push(`${agentId}: duplicates registry agent ${duplicateId}`);
      continue;
    }
    normalizedIds.set(normalizedId, agentId);

    const entry = registry.agents[agentId];
    if (!isRecord(entry)) {
      diagnostics.push(`${agentId}: registry entry must be an object`);
      continue;
    }
    if (
      typeof entry.persistent_name !== 'string' ||
      !entry.persistent_name.trim()
    ) {
      diagnostics.push(`${agentId}: registry entry is missing persistent_name`);
      continue;
    }
    if (typeof entry.status !== 'string' || !entry.status.trim()) {
      diagnostics.push(`${agentId}: registry entry is missing status`);
      continue;
    }
    if (!['active', 'inactive', 'retired'].includes(entry.status)) {
      diagnostics.push(`${agentId}: registry entry has invalid status`);
      continue;
    }

    const persistentName = normalizeAgentRef(entry.persistent_name);
    const duplicateName = persistentNames.get(persistentName);
    if (duplicateName) {
      diagnostics.push(
        `${agentId}: persistent_name duplicates registry agent ${duplicateName}`,
      );
      continue;
    }
    persistentNames.set(persistentName, agentId);

    const charterDirectory =
      entry.status === 'retired'
        ? path.join('agents', '_alumni', agentId)
        : path.join('agents', agentId);
    const displayPath = path.join(charterDirectory, 'charter.md');
    try {
      const charter = parseCharterMarkdown(
        readRequiredFile(path.join(squadDir, displayPath), displayPath),
      );
      if (!charter.identity.name || !charter.identity.role) {
        // A charter written before the 2.0 `## Identity` block is a warning with a hint, not a
        // failure: the squad keeps working, the author just has not adopted the new shape (#2298).
        legacyCharters.push(
          `${agentId}: legacy charter — add "## Identity" with "- **Name:** ${entry.persistent_name}" and "- **Role:** <role>" (see .squad/templates/charter.md)`,
        );
      } else if (
        normalizeAgentRef(charter.identity.name) !== persistentName
      ) {
        diagnostics.push(
          `${agentId}: charter identity does not match persistent_name`,
        );
      }
    } catch (error) {
      diagnostics.push(`${agentId}: ${errorMessage(error)}`);
    }
  }

  if (diagnostics.length > 0) {
    return fail(
      'registry-charters',
      `${diagnostics.length} registry or charter validation failure${diagnostics.length === 1 ? '' : 's'}`,
      [...diagnostics, ...legacyCharters].sort((a, b) => a.localeCompare(b)),
    );
  }

  if (legacyCharters.length > 0) {
    return warnItem(
      'registry-charters',
      `${agentIds.length} registry agent${agentIds.length === 1 ? '' : 's'} have charters; ${legacyCharters.length} legacy charter${legacyCharters.length === 1 ? '' : 's'} without a 2.0 identity block`,
      legacyCharters.sort((a, b) => a.localeCompare(b)),
    );
  }

  return pass(
    'registry-charters',
    `${agentIds.length} registry agent${agentIds.length === 1 ? '' : 's'} have valid charters`,
  );
}

function loadKnownRoutingAgentKeys(squadDir: string): Set<string> {
  const registry = readRegistry(squadDir);
  const keys = new Set<string>();
  for (const [agentId, entry] of Object.entries(registry.agents)) {
    if (!isRecord(entry)) {
      throw new Error(`registry entry ${agentId} must be an object`);
    }
    keys.add(normalizeAgentRef(agentId));
    if (
      typeof entry.persistent_name === 'string' &&
      entry.persistent_name.trim()
    ) {
      keys.add(normalizeAgentRef(entry.persistent_name));
    }
  }

  const team = parseTeamMarkdown(
    readRequiredFile(path.join(squadDir, 'team.md'), '.squad/team.md'),
  );
  for (const agent of team.agents) {
    const key = normalizeAgentRef(agent.name);
    if (key) keys.add(key);
  }
  // Built-ins are legitimate routing targets only while their installed charter exists. A route
  // to an unavailable built-in is a real configuration inconsistency and must fail health.
  for (const { id, name } of BUILTIN_AGENTS) {
    if (!storage.existsSync(path.join(squadDir, 'agents', id, 'charter.md'))) continue;
    keys.add(normalizeAgentRef(id));
    keys.add(normalizeAgentRef(name));
  }
  return keys;
}

function checkRouting(squadDir: string): HealthCheckItem {
  try {
    const content = readRequiredFile(
      path.join(squadDir, 'routing.md'),
      '.squad/routing.md',
    );
    const parsed = parseRoutingRulesMarkdown(content);
    if (parsed.rules.length === 0) {
      return fail(
        'routing',
        'routing.md has no parseable routing rules',
        parsed.warnings.length > 0 ? [...parsed.warnings].sort() : undefined,
      );
    }

    let knownAgentKeys: Set<string>;
    try {
      knownAgentKeys = loadKnownRoutingAgentKeys(squadDir);
    } catch {
      return fail(
        'routing',
        'routing references cannot be validated because the casting registry is invalid',
      );
    }

    const unresolved = new Set<string>();
    const referenced = new Set<string>();
    const routeGroups = new Map<
      string,
      { display: string; routes: Map<string, { agents: string[]; count: number }> }
    >();

    for (const rule of parsed.rules) {
      const workType = rule.workType.trim().toLowerCase();
      const normalizedAgents = rule.agents.map(normalizeAgentRef);
      const routeKey = normalizedAgents.join('\u0000');
      const group = routeGroups.get(workType) ?? {
        display: rule.workType,
        routes: new Map(),
      };
      const route = group.routes.get(routeKey);
      if (route) route.count++;
      else group.routes.set(routeKey, { agents: [...rule.agents], count: 1 });
      routeGroups.set(workType, group);
    }

    const agentReferences =
      parsed.agentReferences ??
      parsed.rules.flatMap((rule) => rule.agents);
    for (const agent of agentReferences) {
      const key = normalizeAgentRef(agent);
      if (!key || !knownAgentKeys.has(key)) {
        unresolved.add(agent);
      } else {
        referenced.add(key);
      }
    }

    const routeDiagnostics = [...routeGroups.values()]
      .filter(
        ({ routes }) =>
          routes.size > 1 ||
          [...routes.values()].some(({ count }) => count > 1),
      )
      .sort((a, b) => a.display.localeCompare(b.display))
      .map(({ display, routes }) => {
        const rendered = [...routes.values()]
          .sort((a, b) => a.agents.join(', ').localeCompare(b.agents.join(', ')))
          .map(({ agents, count }) =>
            `${agents.join(', ')}${count > 1 ? ` (${count} rows)` : ''}`,
          )
          .join(' | ');
        return `${routes.size > 1 ? 'conflicting' : 'duplicate'} route: ${display} -> ${rendered}`;
      });
    const unresolvedDiagnostics = [...unresolved]
        .sort((a, b) => a.localeCompare(b))
        .map((agent) => `unknown agent: ${agent}`);
    if (unresolvedDiagnostics.length > 0) {
      return fail(
        'routing',
        'routing.md contains invalid or unresolved references',
        [...routeDiagnostics, ...unresolvedDiagnostics],
      );
    }
    if (routeDiagnostics.length > 0) {
      return warnItem(
        'routing',
        `routing.md has ${parsed.rules.length} rules with duplicate or conflicting work types`,
        routeDiagnostics,
      );
    }

    return pass(
      'routing',
      `routing.md has ${parsed.rules.length} rules referencing ${referenced.size} known agents`,
    );
  } catch (error) {
    return fail('routing', errorMessage(error));
  }
}

function canonicalBackendType(value: string): StateBackendType | null {
  switch (value.trim().toLowerCase()) {
    case 'local':
    case 'worktree':
      return 'local';
    case 'orphan':
      return 'orphan';
    case 'two-layer':
    case 'git-notes':
      return 'two-layer';
    case 'external':
    case 'external-stub':
      return 'external-stub';
    default:
      return null;
  }
}

function backendMatches(
  backend: StateBackend,
  configured: StateBackendType,
): boolean {
  // `external-stub` is a documented placeholder that the SDK deliberately
  // resolves to the local worktree backend, so a local resolution is the
  // expected outcome rather than a silent fallback.
  if (configured === 'local' || configured === 'external-stub') {
    return backend.name === 'local';
  }
  return backend.name === configured;
}

function captureResolverOutput<T>(operation: () => T): T {
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.warn = () => undefined;
  console.log = () => undefined;
  try {
    return operation();
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}

function checkStateBackend(
  localSquadDir: string,
  repoRoot: string,
): HealthCheckItem {
  const configPath = path.join(localSquadDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    return skip(
      'state-backend',
      'No state backend is configured; local state files are in use',
    );
  }

  let config: Record<string, unknown>;
  try {
    config = parseJsonObject(
      readRequiredFile(configPath, '.squad/config.json'),
      '.squad/config.json',
    );
  } catch (error) {
    return fail('state-backend', errorMessage(error));
  }

  if (config.stateBackend === undefined || config.stateBackend === null) {
    return skip(
      'state-backend',
      'No state backend is configured; local state files are in use',
    );
  }
  if (
    typeof config.stateBackend !== 'string' ||
    !config.stateBackend.trim()
  ) {
    return fail(
      'state-backend',
      'stateBackend must be a non-empty string when configured',
    );
  }

  const configured = canonicalBackendType(config.stateBackend);
  if (!configured) {
    return fail(
      'state-backend',
      'Unknown configured state backend',
    );
  }

  try {
    const backend = captureResolverOutput(() =>
      resolveStateBackend(localSquadDir, repoRoot, configured),
    );
    if (!backendMatches(backend, configured)) {
      return fail(
        'state-backend',
        `Configured ${configured} state backend could not be initialized`,
        [`resolved backend: ${backend.name}`],
      );
    }

    const verification = verifyStateBackend(backend);
    if (!verification.ok) {
      return fail(
        'state-backend',
        `Configured ${configured} state backend is unreachable`,
        ['backend verification failed'],
      );
    }

    return pass(
      'state-backend',
      `Configured ${configured} state backend is reachable`,
    );
  } catch (error) {
    return fail(
      'state-backend',
      `Configured ${configured} state backend check failed`,
      [`error: ${errorKind(error)}`],
    );
  }
}

const ENV_JSON_CONFIGS = [
  { relativePath: '.mcp.json', serverKeys: ['mcpServers'] },
  {
    relativePath: path.join('.copilot', 'mcp-config.json'),
    serverKeys: ['mcpServers'],
  },
  {
    relativePath: path.join('.vscode', 'mcp.json'),
    serverKeys: ['servers'],
  },
  {
    relativePath: path.join('.vscode', 'settings.json'),
    serverKeys: ['copilot.mcp.servers'],
  },
] as const;
const ENV_REFERENCE =
  /\$(?:\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))(?![A-Za-z0-9_])/g;

function collectEnvironmentReferences(
  declaration: string,
  variables: Set<string>,
): void {
  for (const match of declaration.matchAll(ENV_REFERENCE)) {
    const name = match[1] ?? match[2];
    if (name) variables.add(name);
  }
}

function parseJsoncObject(
  content: string,
  displayPath: string,
): Record<string, unknown> {
  const errors: Array<{ error: number; offset: number; length: number }> = [];
  const parsed = parseJsonc(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(`${displayPath} contains invalid JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${displayPath} root must be a JSON object`);
  }
  return parsed;
}

function collectServerEnvironmentDeclarations(
  servers: unknown,
  relativePath: string,
  variables: Set<string>,
  diagnostics: string[],
): void {
  if (!isRecord(servers)) {
    diagnostics.push(`${relativePath}: servers must be a JSON object`);
    return;
  }

  for (const serverName of Object.keys(servers).sort((a, b) =>
    a.localeCompare(b),
  )) {
    if (serverName.toUpperCase().startsWith('EXAMPLE-')) continue;
    const server = servers[serverName];
    if (!isRecord(server) || server.env === undefined) continue;
    if (!isRecord(server.env)) {
      diagnostics.push(
        `${relativePath}: ${serverName}.env must be a JSON object`,
      );
      continue;
    }

    for (const envName of Object.keys(server.env).sort((a, b) =>
      a.localeCompare(b),
    )) {
      const declaration = server.env[envName];
      if (typeof declaration !== 'string') {
        diagnostics.push(
          `${relativePath}: ${serverName}.env.${envName} must be a string`,
        );
        continue;
      }
      collectEnvironmentReferences(declaration, variables);
    }
  }
}

function collectAgentFrontmatterDeclarations(
  repoRoot: string,
  variables: Set<string>,
  diagnostics: string[],
): void {
  const relativePath = path.join('.github', 'agents', 'squad.agent.md');
  const agentPath = path.join(repoRoot, relativePath);
  if (!storage.existsSync(agentPath)) return;

  try {
    const content = storage.readSync(agentPath) ?? '';
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    if (!frontmatter || !/^mcp-servers:\s*$/m.test(frontmatter)) return;

    const lines = frontmatter.split(/\r?\n/);
    let inMcpServers = false;
    let currentServer: string | undefined;
    let inEnvironment = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const indent = line.length - line.trimStart().length;

      if (indent === 0) {
        inMcpServers = trimmed === 'mcp-servers:';
        currentServer = undefined;
        inEnvironment = false;
        continue;
      }
      if (!inMcpServers) continue;
      if (indent === 2 && trimmed.endsWith(':')) {
        currentServer = trimmed.slice(0, -1).trim();
        inEnvironment = false;
        continue;
      }
      if (indent === 4) {
        inEnvironment = trimmed === 'env:';
        continue;
      }
      if (
        indent >= 6 &&
        inEnvironment &&
        currentServer &&
        !currentServer.toUpperCase().startsWith('EXAMPLE-')
      ) {
        const separator = trimmed.indexOf(':');
        if (separator === -1) {
          diagnostics.push(
            `${relativePath}: ${currentServer}.env declaration is invalid`,
          );
          continue;
        }
        collectEnvironmentReferences(
          trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''),
          variables,
        );
      }
    }
  } catch (error) {
    diagnostics.push(`${relativePath}: ${errorMessage(error)}`);
  }
}

function collectEnvironmentDeclarations(repoRoot: string): {
  variables: string[];
  diagnostics: string[];
} {
  const variables = new Set<string>();
  const diagnostics: string[] = [];

  for (const { relativePath, serverKeys } of ENV_JSON_CONFIGS) {
    const configPath = path.join(repoRoot, relativePath);
    if (!storage.existsSync(configPath)) continue;

    try {
      const config = parseJsoncObject(
        readRequiredFile(configPath, relativePath),
        relativePath,
      );
      const servers = serverKeys
        .map((key) => config[key])
        .find((value) => value !== undefined);
      if (servers === undefined) continue;
      collectServerEnvironmentDeclarations(
        servers,
        relativePath,
        variables,
        diagnostics,
      );
    } catch (error) {
      diagnostics.push(`${relativePath}: ${errorMessage(error)}`);
    }
  }
  collectAgentFrontmatterDeclarations(repoRoot, variables, diagnostics);

  return {
    variables: [...variables].sort((a, b) => a.localeCompare(b)),
    diagnostics: diagnostics.sort((a, b) => a.localeCompare(b)),
  };
}

function checkEnvVars(repoRoot: string): HealthCheckItem {
  const declarations = collectEnvironmentDeclarations(repoRoot);
  if (declarations.diagnostics.length > 0) {
    return fail(
      'env-vars',
      'Environment configuration declarations are invalid',
      declarations.diagnostics,
    );
  }
  if (declarations.variables.length === 0) {
    return skip(
      'env-vars',
      'No required environment variables are declared by repository configuration',
    );
  }

  const missing = declarations.variables.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return fail(
      'env-vars',
      `${missing.length} required environment variable${missing.length === 1 ? ' is' : 's are'} missing`,
      missing.map((name) => `missing: ${name}`),
    );
  }

  return pass(
    'env-vars',
    `${declarations.variables.length} required environment variable${declarations.variables.length === 1 ? ' is' : 's are'} set`,
  );
}

function buildHealthReport(
  stateDir: string,
  localSquadDir: string,
  repoRoot: string,
): HealthReport {
  const checks: HealthCheckItem[] = [
    checkTeam(stateDir),
    checkRegistryAndCharters(stateDir),
    checkRouting(stateDir),
    checkStateBackend(localSquadDir, repoRoot),
    checkEnvVars(repoRoot),
  ];
  return {
    schema: HEALTH_SCHEMA,
    status: checks.some((check) => check.status === 'fail') ? 'fail' : 'pass',
    checks,
  };
}

export function runSquadHealth(
  squadDir: string,
  repoRoot: string,
): HealthReport {
  return buildHealthReport(squadDir, squadDir, repoRoot);
}

function buildResolutionFailureReport(
  error: unknown,
  repoRoot: string,
): HealthReport {
  const diagnostic = [`error: ${errorKind(error)}`];
  const checks: HealthCheckItem[] = [
    fail('team', 'Squad state directory could not be resolved', diagnostic),
    fail(
      'registry-charters',
      'Registry and charters could not be checked because Squad state could not be resolved',
    ),
    fail(
      'routing',
      'Routing could not be checked because Squad state could not be resolved',
    ),
    fail(
      'state-backend',
      'Configured Squad state could not be resolved',
      diagnostic,
    ),
    checkEnvVars(repoRoot),
  ];
  return { schema: HEALTH_SCHEMA, status: 'fail', checks };
}

function printHuman(report: HealthReport): void {
  console.log(`squad health: ${report.status.toUpperCase()}`);
  for (const check of report.checks) {
    console.log(
      `[${check.status.toUpperCase()}] ${check.id}: ${check.message}`,
    );
    for (const diagnostic of check.diagnostics ?? []) {
      console.log(`  - ${diagnostic}`);
    }
  }
}

export async function runHealthCommand(
  cwd: string,
  args: string[],
): Promise<number> {
  let report: HealthReport;
  try {
    const dirs = effectiveSquadDir(cwd);
    const repoRoot = path.dirname(dirs.local.path);
    report = buildHealthReport(
      dirs.stateDir,
      dirs.backendConfigDir,
      repoRoot,
    );
  } catch (error) {
    report = buildResolutionFailureReport(error, path.resolve(cwd));
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  return report.status === 'fail' ? 1 : 0;
}
