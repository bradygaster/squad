# Using Squad with the Aspire Dashboard

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> 📌 **Squad CLI only** — The Aspire dashboard integration requires the Squad CLI (`squad aspire`). It is not available when using GitHub Copilot CLI directly. Only Squad CLI commands emit OpenTelemetry data to the dashboard.

**Try this:**
```
squad aspire
```

Aspire is a free, open-source dashboard for observing any OpenTelemetry app — traces, metrics, logs, all in one place. Squad ships with an Aspire integration that streams all your telemetry (agent spawns, token usage, session metrics, errors) to the dashboard in real time.

---

## 1. What Is Aspire?

Aspire is not a .NET thing — it's a **standalone dashboard for any app that speaks OpenTelemetry**. You can run it in Docker, point any OTLP client at it, and watch telemetry flow in:

- **Traces** — see every agent spawn, task execution, and error with timing
- **Metrics** — counters (agents spawned, tokens consumed), histograms (latency), gauges (active sessions)
- **Resources** — grouping by service and environment

Squad's OTel integration exports OTLP/gRPC (the only protocol Aspire understands), so you get instant visibility into what your agents are doing.

---

## 2. Launch the Aspire Container

The easiest way is the built-in `squad aspire` command:

```bash
squad aspire
```

This will:
1. Pull the Aspire dashboard image: `mcr.microsoft.com/dotnet/aspire-dashboard:latest`
2. Start the container on **port 18888** (UI) and **port 4317** (OTLP gRPC)
3. Print the dashboard URL (usually `http://localhost:18888`)

**Behind the scenes**, the container runs with:
```bash
docker run -d \
  --name aspire-dashboard \
  -p 18888:18888 \
  -p 4317:18889 \
  -e DASHBOARD__FRONTEND__AUTHMODE=Unsecured \
  -e DASHBOARD__OTLP__AUTHMODE=Unsecured \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

> ⚠️ **Both `AUTHMODE=Unsecured` flags are required for local dev.** Without `DASHBOARD__OTLP__AUTHMODE=Unsecured`, the OTLP endpoint rejects connections with: `API key from 'x-otlp-api-key' header is missing`. Without `DASHBOARD__FRONTEND__AUTHMODE=Unsecured`, the UI requires a login token.

If you started the container yourself (without `squad aspire`) and you're seeing auth errors, stop it and re-run with the flags above. Or, if you prefer to keep API key auth, set a key on both sides:

```bash
# Container side — set the expected API key
docker run -d \
  --name aspire-dashboard \
  -p 18888:18888 \
  -p 4317:18889 \
  -e DASHBOARD__FRONTEND__AUTHMODE=Unsecured \
  -e DASHBOARD__OTLP__AUTHMODE=ApiKey \
  -e DASHBOARD__OTLP__PRIMARYAPIKEY=my-dev-key \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

```bash
# Client side — tell the OTLP exporter to send the key
export OTEL_EXPORTER_OTLP_HEADERS="x-otlp-api-key=my-dev-key"
```

For local dev, unsecured mode is simplest. For shared environments, use an API key.

---

## 3. Connect Squad to Aspire

When you run Squad (via the CLI or SDK), set the OTLP endpoint:

### Option A: CLI (standalone)

```powershell
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
squad run
```

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
squad run "your prompt here"
```

### Option B: SDK (programmatic)

```typescript
import { initSquadTelemetry, EventBus } from 'squad-sdk';

const bus = new EventBus();
const telemetry = initSquadTelemetry({
  endpoint: 'http://localhost:4317',
  eventBus: bus,
});

// … run your squad …

await telemetry.shutdown();
```

That's it. Squad will automatically:
1. Initialize OpenTelemetry providers (tracing + metrics)
2. Export all agent spawns, token usage, session metrics, and errors to Aspire
3. Flush telemetry on shutdown

---

## 4. What You'll See in the Dashboard

Open **http://localhost:18888** and navigate to:

### **Traces** (`/traces`)

You'll see a list of spans for each operation. Examples:

```
squad.init                 3ms      ✓
squad.agent.spawn          250ms    ✓  (agent-name: "Lead")
squad.agent.spawn          180ms    ✓  (agent-name: "Backend")
squad.agent.error          5ms      ✗  (error: "timeout")
squad.run                  2100ms   ✓
```

Each span has attributes:
- `agent.name` — the agent that ran
- `session.id` — which session this belongs to
- `mode` — "sync" or "async"
- `status` — success or error

Click a span to see full details (attributes, events, timing).

### **Metrics** (`/metrics`)

You'll see gauges, counters, and histograms:

**Counters:**
- `squad.tokens.input` — total input tokens consumed
- `squad.tokens.output` — total output tokens produced
- `squad.agent.spawns` — total agents spawned
- `squad.sessions.created` — total sessions created

**Gauges:**
- `squad.agent.active` — currently active agent sessions
- `squad.sessions.active` — currently active sessions
- `squad.sessions.idle` — pooled sessions waiting for reuse

**Histograms:**
- `squad.agent.duration` — agent task duration (ms)
- `squad.response.ttft` — time to first token (ms)
- `squad.response.duration` — total response duration (ms)

### Rework Rate Metrics (5th DORA)

PR rework rate instruments, exported alongside the core metrics above:

| Instrument | Type | Unit | Description |
|-----------|------|------|-------------|
| `squad.rework.rate` | Gauge | % | Current rework rate percentage |
| `squad.rework.cycles` | Histogram | — | Review cycles per PR |
| `squad.rework.rejection_rate` | Gauge | % | Percentage of PRs with changes requested |
| `squad.rework.time_ms` | Histogram | ms | Time spent in rework |

### **Resources**

Aspire groups all telemetry by service. You'll see:
- `service.name` — "squad-cli" or your custom app name
- `squad.version` — which version of Squad you're running

---

## 5. Example Workflow

### 1. Start Aspire
```bash
squad aspire
```

### 2. Run Squad with telemetry
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
squad run "Implement user registration with email verification"
```

### 3. Watch in real time

Refresh the Aspire dashboard. You'll see:
- **Traces** section fills with `squad.agent.spawn`, `squad.init`, etc.
- **Metrics** show counters ticking up for tokens consumed, agents spawned
- **Latency** histogram shows how long agents took

### 4. Click a span

Click `squad.agent.spawn` to see:
```
Duration:     250ms
Attributes:
  agent.name:  "Lead"
  session.id:  "abc-123"
  mode:        "sync"
```

---

## 6. Troubleshooting

### "API key from 'x-otlp-api-key' header is missing"

This is the most common issue. It means your Aspire container is running with API key auth enabled (the default). Fix it one of two ways:

**Option A: Restart with unsecured OTLP (recommended for local dev)**
```bash
docker stop aspire-dashboard && docker rm aspire-dashboard
docker run -d --name aspire-dashboard \
  -p 18888:18888 -p 4317:18889 \
  -e DASHBOARD__FRONTEND__AUTHMODE=Unsecured \
  -e DASHBOARD__OTLP__AUTHMODE=Unsecured \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

**Option B: Send the API key from Squad**
```bash
# Set both in your .env or shell:
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_EXPORTER_OTLP_HEADERS=x-otlp-api-key=your-key-here
```
(The key must match `DASHBOARD__OTLP__PRIMARYAPIKEY` on the container.)

### Quick Debug Checklist

If no telemetry appears in the Aspire dashboard, walk through this list:

1. **Is the container running?**
   ```bash
   docker ps | grep aspire-dashboard
   ```
   You should see ports `18888` and `4317` mapped.

2. **Is the OTLP endpoint set correctly?**
   ```bash
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   # Must be: http://localhost:4317  (include http://)
   ```
   Port 4317 on the host maps to the Aspire OTLP/gRPC listener on container port 18889. Do **not** use the dashboard UI port (18888). The `http://` prefix is required.

3. **Is OTLP auth disabled?**
   Check the container logs:
   ```bash
   docker logs aspire-dashboard 2>&1 | grep -i auth
   ```
   If you see `OtlpComposite was not authenticated` or `API key... is missing`, see the auth fix above.

4. **Is the protocol correct?**
   Squad exports OTLP/gRPC. Aspire only accepts gRPC on port 18889. If you see `UNIMPLEMENTED` or connection errors, confirm you're not accidentally using an OTLP/HTTP endpoint (port 4318).

5. **Firewall / network:**
   Port 4317 must be reachable between your app and the Docker host. On Docker Desktop (Windows/Mac), `localhost:4317` should work.

6. **Wait for batching:**
   OTel batches span exports. Traces may take 1–2 seconds to appear. Metrics export every 30 seconds by default (set `OTEL_METRIC_EXPORT_INTERVAL_MILLIS=1000` for faster feedback).

### Dashboard shows no traces

- **Check the container is running:** `docker ps | grep aspire-dashboard`
- **Verify the endpoint:** `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`
- **Wait a moment:** Aspire batches exports — it may take 1–2 seconds for traces to appear
- **Check firewall:** Port 4317 needs to be open between your app and Docker

### Dashboard is slow or unresponsive

- **Restart the container:** `squad aspire` (auto-stops and restarts)
- **Check Docker resources:** Aspire needs ~500MB RAM
- **Look at logs:** `docker logs aspire-dashboard`

### OTLP/gRPC connection refused

- **Ensure port 4317 is mapped:** The docker run command above maps `-p 4317:18889`
- **On Windows/Mac:** If using Docker Desktop, localhost:4317 should work. If not, try `host.docker.internal:4317`
- **Custom endpoint?** Set `OTEL_EXPORTER_OTLP_ENDPOINT` explicitly

---

## 7. Stop Aspire

```bash
squad aspire --stop
```

Or manually:
```bash
docker stop aspire-dashboard
docker rm aspire-dashboard
```

---

## 8. Pro Tips

- **Export metrics frequently:** Set `OTEL_METRIC_EXPORT_INTERVAL_MILLIS=1000` for near-real-time metric updates (default is 60s)
- **Tag your service:** Customize the service name with `OTEL_SERVICE_NAME=my-app`
- **Batch size:** Adjust `OTEL_BSP_MAX_QUEUE_SIZE` if you're emitting tons of spans
- **Only export what you need:** If Squad is a tiny part of your app, filter traces by service name in Aspire UI

---

## 9. Learn More

- [Aspire Documentation](https://aspire.dev)
- [OpenTelemetry Protocol (OTLP)](https://opentelemetry.io/docs/specs/otel/protocol/)
- [Squad SDK Reference](../reference/sdk.md) — detailed API documentation

Aspire pairs perfectly with Squad: **watch your agents work in real time, catch performance issues early, and prove to yourself (and your team) that AI agents are deterministic and safe.**
