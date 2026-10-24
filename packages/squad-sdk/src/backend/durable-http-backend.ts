import { randomUUID } from 'node:crypto';
import { BACKEND_PROTOCOL_VERSION, BackendError } from './types.js';
import type {
  ApprovalRecord,
  ApprovalResponse,
  BackendAdmission,
  BackendConversation,
  BackendErrorCode,
  BackendEventPage,
  BackendHealth,
  BackendMessage,
  BackendTurn,
  CreateConversationOptions,
  LeaseEpoch,
  NegotiatedCapabilities,
  ProtocolHello,
  ReadEventsOptions,
  SquadBackend,
} from './types.js';

export interface DurableHttpOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
  /** Per-attempt HTTP request timeout in milliseconds (default: 15_000). */
  requestTimeoutMs?: number;
  epoch?: LeaseEpoch;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Client for DurableSquad's `/v1/conversations` HTTP surface. */
export class DurableHttpSquadBackend implements SquadBackend {
  readonly kind = 'durable-http';
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly requestTimeoutMs: number;
  /** Initial epoch for conversations this client has not learned one for. */
  private readonly defaultEpoch: LeaseEpoch | undefined;
  /** Learned lease epoch per conversation: one conversation's epoch must never leak into another. */
  private readonly epochs = new Map<string, LeaseEpoch>();

  constructor(private readonly options: DurableHttpOptions) {
    this.base = validateBaseUrl(options.baseUrl);
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 200;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.defaultEpoch = options.epoch;
  }

  negotiate(hello: ProtocolHello): Promise<NegotiatedCapabilities> {
    return this.request('POST', '/v1/capabilities', hello);
  }

  readEvents(conversationId: string, options: ReadEventsOptions = {}): Promise<BackendEventPage> {
    const q = new URLSearchParams();
    if (options.after) q.set('after', options.after);
    if (options.limit) q.set('limit', String(options.limit));
    if (options.stream) q.set('stream', options.stream);
    const qs = q.toString();
    return this.request('GET', `/v1/conversations/${enc(conversationId)}/events${qs ? `?${qs}` : ''}`);
  }

  async createConversation(options: CreateConversationOptions = {}): Promise<BackendConversation> {
    // one id per call, reused by every retry attempt, so a lost response never creates a second conversation
    const conversationId = options.conversationId ?? randomUUID();
    const conv = await this.request<BackendConversation>('POST', '/v1/conversations', { ...options, conversationId },
      { 'Idempotency-Key': `create:${conversationId}` });
    this.learn(conv.conversationId ?? conversationId, conv.epoch);
    return conv;
  }

  async sendMessage(conversationId: string, message: BackendMessage): Promise<BackendAdmission> {
    const epoch = message.epoch ?? this.epochOf(conversationId);
    const admission = await this.request<BackendAdmission>(
      'POST',
      `/v1/conversations/${enc(conversationId)}/messages`,
      { ...message, epoch },
      { ...(message.correlationId ? { 'X-Correlation-Id': message.correlationId } : {}), 'Idempotency-Key': `${message.runId}:${message.seq}` },
      epoch,
    );
    this.learn(conversationId, admission.epoch);
    return admission;
  }

  async getTranscript(conversationId: string): Promise<BackendMessage[]> {
    const res = await this.request<BackendMessage[] | { messages: BackendMessage[] }>(
      'GET', `/v1/conversations/${enc(conversationId)}/transcript`);
    return Array.isArray(res) ? res : res.messages ?? [];
  }

  getTurn(conversationId: string, seq: number): Promise<BackendTurn> {
    return this.request('GET', `/v1/conversations/${enc(conversationId)}/turns/${seq}`);
  }

  cancelTurn(conversationId: string, seq: number, epoch?: LeaseEpoch): Promise<BackendTurn> {
    return this.request('POST', `/v1/conversations/${enc(conversationId)}/turns/${seq}/cancel`, {}, undefined, epoch ?? this.epochOf(conversationId));
  }

  cancelRun(conversationId: string, runId: string, reason?: string, epoch?: LeaseEpoch): Promise<BackendTurn> {
    return this.request(
      'POST',
      `/v1/conversations/${enc(conversationId)}/runs/${enc(runId)}/cancel`,
      { reason },
      { 'Idempotency-Key': `cancel:${runId}` },
      epoch ?? this.epochOf(conversationId),
    );
  }

  async getApprovals(conversationId: string): Promise<ApprovalRecord[]> {
    const res = await this.request<ApprovalRecord[] | { approvals: ApprovalRecord[] }>(
      'GET', `/v1/conversations/${enc(conversationId)}/approvals`);
    return Array.isArray(res) ? res : res.approvals ?? [];
  }

  respondApproval(conversationId: string, response: ApprovalResponse): Promise<BackendTurn> {
    const epoch = response.epoch ?? this.epochOf(conversationId);
    return this.request(
      'POST',
      `/v1/conversations/${enc(conversationId)}/approvals/${enc(response.approvalId)}`,
      { ...response, epoch },
      { 'Idempotency-Key': `approval:${response.approvalId}` },
      epoch,
    );
  }

  private epochOf(conversationId: string): LeaseEpoch | undefined {
    return this.epochs.get(conversationId) ?? this.defaultEpoch;
  }

  private learn(conversationId: string, epoch: unknown): void {
    if (typeof epoch === 'number') this.epochs.set(conversationId, Math.max(this.epochs.get(conversationId) ?? 0, epoch));
  }

  /** Probes unversioned /health/live and /health/ready, falling back to /health. */
  async health(): Promise<BackendHealth> {
    const [live, ready] = await Promise.all([this.probe('/health/live'), this.probe('/health/ready')]);
    if (live.status === 'missing' && ready.status === 'missing') {
      const legacy = await this.probe('/health');
      return { ok: legacy.status === 'ok', live: legacy.status === 'ok', ready: legacy.status === 'ok', backend: this.kind, detail: legacy.detail };
    }
    const isLive = live.status === 'ok';
    const isReady = ready.status === 'ok';
    return {
      ok: isLive && isReady, live: isLive, ready: isReady, backend: this.kind,
      version: live.version ?? ready.version, detail: isLive && isReady ? undefined : ready.detail ?? live.detail,
    };
  }

  private async probe(route: string): Promise<{ status: 'ok' | 'fail' | 'missing'; version?: string; detail?: string }> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.options.token) headers['Authorization'] = `Bearer ${this.options.token}`;
    try {
      const res = await this.doFetch(`${this.base}${route}`, {
        method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (res.status === 404) return { status: 'missing' };
      const text = await res.text();
      let body: { version?: string; detail?: string } = {};
      try { body = JSON.parse(text) as typeof body; } catch { /* plain-text probe */ }
      return res.ok ? { status: 'ok', version: body.version } : { status: 'fail', detail: body.detail ?? `HTTP ${res.status}` };
    } catch (err) {
      return { status: 'fail', detail: err instanceof Error ? err.message : String(err) };
    }
  }
  private async request<T>(
    method: string,
    route: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    epoch?: LeaseEpoch,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json', 'X-Squad-Protocol': BACKEND_PROTOCOL_VERSION, ...extraHeaders,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.options.token) headers['Authorization'] = `Bearer ${this.options.token}`;
    if (epoch !== undefined) headers['X-Lease-Epoch'] = String(epoch);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await delay(this.retryDelayMs * 2 ** (attempt - 1));
      const signal = AbortSignal.timeout(this.requestTimeoutMs);
      let res: Response;
      let text: string;
      try {
        // redirect: 'error' — the bearer token is never replayed to a different origin
        res = await this.doFetch(`${this.base}${route}`, {
          method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: 'error',
        });
        // the body is part of the attempt: a stream failing after the headers arrived is retried like any network error
        text = await res.text();
      } catch (err) {
        const timedOut = signal.aborted
          || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
        lastError = timedOut
          ? new BackendError('unavailable', 'Backend request timed out', 504)
          : new BackendError('unavailable', `Network error: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      if (res.ok) return (text ? JSON.parse(text) : {}) as T;
      const err = toError(res, text);
      if (err.retryable || RETRYABLE_STATUS.has(res.status)) { lastError = err; continue; }
      throw err;
    }
    throw lastError instanceof BackendError ? lastError : new BackendError('unavailable', 'Request failed');
  }
}

const enc = encodeURIComponent;
const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Only https, or plain http to a loopback host, may carry the bearer token. Returns the normalized base. */
export function validateBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) throw new BackendError('invalid-request', 'baseUrl is required', 400);
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new BackendError('invalid-request', `baseUrl '${baseUrl}' is not a valid URL`, 400);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new BackendError('invalid-request',
      `baseUrl must use https:// (plain http:// is allowed only for localhost / 127.0.0.1 / ::1); got '${url.protocol}//${url.host}'`, 400);
  }
  if (url.username || url.password) throw new BackendError('invalid-request', 'baseUrl must not embed credentials', 400);
  return baseUrl.replace(/\/+$/, '');
}

function toError(res: Response, text: string): BackendError {
  let detail = '';
  let code: BackendErrorCode | undefined;
  let details: Record<string, unknown> | undefined;
  let correlationId = res.headers.get('x-correlation-id') ?? undefined;
  try {
    // Canonical shape is { error: { code, message, retryable, details } }; flat bodies are tolerated.
    const body = JSON.parse(text) as Record<string, unknown>;
    const e = (body['error'] && typeof body['error'] === 'object' ? body['error'] : body) as Record<string, unknown>;
    detail = String(e['message'] ?? (typeof body['error'] === 'string' ? body['error'] : '') ?? '');
    if (typeof e['code'] === 'string' && isCode(e['code'])) code = e['code'];
    if (e['details'] && typeof e['details'] === 'object') details = e['details'] as Record<string, unknown>;
    if (typeof e['correlationId'] === 'string') correlationId = e['correlationId'];
  } catch { /* non-JSON body */ }
  if (!code) {
    code = res.status === 404 ? 'not-found'
      : res.status === 409 ? 'conflict'
      : res.status >= 500 || res.status === 429 ? 'unavailable'
      : 'invalid-request';
  }
  return new BackendError(code, detail || `HTTP ${res.status}`, res.status, details, correlationId);
}

function isCode(c: string): c is BackendErrorCode {
  return ['not-found', 'stale-epoch', 'approval-hash-mismatch', 'approval-not-pending',
    'invalid-request', 'unsupported-protocol', 'unavailable', 'conflict'].includes(c);
}
