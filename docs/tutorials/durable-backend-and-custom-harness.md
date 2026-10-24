# Durable backend and custom harness tutorial

> **Experimental Preview — Bring Your Own Server:** `@bradygaster/squad-sdk/backend` is an experimental extension contract (`BACKEND_CONTRACT_STAGE = 'experimental'`). Squad ships the `SquadBackend` / `HarnessAdapter` interfaces, the local file/state-store backend, and the outbound `durable-http` client — it does **not** bundle a remote DurableSquad server, and server-side DurableSquad Phase 2 integration (remote durable approvals and lease-epoch coordination) is pending. Use `durable-http` when connecting to your own external or managed `/v1/conversations` server.

> **Canonical Published Docs:** See [Squad 2.0 architecture](../src/content/docs/concepts/squad-2-0-architecture.md) and the [SDK Reference](../src/content/docs/reference/sdk.md) on the published Astro docs site for the architectural overview and API surface.

---

## Part 1: connect `durable-http` or `squad state-mcp` to your `/v1/conversations` server

`createSquadBackend` supports three modes: `kind: 'local'`, `kind: 'mcp'`, and `kind: 'durable-http'`.

In `squad state-mcp`, the 11 `squad_backend_*` MCP conversation tools are **opt-in**: pass `--experimental-backend` or set `SQUAD_EXPERIMENTAL_BACKEND=1`. `SQUAD_BACKEND_URL` alone does not enable them. The bridge ships no execution harness: `squad_backend_health` / `squad_backend_negotiate` report `executionAvailable: false`, and `squad_backend_send_message` refuses instead of queueing (`unavailable` when no harness is registered; auto-selects a single registered in-process harness when `harness` is omitted, or refuses with `invalid-request` when multiple harnesses are registered), so over MCP the bundled backend is a transcript and event-log surface.

### Step 1: configure environment variables

Bash:

```bash
export SQUAD_EXPERIMENTAL_BACKEND=1
export SQUAD_BACKEND_URL="https://your-durable-squad.example.com"
export SQUAD_BACKEND_TOKEN="...optional bearer token..."
```

PowerShell:

```powershell
$env:SQUAD_EXPERIMENTAL_BACKEND = "1"
$env:SQUAD_BACKEND_URL = "https://your-durable-squad.example.com"
$env:SQUAD_BACKEND_TOKEN = "...optional bearer token..."
```

### Step 2: negotiate capabilities, send a message, resume, approve, and cancel in TypeScript

```ts
import {
  BACKEND_PROTOCOL_VERSION,
  createSquadBackend,
  type BackendMessage,
  type ProtocolHello,
} from '@bradygaster/squad-sdk/backend';

const baseUrl = process.env.SQUAD_BACKEND_URL;
if (!baseUrl) throw new Error('SQUAD_BACKEND_URL is required');

const backend = createSquadBackend({
  kind: 'durable-http',
  baseUrl,
  token: process.env.SQUAD_BACKEND_TOKEN,
});

const hello: ProtocolHello = {
  protocols: [BACKEND_PROTOCOL_VERSION],
  clientName: 'docs-sample',
  contentParts: ['text', 'tool-call', 'tool-result'],
  capabilities: ['cursor-reconnect', 'approvals', 'cancel-run', 'typed-content-parts'],
  policyCapabilities: ['cursor-reconnect', 'approvals', 'cancel-run', 'typed-content-parts'],
};

// NegotiatedCapabilities advertises streams: ['control', 'execution'] separately
const negotiated = await backend.negotiate(hello);
console.log(negotiated.effectiveCapabilities, negotiated.streams);

const conversation = await backend.createConversation({ title: 'Durable demo' });

const message: BackendMessage = {
  runId: 'run-001',
  seq: 1,
  role: 'user',
  content: 'Please draft the release notes.',
  correlationId: 'demo-release-notes',
};

const admission = await backend.sendMessage(conversation.conversationId, message);

// Reconnect with an opaque cursor via readEvents()
const page = await backend.readEvents(conversation.conversationId, {
  after: admission.cursor,
  stream: 'control',
  limit: 50,
});

// Resolve pending versioned approvals (v1 requested -> v2 decided, echoing immutable hash)
const approvals = await backend.getApprovals(conversation.conversationId);
const pending = approvals.find((a) => a.state === 'pending');
if (pending) {
  await backend.respondApproval(conversation.conversationId, {
    approvalId: pending.approvalId,
    hash: pending.hash,
    decision: 'approve',
  });
}

// Cancel by stable runId (independent of turn seq)
await backend.cancelRun(conversation.conversationId, 'run-001', 'user asked to stop');
```

---

## Part 2: write a custom `HarnessAdapter`

Implement `HarnessAdapter` (`submit`, `subscribe`, `cancel`, `respondApproval`, `describe`) and register it with `DefaultHarnessRegistry`. Vendor extension fields must stay under `x-<harness>.*` and are validated with `validateExtensions()`.

```ts
import {
  DefaultHarnessRegistry,
  validateExtensions,
  type ApprovalResponse,
  type HarnessAdapter,
  type HarnessCapabilities,
  type HarnessDescriptor,
  type HarnessEventEnvelope,
  type HarnessSubmission,
} from '@bradygaster/squad-sdk/backend';

import path from 'node:path';

type Listener = (event: HarnessEventEnvelope) => void;

export class DemoHarnessAdapter implements HarnessAdapter {
  readonly id = 'demo';

  readonly capabilities: HarnessCapabilities = {
    streaming: true,
    approvals: true,
    cancellation: true,
    tools: true,
    extensionNamespaces: ['x-demo'],
  };

  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly cancelledRuns = new Set<string>();
  private readonly pendingApprovals = new Map<string, { runId: string; seq: number }>();

  constructor(private readonly repoRoot: string) {}

  async submit(submission: HarnessSubmission): Promise<void> {
    validateExtensions(submission.extensions, this.capabilities.extensionNamespaces);

    this.emit(submission.conversationId, {
      runId: submission.runId,
      seq: submission.seq,
      type: 'state',
      state: 'running',
    });

    this.emit(submission.conversationId, {
      runId: submission.runId,
      seq: submission.seq,
      type: 'message',
      message: {
        runId: submission.runId,
        seq: submission.seq,
        role: 'assistant',
        content: 'Demo harness accepted the run.',
        harness: this.id,
        extensions: {
          'x-demo.worker': 'local-demo',
        },
      },
    });

    const approvalId = `approval-${submission.runId}-${submission.seq}`;
    this.pendingApprovals.set(`${submission.conversationId}:${approvalId}`, {
      runId: submission.runId,
      seq: submission.seq,
    });

    this.emit(submission.conversationId, {
      runId: submission.runId,
      seq: submission.seq,
      type: 'approval-requested',
      request: {
        approvalId,
        turnSeq: submission.seq,
        action: 'demo.write',
        hash: 'sha256:demo-payload',
        payload: { target: 'docs/demo.txt' },
      },
    });
  }

  subscribe(conversationId: string, listener: Listener): () => void {
    const bucket = this.listeners.get(conversationId) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(conversationId, bucket);
    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) this.listeners.delete(conversationId);
    };
  }

  async cancel(conversationId: string, runId: string, seq: number): Promise<void> {
    this.cancelledRuns.add(runId);
    this.emit(conversationId, {
      runId,
      seq,
      type: 'state',
      state: 'cancelled',
    });
  }

  async respondApproval(conversationId: string, response: ApprovalResponse): Promise<void> {
    const turn = this.pendingApprovals.get(`${conversationId}:${response.approvalId}`);
    if (!turn) return;
    this.pendingApprovals.delete(`${conversationId}:${response.approvalId}`);

    this.emit(conversationId, {
      runId: turn.runId,
      seq: turn.seq,
      type: 'message',
      message: {
        runId: turn.runId,
        seq: turn.seq,
        role: 'tool',
        content: `Approval ${response.decision} for ${response.approvalId}`,
        harness: this.id,
      },
    });

    if (!this.cancelledRuns.has(turn.runId)) {
      this.emit(conversationId, {
        runId: turn.runId,
        seq: turn.seq,
        type: 'state',
        state: response.decision === 'approve' ? 'completed' : 'cancelled',
      });
    }
  }

  describe(): HarnessDescriptor {
    return {
      id: this.id,
      displayName: 'Demo harness',
      version: '0.1.0',
      capabilities: this.capabilities,
    };
  }

  projectWorkspace() {
    return {
      repoRoot: this.repoRoot,
      workingDirectory: path.join(this.repoRoot, 'docs'),
      workspaceKind: 'repository' as const,
      supportFiles: ['docs/demo.txt'],
    };
  }

  private emit(conversationId: string, event: HarnessEventEnvelope) {
    for (const listener of this.listeners.get(conversationId) ?? []) listener(event);
  }
}

const registry = new DefaultHarnessRegistry();
registry.register(new DemoHarnessAdapter(process.cwd()));
```

---

## Part 3: validate against the golden conformance trace

Run the backend and security/conformance suites (`G1`–`G9` and `squad-protocol-v2.0-rc1` golden trace across all 7 host projections):

```bash
npm test -- test/backend.test.ts
```

```bash
npm test -- test/squad-20-security-contracts.test.ts
```
