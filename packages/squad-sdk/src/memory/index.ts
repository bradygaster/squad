import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageProvider } from '../storage/storage-provider.js';

export type MemoryClass =
  | 'TRANSIENT'
  | 'LOCAL'
  | 'DECISION'
  | 'POLICY'
  | 'COPILOT_MEMORY'
  | 'FORBIDDEN';

export type MemoryLoadGuidance = 'ALWAYS' | 'ON-DEMAND' | 'ARCHIVE' | 'NEVER';

export interface MemoryGovernanceConfig {
  version: 1;
  defaultProvider: 'local' | 'hostInjectedCopilotAdapter' | 'copilot';
  promptOnlyFallback: true;
  externalProviders: {
    hostInjectedCopilotAdapter: {
      enabled: boolean;
      requireApproval: boolean;
    };
  };
  policy: {
    rejectForbidden: true;
    rejectTransientDurableWrites: true;
    auditContent: false;
  };
}

export interface MemoryClassification {
  class: MemoryClass;
  allowed: boolean;
  reason: string;
  destination: 'none' | 'local' | 'decision-inbox' | 'policy-inbox' | 'external-semantic';
  loadGuidance: MemoryLoadGuidance;
}

export interface MemoryWriteRequest {
  content: string;
  title?: string;
  author?: string;
  requestedClass?: MemoryClass;
  approved?: boolean;
  metadata?: Record<string, string>;
}

export interface MemoryWriteResult {
  stored: boolean;
  id?: string;
  classification: MemoryClassification;
  path?: string;
}

export interface MemorySearchResult {
  id: string;
  class: MemoryClass;
  loadGuidance: MemoryLoadGuidance;
  title: string;
  path: string;
  snippet: string;
  provider?: 'local' | 'hostInjectedCopilotAdapter' | 'copilot';
}

export interface MemoryAuditRecord {
  timestamp: string;
  action: 'classify' | 'write' | 'reject' | 'promote' | 'delete' | 'search' | 'configure';
  id?: string;
  class?: MemoryClass;
  title?: string;
  path?: string;
  reason?: string;
  actor?: string;
  provider?: 'local' | 'hostInjectedCopilotAdapter' | 'copilot';
}

export interface CopilotMemoryProviderWriteRequest {
  content: string;
  title: string;
  author?: string;
  metadata?: Record<string, string>;
  classification: MemoryClassification;
}

export interface CopilotMemoryProviderWriteResult {
  id: string;
  path?: string;
}

export interface CopilotMemoryProviderSearchResult {
  id: string;
  title: string;
  snippet: string;
  path?: string;
}

export interface CopilotMemoryProviderClient {
  write(request: CopilotMemoryProviderWriteRequest): Promise<CopilotMemoryProviderWriteResult>;
  search(query: string): Promise<CopilotMemoryProviderSearchResult[]>;
  delete(id: string): Promise<boolean>;
}

export interface LocalMemoryStoreOptions {
  rootKind?: 'project' | 'squad';
  hostInjectedCopilotAdapterClient?: CopilotMemoryProviderClient;
  /** @deprecated Use hostInjectedCopilotAdapterClient. */
  copilotMemoryClient?: CopilotMemoryProviderClient;
}

interface MemoryIndexEntry {
  id: string;
  class: MemoryClass;
  loadGuidance: MemoryLoadGuidance;
  title: string;
  path: string;
  status: 'active' | 'deleted' | 'superseded';
  supersedes?: string;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

const DEFAULT_CONFIG: MemoryGovernanceConfig = {
  version: 1,
  defaultProvider: 'local',
  promptOnlyFallback: true,
  externalProviders: {
    hostInjectedCopilotAdapter: {
      enabled: false,
      requireApproval: true,
    },
  },
  policy: {
    rejectForbidden: true,
    rejectTransientDurableWrites: true,
    auditContent: false,
  },
};

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i, reason: 'private key material' },
  { pattern: /\b(ghp|github_pat|glpat|xox[baprs])-?[A-Za-z0-9_=-]{12,}\b/i, reason: 'access token' },
  { pattern: /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/i, reason: 'credential-like assignment' },
  { pattern: /\b(AccountKey|SharedAccessKey|DefaultEndpointsProtocol)=/i, reason: 'connection string secret' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/, reason: 'PII-like identifier' },
  { pattern: /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/, reason: 'internal network topology' },
  { pattern: /\b(raw logs?|stack trace|telemetry payload|dump file)\b/i, reason: 'raw diagnostic payload' },
  { pattern: /\b(CI|PR|build)\s+(status|failed|passed|output|log)\b/i, reason: 'transient CI/PR status' },
  { pattern: /\b(private|confidential|restricted)\s+customer\s+(data|record|records|details|information|info)\b/i, reason: 'private customer data' },
  { pattern: /\bcustomer\s+(pii|personal data|tenant secret|production data)\b/i, reason: 'private customer data' },
  { pattern: /\bunreviewed\s+(security\s+)?vulnerabilit(?:y|ies)\b/i, reason: 'unreviewed vulnerability disclosure' },
  { pattern: /\b(?:0-day|zero-day)\b/i, reason: 'unreviewed vulnerability disclosure' },
];

function cloneDefaultConfig(): MemoryGovernanceConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as MemoryGovernanceConfig;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || 'memory';
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find(line => line.trim().length > 0)?.trim().slice(0, 80) ?? 'Untitled memory';
}

function safeAuditTitle(title: string | undefined, placeholder = 'Rejected governed memory'): string {
  const trimmed = title?.trim();
  if (!trimmed) return placeholder;
  return FORBIDDEN_PATTERNS.some(({ pattern }) => pattern.test(trimmed))
    ? placeholder
    : trimmed.slice(0, 80);
}

function loadGuidanceFor(memoryClass: MemoryClass): MemoryLoadGuidance {
  switch (memoryClass) {
    case 'POLICY':
    case 'DECISION':
      return 'ALWAYS';
    case 'LOCAL':
    case 'COPILOT_MEMORY':
      return 'ON-DEMAND';
    case 'TRANSIENT':
    case 'FORBIDDEN':
      return 'NEVER';
  }
}

function normalizeLoadGuidance(value: string | undefined, fallback: MemoryLoadGuidance): MemoryLoadGuidance {
  const normalized = value?.trim().replace(/^\[|\]$/g, '').toUpperCase();
  return normalized === 'ALWAYS'
    || normalized === 'ON-DEMAND'
    || normalized === 'ARCHIVE'
    || normalized === 'NEVER'
    ? normalized
    : fallback;
}

export const REAL_COPILOT_UNAVAILABLE_REASON =
  'Real Copilot Memory API unavailable: no concrete callable API was found in installed @github/copilot SDK/tooling. Squad will not fake provider=copilot; use hostInjectedCopilotAdapter only when a host supplies a client.';

function isRealCopilotProviderSelected(config: MemoryGovernanceConfig): boolean {
  return config.defaultProvider === 'copilot';
}

function isHostInjectedCopilotAdapterConfigured(config: MemoryGovernanceConfig): boolean {
  return config.externalProviders.hostInjectedCopilotAdapter.enabled;
}

export class HostInjectedCopilotMemoryAdapter {
  constructor(private readonly client?: CopilotMemoryProviderClient) {}

  isAvailable(): boolean {
    return this.client !== undefined;
  }

  async write(request: CopilotMemoryProviderWriteRequest): Promise<CopilotMemoryProviderWriteResult> {
    return this.requireClient().write(request);
  }

  async search(query: string): Promise<CopilotMemoryProviderSearchResult[]> {
    return this.requireClient().search(query);
  }

  async delete(id: string): Promise<boolean> {
    return this.requireClient().delete(id);
  }

  private requireClient(): CopilotMemoryProviderClient {
    if (!this.client) {
      throw new Error(
        'hostInjectedCopilotAdapter is enabled, but no host-injected Copilot memory client was supplied. This is not real provider=copilot persistence.',
      );
    }
    return this.client;
  }
}

function destinationFor(memoryClass: MemoryClass): MemoryClassification['destination'] {
  switch (memoryClass) {
    case 'LOCAL':
      return 'local';
    case 'DECISION':
      return 'decision-inbox';
    case 'POLICY':
      return 'policy-inbox';
    case 'COPILOT_MEMORY':
      return 'external-semantic';
    default:
      return 'none';
  }
}

export async function ensureMemoryGovernanceDefaults(
  storage: StorageProvider,
  projectRoot: string,
): Promise<string[]> {
  const created: string[] = [];
  const memoryDir = path.join(projectRoot, '.squad', 'memory');
  for (const dir of ['local', 'policy-inbox', 'semantic-inbox', 'tombstones']) {
    const fullPath = path.join(memoryDir, dir);
    if (!await storage.exists(fullPath)) {
      await storage.mkdir(fullPath, { recursive: true });
      created.push(path.join('.squad', 'memory', dir));
    }
  }

  const configPath = path.join(memoryDir, 'config.json');
  if (!await storage.exists(configPath)) {
    await storage.write(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    created.push(path.join('.squad', 'memory', 'config.json'));
  }

  const indexPath = path.join(memoryDir, 'index.json');
  if (!await storage.exists(indexPath)) {
    await storage.write(indexPath, '[]\n');
    created.push(path.join('.squad', 'memory', 'index.json'));
  }

  const auditPath = path.join(memoryDir, 'audit.jsonl');
  if (!await storage.exists(auditPath)) {
    await storage.write(auditPath, '');
    created.push(path.join('.squad', 'memory', 'audit.jsonl'));
  }

  return created;
}

export class LocalMemoryStore {
  private readonly squadDir: string;
  private readonly copilotProvider: HostInjectedCopilotMemoryAdapter;

  constructor(
    private readonly storage: StorageProvider,
    rootDir: string,
    options: LocalMemoryStoreOptions = {},
  ) {
    this.squadDir = options.rootKind === 'squad' ? rootDir : path.join(rootDir, '.squad');
    this.copilotProvider = new HostInjectedCopilotMemoryAdapter(
      options.hostInjectedCopilotAdapterClient ?? options.copilotMemoryClient,
    );
  }

  async classify(
    request: Pick<MemoryWriteRequest, 'content' | 'requestedClass' | 'metadata'>,
    options: { audit?: boolean; actor?: string; title?: string } = {},
  ): Promise<MemoryClassification> {
    const content = request.content.trim();
    let classification: MemoryClassification | undefined;
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        classification = {
          class: 'FORBIDDEN',
          allowed: false,
          reason: `Rejected as forbidden memory: ${reason}`,
          destination: 'none',
          loadGuidance: 'NEVER',
        };
        break;
      }
    }

    if (!classification) {
      let memoryClass = request.requestedClass;
      if (!memoryClass) {
        if (/\b(CI|PR|build)\s+(status|failed|passed|output|log)\b/i.test(content)) {
          memoryClass = 'TRANSIENT';
        } else if (/^\s*(always|never|must|do not)\b/i.test(content)) {
          memoryClass = 'POLICY';
        } else if (/\b(decision|decided|adopt|standardize|use .+ for)\b/i.test(content)) {
          memoryClass = 'DECISION';
        } else if (/\bcopilot memory|semantic memory\b/i.test(content)) {
          memoryClass = 'COPILOT_MEMORY';
        } else {
          memoryClass = 'LOCAL';
        }
      }

      if (memoryClass === 'FORBIDDEN') {
        classification = {
          class: 'FORBIDDEN',
          allowed: false,
          reason: 'Requested class is forbidden',
          destination: 'none',
          loadGuidance: 'NEVER',
        };
      } else if (memoryClass === 'TRANSIENT') {
        classification = {
          class: 'TRANSIENT',
          allowed: false,
          reason: 'Transient task state is not persisted as durable memory',
          destination: 'none',
          loadGuidance: 'NEVER',
        };
      } else {
        const fallbackLoadGuidance = loadGuidanceFor(memoryClass);
        classification = {
          class: memoryClass,
          allowed: true,
          reason: memoryClass === 'COPILOT_MEMORY'
            ? 'Content is allowed for governed Copilot Memory provider after opt-in checks'
            : 'Content is allowed for governed local memory',
          destination: destinationFor(memoryClass),
          loadGuidance: normalizeLoadGuidance(request.metadata?.loadGuidance, fallbackLoadGuidance),
        };
      }
    }

    if (options.audit) {
      await this.ensureInitialized();
      await this.audit({
        action: 'classify',
        class: classification.class,
        title: safeAuditTitle(options.title, 'Classified governed memory'),
        reason: classification.reason,
        actor: options.actor,
      });
    }

    return classification;
  }

  async write(request: MemoryWriteRequest): Promise<MemoryWriteResult> {
    await this.ensureInitialized();
    const classification = await this.classify(request);
    if (!classification.allowed) {
      await this.audit({
        action: 'reject',
        class: classification.class,
        title: safeAuditTitle(request.title),
        reason: classification.reason,
        actor: request.author,
      });
      return { stored: false, classification };
    }

    const config = await this.readConfig();
    if (classification.class === 'COPILOT_MEMORY') {
      if (isRealCopilotProviderSelected(config)) {
        await this.audit({
          action: 'reject',
          class: classification.class,
          title: safeAuditTitle(request.title),
          reason: REAL_COPILOT_UNAVAILABLE_REASON,
          actor: request.author,
          provider: 'copilot',
        });
        return {
          stored: false,
          classification: { ...classification, allowed: false, reason: REAL_COPILOT_UNAVAILABLE_REASON },
        };
      }
      const copilot = config.externalProviders.hostInjectedCopilotAdapter;
      if (!copilot.enabled) {
        const reason = 'COPILOT_MEMORY writes are disabled unless explicitly configured with hostInjectedCopilotAdapter. Real provider=copilot is unavailable locally.';
        await this.audit({
          action: 'reject',
          class: classification.class,
          title: safeAuditTitle(request.title),
          reason,
          actor: request.author,
          provider: 'hostInjectedCopilotAdapter',
        });
        return {
          stored: false,
          classification: { ...classification, allowed: false, reason },
        };
      }
      if (copilot.requireApproval && request.approved !== true) {
        const reason = 'Copilot Memory writes require explicit approval';
        await this.audit({
          action: 'reject',
          class: classification.class,
          title: safeAuditTitle(request.title),
          reason,
          actor: request.author,
          provider: 'hostInjectedCopilotAdapter',
        });
        return {
          stored: false,
          classification: { ...classification, allowed: false, reason },
        };
      }

      let providerResult: CopilotMemoryProviderWriteResult;
      try {
        providerResult = await this.copilotProvider.write({
          content: request.content.trim(),
          title: request.title?.trim() || firstLine(request.content),
          author: request.author,
          metadata: request.metadata,
          classification,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.audit({
          action: 'reject',
          class: classification.class,
          title: safeAuditTitle(request.title),
          reason,
          actor: request.author,
          provider: 'hostInjectedCopilotAdapter',
        });
        return {
          stored: false,
          classification: { ...classification, allowed: false, reason },
        };
      }

      const now = new Date().toISOString();
      const title = request.title?.trim() || firstLine(request.content);
      const entry: MemoryIndexEntry = {
        id: providerResult.id,
        class: classification.class,
        loadGuidance: classification.loadGuidance,
        title,
        path: providerResult.path ?? `host-injected-copilot-adapter:${providerResult.id}`,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const index = await this.readIndex();
      index.push(entry);
      await this.writeIndex(index);
      await this.audit({
        action: 'write',
        id: providerResult.id,
        class: classification.class,
        title,
        path: entry.path,
        reason: classification.reason,
        actor: request.author,
        provider: 'hostInjectedCopilotAdapter',
      });
      return {
        stored: true,
        id: providerResult.id,
        classification,
        path: entry.path,
      };
    }

    const id = randomUUID();
    const title = request.title?.trim() || firstLine(request.content);
    const relativePath = this.destinationPath(classification.class, id, title, request.author);
    const fullPath = path.join(this.squadDir, relativePath);
    const content = this.renderMemoryFile(id, classification.class, title, request);
    await this.storage.write(fullPath, content);

    const now = new Date().toISOString();
    const entry: MemoryIndexEntry = {
      id,
      class: classification.class,
      loadGuidance: classification.loadGuidance,
      title,
      path: path.join('.squad', relativePath),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const index = await this.readIndex();
    index.push(entry);
    await this.writeIndex(index);
    await this.audit({
      action: 'write',
      id,
      class: classification.class,
      title,
      path: entry.path,
      reason: classification.reason,
      actor: request.author,
      provider: 'local',
    });

    return { stored: true, id, classification, path: entry.path };
  }

  async search(query: string): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    const queryClassification = await this.classify({ content: query });
    if (queryClassification.class === 'FORBIDDEN') {
      await this.audit({
        action: 'reject',
        class: queryClassification.class,
        title: 'Rejected governed memory search',
        reason: queryClassification.reason,
      });
      return [];
    }

    const config = await this.readConfig();
    if (isRealCopilotProviderSelected(config)) {
      await this.audit({
        action: 'reject',
        class: 'COPILOT_MEMORY',
        title: 'Rejected governed memory search',
        reason: REAL_COPILOT_UNAVAILABLE_REASON,
        provider: 'copilot',
      });
      return [];
    }

    const normalized = query.toLowerCase();
    const index = await this.readIndex();
    const results: MemorySearchResult[] = [];
    for (const entry of index.filter(item => item.status === 'active')) {
      if (
        entry.class === 'COPILOT_MEMORY'
        || entry.path.startsWith('copilot-memory:')
        || entry.path.startsWith('host-injected-copilot-adapter:')
      ) continue;
      const content = await this.storage.read(this.absoluteFromEntryPath(entry.path));
      if (!content) continue;
      const haystack = `${entry.title}\n${content}`.toLowerCase();
      if (!haystack.includes(normalized)) continue;
      const matchLine = content.split(/\r?\n/).find(line => line.toLowerCase().includes(normalized));
      results.push({
          id: entry.id,
          class: entry.class,
          loadGuidance: entry.loadGuidance ?? loadGuidanceFor(entry.class),
          title: entry.title,
        path: entry.path,
        snippet: (matchLine ?? entry.title).trim().slice(0, 240),
        provider: 'local',
      });
    }
    if (isHostInjectedCopilotAdapterConfigured(config)) {
      const activeCopilotIds = new Set(index
        .filter(item => item.status === 'active' && item.class === 'COPILOT_MEMORY')
        .map(item => item.id));
      const externalResults = await this.copilotProvider.search(query);
      for (const result of externalResults) {
        if (!activeCopilotIds.has(result.id)) continue;
        results.push({
          id: result.id,
          class: 'COPILOT_MEMORY',
          loadGuidance: 'ON-DEMAND',
          title: result.title,
          path: result.path ?? `host-injected-copilot-adapter:${result.id}`,
          snippet: result.snippet.slice(0, 240),
          provider: 'hostInjectedCopilotAdapter',
        });
      }
    }
    await this.audit({
      action: 'search',
      reason: `Search returned ${results.length} result(s)`,
    });
    return results;
  }

  async promote(id: string, targetClass: Exclude<MemoryClass, 'FORBIDDEN' | 'TRANSIENT'>, actor?: string): Promise<MemoryWriteResult> {
    await this.ensureInitialized();
    const index = await this.readIndex();
    const entry = index.find(item => item.id === id && item.status === 'active');
    if (!entry) {
      throw new Error(`Memory '${id}' not found`);
    }
    const content = await this.storage.read(this.absoluteFromEntryPath(entry.path));
    if (!content) {
      throw new Error(`Memory '${id}' content not found`);
    }
    const body = content.split('---').slice(2).join('---').trim() || content;
    const result = await this.write({
      content: body,
      title: entry.title,
      author: actor,
      requestedClass: targetClass,
    });
    if (result.stored && result.id) {
      const now = new Date().toISOString();
      const nextIndex = await this.readIndex();
      const prior = nextIndex.find(item => item.id === id);
      const successor = nextIndex.find(item => item.id === result.id);
      if (successor) {
        successor.supersedes = id;
        successor.updatedAt = now;
      }
      if (prior) {
        prior.status = 'superseded';
        prior.loadGuidance = 'ARCHIVE';
        prior.supersededBy = result.id;
        prior.updatedAt = now;
      }
      await this.writeIndex(nextIndex);
      if (prior && !prior.path.startsWith('host-injected-copilot-adapter:') && !prior.path.startsWith('copilot-memory:')) {
        await this.updateMemoryFileMetadata(prior.path, {
          status: 'superseded',
          loadGuidance: '[ARCHIVE]',
          supersededBy: result.id,
        });
      }
      await this.audit({
        action: 'promote',
        id,
        class: targetClass,
        title: entry.title,
        reason: `Promoted to ${targetClass}`,
        actor,
      });
    }
    return result;
  }

  async delete(id: string, actor?: string): Promise<boolean> {
    await this.ensureInitialized();
    const index = await this.readIndex();
    const entry = index.find(item => item.id === id && item.status !== 'deleted');
    if (!entry) return false;
    const previousStatus = entry.status;
    if (
      entry.class === 'COPILOT_MEMORY'
      || entry.path.startsWith('copilot-memory:')
      || entry.path.startsWith('host-injected-copilot-adapter:')
    ) {
      const config = await this.readConfig();
      if (isRealCopilotProviderSelected(config)) {
        throw new Error(REAL_COPILOT_UNAVAILABLE_REASON);
      }
      if (!isHostInjectedCopilotAdapterConfigured(config)) {
        throw new Error('COPILOT_MEMORY delete requires hostInjectedCopilotAdapter to be enabled; real provider=copilot is unavailable locally.');
      }
      const deleted = await this.copilotProvider.delete(id);
      if (!deleted) return false;
    } else {
      await this.storage.delete(this.absoluteFromEntryPath(entry.path));
    }
    entry.status = 'deleted';
    entry.loadGuidance = 'ARCHIVE';
    entry.deletedAt = new Date().toISOString();
    entry.updatedAt = entry.deletedAt;
    await this.writeIndex(index);
    await this.storage.write(
      path.join(this.squadDir, 'memory', 'tombstones', `${id}.json`),
      JSON.stringify({
        id,
        deletedAt: entry.deletedAt,
        path: entry.path,
        previousStatus,
        supersedes: entry.supersedes,
        supersededBy: entry.supersededBy,
        loadGuidance: '[ARCHIVE]',
      }, null, 2) + '\n',
    );
    await this.audit({
      action: 'delete',
      id,
      class: entry.class,
      title: entry.title,
      path: entry.path,
      reason: 'Deleted governed memory and wrote tombstone',
      actor,
      provider: entry.class === 'COPILOT_MEMORY' ? 'hostInjectedCopilotAdapter' : 'local',
    });
    return true;
  }

  async providerStatus(): Promise<{
    defaultProvider: MemoryGovernanceConfig['defaultProvider'];
    realCopilotMemory: { available: false; configured: boolean; reason: string };
    hostInjectedCopilotAdapter: MemoryGovernanceConfig['externalProviders']['hostInjectedCopilotAdapter'] & { clientAvailable: boolean; configured: boolean };
  }> {
    await this.ensureInitialized();
    const config = await this.readConfig();
    return {
      defaultProvider: config.defaultProvider,
      realCopilotMemory: {
        available: false,
        configured: isRealCopilotProviderSelected(config),
        reason: REAL_COPILOT_UNAVAILABLE_REASON,
      },
      hostInjectedCopilotAdapter: {
        ...config.externalProviders.hostInjectedCopilotAdapter,
        clientAvailable: this.copilotProvider.isAvailable(),
        configured: isHostInjectedCopilotAdapterConfigured(config),
      },
    };
  }

  async configureHostInjectedCopilotAdapter(options: {
    enabled: boolean;
    requireApproval?: boolean;
    defaultProvider?: Exclude<MemoryGovernanceConfig['defaultProvider'], 'copilot'>;
    actor?: string;
  }): Promise<MemoryGovernanceConfig> {
    await this.ensureInitialized();
    const current = await this.readConfig();
    const next: MemoryGovernanceConfig = {
      ...current,
      defaultProvider: options.defaultProvider ?? current.defaultProvider,
      externalProviders: {
        ...current.externalProviders,
          hostInjectedCopilotAdapter: {
            enabled: options.enabled,
            requireApproval: options.requireApproval ?? current.externalProviders.hostInjectedCopilotAdapter.requireApproval,
          },
        },
    };
    await this.storage.write(path.join(this.squadDir, 'memory', 'config.json'), JSON.stringify(next, null, 2) + '\n');
    await this.audit({
      action: 'configure',
      reason: options.enabled
        ? 'Configured hostInjectedCopilotAdapter; this is not real provider=copilot persistence'
        : 'Disabled hostInjectedCopilotAdapter',
      actor: options.actor,
      provider: 'hostInjectedCopilotAdapter',
    });
    return next;
  }

  async configureCopilotProvider(options: {
    enabled: boolean;
    adapter?: 'host' | 'hostInjectedCopilotAdapter';
    requireApproval?: boolean;
    defaultProvider?: MemoryGovernanceConfig['defaultProvider'];
    actor?: string;
  }): Promise<MemoryGovernanceConfig> {
    if (options.defaultProvider === 'copilot') {
      throw new Error(REAL_COPILOT_UNAVAILABLE_REASON);
    }
    return this.configureHostInjectedCopilotAdapter({
      enabled: options.enabled,
      requireApproval: options.requireApproval,
      defaultProvider: options.defaultProvider,
      actor: options.actor,
    });
  }

  async auditLog(): Promise<MemoryAuditRecord[]> {
    await this.ensureInitialized();
    const content = await this.storage.read(path.join(this.squadDir, 'memory', 'audit.jsonl'));
    if (!content) return [];
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line) as MemoryAuditRecord);
  }

  private async ensureInitialized(): Promise<void> {
    const memoryDir = path.join(this.squadDir, 'memory');
    for (const dir of ['local', 'policy-inbox', 'semantic-inbox', 'tombstones']) {
      await this.storage.mkdir(path.join(memoryDir, dir), { recursive: true });
    }
    const configPath = path.join(memoryDir, 'config.json');
    if (!await this.storage.exists(configPath)) {
      await this.storage.write(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    }
    const indexPath = path.join(memoryDir, 'index.json');
    if (!await this.storage.exists(indexPath)) {
      await this.storage.write(indexPath, '[]\n');
    }
    const auditPath = path.join(memoryDir, 'audit.jsonl');
    if (!await this.storage.exists(auditPath)) {
      await this.storage.write(auditPath, '');
    }
  }

  private async readConfig(): Promise<MemoryGovernanceConfig> {
    const content = await this.storage.read(path.join(this.squadDir, 'memory', 'config.json'));
    if (!content) return cloneDefaultConfig();
    try {
      const parsed = JSON.parse(content) as Partial<MemoryGovernanceConfig>;
      const defaults = cloneDefaultConfig();
      const parsedExternalProviders = parsed.externalProviders as Partial<MemoryGovernanceConfig['externalProviders']> & {
        copilotMemory?: { enabled?: boolean; requireApproval?: boolean; adapter?: string };
      } | undefined;
      const legacyHostInjected = parsedExternalProviders?.copilotMemory;
      return {
        ...defaults,
        ...parsed,
        externalProviders: {
          ...defaults.externalProviders,
          ...parsedExternalProviders,
          hostInjectedCopilotAdapter: {
            ...defaults.externalProviders.hostInjectedCopilotAdapter,
            ...(legacyHostInjected
              ? {
                  enabled: legacyHostInjected.enabled ?? defaults.externalProviders.hostInjectedCopilotAdapter.enabled,
                  requireApproval: legacyHostInjected.requireApproval ?? defaults.externalProviders.hostInjectedCopilotAdapter.requireApproval,
                }
              : {}),
            ...parsedExternalProviders?.hostInjectedCopilotAdapter,
          },
        },
        policy: {
          ...defaults.policy,
          ...parsed.policy,
        },
      };
    } catch {
      return cloneDefaultConfig();
    }
  }

  private async readIndex(): Promise<MemoryIndexEntry[]> {
    const content = await this.storage.read(path.join(this.squadDir, 'memory', 'index.json'));
    if (!content) return [];
    try {
      const parsed = JSON.parse(content) as MemoryIndexEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeIndex(index: MemoryIndexEntry[]): Promise<void> {
    await this.storage.write(path.join(this.squadDir, 'memory', 'index.json'), JSON.stringify(index, null, 2) + '\n');
  }

  private async audit(record: Omit<MemoryAuditRecord, 'timestamp'>): Promise<void> {
    const auditRecord: MemoryAuditRecord = {
      timestamp: new Date().toISOString(),
      ...record,
    };
    await this.storage.append(path.join(this.squadDir, 'memory', 'audit.jsonl'), JSON.stringify(auditRecord) + '\n');
  }

  private destinationPath(memoryClass: MemoryClass, id: string, title: string, author?: string): string {
    const prefix = author ? `${slugify(author)}-` : '';
    const fileName = `${prefix}${slugify(title)}-${id.slice(0, 8)}.md`;
    if (memoryClass === 'DECISION') {
      return path.join('decisions', 'inbox', fileName);
    }
    if (memoryClass === 'POLICY') {
      return path.join('memory', 'policy-inbox', fileName);
    }
    return path.join('memory', 'local', fileName);
  }

  private renderMemoryFile(
    id: string,
    memoryClass: MemoryClass,
    title: string,
    request: MemoryWriteRequest,
  ): string {
    const metadata = request.metadata ? JSON.stringify(request.metadata) : '{}';
    return [
      '---',
      `id: ${id}`,
      `class: ${memoryClass}`,
      `loadGuidance: [${normalizeLoadGuidance(request.metadata?.loadGuidance, loadGuidanceFor(memoryClass))}]`,
      `title: ${JSON.stringify(title)}`,
      `author: ${JSON.stringify(request.author ?? 'unknown')}`,
      `createdAt: ${new Date().toISOString()}`,
      `metadata: ${metadata}`,
      '---',
      '',
      request.content.trim(),
      '',
    ].join('\n');
  }

  private absoluteFromEntryPath(entryPath: string): string {
    const relative = entryPath.startsWith('.squad')
      ? entryPath.slice('.squad'.length + 1)
      : entryPath;
    return path.join(this.squadDir, relative);
  }

  private async updateMemoryFileMetadata(entryPath: string, updates: Record<string, string>): Promise<void> {
    const fullPath = this.absoluteFromEntryPath(entryPath);
    const content = await this.storage.read(fullPath);
    if (!content) return;
    const lines = content.split(/\r?\n/);
    if (lines[0] !== '---') return;
    const endIndex = lines.findIndex((line, index) => index > 0 && line === '---');
    if (endIndex < 0) return;
    for (const [key, value] of Object.entries(updates)) {
      const existingIndex = lines.findIndex((line, index) => index > 0 && index < endIndex && line.startsWith(`${key}:`));
      if (existingIndex >= 0) {
        lines[existingIndex] = `${key}: ${value}`;
      } else {
        lines.splice(endIndex, 0, `${key}: ${value}`);
      }
    }
    await this.storage.write(fullPath, lines.join('\n'));
  }
}
