# Durable backend and custom harness tutorial

This tutorial is for the moment when local Squad is no longer enough.

Maybe you want a durable backend. Maybe you want reconnect after disconnect. Maybe you want your own execution harness. Good. This is the part where Squad 2.0 stops being theory.

---

## Part 1: switch from local backend to DurableSquad over HTTP

The current backend factory supports three modes:

- `kind: 'local'`
- `kind: 'mcp'`
- `kind: 'durable-http'`

If you want the same conversation contract backed by a remote durable service, use `durable-http`.

### Step 1: point the process at the remote backend

Bash:

```bash
export SQUAD_BACKEND_URL="https://your-durable-squad.example.com"
export SQUAD_BACKEND_TOKEN="...optional bearer token..."
```

PowerShell:

```powershell
$env:SQUAD_BACKEND_URL = "https://your-durable-squad.example.com"
$env:SQUAD_BACKEND_TOKEN = "...optional bearer token..."
```

The CLI-side MCP bridge already understands this convention: when `SQUAD_BACKEND_URL` is present, the bridge can route to `durable-http` instead of the local in-process backend.

### Step 2: build the backend explicitly in TypeScript

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
  capabilities: ['stream:control', 'stream:execution', 'resume', 'approvals', 'cancel:run'],
  policyCapabilities: ['stream:control', 'stream:execution', 'resume', 'approvals', 'cancel:run'],
};

const negotiated = await backend.negotiate(hello);
console.log(negotiated.effectiveCapabilities);
```

### Step 3: create a conversation and send a message

```ts
const conversation = await backend.createConversation({ title: 'Durable demo' });

const message: BackendMessage = {
  runId: 'run-001',
  seq: 1,
  role: 'user',
  content: 'Please draft the release notes.',
  correlationId: 'demo-release-notes',
};

const admission = await backend.sendMessage(conversation.conversationId, message);
console.log(admission.cursor);
```

### Step 4: reconnect with `readEvents()` after a disconnect

The durable path is where cursor-based resume matters.

```ts
let cursor = admission.cursor;

const firstPage = await backend.readEvents(conversation.conversationId, {
  after: cursor,
  stream: 'control',
  limit: 50,
});

cursor = firstPage.nextCursor;
console.log({
  lastAcceptedSeq: firstPage.lastAcceptedSeq,
  resumable: firstPage.resumable,
});

// later, after losing the connection
const missed = await backend.readEvents(conversation.conversationId, {
  after: cursor,
  limit: 50,
});

cursor = missed.nextCursor;
```

Treat the cursor as opaque. Do not parse it. Do not synthesize one. Just store it and hand it back.

### Step 5: work with versioned approvals

The backend exposes durable approval resources in request order:

```ts
const approvals = await backend.getApprovals(conversation.conversationId);
const pending = approvals.find((a) => a.state === 'pending');

if (pending) {
  await backend.respondApproval(conversation.conversationId, {
    approvalId: pending.approvalId,
    hash: pending.hash,
    decision: 'approve',
  });
}
```

A useful mental model:

- approval **v1** is the request;
- approval **v2** is the decision;
- the response must echo the immutable hash / payload hash for the request.

If the payload changed, or the approval is stale, the backend rejects it. That is exactly what you want.

### Step 6: cancel by `runId`

```ts
await backend.cancelRun(conversation.conversationId, 'run-001', 'user asked to stop');
```

That is intentionally `runId`-scoped. Cancellation follows the run lifecycle, not a local spinner in one UI.

---

## Part 2: write a custom `HarnessAdapter`

The current runtime `HarnessAdapter` interface is intentionally small:

- `submit`
- `subscribe`
- `cancel`
- `respondApproval`
- `describe`

For a practical integration, it is perfectly fine to add a local `projectWorkspace()` helper on your concrete class so you also line up with the broader Squad 2.0 adapter profile.

### A complete working example

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

    this.emit(submission.conversationId, {
      runId: submission.runId,
      seq: submission.seq,
      type: 'approval-requested',
      request: {
        approvalId: `approval-${submission.runId}`,
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
    const approvalRunId = response.approvalId.replace(/^approval-/, '');
    this.emit(conversationId, {
      runId: approvalRunId,
      seq: 1,
      type: 'message',
      message: {
        runId: approvalRunId,
        seq: 1,
        role: 'tool',
        content: `Approval ${response.decision} for ${response.approvalId}`,
        harness: this.id,
      },
    });

    if (!this.cancelledRuns.has(approvalRunId)) {
      this.emit(conversationId, {
        runId: approvalRunId,
        seq: 1,
        type: 'state',
        state: 'completed',
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

  // Optional today, but useful and aligned with the broader adapter profile.
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

### Why this example is worth copying

It demonstrates the things that actually matter:

- the harness advertises one stable id (`demo`);
- extension fields stay in the `x-demo.*` namespace;
- `validateExtensions()` protects that namespace boundary;
- approval and cancellation events flow back through the broker contract instead of becoming ad hoc side channels;
- the harness can expose workspace metadata without changing the broker API.

### Where idempotency really lives

The harness should behave sensibly if a submission is replayed, but the **canonical** dedupe contract lives in the broker at `(runId, seq)`.

That is a good split of responsibility:

- the broker guarantees durable semantics;
- the harness avoids obvious duplicate side effects;
- the client keeps one stable view of history.

---

## Part 3: test against the golden conformance trace

The protocol baseline for this work is `squad-protocol-v2.0-rc1`.

The frozen story to verify is:

```text
TurnAccepted(runId, seq)
-> stream partial output
-> ApprovalRequested(v1)
-> disconnect
-> reconnect(cursor)
-> ApprovalDecided(v2)
-> CancellationRequested(runId)
-> terminal state
```

### What your backend or harness must prove

1. reconnect from a stored cursor returns only the missing suffix;
2. stale approval decisions do not re-run effects;
3. `cancelRun(runId)` is idempotent;
4. exactly one terminal state wins the cancel-vs-complete race;
5. all client projections observe the same canonical history.

### Practical commands

These are the fastest validation passes from the repo root:

```bash
npm test -- test/backend.test.ts
```

```bash
npm test -- test/squad-20-security-contracts.test.ts
```

### What to look for in the validation suite

The security / conformance suite specifically checks:

- `G1` through `G9`;
- cursor opacity;
- approval replay rejection;
- cross-adapter canonical-history equality;
- unknown future events surviving reconnect without crashing a projection.

If your harness or backend passes those checks, you are no longer just "integrated." You are speaking the same protocol.

---

## Final advice

If you are building something new, start local.

If you need durable reconnect, multi-worker semantics, or remote orchestration, switch to `durable-http` early.

If you need a custom execution story, implement `HarnessAdapter` without inventing a second protocol on the side.

That is the Squad 2.0 trick: one contract, many hosts, many runtimes, way less drama.
