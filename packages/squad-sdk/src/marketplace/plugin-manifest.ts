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
  'skills',
  'templates',
]);
const COMPONENT_KINDS = [
  'agents',
  'skills',
  'knowledge',
  'memory',
  'routing',
  'decisions',
  'hooks',
  'adapters',
] as const;

export type PluginComponentKind = typeof COMPONENT_KINDS[number];

export type PluginFileType =
  | 'agent'
  | 'asset'
  | 'doc'
  | 'instruction'
  | 'prompt'
  | 'skill'
  | 'template';

export interface PluginFileDeployment {
  source: string;
  target: string;
  type?: PluginFileType;
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
    const allowedTypes: PluginFileType[] = ['agent', 'asset', 'doc', 'instruction', 'prompt', 'skill', 'template'];
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
