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
    auditMaxBytes: number;
    auditMaxArchives: number;
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
  provider?: string;
  score?: number;
}

export interface MemoryAuditRecord {
  timestamp: string;
  action: 'classify' | 'write' | 'reject' | 'promote' | 'delete' | 'search' | 'configure' | 'provider-error';
  id?: string;
  class?: MemoryClass;
  title?: string;
  path?: string;
  reason?: string;
  actor?: string;
  provider?: string;
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

export interface MemoryProviderSearchResult extends CopilotMemoryProviderSearchResult {
  class: MemoryClass;
  loadGuidance: MemoryLoadGuidance;
  score?: number;
}

export interface CopilotMemoryProviderClient {
  write(request: CopilotMemoryProviderWriteRequest): Promise<CopilotMemoryProviderWriteResult>;
  search(query: string): Promise<CopilotMemoryProviderSearchResult[]>;
  delete(id: string): Promise<boolean>;
}

// ── MemoryProvider abstraction ───────────────────────────────────────────────
//
// A generic provider seam for external/local memory backends.
// Governance classification always happens BEFORE provider calls.
// FORBIDDEN and TRANSIENT content never reaches a provider.
// provider=copilot is reserved and fails closed separately.

export interface MemoryProviderStatus {
  id: string;
  name: string;
  available: boolean;
  reason?: string;
}

/**
 * Generic external memory provider contract.
 *
 * Implementations receive only pre-classified, non-forbidden, non-transient
 * memory. The {@link LocalMemoryStore} enforces governance before routing
 * to any registered provider.
 */
export interface MemoryProvider {
  readonly id: string;
  readonly name: string;
  /** Memory classes this provider is designed to store and retrieve. */
  readonly supportedClasses: ReadonlyArray<MemoryClass>;
  status(): Promise<MemoryProviderStatus>;
  write(request: CopilotMemoryProviderWriteRequest): Promise<CopilotMemoryProviderWriteResult>;
  search(query: string): Promise<MemoryProviderSearchResult[]>;
  delete(id: string): Promise<boolean>;
}

/**
 * MemPalace — in-memory test double for an external spatial memory provider.
 *
 * Models a "memory palace" (method of loci) where memories are stored at
 * named loci. In production this would be replaced by a real spatial/external
 * memory service. Set `metadata.locus` on a write request to tag the
 * destination locus; defaults to `'default'`.
 *
 * Accepts: LOCAL, DECISION, POLICY.
 * Never receives FORBIDDEN, TRANSIENT, or COPILOT_MEMORY (filtered upstream).
 */
export class MemPalaceMemoryProvider implements MemoryProvider {
  readonly id = 'mempalace';
  readonly name = 'MemPalace';
  readonly supportedClasses: ReadonlyArray<MemoryClass> = ['LOCAL', 'DECISION', 'POLICY'];

  private readonly loci = new Map<string, {
    id: string;
    title: string;
    content: string;
    class: MemoryClass;
    loadGuidance: MemoryLoadGuidance;
    locus: string;
    path: string;
    createdAt: number;
  }>();

  constructor(private readonly maxEntries = 500) {}

  async status(): Promise<MemoryProviderStatus> {
    return { id: this.id, name: this.name, available: true };
  }

  async write(request: CopilotMemoryProviderWriteRequest): Promise<CopilotMemoryProviderWriteResult> {
    const id = `mempalace-${randomUUID()}`;
    const locus = providerPathSegment(request.metadata?.['locus'] ?? 'default');
    this.loci.set(id, {
      id,
      title: request.title,
      content: request.content,
      class: request.classification.class,
      loadGuidance: request.classification.loadGuidance,
      locus,
      path: `mempalace:${locus}:${id}`,
      createdAt: Date.now(),
    });
    evictOldest(this.loci, this.maxEntries);
    return { id, path: `mempalace:${locus}:${id}` };
  }

  async search(query: string): Promise<MemoryProviderSearchResult[]> {
    const normalized = query.toLowerCase();
    const results: MemoryProviderSearchResult[] = [];
    for (const entry of this.loci.values()) {
      const score = providerRelevanceScore(entry.title, entry.content, normalized);
      if (
        entry.title.toLowerCase().includes(normalized) ||
        entry.content.toLowerCase().includes(normalized) ||
        score > 0
      ) {
        results.push({
          id: entry.id,
          title: entry.title,
          snippet: (entry.content.split('\n').find(l => l.toLowerCase().includes(normalized)) ?? entry.title).slice(0, 240),
          path: entry.path,
          class: entry.class,
          loadGuidance: entry.loadGuidance,
          score,
        });
      }
    }
    return results.sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.id.localeCompare(right.id));
  }

  async delete(id: string): Promise<boolean> {
    return this.loci.delete(id);
  }

  /** Number of stored loci entries — for test introspection only. */
  get size(): number {
    return this.loci.size;
  }
}

/**
 * IndexServer — in-memory test double for a governed knowledge/instruction catalog.
 *
 * Models a server-side index of stable instructions and reference knowledge.
 * In production this would be replaced by a real embedding-search or BM25 index.
 * Set `metadata.topic` on a write request to tag the catalog entry; defaults to
 * the memory class (lowercased).
 *
 * Accepts: LOCAL, DECISION, POLICY.
 * Never receives FORBIDDEN, TRANSIENT, or COPILOT_MEMORY (filtered upstream).
 */
export class IndexServerMemoryProvider implements MemoryProvider {
  readonly id = 'indexserver';
  readonly name = 'IndexServer';
  readonly supportedClasses: ReadonlyArray<MemoryClass> = ['LOCAL', 'DECISION', 'POLICY'];

  private readonly catalog = new Map<string, {
    id: string;
    title: string;
    content: string;
    class: MemoryClass;
    loadGuidance: MemoryLoadGuidance;
    topic: string;
    path: string;
    createdAt: number;
  }>();

  constructor(private readonly maxEntries = 500) {}

  async status(): Promise<MemoryProviderStatus> {
    return { id: this.id, name: this.name, available: true };
  }

  async write(request: CopilotMemoryProviderWriteRequest): Promise<CopilotMemoryProviderWriteResult> {
    const id = `indexserver-${randomUUID()}`;
    const topic = providerPathSegment(request.metadata?.['topic'] ?? request.classification.class.toLowerCase());
    this.catalog.set(id, {
      id,
      title: request.title,
      content: request.content,
      class: request.classification.class,
      loadGuidance: request.classification.loadGuidance,
      topic,
      path: `indexserver:${topic}:${id}`,
      createdAt: Date.now(),
    });
    evictOldest(this.catalog, this.maxEntries);
    return { id, path: `indexserver:${topic}:${id}` };
  }

  async search(query: string): Promise<MemoryProviderSearchResult[]> {
    const normalized = query.toLowerCase();
    const results: MemoryProviderSearchResult[] = [];
    for (const entry of this.catalog.values()) {
      const score = providerRelevanceScore(entry.title, entry.content, normalized);
      if (
        entry.title.toLowerCase().includes(normalized) ||
        entry.content.toLowerCase().includes(normalized) ||
        score > 0
      ) {
        results.push({
          id: entry.id,
          title: entry.title,
          snippet: (entry.content.split('\n').find(l => l.toLowerCase().includes(normalized)) ?? entry.title).slice(0, 240),
          path: entry.path,
          class: entry.class,
          loadGuidance: entry.loadGuidance,
          score,
        });
      }
    }
    return results.sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.id.localeCompare(right.id));
  }

  async delete(id: string): Promise<boolean> {
    return this.catalog.delete(id);
  }

  /** Number of catalog entries — for test introspection only. */
  get size(): number {
    return this.catalog.size;
  }
}

export interface LocalMemoryStoreOptions {
  rootKind?: 'project' | 'squad';
  hostInjectedCopilotAdapterClient?: CopilotMemoryProviderClient;
  /** @deprecated Use hostInjectedCopilotAdapterClient. */
  copilotMemoryClient?: CopilotMemoryProviderClient;
  /**
   * Optional additional external memory providers.
   * Each provider receives writes/searches for its supported memory classes
   * AFTER governance classification. FORBIDDEN and TRANSIENT content never
   * reaches these providers. Results are merged with local search results.
   */
  registeredProviders?: MemoryProvider[];
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
    auditMaxBytes: 1_048_576,
    auditMaxArchives: 3,
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

function providerPathSegment(value: string): string {
  return slugify(value).slice(0, 40) || 'default';
}

function providerRelevanceScore(title: string, content: string, normalizedQuery: string): number {
  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter(token => token.length >= 4);
  if (queryTokens.length === 0) return 0;
  const haystack = new Set(`${title} ${content}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return queryTokens.filter(token => haystack.has(token)).length;
}

function evictOldest<T extends { createdAt: number }>(entries: Map<string, T>, maxEntries: number): void {
  if (maxEntries < 1) {
    entries.clear();
    return;
  }
  while (entries.size > maxEntries) {
    const oldest = [...entries.entries()].sort((left, right) => left[1].createdAt - right[1].createdAt)[0];
    if (!oldest) return;
    entries.delete(oldest[0]);
  }
}

function safeProviderErrorReason(provider: MemoryProvider, operation: 'write' | 'search', error: unknown): string {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  return `${provider.name} provider ${operation} failed (${errorName}); raw provider error text omitted`;
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
  private readonly registeredProviders: MemoryProvider[];
  /**
   * Async mutex tail for index read-modify-write operations.
   * Each caller enqueues behind the current tail so concurrent writes
   * are serialized without OS-level file locking.
   */
  private indexLockTail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: StorageProvider,
    rootDir: string,
    options: LocalMemoryStoreOptions = {},
  ) {
    this.squadDir = options.rootKind === 'squad' ? rootDir : path.join(rootDir, '.squad');
    this.copilotProvider = new HostInjectedCopilotMemoryAdapter(
      options.hostInjectedCopilotAdapterClient ?? options.copilotMemoryClient,
    );
    this.registeredProviders = options.registeredProviders ?? [];
  }

  /**
   * Serialize all index read-modify-write operations.
   *
   * All callers that do readIndex() → mutate → writeIndex() must go through
   * this method so concurrent writes within the same store instance cannot
   * interleave and lose entries. The critical section is purely async
   * (no thread blocking), so this is safe in Node.js single-thread land.
   */
  private async withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    let unlock!: () => void;
    // Append a new "release" promise to the tail of the lock chain.
    // The next caller will wait for this release before proceeding.
    const release = new Promise<void>(resolve => { unlock = resolve; });
    const prev = this.indexLockTail;
    this.indexLockTail = release;
    await prev;
    try {
      return await fn();
    } finally {
      unlock();
    }
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
      await this.withIndexLock(async () => {
        const index = await this.readIndex();
        index.push(entry);
        await this.writeIndex(index);
      });
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
    // Serialize the read-modify-write under the index lock so concurrent
    // calls within the same store instance cannot overwrite each other's entry.
    await this.withIndexLock(async () => {
      const index = await this.readIndex();
      index.push(entry);
      await this.writeIndex(index);
    });
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

    // Route to registered external providers that support this memory class.
    // Governance classification has already run; FORBIDDEN and TRANSIENT never
    // reach this point. Providers receive only safe, non-copilot content.
    const providerWriteRequest: CopilotMemoryProviderWriteRequest = {
      content: request.content.trim(),
      title,
      author: request.author,
      metadata: request.metadata,
      classification,
    };
    for (const provider of this.registeredProviders) {
      if (!provider.supportedClasses.includes(classification.class)) continue;
      try {
        const providerResult = await provider.write(providerWriteRequest);
        await this.audit({
          action: 'write',
          id: providerResult.id,
          class: classification.class,
          title,
          path: providerResult.path ?? `${provider.id}:${providerResult.id}`,
          reason: `Replicated to ${provider.name} provider`,
          actor: request.author,
        });
      } catch (error) {
        await this.audit({
          action: 'provider-error',
          class: classification.class,
          title,
          reason: safeProviderErrorReason(provider, 'write', error),
          actor: request.author,
          provider: provider.id,
        });
      }
    }

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

    // Query registered external providers. Governance filtering already
    // passed. Deduplicates results by id (local takes precedence).
    const seenIds = new Set(results.map(r => r.id));
    for (const provider of this.registeredProviders) {
      try {
        const providerResults = await provider.search(query);
        for (const result of providerResults) {
          if (seenIds.has(result.id)) continue;
          seenIds.add(result.id);
          results.push({
            id: result.id,
            class: result.class,
            loadGuidance: result.loadGuidance,
            title: result.title,
            path: result.path ?? `${provider.id}:${result.id}`,
            snippet: result.snippet.slice(0, 240),
            provider: provider.id,
            score: result.score,
          });
        }
      } catch (error) {
        await this.audit({
          action: 'provider-error',
          title: 'Registered provider search failed',
          reason: safeProviderErrorReason(provider, 'search', error),
          provider: provider.id,
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
      const successorId = result.id;
      if (!successorId) {
        throw new Error(`Promoted memory '${id}' did not return a successor id`);
      }
      // Serialize the supersedes/supersededBy mutation under the lock.
      // write() above already released its lock before we reach here.
      let priorEntryPath: string | undefined;
      await this.withIndexLock(async () => {
        const nextIndex = await this.readIndex();
        const prior = nextIndex.find(item => item.id === id);
        const successor = nextIndex.find(item => item.id === successorId);
        if (successor) {
          successor.supersedes = id;
          successor.updatedAt = now;
        }
        if (prior) {
          prior.status = 'superseded';
          prior.loadGuidance = 'ARCHIVE';
          prior.supersededBy = successorId;
          prior.updatedAt = now;
          priorEntryPath = prior.path;
        }
        await this.writeIndex(nextIndex);
      });
      if (priorEntryPath && !priorEntryPath.startsWith('host-injected-copilot-adapter:') && !priorEntryPath.startsWith('copilot-memory:')) {
        await this.updateMemoryFileMetadata(priorEntryPath, {
          status: 'superseded',
          loadGuidance: '[ARCHIVE]',
          supersededBy: successorId,
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
    return this.withIndexLock(async () => {
      const index = await this.readIndex();
      const entry = index.find(item => item.id === id && item.status !== 'deleted');
      if (!entry) return false;
      const previousStatus = entry.status;
      const deletedAt = new Date().toISOString();
      const tombstonePath = path.join(this.squadDir, 'memory', 'tombstones', `${id}.json`);
      const tombstoneData =
        JSON.stringify({
          id,
          deletedAt,
          path: entry.path,
          previousStatus,
          supersedes: entry.supersedes,
          supersededBy: entry.supersededBy,
          loadGuidance: '[ARCHIVE]',
        }, null, 2) + '\n';

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
        // For COPILOT_MEMORY: gate on external delete success before local mutations.
        const deleted = await this.copilotProvider.delete(id);
        if (!deleted) return false;
        // Write tombstone first (local intent record), then update index.
        await this.storage.write(tombstonePath, tombstoneData);
        entry.status = 'deleted';
        entry.loadGuidance = 'ARCHIVE';
        entry.deletedAt = deletedAt;
        entry.updatedAt = deletedAt;
        await this.writeIndex(index);
      } else {
        // For local entries: tombstone FIRST (before any destructive action),
        // then update index, then delete source file last.
        // If tombstone write fails, source and index are untouched.
        // If writeIndex fails after tombstone, source still exists and tombstone
        // signals the delete intent for recovery.
        await this.storage.write(tombstonePath, tombstoneData);
        entry.status = 'deleted';
        entry.loadGuidance = 'ARCHIVE';
        entry.deletedAt = deletedAt;
        entry.updatedAt = deletedAt;
        await this.writeIndex(index);
        // Source deletion is last: if it fails, the entry is already marked
        // deleted in the index and a tombstone exists — recoverable.
        await this.storage.delete(this.absoluteFromEntryPath(entry.path));
      }

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
    });
  }

  async providerStatus(): Promise<{
    defaultProvider: MemoryGovernanceConfig['defaultProvider'];
    realCopilotMemory: { available: false; configured: boolean; reason: string };
    hostInjectedCopilotAdapter: MemoryGovernanceConfig['externalProviders']['hostInjectedCopilotAdapter'] & { clientAvailable: boolean; configured: boolean };
    registeredProviders: MemoryProviderStatus[];
  }> {
    await this.ensureInitialized();
    const config = await this.readConfig();
    const providerStatuses: MemoryProviderStatus[] = await Promise.all(
      this.registeredProviders.map(p => p.status()),
    );
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
      registeredProviders: providerStatuses,
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
    const indexPath = path.join(this.squadDir, 'memory', 'index.json');
    const content = await this.storage.read(indexPath);
    if (!content) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      // Do NOT silently reset to []. Backup the corrupt file and surface the error.
      await this.backupCorruptIndex(indexPath, content);
      throw new Error(
        `Memory index is corrupt (JSON parse failed: ${err instanceof Error ? err.message : String(err)}). ` +
        `A backup was written to ${indexPath}.corrupt. Manual recovery is required.`,
      );
    }
    if (!Array.isArray(parsed)) {
      await this.backupCorruptIndex(indexPath, content);
      throw new Error(
        `Memory index is corrupt (root is not an array). ` +
        `A backup was written to ${indexPath}.corrupt. Manual recovery is required.`,
      );
    }
    return parsed as MemoryIndexEntry[];
  }

  /**
   * Best-effort backup of a corrupt index file.
   * Writes the raw content to a `.corrupt` path alongside the index.
   * Failure to write the backup is suppressed so callers see the original error.
   */
  private async backupCorruptIndex(indexPath: string, content: string): Promise<void> {
    try {
      await this.storage.write(`${indexPath}.corrupt`, content);
    } catch {
      // Suppress backup write failure; caller will still throw the original error.
    }
  }

  private async writeIndex(index: MemoryIndexEntry[]): Promise<void> {
    const indexPath = path.join(this.squadDir, 'memory', 'index.json');
    const tmpPath = `${indexPath}.tmp`;
    // Write to a temp file first, then atomically rename into place.
    // This prevents a crash mid-write from leaving a partial/corrupt index.
    await this.storage.write(tmpPath, JSON.stringify(index, null, 2) + '\n');
    await this.storage.rename(tmpPath, indexPath);
  }

  private async audit(record: Omit<MemoryAuditRecord, 'timestamp'>): Promise<void> {
    await this.rotateAuditIfNeeded();
    const auditRecord: MemoryAuditRecord = {
      timestamp: new Date().toISOString(),
      ...record,
    };
    await this.storage.append(path.join(this.squadDir, 'memory', 'audit.jsonl'), JSON.stringify(auditRecord) + '\n');
  }

  private async rotateAuditIfNeeded(): Promise<void> {
    const config = await this.readConfig();
    const maxBytes = config.policy.auditMaxBytes;
    if (maxBytes <= 0) return;
    const auditPath = path.join(this.squadDir, 'memory', 'audit.jsonl');
    const stats = await this.storage.stat(auditPath);
    if (!stats || stats.size < maxBytes) return;
    const maxArchives = Math.max(0, config.policy.auditMaxArchives);
    for (let index = maxArchives; index >= 1; index--) {
      const current = path.join(this.squadDir, 'memory', `audit.${index}.jsonl`);
      const next = path.join(this.squadDir, 'memory', `audit.${index + 1}.jsonl`);
      if (!await this.storage.exists(current)) continue;
      if (index === maxArchives) {
        await this.storage.delete(current);
      } else {
        await this.storage.rename(current, next);
      }
    }
    if (maxArchives > 0) {
      await this.storage.rename(auditPath, path.join(this.squadDir, 'memory', 'audit.1.jsonl'));
    } else {
      await this.storage.delete(auditPath);
    }
    await this.storage.write(auditPath, '');
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
    if (/^[a-z][a-z0-9+.-]*:/i.test(entryPath)) {
      throw new Error(`External memory path cannot be resolved locally: ${entryPath}`);
    }
    const normalizedInput = entryPath.replace(/\\/g, path.sep);
    const relative = normalizedInput.startsWith('.squad')
      ? normalizedInput.slice('.squad'.length + 1)
      : normalizedInput;
    const normalized = path.normalize(relative);
    if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
      throw new Error(`Unsafe memory path blocked: ${entryPath}`);
    }
    return path.join(this.squadDir, normalized);
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
