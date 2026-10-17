import {
  BackendError,
  createSquadBackend,
  resolveSquadState,
  type BackendContentPart,
  type ProtocolHello,
  type SquadBackend,
} from '@bradygaster/squad-sdk';

/**
 * MCP TRANSPORT ADAPTER over `SquadBackend`. MCP is only a local bridge for
 * tool/execution access; the canonical conversation wire contract is the
 * versioned envelope protocol defined in the SDK (`BackendEnvelope`,
 * `BackendErrorInfo`, `NegotiatedCapabilities`). Errors are returned in the
 * canonical `BackendErrorInfo` structure.
 */
export interface BackendMcpTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, object>; required?: string[] };
  call(args: Record<string, unknown>): Promise<unknown>;
}

const cid = { type: 'string', description: 'Conversation id' };
const seq = { type: 'integer', description: 'Turn sequence number' };

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v) throw new BackendError('invalid-request', `'${key}' is required`, 400);
  return v;
}

function num(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new BackendError('invalid-request', `'${key}' must be an integer`, 400);
  return v;
}

/**
 * Backend selection: SQUAD_BACKEND_URL (+ SQUAD_BACKEND_TOKEN) → durable-http,
 * otherwise the local backend over the repo's .squad directory.
 */
export function createMcpBackend(startDir: string, env: NodeJS.ProcessEnv = process.env): SquadBackend {
  if (env['SQUAD_BACKEND_URL']) {
    return createSquadBackend({ kind: 'durable-http', baseUrl: env['SQUAD_BACKEND_URL'], token: env['SQUAD_BACKEND_TOKEN'] });
  }
  const context = resolveSquadState(startDir);
  if (!context) throw new Error(`No .squad directory found from ${startDir}`);
  return createSquadBackend({ kind: 'mcp', squadDir: context.paths.teamSquadDir });
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
        conversationId: typeof a['conversationId'] === 'string' ? a['conversationId'] : undefined,
        title: typeof a['title'] === 'string' ? a['title'] : undefined,
        metadata: a['metadata'] as Record<string, unknown> | undefined,
      }),
    },
    {
      name: 'squad_backend_send_message',
      description: 'Send a message; (runId, seq) is the idempotency key and epoch is the lease fencing token.',
      inputSchema: { type: 'object', properties: {
        conversationId: cid,
        runId: { type: 'string' }, seq,
        role: { type: 'string', enum: ['user', 'assistant', 'system', 'tool'] },
        content: { type: 'string' },
        parts: { type: 'array', items: { type: 'object' }, description: 'Typed content parts (text, data, resource, tool-call, tool-result)' },
        correlationId: { type: 'string' }, causationId: { type: 'string' },
        epoch: { type: 'integer' }, harness: { type: 'string' },
        extensions: { type: 'object', description: 'Keys must be x-<harness>.*' },
      }, required: ['conversationId', 'runId', 'seq', 'content'] },
      call: a => getBackend().sendMessage(str(a, 'conversationId'), {
        runId: str(a, 'runId'),
        seq: num(a, 'seq'),
        role: (a['role'] as 'user' | undefined) ?? 'user',
        content: str(a, 'content'),
        parts: Array.isArray(a['parts']) ? a['parts'] as BackendContentPart[] : undefined,
        correlationId: typeof a['correlationId'] === 'string' ? a['correlationId'] : undefined,
        causationId: typeof a['causationId'] === 'string' ? a['causationId'] : undefined,
        epoch: typeof a['epoch'] === 'number' ? a['epoch'] : undefined,
        harness: typeof a['harness'] === 'string' ? a['harness'] : undefined,
        extensions: a['extensions'] as Record<string, unknown> | undefined,
      }),
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
      inputSchema: { type: 'object', properties: { conversationId: cid, seq }, required: ['conversationId', 'seq'] },
      call: a => getBackend().cancelTurn(str(a, 'conversationId'), num(a, 'seq')),
    },
    {
      name: 'squad_backend_cancel_run',
      description: 'Cancel a run by its stable runId (distinct from turn seq).',
      inputSchema: { type: 'object', properties: { conversationId: cid, runId: { type: 'string' }, reason: { type: 'string' } }, required: ['conversationId', 'runId'] },
      call: a => getBackend().cancelRun(str(a, 'conversationId'), str(a, 'runId'), typeof a['reason'] === 'string' ? a['reason'] : undefined),
    },
    {
      name: 'squad_backend_get_approvals',
      description: 'List durable, versioned approval records (version 1 pending, 2 decided).',
      inputSchema: { type: 'object', properties: { conversationId: cid }, required: ['conversationId'] },
      call: a => getBackend().getApprovals(str(a, 'conversationId')),
    },
    {
      name: 'squad_backend_respond_approval',
      description: 'Approve or deny a pending approval; hash must match the request hash.',
      inputSchema: { type: 'object', properties: {
        conversationId: cid, approvalId: { type: 'string' }, hash: { type: 'string' },
        decision: { type: 'string', enum: ['approve', 'deny'] },
        reason: { type: 'string' }, epoch: { type: 'integer' },
      }, required: ['conversationId', 'approvalId', 'hash', 'decision'] },
      call: a => getBackend().respondApproval(str(a, 'conversationId'), {
        approvalId: str(a, 'approvalId'),
        hash: str(a, 'hash'),
        decision: str(a, 'decision') === 'approve' ? 'approve' : 'deny',
        reason: typeof a['reason'] === 'string' ? a['reason'] : undefined,
        epoch: typeof a['epoch'] === 'number' ? a['epoch'] : undefined,
      }),
    },
    {
      name: 'squad_backend_negotiate',
      description: 'Negotiate protocol version and capabilities.',
      inputSchema: { type: 'object', properties: {
        protocols: { type: 'array', items: { type: 'string' } },
        clientName: { type: 'string' },
        contentParts: { type: 'array', items: { type: 'string' } },
        extensionNamespaces: { type: 'array', items: { type: 'string' } },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Client capability flags' },
        policyCapabilities: { type: 'array', items: { type: 'string' }, description: 'Policy-allowed capability flags' },
      }, required: ['protocols'] },
      call: a => getBackend().negotiate({
        protocols: Array.isArray(a['protocols']) ? a['protocols'] as string[] : [],
        clientName: typeof a['clientName'] === 'string' ? a['clientName'] : undefined,
        contentParts: a['contentParts'] as ProtocolHello['contentParts'],
        extensionNamespaces: a['extensionNamespaces'] as string[] | undefined,
        capabilities: a['capabilities'] as string[] | undefined,
        policyCapabilities: a['policyCapabilities'] as string[] | undefined,
      }),
    },
    {
      name: 'squad_backend_read_events',
      description: 'Read canonical event envelopes after an opaque cursor (at-least-once; dedupe on id).',
      inputSchema: { type: 'object', properties: {
        conversationId: cid,
        after: { type: 'string', description: 'Opaque cursor from a previous page' },
        limit: { type: 'integer' },
        stream: { type: 'string', enum: ['control', 'execution'] },
      }, required: ['conversationId'] },
      call: a => getBackend().readEvents(str(a, 'conversationId'), {
        after: typeof a['after'] === 'string' ? a['after'] : undefined,
        limit: typeof a['limit'] === 'number' ? a['limit'] : undefined,
        stream: a['stream'] === 'control' || a['stream'] === 'execution' ? a['stream'] : undefined,
      }),
    },
    {
      name: 'squad_backend_health',
      description: 'Backend health.',
      inputSchema: { type: 'object', properties: {} },
      call: () => getBackend().health(),
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
    const info = err instanceof BackendError
      ? err.toInfo()
      : { code: 'unavailable', message: err instanceof Error ? err.message : String(err), retryable: false };
    return { content: [{ type: 'text', text: JSON.stringify({ error: info }) }], isError: true };
  }
}
