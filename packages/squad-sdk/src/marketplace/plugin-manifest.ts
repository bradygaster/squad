import { basename, extname, isAbsolute, normalize, sep } from 'node:path';

export const PLUGIN_MANIFEST_FILENAMES = [
  'plugin.manifest.json',
  'squad-plugin.json',
  'squad-plugin.yaml',
  'squad-plugin.yml',
  'plugin.json',
  'plugin.yaml',
  'plugin.yml',
] as const;

const EXECUTABLE_KEYS = new Set([
  'command',
  'commands',
  'exec',
  'executable',
  'install',
  'postinstall',
  'preinstall',
  'run',
  'script',
  'scripts',
]);
const EXECUTABLE_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.com',
  '.cjs',
  '.exe',
  '.js',
  '.mjs',
  '.ps1',
  '.sh',
  '.ts',
  '.tsx',
]);
const ALLOWED_TARGET_ROOTS = new Set([
  'agents',
  'ceremonies',
  'decisions',
  'instructions',
  'knowledge',
  'memory',
  'plugins',
  'prompts',
  'routing',
  'templates',
  'workflows',
]);
const COMPONENT_KINDS = [
  'agents',
  'ceremonies',
  'decisions',
  'instructions',
  'knowledge',
  'memory',
  'routing',
  'templates',
  'workflows',
  'hooks',
  'adapters',
] as const;

export type PluginComponentKind = typeof COMPONENT_KINDS[number];

export type PluginFileType =
  | 'agent'
  | 'asset'
  | 'doc'
  | 'instruction'
  | 'knowledge'
  | 'prompt'
  | 'template'
  | 'workflow';

export interface PluginFileDeployment {
  source: string;
  target: string;
  type?: PluginFileType;
}

export interface CopilotPluginDependency {
  id: string;
  version?: string;
  optional?: boolean;
  reason?: string;
}

export interface CopilotPluginRequirements {
  requires?: CopilotPluginDependency[];
}

export interface PluginRepositoryMetadata {
  type?: string;
  url: string;
}

export interface PluginUpstreamMetadata {
  package?: string;
  registry?: string;
  installCommand?: string;
  docs?: string;
}

export interface PluginMcpMetadata {
  available?: boolean;
  server?: string;
  entryPoint?: string;
  installCommand?: string;
  reason?: string;
}

const PROVIDER_TYPES = [
  'memory',
  'knowledge',
  'persistence',
  'event',
  'policy',
] as const;
const PROVIDER_MODES = ['read', 'write', 'read-write'] as const;
const PROVIDER_PROTOCOLS = ['static-artifact', 'mcp'] as const;
const RUNTIME_CAPABILITY_TYPES = ['artifact-generation'] as const;
const APPROVED_RUNTIME_PROVIDERS = ['graphify'] as const;
const ALLOWED_LIFECYCLE_EVENTS = [
  'onInstall',
  'onEnable',
  'onDisable',
  'onBeforeSpawn',
  'onAfterTask',
  'onMemoryRefresh',
] as const;

export type PluginProviderType = typeof PROVIDER_TYPES[number];
export type PluginProviderMode = typeof PROVIDER_MODES[number];
export type PluginProviderProtocol = typeof PROVIDER_PROTOCOLS[number];
export type PluginRuntimeCapabilityType = typeof RUNTIME_CAPABILITY_TYPES[number];
export type RuntimeProviderName = typeof APPROVED_RUNTIME_PROVIDERS[number];
export type LifecycleEventName = typeof ALLOWED_LIFECYCLE_EVENTS[number];

export interface PluginProviderMcpBinding {
  server?: string;
  tool?: string;
  capability?: string;
}

export interface PluginProviderContract {
  id: string;
  type: PluginProviderType;
  mode?: PluginProviderMode;
  protocol?: PluginProviderProtocol;
  description?: string;
  artifact?: string;
  mcp?: PluginProviderMcpBinding;
  capabilities?: string[];
}

export interface PluginRuntimeCapability {
  type: PluginRuntimeCapabilityType;
  provider: RuntimeProviderName;
  lifecycle: LifecycleEventName[];
  outputPaths: string[];
  description?: string;
}

export interface PluginRuntimeManifest {
  capabilities?: PluginRuntimeCapability[];
}

export interface SquadPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  authors?: string[];
  license?: string;
  squad?: string;
  components?: Partial<Record<PluginComponentKind, unknown>>;
  copilot?: CopilotPluginRequirements;
  repository?: PluginRepositoryMetadata;
  upstream?: PluginUpstreamMetadata;
  mcp?: PluginMcpMetadata;
  providers?: PluginProviderContract[];
  runtime?: PluginRuntimeManifest;
  files: PluginFileDeployment[];
}

export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PluginInstallPlanFile extends PluginFileDeployment {
  targetRoot: string;
}

export interface PluginInstallPlan {
  manifest: SquadPluginManifest;
  files: PluginInstallPlanFile[];
  dryRun: boolean;
}

export const PLUGIN_MANIFEST_SCHEMA_VERSION = '0.1';

export function parsePluginManifestContent(content: string, fileName = 'squad-plugin.json'): SquadPluginManifest {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Plugin manifest is empty');
  }

  const ext = extname(fileName).toLowerCase();
  const raw = ext === '.json' || trimmed.startsWith('{')
    ? JSON.parse(trimmed)
    : parseDeclarativeYaml(trimmed);

  return normalizePluginManifest(raw);
}

export function validatePluginManifest(manifest: SquadPluginManifest): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  validateName('id', manifest.id, errors);
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version is required and must be a string');
  } else if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    errors.push('version must follow semver (e.g. 1.0.0)');
  }
  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    errors.push('description must be a string when provided');
  }
  if (manifest.authors !== undefined && !manifest.authors.every((author) => typeof author === 'string')) {
    errors.push('authors must be an array of strings when provided');
  }
  if (manifest.license !== undefined && typeof manifest.license !== 'string') {
    errors.push('license must be a string when provided');
  }
  if (manifest.squad !== undefined && typeof manifest.squad !== 'string') {
    errors.push('squad compatibility must be a string when provided');
  }
  validateComponents(manifest.components, errors);
  validateCopilotRequirements(manifest.copilot, errors);
  validateRepositoryMetadata(manifest.repository, errors);
  validateUpstreamMetadata(manifest.upstream, errors, warnings);
  validateMcpMetadata(manifest.mcp, errors, warnings);
  validateProviderContracts(manifest.providers, errors, warnings);
  validateRuntimeManifest(manifest.runtime, errors, warnings);
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    errors.push('files must include at least one static file deployment');
  } else {
    for (const [index, file] of manifest.files.entries()) {
      validatePluginFile(file, index, errors, warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function derivePluginRoles(manifest: SquadPluginManifest): PluginComponentKind[] {
  if (!manifest.components) {
    return [];
  }
  return COMPONENT_KINDS.filter((kind) => {
    const value = manifest.components?.[kind];
    if (value === undefined || value === null) {
      return false;
    }
    return !(Array.isArray(value) && value.length === 0);
  });
}

export function createPluginInstallPlan(
  manifest: SquadPluginManifest,
  options: { dryRun?: boolean } = {},
): PluginInstallPlan {
  const validation = validatePluginManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
  }

  return {
    manifest,
    files: manifest.files.map((file) => ({
      ...file,
      targetRoot: file.target.split('/')[0]!,
    })),
    dryRun: options.dryRun ?? false,
  };
}

function normalizePluginManifest(raw: unknown): SquadPluginManifest {
  if (!isRecord(raw)) {
    throw new Error('Plugin manifest must be an object');
  }

  const executableKey = findExecutableKey(raw);
  if (executableKey) {
    throw new Error(`Plugin manifest may not declare executable key "${executableKey}"`);
  }

  const filesRaw = raw.files;
  if (!Array.isArray(filesRaw)) {
    return {
      id: readString(raw, 'id'),
      name: readString(raw, 'name'),
      version: readString(raw, 'version'),
      description: readOptionalString(raw, 'description'),
      authors: readOptionalStringArray(raw, 'authors'),
      license: readOptionalString(raw, 'license'),
      squad: readOptionalString(raw, 'squad'),
      components: normalizeComponents(raw.components),
      copilot: normalizeCopilotRequirements(raw.copilot),
      repository: normalizeRepositoryMetadata(raw.repository),
      upstream: normalizeUpstreamMetadata(raw.upstream),
      mcp: normalizeMcpMetadata(raw.mcp),
      providers: normalizeProviderContracts(raw.providers),
      runtime: normalizeRuntimeManifest(raw.runtime),
      files: [],
    };
  }

  return {
    id: readString(raw, 'id'),
    name: readString(raw, 'name'),
    version: readString(raw, 'version'),
    description: readOptionalString(raw, 'description'),
    authors: readOptionalStringArray(raw, 'authors'),
    license: readOptionalString(raw, 'license'),
    squad: readOptionalString(raw, 'squad'),
    components: normalizeComponents(raw.components),
    copilot: normalizeCopilotRequirements(raw.copilot),
    repository: normalizeRepositoryMetadata(raw.repository),
    upstream: normalizeUpstreamMetadata(raw.upstream),
    mcp: normalizeMcpMetadata(raw.mcp),
    providers: normalizeProviderContracts(raw.providers),
    runtime: normalizeRuntimeManifest(raw.runtime),
    files: filesRaw.map((item, index) => normalizePluginFile(item, index)),
  };
}

function normalizePluginFile(raw: unknown, index: number): PluginFileDeployment {
  if (!isRecord(raw)) {
    throw new Error(`files[${index}] must be an object`);
  }
  const file: PluginFileDeployment = {
    source: readString(raw, 'source'),
    target: readString(raw, 'target'),
  };
  const type = readOptionalString(raw, 'type');
  if (type !== undefined) {
    file.type = type as PluginFileType;
  }
  return file;
}

function validateName(field: string, value: string, errors: string[]): void {
  if (!value || typeof value !== 'string') {
    errors.push(`${field} is required and must be a string`);
    return;
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
    errors.push(`${field} must be lowercase alphanumeric with hyphens only`);
  }
}

function validatePluginFile(
  file: PluginFileDeployment,
  index: number,
  errors: string[],
  warnings: string[],
): void {
  if (!file.source || typeof file.source !== 'string') {
    errors.push(`files[${index}].source is required and must be a string`);
  } else {
    validateRelativePath(`files[${index}].source`, file.source, errors);
    validateStaticFileExtension(`files[${index}].source`, file.source, errors);
  }

  if (!file.target || typeof file.target !== 'string') {
    errors.push(`files[${index}].target is required and must be a string`);
  } else {
    validateRelativePath(`files[${index}].target`, file.target, errors);
    validateStaticFileExtension(`files[${index}].target`, file.target, errors);
    const root = file.target.split('/')[0];
    if (!root || !ALLOWED_TARGET_ROOTS.has(root)) {
      errors.push(`files[${index}].target must start with one of: ${[...ALLOWED_TARGET_ROOTS].join(', ')}`);
    }
  }

  if (file.type !== undefined) {
    const allowedTypes: PluginFileType[] = ['agent', 'asset', 'doc', 'instruction', 'knowledge', 'prompt', 'template', 'workflow'];
    if (!allowedTypes.includes(file.type)) {
      errors.push(`files[${index}].type is not supported: ${file.type}`);
    }
  } else {
    warnings.push(`files[${index}].type is not specified`);
  }
}

function validateRelativePath(field: string, value: string, errors: string[]): void {
  const normalized = normalize(value).replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (isAbsolute(value) || normalized.startsWith('../') || normalized === '..' || segments.includes('..')) {
    errors.push(`${field} must be a relative path that does not escape the plugin or .squad directory`);
  }
  if (segments.some((segment) => segment.length === 0)) {
    errors.push(`${field} must not contain empty path segments`);
  }
}

function validateStaticFileExtension(field: string, value: string, errors: string[]): void {
  const ext = extname(value).toLowerCase();
  if (EXECUTABLE_EXTENSIONS.has(ext)) {
    errors.push(`${field} points to executable or script file type "${ext}"`);
  }
}

function readString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === 'string' ? value : '';
}

function readOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' ? value : undefined;
}

function readOptionalStringArray(raw: Record<string, unknown>, key: string): string[] | undefined {
  const value = raw[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readOptionalBoolean(raw: Record<string, unknown>, key: string): boolean | undefined {
  const value = raw[key];
  return typeof value === 'boolean' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findExecutableKey(value: unknown, path = ''): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findExecutableKey(item, `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  for (const [key, nested] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (EXECUTABLE_KEYS.has(key.toLowerCase())) {
      return keyPath;
    }
    const found = findExecutableKey(nested, keyPath);
    if (found) return found;
  }
  return undefined;
}

function normalizeComponents(raw: unknown): Partial<Record<PluginComponentKind, unknown>> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return {};
  }
  const components: Partial<Record<PluginComponentKind, unknown>> = {};
  for (const kind of COMPONENT_KINDS) {
    if (raw[kind] !== undefined) {
      components[kind] = raw[kind];
    }
  }
  for (const key of Object.keys(raw)) {
    if (!(COMPONENT_KINDS as readonly string[]).includes(key)) {
      components[key as PluginComponentKind] = raw[key];
    }
  }
  return components;
}

function validateComponents(
  components: Partial<Record<PluginComponentKind, unknown>> | undefined,
  errors: string[],
): void {
  if (components === undefined) {
    return;
  }
  if (!isRecord(components)) {
    errors.push('components must be an object when provided');
    return;
  }
  for (const key of Object.keys(components)) {
    if (!(COMPONENT_KINDS as readonly string[]).includes(key)) {
      errors.push(`components.${key} is not supported`);
    }
  }
}

function normalizeCopilotRequirements(raw: unknown): CopilotPluginRequirements | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return {};
  }
  const requires = raw.requires;
  if (!Array.isArray(requires)) {
    return {};
  }
  return {
    requires: requires.map((item) => normalizeCopilotPluginDependency(item)),
  };
}

function normalizeCopilotPluginDependency(raw: unknown): CopilotPluginDependency {
  if (!isRecord(raw)) {
    return { id: '' };
  }
  return {
    id: readString(raw, 'id'),
    version: readOptionalString(raw, 'version'),
    optional: readOptionalBoolean(raw, 'optional'),
    reason: readOptionalString(raw, 'reason'),
  };
}

function validateCopilotRequirements(
  copilot: CopilotPluginRequirements | undefined,
  errors: string[],
): void {
  if (copilot === undefined) {
    return;
  }
  if (!isRecord(copilot)) {
    errors.push('copilot must be an object when provided');
    return;
  }
  if (copilot.requires === undefined) {
    return;
  }
  if (!Array.isArray(copilot.requires)) {
    errors.push('copilot.requires must be an array when provided');
    return;
  }
  for (const [index, dependency] of copilot.requires.entries()) {
    if (!isRecord(dependency)) {
      errors.push(`copilot.requires[${index}] must be an object`);
      continue;
    }
    validateCopilotPluginId(`copilot.requires[${index}].id`, dependency.id, errors);
    if (dependency.version !== undefined && typeof dependency.version !== 'string') {
      errors.push(`copilot.requires[${index}].version must be a string when provided`);
    }
    if (dependency.optional !== undefined && typeof dependency.optional !== 'boolean') {
      errors.push(`copilot.requires[${index}].optional must be a boolean when provided`);
    }
    if (dependency.reason !== undefined && typeof dependency.reason !== 'string') {
      errors.push(`copilot.requires[${index}].reason must be a string when provided`);
    }
  }
}

function validateCopilotPluginId(field: string, value: unknown, errors: string[]): void {
  if (!value || typeof value !== 'string') {
    errors.push(`${field} is required and must be a string`);
    return;
  }
  if (value.includes('..') || value.startsWith('/') || value.startsWith('\\')) {
    errors.push(`${field} must be a package or owner/name identifier, not a path`);
  }
}

function normalizeRepositoryMetadata(raw: unknown): PluginRepositoryMetadata | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return { url: '' };
  }
  return {
    type: readOptionalString(raw, 'type'),
    url: readString(raw, 'url'),
  };
}

function normalizeUpstreamMetadata(raw: unknown): PluginUpstreamMetadata | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return {};
  }
  return {
    package: readOptionalString(raw, 'package'),
    registry: readOptionalString(raw, 'registry'),
    installCommand: readOptionalString(raw, 'installCommand'),
    docs: readOptionalString(raw, 'docs'),
  };
}

function normalizeMcpMetadata(raw: unknown): PluginMcpMetadata | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return {};
  }
  return {
    available: readOptionalBoolean(raw, 'available'),
    server: readOptionalString(raw, 'server'),
    entryPoint: readOptionalString(raw, 'entryPoint'),
    installCommand: readOptionalString(raw, 'installCommand'),
    reason: readOptionalString(raw, 'reason'),
  };
}

function normalizeProviderContracts(raw: unknown): PluginProviderContract[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => normalizeProviderContract(item));
}

function normalizeProviderContract(raw: unknown): PluginProviderContract {
  if (!isRecord(raw)) {
    return { id: '', type: 'memory' };
  }
  const provider: PluginProviderContract = {
    id: readString(raw, 'id'),
    type: readString(raw, 'type') as PluginProviderType,
    mode: readOptionalString(raw, 'mode') as PluginProviderMode | undefined,
    protocol: readOptionalString(raw, 'protocol') as PluginProviderProtocol | undefined,
    description: readOptionalString(raw, 'description'),
    artifact: readOptionalString(raw, 'artifact'),
    mcp: normalizeProviderMcpBinding(raw.mcp),
    capabilities: readOptionalStringArray(raw, 'capabilities'),
  };
  return provider;
}

function normalizeProviderMcpBinding(raw: unknown): PluginProviderMcpBinding | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return {};
  }
  return {
    server: readOptionalString(raw, 'server'),
    tool: readOptionalString(raw, 'tool'),
    capability: readOptionalString(raw, 'capability'),
  };
}

function normalizeRuntimeManifest(raw: unknown): PluginRuntimeManifest | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return {};
  }
  return {
    capabilities: normalizeRuntimeCapabilities(raw.capabilities),
  };
}

function normalizeRuntimeCapabilities(raw: unknown): PluginRuntimeCapability[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => normalizeRuntimeCapability(item));
}

function normalizeRuntimeCapability(raw: unknown): PluginRuntimeCapability {
  if (!isRecord(raw)) {
    return {
      type: 'artifact-generation',
      provider: 'graphify',
      lifecycle: [],
      outputPaths: [],
    };
  }
  return {
    type: readString(raw, 'type') as PluginRuntimeCapabilityType,
    provider: readString(raw, 'provider') as RuntimeProviderName,
    lifecycle: readOptionalStringArray(raw, 'lifecycle') as LifecycleEventName[] | undefined ?? [],
    outputPaths: readOptionalStringArray(raw, 'outputPaths') ?? [],
    description: readOptionalString(raw, 'description'),
  };
}

function validateRepositoryMetadata(
  repository: PluginRepositoryMetadata | undefined,
  errors: string[],
): void {
  if (repository === undefined) {
    return;
  }
  if (!isRecord(repository)) {
    errors.push('repository must be an object when provided');
    return;
  }
  if (repository.type !== undefined && typeof repository.type !== 'string') {
    errors.push('repository.type must be a string when provided');
  }
  validateUrl('repository.url', repository.url, errors);
}

function validateUpstreamMetadata(
  upstream: PluginUpstreamMetadata | undefined,
  errors: string[],
  warnings: string[],
): void {
  if (upstream === undefined) {
    return;
  }
  if (!isRecord(upstream)) {
    errors.push('upstream must be an object when provided');
    return;
  }
  validateOptionalString('upstream.package', upstream.package, errors);
  validateOptionalString('upstream.registry', upstream.registry, errors);
  validateOptionalString('upstream.installCommand', upstream.installCommand, errors);
  validateOptionalUrl('upstream.docs', upstream.docs, errors);
  if (upstream.installCommand) {
    warnings.push('upstream.installCommand is metadata only; Squad will not execute it');
  }
}

function validateMcpMetadata(
  mcp: PluginMcpMetadata | undefined,
  errors: string[],
  warnings: string[],
): void {
  if (mcp === undefined) {
    return;
  }
  if (!isRecord(mcp)) {
    errors.push('mcp must be an object when provided');
    return;
  }
  if (mcp.available !== undefined && typeof mcp.available !== 'boolean') {
    errors.push('mcp.available must be a boolean when provided');
  }
  validateOptionalString('mcp.server', mcp.server, errors);
  validateOptionalString('mcp.entryPoint', mcp.entryPoint, errors);
  validateOptionalString('mcp.installCommand', mcp.installCommand, errors);
  validateOptionalString('mcp.reason', mcp.reason, errors);
  if (mcp.installCommand) {
    warnings.push('mcp.installCommand is metadata only; Squad will not execute it');
  }
}

function validateProviderContracts(
  providers: PluginProviderContract[] | undefined,
  errors: string[],
  warnings: string[],
): void {
  if (providers === undefined) {
    return;
  }
  if (!Array.isArray(providers)) {
    errors.push('providers must be an array when provided');
    return;
  }
  for (const [index, provider] of providers.entries()) {
    const prefix = `providers[${index}]`;
    if (!isRecord(provider)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    validateName(`${prefix}.id`, provider.id, errors);
    if (!PROVIDER_TYPES.includes(provider.type)) {
      errors.push(`${prefix}.type must be one of: ${PROVIDER_TYPES.join(', ')}`);
    }
    if (provider.mode !== undefined && !PROVIDER_MODES.includes(provider.mode)) {
      errors.push(`${prefix}.mode must be one of: ${PROVIDER_MODES.join(', ')}`);
    }
    if (provider.protocol !== undefined && !PROVIDER_PROTOCOLS.includes(provider.protocol)) {
      errors.push(`${prefix}.protocol must be one of: ${PROVIDER_PROTOCOLS.join(', ')}`);
    }
    validateOptionalString(`${prefix}.description`, provider.description, errors);
    if (provider.artifact !== undefined) {
      validateRelativePath(`${prefix}.artifact`, provider.artifact, errors);
      validateStaticFileExtension(`${prefix}.artifact`, provider.artifact, errors);
      const root = provider.artifact.split('/')[0];
      if (!root || !ALLOWED_TARGET_ROOTS.has(root)) {
        errors.push(`${prefix}.artifact must start with one of: ${[...ALLOWED_TARGET_ROOTS].join(', ')}`);
      }
    }
    if (provider.capabilities !== undefined) {
      if (!Array.isArray(provider.capabilities)) {
        errors.push(`${prefix}.capabilities must be an array when provided`);
      } else if (!provider.capabilities.every((capability) => typeof capability === 'string' && capability.trim().length > 0)) {
        errors.push(`${prefix}.capabilities must contain only non-empty strings`);
      }
    }
    if (provider.mcp !== undefined) {
      if (!isRecord(provider.mcp)) {
        errors.push(`${prefix}.mcp must be an object when provided`);
      } else {
        validateOptionalString(`${prefix}.mcp.server`, provider.mcp.server, errors);
        validateOptionalString(`${prefix}.mcp.tool`, provider.mcp.tool, errors);
        validateOptionalString(`${prefix}.mcp.capability`, provider.mcp.capability, errors);
        warnings.push(`${prefix}.mcp is provider metadata only; Squad will not start MCP servers or call provider tools`);
      }
    }
  }
}

function validateRuntimeManifest(
  runtime: PluginRuntimeManifest | undefined,
  errors: string[],
  warnings: string[],
): void {
  if (runtime === undefined) {
    return;
  }
  if (!isRecord(runtime)) {
    errors.push('runtime must be an object when provided');
    return;
  }
  if (runtime.capabilities === undefined) {
    return;
  }
  if (!Array.isArray(runtime.capabilities)) {
    errors.push('runtime.capabilities must be an array when provided');
    return;
  }
  for (const [index, capability] of runtime.capabilities.entries()) {
    const prefix = `runtime.capabilities[${index}]`;
    if (!isRecord(capability)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!(RUNTIME_CAPABILITY_TYPES as readonly unknown[]).includes(capability.type)) {
      errors.push(`${prefix}.type must be one of: ${RUNTIME_CAPABILITY_TYPES.join(', ')}`);
    }
    if (!(APPROVED_RUNTIME_PROVIDERS as readonly unknown[]).includes(capability.provider)) {
      errors.push(
        `${prefix}.provider "${capability.provider}" is not approved. Allowed providers: ${APPROVED_RUNTIME_PROVIDERS.join(', ')}`,
      );
    }
    if (!Array.isArray(capability.lifecycle)) {
      errors.push(`${prefix}.lifecycle must be an array`);
    } else if (capability.lifecycle.length === 0) {
      errors.push(`${prefix}.lifecycle must not be empty`);
    } else {
      for (const [lifecycleIndex, event] of capability.lifecycle.entries()) {
        if (typeof event !== 'string') {
          errors.push(`${prefix}.lifecycle[${lifecycleIndex}] must be a string`);
        } else if (!ALLOWED_LIFECYCLE_EVENTS.includes(event as LifecycleEventName)) {
          errors.push(
            `${prefix}.lifecycle[${lifecycleIndex}] "${event}" is not allowed. Allowed events: ${ALLOWED_LIFECYCLE_EVENTS.join(', ')}`,
          );
        }
      }
    }
    if (!Array.isArray(capability.outputPaths)) {
      errors.push(`${prefix}.outputPaths must be an array`);
    } else if (capability.outputPaths.length === 0) {
      errors.push(`${prefix}.outputPaths must not be empty`);
    } else {
      for (const [pathIndex, outputPath] of capability.outputPaths.entries()) {
        const pathPrefix = `${prefix}.outputPaths[${pathIndex}]`;
        if (typeof outputPath !== 'string') {
          errors.push(`${pathPrefix} must be a string`);
          continue;
        }
        if (outputPath.trim() === '') {
          errors.push(`${pathPrefix} must not be empty`);
          continue;
        }
        validateRelativePath(pathPrefix, outputPath, errors);
        validateStaticFileExtension(pathPrefix, outputPath, errors);
        const root = outputPath.split('/')[0];
        if (!root || !ALLOWED_TARGET_ROOTS.has(root)) {
          errors.push(`${pathPrefix} must start with one of: ${[...ALLOWED_TARGET_ROOTS].join(', ')}`);
        }
      }
    }
    validateOptionalString(`${prefix}.description`, capability.description, errors);
    warnings.push(`${prefix} uses built-in artifact operations only; Squad will not execute plugin-supplied code`);
  }
}

function validateOptionalString(field: string, value: unknown, errors: string[]): void {
  if (value !== undefined && typeof value !== 'string') {
    errors.push(`${field} must be a string when provided`);
  }
}

function validateOptionalUrl(field: string, value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  validateUrl(field, value, errors);
}

function validateUrl(field: string, value: unknown, errors: string[]): void {
  if (!value || typeof value !== 'string') {
    errors.push(`${field} is required and must be a URL string`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      errors.push(`${field} must use https`);
    }
  } catch {
    errors.push(`${field} must be a valid URL`);
  }
}

function parseDeclarativeYaml(content: string): unknown {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trimEnd())
    .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith('#'));
  const root: Record<string, unknown> = {};
  let currentArrayKey: string | undefined;
  let currentArrayItem: Record<string, unknown> | undefined;

  for (const line of lines) {
    if (!line.startsWith(' ') && !line.startsWith('-')) {
      const [key, value] = splitYamlPair(line);
      if (!key) {
        throw new Error(`Invalid YAML line: ${line}`);
      }
      if (value === '') {
        root[key] = [];
        currentArrayKey = key;
        currentArrayItem = undefined;
      } else {
        root[key] = parseYamlScalar(value);
        currentArrayKey = undefined;
        currentArrayItem = undefined;
      }
      continue;
    }

    const trimmed = line.trimStart();
    if (!currentArrayKey || !Array.isArray(root[currentArrayKey])) {
      throw new Error(`Nested YAML is only supported for top-level arrays: ${line}`);
    }

    if (trimmed.startsWith('- ')) {
      const itemText = trimmed.slice(2);
      currentArrayItem = {};
      (root[currentArrayKey] as Record<string, unknown>[]).push(currentArrayItem);
      if (itemText.length > 0) {
        const [key, value] = splitYamlPair(itemText);
        currentArrayItem[key] = parseYamlScalar(value);
      }
      continue;
    }

    if (!currentArrayItem) {
      throw new Error(`YAML array property appears before an array item: ${line}`);
    }
    const [key, value] = splitYamlPair(trimmed);
    currentArrayItem[key] = parseYamlScalar(value);
  }

  return root;
}

function splitYamlPair(line: string): [string, string] {
  const index = line.indexOf(':');
  if (index === -1) {
    throw new Error(`Invalid YAML key/value line: ${line}`);
  }
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}

function parseYamlScalar(value: string): unknown {
  if (value === '') return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => String(parseYamlScalar(item.trim())));
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function toPosixRelativePath(pathValue: string): string {
  return normalize(pathValue).split(sep).join('/');
}

export function describePluginFile(file: PluginFileDeployment): string {
  return `${basename(file.source)} → ${file.target}`;
}
