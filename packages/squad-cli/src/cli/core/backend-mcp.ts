import { resolveSquadState } from '@bradygaster/squad-sdk';
import {
  ALL_CONTENT_PART_TYPES,
  BACKEND_PROTOCOL_VERSION,
  BackendError,
  createSquadBackend,
  createStateBackendStore,
  type BackendContentPart,
  type BackendMessage,
  type ProtocolHello,
  type SquadBackend,
} from '@bradygaster/squad-sdk/backend';

/**
 * MCP TRANSPORT ADAPTER over `SquadBackend`. MCP is only a local bridge for
 * tool/execution access; the canonical conversation wire contract is the
 * versioned envelope protocol defined in the SDK (`BackendEnvelope`,
 * `BackendErrorInfo`, `NegotiatedCapabilities`). Errors are returned in the
 * canonical `BackendErrorInfo` structure.
 *
 * No execution harness ships with the CLI: the bridge is a transcript / event-log
 * surface. `squad_backend_send_message` refuses to admit a turn when no harness is
 * registered instead of queueing it forever.
 */
export interface BackendMcpTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, object>; required?: string[] };
  call(args: Record<string, unknown>): Promise<unknown>;
}

export const NO_HARNESS_MESSAGE =
  'No execution harness is registered; the experimental MCP backend currently records transcripts only';

export const MAX_READ_EVENTS_LIMIT = 500;
const ROLES: readonly BackendMessage['role'][] = ['user', 'assistant', 'system', 'tool'];

const cid = { type: 'string', description: 'Conversation id' };
const seq = { type: 'integer', description: 'Turn sequence number' };

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v) return missing(key);
  return v;
}

function missing(key: string): never {
  throw new BackendError('invalid-request', `'${key}' is required`, 400);
}

function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new BackendError('invalid-request', `'${key}' must be a string`, 400);
  return v;
}

function num(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new BackendError('invalid-request', `'${key}' must be an integer`, 400);
  return v;
}

function optInt(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new BackendError('invalid-request', `'${key}' must be an integer`, 400);
  return v;
}

function optEnum<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new BackendError('invalid-request', `'${key}' must be one of ${allowed.join(', ')}`, 400);
  }
  return v as T;
}

function optStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) {
    throw new BackendError('invalid-request', `'${key}' must be an array of strings`, 400);
  }
  return v as string[];
}

function optObject(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new BackendError('invalid-request', `'${key}' must be an object`, 400);
  return v as Record<string, unknown>;
}

function optParts(args: Record<string, unknown>): BackendContentPart[] | undefined {
  const v = args['parts'];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new BackendError('invalid-request', "'parts' must be an array", 400);
  for (const p of v) {
    const type = (p as { type?: unknown } | null)?.type;
    if (!p || typeof p !== 'object' || typeof type !== 'string' || !ALL_CONTENT_PART_TYPES.includes(type as BackendContentPart['type'])) {
      throw new BackendError('invalid-request', `each part needs a 'type' of ${ALL_CONTENT_PART_TYPES.join(', ')}`, 400);
    }
  }
  return v as BackendContentPart[];
}

/** content is optional when typed parts are supplied. */
function sendContent(args: Record<string, unknown>, parts: BackendContentPart[] | undefined): string {
  if (typeof args['content'] === 'string') return args['content'];
  if (parts && parts.length > 0) return '';
  throw new BackendError('invalid-request', "'content' or 'parts' is required", 400);
}

/**
 * The `squad_backend_*` tools are exposed only on explicit opt-in: `--experimental-backend` or
 * `SQUAD_EXPERIMENTAL_BACKEND=1`. `SQUAD_BACKEND_URL` by itself selects the remote backend but does
 * not enable the tools, so a stray environment variable never routes traffic (and the bearer token)
 * anywhere.
 */
export function isExperimentalBackendEnabled(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return args.includes('--experimental-backend')
    || env['SQUAD_EXPERIMENTAL_BACKEND'] === '1';
}

/**
 * Backend selection: SQUAD_BACKEND_URL (+ SQUAD_BACKEND_TOKEN) → durable-http (https, or http to loopback),
 * otherwise the local backend over the repo's .squad directory.
 */
export function createMcpBackend(
  startDir: string,
  env: NodeJS.ProcessEnv = process.env,
  resolveState: (dir: string) => Pick<NonNullable<ReturnType<typeof resolveSquadState>>, 'paths' | 'backend'> | null = resolveSquadState,
): SquadBackend {
  if (env['SQUAD_BACKEND_URL']) {
    return createSquadBackend({ kind: 'durable-http', baseUrl: env['SQUAD_BACKEND_URL'], token: env['SQUAD_BACKEND_TOKEN'] });
  }
  const context = resolveState(startDir);
  if (!context) throw new Error(`No .squad directory found from ${startDir}`);
  // honor the project's configured state backend (git-notes, orphan, ...); the local backend keeps the
  // lock-protected, symlink-guarded file store over the team .squad directory. A configured backend keeps
  // its data outside the working tree, so its locks are machine-local and nothing lands in .squad/backend/
  const state = context.backend.name === 'local'
    ? undefined
    : createStateBackendStore(context.backend, { lockAnchor: context.paths.teamSquadDir });
  return createSquadBackend({ kind: 'mcp', squadDir: context.paths.teamSquadDir, state });
}

/** Harness ids registered on an in-process backend; `undefined` when the backend is remote and does not expose them. */
function registeredHarnesses(backend: SquadBackend): string[] | undefined {
  const h = (backend as { harnesses?: { list?: () => Array<{ id: string }> } }).harnesses;
  return typeof h?.list === 'function' ? h.list().map(d => d.id) : undefined;
}

async function harnessIds(backend: SquadBackend): Promise<string[]> {
  const local = registeredHarnesses(backend);
  if (local) return local;
  try {
    return (await backend.negotiate({ protocols: [BACKEND_PROTOCOL_VERSION] })).harnesses;
  } catch {
    return [];
  }
}

export function createBackendMcpTools(getBackend: () => SquadBackend): BackendMcpTool[] {
  return [
    {
      name: 'squad_backend_create_conversation',
      description: 'Create (or idempotently re-open) a Squad backend conversation.',
      inputSchema: { type: 'object', properties: {
        conversationId: { type: 'string' }, title: { type: 'string' }, metadata: { type: 'object' },
      } },
      call: a => getBackend().createConversation({
        conversationId: optStr(a, 'conversationId'),
        title: optStr(a, 'title'),
        metadata: optObject(a, 'metadata'),
      }),
    },
    {
      name: 'squad_backend_send_message',
      description: 'Send a message; (runId, seq) is the idempotency key and epoch is the lease fencing token. '
        + 'Fails with code "unavailable" when no execution harness is registered (the bundled bridge ships none: it records transcripts only).',
      inputSchema: { type: 'object', properties: {
        conversationId: cid,
        runId: { type: 'string' }, seq,
        role: { type: 'string', enum: [...ROLES] },
        content: { type: 'string' },
        parts: { type: 'array', items: { type: 'object' }, description: 'Typed content parts (text, data, resource, tool-call, tool-result)' },
        correlationId: { type: 'string' }, causationId: { type: 'string' },
        epoch: { type: 'integer' }, harness: { type: 'string' },
        extensions: { type: 'object', description: 'Keys must be x-<harness>.*' },
      }, required: ['conversationId', 'runId', 'seq'] },
      call: a => {
        const backend = getBackend();
        const localHarnesses = registeredHarnesses(backend);
        if (localHarnesses?.length === 0) {
          throw new BackendError('unavailable', NO_HARNESS_MESSAGE, 503, { executionAvailable: false });
        }
        let harness = optStr(a, 'harness');
        if (harness === undefined && localHarnesses !== undefined) {
          if (localHarnesses.length === 1) {
            harness = localHarnesses[0];
          } else {
            throw new BackendError(
              'invalid-request',
              `Multiple execution harnesses are registered (${localHarnesses.join(', ')}); 'harness' is required`,
              400,
              { harnesses: localHarnesses },
            );
          }
        }
        const parts = optParts(a);
        return backend.sendMessage(str(a, 'conversationId'), {
          runId: str(a, 'runId'),
          seq: num(a, 'seq'),
          role: optEnum(a, 'role', ROLES) ?? 'user',
          content: sendContent(a, parts),
          parts,
          correlationId: optStr(a, 'correlationId'),
          causationId: optStr(a, 'causationId'),
          epoch: optInt(a, 'epoch'),
          harness,
          extensions: optObject(a, 'extensions'),
        });
      },
    },
    {
      name: 'squad_backend_get_transcript',
      description: 'Read the full transcript of a conversation.',
      inputSchema: { type: 'object', properties: { conversationId: cid }, required: ['conversationId'] },
      call: a => getBackend().getTranscript(str(a, 'conversationId')),
    },
    {
      name: 'squad_backend_get_turn',
      description: 'Read a turn: state, tasks, messages and any pending approval.',
      inputSchema: { type: 'object', properties: { conversationId: cid, seq }, required: ['conversationId', 'seq'] },
      call: a => getBackend().getTurn(str(a, 'conversationId'), num(a, 'seq')),
    },
    {
      name: 'squad_backend_cancel_turn',
      description: 'Cancel a running turn.',
      inputSchema: { type: 'object', properties: { conversationId: cid, seq, epoch: { type: 'integer', description: 'Lease epoch; required once the conversation is fenced' } }, required: ['conversationId', 'seq'] },
      call: a => getBackend().cancelTurn(str(a, 'conversationId'), num(a, 'seq'), optInt(a, 'epoch')),
    },
    {
      name: 'squad_backend_cancel_run',
      description: 'Cancel a run by its stable runId (distinct from turn seq).',
      inputSchema: { type: 'object', properties: { conversationId: cid, runId: { type: 'string' }, reason: { type: 'string' }, epoch: { type: 'integer', description: 'Lease epoch; required once the conversation is fenced' } }, required: ['conversationId', 'runId'] },
      call: a => getBackend().cancelRun(str(a, 'conversationId'), str(a, 'runId'), optStr(a, 'reason'), optInt(a, 'epoch')),
    },
    {
      name: 'squad_backend_get_approvals',
      description: 'List durable, versioned approval records (version 1 pending, 2 decided).',
      inputSchema: { type: 'object', properties: { conversationId: cid }, required: ['conversationId'] },
      call: a => getBackend().getApprovals(str(a, 'conversationId')),
    },
    {
      name: 'squad_backend_respond_approval',
      description: 'Approve or deny a pending approval; hash must echo the opaque hash the harness supplied with the request.',
      inputSchema: { type: 'object', properties: {
        conversationId: cid, approvalId: { type: 'string' }, hash: { type: 'string' },
        decision: { type: 'string', enum: ['approve', 'deny'] },
        reason: { type: 'string' }, epoch: { type: 'integer' },
      }, required: ['conversationId', 'approvalId', 'hash', 'decision'] },
      call: a => getBackend().respondApproval(str(a, 'conversationId'), {
        approvalId: str(a, 'approvalId'),
        hash: str(a, 'hash'),
        decision: optEnum(a, 'decision', ['approve', 'deny'] as const) ?? missing('decision'),
        reason: optStr(a, 'reason'),
        epoch: optInt(a, 'epoch'),
      }),
    },
    {
      name: 'squad_backend_negotiate',
      description: 'Negotiate protocol version and capabilities. `harnesses` lists registered execution harnesses and '
        + '`executionAvailable` is false when there are none (the bundled bridge ships no harness).',
      inputSchema: { type: 'object', properties: {
        protocols: { type: 'array', items: { type: 'string' } },
        clientName: { type: 'string' },
        contentParts: { type: 'array', items: { type: 'string' } },
        extensionNamespaces: { type: 'array', items: { type: 'string' } },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Client capability flags' },
        policyCapabilities: { type: 'array', items: { type: 'string' }, description: 'Policy-allowed capability flags' },
      }, required: ['protocols'] },
      call: async a => {
        const protocols = optStringArray(a, 'protocols');
        if (!protocols) throw new BackendError('invalid-request', "'protocols' must be an array of strings", 400);
        const contentParts = optStringArray(a, 'contentParts');
        if (contentParts?.some(p => !ALL_CONTENT_PART_TYPES.includes(p as BackendContentPart['type']))) {
          throw new BackendError('invalid-request', `'contentParts' entries must be one of ${ALL_CONTENT_PART_TYPES.join(', ')}`, 400);
        }
        const negotiated = await getBackend().negotiate({
          protocols,
          clientName: optStr(a, 'clientName'),
          contentParts: contentParts as ProtocolHello['contentParts'],
          extensionNamespaces: optStringArray(a, 'extensionNamespaces'),
          capabilities: optStringArray(a, 'capabilities'),
          policyCapabilities: optStringArray(a, 'policyCapabilities'),
        });
        return { ...negotiated, executionAvailable: negotiated.harnesses.length > 0 };
      },
    },
    {
      name: 'squad_backend_read_events',
      description: `Read canonical event envelopes after an opaque cursor (at-least-once; dedupe on id). limit is capped at ${MAX_READ_EVENTS_LIMIT}.`,
      inputSchema: { type: 'object', properties: {
        conversationId: cid,
        after: { type: 'string', description: 'Opaque cursor from a previous page' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_READ_EVENTS_LIMIT },
        stream: { type: 'string', enum: ['control', 'execution'] },
      }, required: ['conversationId'] },
      call: a => {
        const limit = optInt(a, 'limit');
        if (limit !== undefined && limit < 1) throw new BackendError('invalid-request', "'limit' must be a positive integer", 400);
        return getBackend().readEvents(str(a, 'conversationId'), {
          after: optStr(a, 'after'),
          limit: limit === undefined ? MAX_READ_EVENTS_LIMIT : Math.min(limit, MAX_READ_EVENTS_LIMIT),
          stream: optEnum(a, 'stream', ['control', 'execution'] as const),
        });
      },
    },
    {
      name: 'squad_backend_health',
      description: 'Backend health, plus the registered execution harnesses and whether execution is available at all '
        + '(false for the bundled transcript-only bridge).',
      inputSchema: { type: 'object', properties: {} },
      call: async () => {
        const backend = getBackend();
        const [health, harnesses] = await Promise.all([backend.health(), harnessIds(backend)]);
        return { ...health, harnesses, executionAvailable: harnesses.length > 0 };
      },
    },
  ];
}

export async function callBackendMcpTool(tool: BackendMcpTool, args: Record<string, unknown>): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await tool.call(args), null, 2) }] };
  } catch (err) {
    // non-contract failures are reported generically: raw messages may carry absolute paths or stack details
    const info = isBackendError(err)
      ? err.toInfo()
      : { code: 'unavailable', message: `Backend tool '${tool.name}' failed unexpectedly`, retryable: false };
    return { content: [{ type: 'text', text: JSON.stringify({ error: info }) }], isError: true };
  }
}

/** Structural check: the SDK may be loaded twice (source + dist), which breaks `instanceof`. */
function isBackendError(err: unknown): err is BackendError {
  return err instanceof BackendError
    || (err instanceof Error && err.name === 'BackendError' && typeof (err as Partial<BackendError>).toInfo === 'function');
}
