---
title: Production Observability
description: Route Squad telemetry to Azure Monitor / Application Insights, Managed Grafana, and structured log sinks in production clusters — OTLP collector wiring, verified environment variables, and a troubleshooting checklist.
order: 26
---

# Production Observability

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> 🔗 **Related:** [Aspire Dashboard](./aspire-dashboard) (local dev telemetry) · [Container Image — Env Var Contract](/squad/docs/reference/container-image/) · [#1144](https://github.com/bradygaster/squad/issues/1144) (embedded-host telemetry — tracked separately)

---

## Local dev vs. production telemetry

`squad aspire` spins up the Aspire Dashboard container on your **local machine** and points Squad's OTLP exporter at `localhost:4317`. That path is strictly local:

| Environment | Transport | Collector | Dashboard |
|---|---|---|---|
| **Local dev** (`squad aspire`) | `localhost:4317` (gRPC) | Aspire Dashboard container | `http://localhost:18888` |
| **Production cluster** | In-cluster OTLP endpoint | OpenTelemetry Collector sidecar / DaemonSet | Azure Monitor / Grafana / Log Analytics |

The Aspire Dashboard container does **not** run in a Kubernetes cluster and is not reachable from pods. Do not set `OTEL_EXPORTER_OTLP_ENDPOINT` to a localhost address in container deployments.

---

## Verified Squad telemetry environment variables

Squad reads the following standard OpenTelemetry SDK environment variables. These are the **only** OTEL variables Squad currently consumes — do not invent others.

| Variable | Default | Effect |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(unset — telemetry disabled)* | OTLP/gRPC or OTLP/HTTP endpoint. When set, Squad emits spans for issue dispatch, agent lifecycle, and tool calls. |
| `OTEL_SERVICE_NAME` | `squad-agent` | Service name attached to every span and metric. |
| `OTEL_RESOURCE_ATTRIBUTES` | *(none)* | Comma-separated `key=value` pairs appended to every span (e.g., `deployment.environment=production,cluster=aks-eastus`). |

Full environment variable reference: [Container Image — Env Var Contract](/squad/docs/reference/container-image/#optional--observability).

> **Protocol note:** Squad uses OTLP over gRPC (port `4317`) by default. If your collector or backend requires OTLP/HTTP, set the endpoint to the HTTP receiver port (`4318`) and ensure the SDK selects the HTTP exporter. Confirm with your collector's documentation — the correct port depends on which receiver you have enabled.

---

## Architecture: OTLP flow from pod to backend

```
┌─────────────────────────────────────┐
│  Squad pod                          │
│  OTEL_EXPORTER_OTLP_ENDPOINT=       │
│    http://otel-collector.monitoring:4317 │
│                                     │
│  spans → gRPC → ────────────────────┼──→ OpenTelemetry Collector
└─────────────────────────────────────┘         │
                                                 ├──→ Azure Monitor / Application Insights
                                                 ├──→ Azure Managed Grafana (Prometheus remote write)
                                                 └──→ Log Analytics (structured stdout)
```

The OpenTelemetry Collector sits between Squad pods and every backend — this lets you route, filter, and fan-out telemetry without changing Squad configuration.

---

## Option A — Azure Monitor / Application Insights via OTLP exporter

Azure Monitor supports native OTLP ingest. You do **not** need to run a Collector if you export directly to Azure Monitor's OTLP endpoint — but a Collector is recommended for production so you can add batching, retry, and routing.

### Direct export (no Collector)

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to the Azure Monitor OTLP endpoint for your Application Insights resource:

```bash
# Azure Monitor OTLP endpoint format (as of 2024 — verify at docs below)
OTEL_EXPORTER_OTLP_ENDPOINT=https://eastus.otlp.monitor.azure.com/
OTEL_EXPORTER_OTLP_HEADERS=x-ms-application-insights-connection-string=<InstrumentationKey=...>
```

> ⚠️ **Verify the current endpoint and header format** in [Azure Monitor OpenTelemetry Enable](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable) before deploying. Endpoint URLs and authentication headers are subject to change as the service reaches GA.

### Via OpenTelemetry Collector (recommended)

Run an OTel Collector DaemonSet or sidecar on your cluster. A minimal Collector ConfigMap that accepts OTLP and exports to Azure Monitor:

```yaml
# This is a minimal illustrative example. Validate against the
# official OpenTelemetry Collector contrib image and Azure Monitor exporter docs:
# https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/azuremonitorexporter
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector-config
  namespace: monitoring
data:
  config.yaml: |
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318

    processors:
      batch:
        timeout: 10s
        send_batch_size: 1000

    exporters:
      azuremonitor:
        connection_string: "${APPLICATIONINSIGHTS_CONNECTION_STRING}"

    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [azuremonitor]
        metrics:
          receivers: [otlp]
          processors: [batch]
          exporters: [azuremonitor]
```

Set the connection string as a Kubernetes Secret and reference it via `secretKeyRef` in the Collector Deployment. Do not bake connection strings into ConfigMaps.

**First-party references:**
- [Azure Monitor OpenTelemetry Enable](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable)
- [OpenTelemetry Collector contrib — Azure Monitor exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/azuremonitorexporter)
- [AKS Monitoring with Container Insights](https://learn.microsoft.com/azure/aks/monitor-aks)

---

## Option B — Azure Managed Grafana + Prometheus

Azure Managed Grafana can connect to a Prometheus data source backed by Azure Monitor Managed Prometheus. Squad emits OTLP metrics; the Collector translates them to Prometheus remote-write format.

**Collector pipeline addition:**

```yaml
exporters:
  prometheusremotewrite:
    endpoint: "${AZURE_MONITOR_PROMETHEUS_REMOTE_WRITE_ENDPOINT}"
    auth:
      authenticator: bearertokenauth
```

**Starter Grafana PromQL panel — agent duration histogram:**

```promql
# 95th-percentile agent task duration (Squad emits squad.agent.duration as a histogram)
histogram_quantile(0.95,
  sum(rate(squad_agent_duration_bucket[5m])) by (le, service_name)
)
```

> ⚠️ Metric names are subject to change as Squad's OpenTelemetry instrumentation stabilizes. Verify actual emitted metric names in your Collector's metric output before building dashboards.

**First-party references:**
- [Azure Managed Grafana overview](https://learn.microsoft.com/azure/managed-grafana/overview)
- [Azure Monitor Managed Prometheus](https://learn.microsoft.com/azure/azure-monitor/essentials/prometheus-metrics-overview)

---

## Structured stdout logs → Log Analytics

Squad emits structured JSON to stdout when running in a container. AKS + Container Insights forwards container stdout to Log Analytics automatically when Container Insights is enabled on the cluster.

Query agent activity in Log Analytics (KQL):

```kusto
ContainerLogV2
| where ContainerName == "squad-agent"
| where TimeGenerated > ago(1h)
| extend parsed = parse_json(LogMessage)
| project TimeGenerated, Level = parsed.level, Message = parsed.message, TraceId = parsed.traceId
| order by TimeGenerated desc
```

**PII and log redaction:** Squad does not currently redact user-provided content from structured log output. If your agents process issues that may contain personal data, configure log filtering at the Collector or Log Analytics level. Do not rely on application-level redaction until this is explicitly documented as a supported feature.

---

## "No traces appear" troubleshooting checklist

Work through this list in order:

1. **Is `OTEL_EXPORTER_OTLP_ENDPOINT` set?** — Squad emits no telemetry if the variable is absent. Run `kubectl exec -n squad <pod> -- env | grep OTEL` to confirm.

2. **Is the Collector reachable from the pod?** — Use `kubectl exec -n squad <pod> -- nc -zv otel-collector.monitoring 4317` (if `nc` is available in the image). A timeout indicates a NetworkPolicy or DNS issue.

3. **Is the OTLP protocol correct?** — Squad uses gRPC by default (port `4317`). If you set an HTTP receiver URL (`/v1/traces`), the gRPC handshake will fail silently. Check Collector logs: `kubectl logs -n monitoring deployment/otel-collector | grep error`.

4. **Are authentication headers present?** — Azure Monitor OTLP ingest requires the `x-ms-application-insights-connection-string` header. Missing or malformed headers cause 401 responses that may not surface in Collector metrics.

5. **Is the Collector exporter healthy?** — Check Collector internal metrics (`http://otel-collector:8888/metrics`). Look for `otelcol_exporter_send_failed_spans` > 0.

6. **NetworkPolicy blocking egress?** — AKS clusters with Calico or Azure Network Policy may block pod egress to the Collector namespace. Add an egress rule allowing `squad` namespace → `monitoring` namespace on port `4317`.

7. **Firewall / private endpoint?** — If Azure Monitor is accessed via Private Link, confirm the pod's DNS resolves `*.monitor.azure.com` to a private IP. Check `kubectl exec -n squad <pod> -- nslookup eastus.otlp.monitor.azure.com`.

---

## Dashboards and alerting

Recommended alerts once traces are flowing to Azure Monitor or Grafana:

| Signal | Recommended threshold | Alert type |
|---|---|---|
| `squad.agent.duration` p95 > 5 minutes | Warning | Metric alert |
| `squad.issue.dispatch.errors` rate > 5/min | Critical | Log alert |
| Pod OOM restarts > 2 in 10 min | Critical | Container Insights alert |
| GitHub API 401 errors in structured logs | Critical | Log alert |
| No spans received from service in 10 min | Warning | Availability alert |

---

## Graceful shutdown limits

When Kubernetes sends `SIGTERM`, Squad begins graceful shutdown. The default pod `terminationGracePeriodSeconds` is 30 seconds. If an agent is mid-task, in-flight work may be interrupted. Squad does not currently checkpoint in-progress tasks before shutdown.

Mitigation: Set `terminationGracePeriodSeconds: 120` in your Deployment spec to give long-running agents time to finish. There is no guarantee all work completes — monitor `squad.agent.interrupted` spans in your telemetry backend to measure the impact.

---

## Incident collection and escalation

When filing a support issue or escalating an incident:

1. Collect pod logs: `kubectl logs -n squad <pod> --previous > squad-agent.log`
2. Collect events: `kubectl get events -n squad --sort-by=.lastTimestamp > squad-events.txt`
3. Export a 30-minute trace sample from Application Insights or Grafana Tempo
4. Attach `kubectl describe pod -n squad <pod>` output
5. Open an issue at [bradygaster/squad](https://github.com/bradygaster/squad/issues) with the above artifacts, redacting any PII from log excerpts

---

## Relation to open issues

| Issue | Status | Impact |
|---|---|---|
| [#1144](https://github.com/bradygaster/squad/issues/1144) | Open — embedded host telemetry | Squad running via `@github/copilot-sdk` does not yet expose OTLP. Production telemetry requires Squad CLI container mode. |
| [#1577](https://github.com/bradygaster/squad/issues/1577) | Open — HTTP health endpoints | No `/healthz` or `/readyz` endpoint exists. Readiness cannot be confirmed via HTTP; Kubernetes relies on process restart policy only. |

---

## Inspiration and attribution

The OTLP-to-Azure-Monitor wiring patterns described here draw on real-world Squad deployment experience documented by Tamir Dresher:

- [Scaling AI Agents at Scale — Part 8: Pathfinder](https://www.tamirdresher.com/blog/2026/03/26/scaling-ai-part8-pathfinder)
- [squad-otel-poc (reference repo)](https://github.com/tamirdresher/squad-otel-poc)

Content is written in Squad voice; no text is copied from these sources.
