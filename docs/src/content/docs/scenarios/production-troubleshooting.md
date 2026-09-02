---
title: Production Troubleshooting Runbook
description: Operator runbook for Squad container and Kubernetes deployments — startup failures, GitHub auth, OTEL export, state backend, KEDA scaling, image pull errors, OOM restarts, and escalation guidance.
order: 27
---

# Production Troubleshooting Runbook

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> 🔗 **Related:** [AKS Deployment Runbook](./aks-deployment) · [Production Observability](./production-observability) · [State Backend Selection](/squad/docs/reference/state-backend-selection/) · [Container Image — Env Var Contract](/squad/docs/reference/container-image/)

This runbook covers failure modes for Squad running as a container or Kubernetes pod. For local CLI issues, see [Troubleshooting](./troubleshooting).

---

## Quick triage: "My agents are not picking up issues"

Work through this decision tree before drilling into a specific section:

```
Is the pod running?
  └─ No  → See "Pod not starting" below
  └─ Yes ↓

Does `kubectl logs -n squad <pod>` show squad watch started?
  └─ No  → See "CLI / startup path" below
  └─ Yes ↓

Are qualifying issues present in GitHub?
  └─ No  → Add a label matching your routing rules and re-check
  └─ Yes ↓

Does the GitHub token have required scopes?
  └─ Fail → See "GitHub authentication" below
  └─ Pass ↓

Is KEDA scaling pods for the queue depth?
  └─ No  → See "KEDA scaler not triggering" below
  └─ Yes ↓

Is the state backend accessible?
  └─ No  → See "State backend / bridge" below
  └─ Yes → Check routing rules in .squad/routing.md; verify labels match
```

Root causes in order of frequency:
1. **KEDA not scaling** — queue depth below threshold or scaler unreachable
2. **Wrong or missing env vars** — `GITHUB_TOKEN` absent or wrong scope
3. **State backend inaccessible** — PVC mount failure or `FSStorageProvider` path bug (#1555)
4. **GitHub API 401** — expired token, missing scope, or org SSO not enabled
5. **No qualifying labels** — issues exist but labels don't match routing rules
6. **Image pull failure** — ACR credentials expired or image tag not found
7. **OOM restart loop** — insufficient memory limits

---

## CLI / startup path

**Symptom:** Pod starts, then exits immediately; logs show no `squad watch` output.

**Diagnosis:**

```bash
kubectl logs -n squad <pod>
kubectl describe pod -n squad <pod>
```

**Common causes:**

| Exit pattern | Cause | Fix |
|---|---|---|
| `Error: Cannot find module` | Image built from wrong working directory or missing `node_modules` | Rebuild image with correct `WORKDIR` and `RUN npm ci` |
| `SyntaxError` or `ERR_MODULE_NOT_FOUND` | Node.js version mismatch | Pin `node:22-alpine` in Dockerfile; check `engines` field in `package.json` |
| Exits 0 silently | `CMD` runs `squad init` instead of `squad watch --execute` | Fix Dockerfile `CMD` to `["squad", "watch", "--execute"]` |
| `No .squad/ directory found` | `.squad/team.md` not present in image or on volume | Bake `.squad/` into image (Strategy A) or mount a ConfigMap volume (Strategy B) — see [Container Image ref](/squad/docs/reference/container-image/#volume-mount-strategies) |

**CLI path check:**

```bash
kubectl exec -n squad <pod> -- squad --version
```

If `squad` is not found, the CLI is not installed in the image. Build from the
standalone bundle image or install the CLI before setting the entrypoint.

---

## GitHub authentication

**Symptom:** Logs show `401 Unauthorized`, `Bad credentials`, or `Resource not accessible by integration`.

**Diagnosis:**

```bash
# Confirm the token env var is set
kubectl exec -n squad <pod> -- env | grep GITHUB_TOKEN

# Validate token scopes (replace <token> with actual value from secret)
gh api user --hostname github.com  # or use curl with Authorization header
```

**Common causes:**

| Error | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | `GITHUB_TOKEN` absent, expired, or empty string | Re-create Kubernetes Secret with a valid token; rotate PAT |
| `403 Forbidden` on org resources | Token missing `read:org` scope | Re-generate PAT with required scopes (see [Container Image ref](/squad/docs/reference/container-image/#github-api-scopes-required)) |
| `Resource not accessible` on private org | SSO not authorized for the token | Go to [github.com/settings/tokens](https://github.com/settings/tokens) → authorize SSO for the PAT |
| GitHub App token expired | Apps tokens expire after 1 hour | Use a secret rotation mechanism (Key Vault rotation + pod restart / CSI refresh) |

**Rate limiting across a pod fleet:**

GitHub's rate limit is **5,000 requests/hour per token** for authenticated REST API calls. If you run multiple Squad pods sharing a single token, they compete for the same quota. At 10 pods each polling every 30 seconds, you will exhaust the quota in under 30 minutes.

Mitigation options:
- Use `SQUAD_DEPLOYMENT_MODE=squad-per-pod` and issue unique GitHub App installation tokens per pod (different apps or different installation tokens from the same app).
- Set `targetQueueLength` in your KEDA `ScaledObject` high enough that you run fewer pods concurrently.
- Monitor rate limit headers in structured logs; alert when `x-ratelimit-remaining < 500`.

---

## OpenTelemetry export

**Symptom:** No traces appear in Azure Monitor or Grafana; `squad.agent.duration` metric absent.

**Full troubleshooting checklist:** See [Production Observability — "No traces appear"](./production-observability#no-traces-appear-troubleshooting-checklist).

Quick checks:

```bash
# Is the endpoint set?
kubectl exec -n squad <pod> -- env | grep OTEL

# Can the pod reach the Collector?
kubectl exec -n squad <pod> -- nc -zv otel-collector.monitoring 4317

# Check Collector logs for export errors
kubectl logs -n monitoring deployment/otel-collector | grep -i error | tail -20
```

---

## State backend / bridge failures

**Symptom:** Squad starts but loses state between runs, or logs show `ENOENT` / path errors when reading `.squad/`.

### PVC not mounted

```bash
kubectl describe pod -n squad <pod> | grep -A 5 "Volumes\|Mount"
```

If the PVC mount is missing, the pod is writing state to the container's ephemeral filesystem. State is lost on restart. Add the `volumeMounts` block as described in [State Backend Selection](/squad/docs/reference/state-backend-selection/#configuring-local-backend-with-a-pvc-single-pod).

### FSStorageProvider rootDir bug (#1555)

If Squad logs show state files at the repo root (e.g., `agents/`, `log/`, `decisions.md` appearing at `/app/` rather than `/app/.squad/`), this is [#1555](https://github.com/bradygaster/squad/issues/1555): `FSStorageProvider` is constructed without a `rootDir` argument, so all state keys resolve against the process `cwd` (the repo root) instead of `.squad/`.

> ⚠️ **There is no configuration-level workaround for #1555.** Setting `rootDir` in `config.json` has no effect — `FSStorageProvider` ignores constructor arguments in the affected code path. This must be fixed in the SDK itself.
>
> **Mitigation until #1555 is resolved:** Run only a single Squad replica. Avoid deployment shapes where the MCP server process `cwd` differs from the intended state path. Track [#1555](https://github.com/bradygaster/squad/issues/1555) for status.

See [State Backend Selection — Known bug #1555](/squad/docs/reference/state-backend-selection/#known-bug-fsstorageprovider-rootdir-1555) for background.

### `squad-state` branch push rejected (two-layer / orphan)

```bash
kubectl logs -n squad <pod> | grep "non-fast-forward\|push rejected"
```

If you see push rejections, two pods wrote to `squad-state` concurrently. One pod's state changes were discarded. For multi-pod deployments, do not use branch-based backends — see [State Backend Selection](/squad/docs/reference/state-backend-selection/) and track [#1402](https://github.com/bradygaster/squad/issues/1402).

---

## KEDA scaler not triggering

**Symptom:** Issues are open with qualifying labels, but Squad pods are not being created.

**Diagnosis:**

```bash
# Check ScaledObject status
kubectl describe scaledobject -n squad squad-agents

# Look for ScaledObject conditions
kubectl get scaledobject -n squad squad-agents -o jsonpath='{.status.conditions}' | python3 -m json.tool

# Check external scaler service health
kubectl get svc -n squad squad-external-scaler
kubectl logs -n squad deployment/squad-external-scaler | tail -30
```

**Common causes:**

| Symptom | Cause | Fix |
|---|---|---|
| `READY=False` on ScaledObject | External scaler service unreachable | Check scaler pod logs and service endpoint; confirm port matches `scalerAddress` |
| `READY=True` but no scale-up | `targetQueueLength` set too high | Lower `targetQueueLength` or add more qualifying issues |
| Scale-up happens but pods crash | Image pull failure or startup crash | See image pull and startup sections |
| Pods stay at 0 after queue drains | Expected behavior (`minReplicaCount: 0`) | This is correct zero-cost idle behavior |
| KEDA controller not running | KEDA add-on not enabled | `az aks update --enable-keda` or install Helm chart |

**Verify GitHub token for KEDA:**

```bash
kubectl get secret -n squad github-token-secret -o jsonpath='{.data.personalAccessToken}' | base64 --decode | wc -c
# Should be >0 (non-empty token)
```

---

## Image pull failures

**Symptom:** Pod is stuck in `ImagePullBackOff` or `ErrImagePull`.

```bash
kubectl describe pod -n squad <pod> | grep -A 10 "Events"
```

| Error message | Cause | Fix |
|---|---|---|
| `unauthorized: authentication required` | ACR not attached to AKS or credentials expired | `az aks update --attach-acr <acr-name>` — see [AKS Deployment Runbook](/squad/docs/scenarios/aks-deployment/) |
| `manifest unknown` | Image tag does not exist in ACR | Verify tag with `az acr repository show-tags --name <acr> --repository squad-agent` |
| `name unknown` | Repository name typo in Deployment spec | Check `image:` field; ACR uses `<registry>.azurecr.io/<repo>:<tag>` format |
| Timeout | Private ACR behind VNet, no private endpoint | Add private endpoint for ACR in the AKS VNet |

---

## OOM restarts

**Symptom:** Pod restarts repeatedly; `kubectl describe pod` shows `OOMKilled` in last state.

```bash
kubectl describe pod -n squad <pod> | grep -A 5 "Last State\|OOM"
kubectl top pod -n squad  # requires metrics-server
```

**Mitigation:**

1. Increase memory limit in Deployment spec:
   ```yaml
   resources:
     requests:
       memory: "256Mi"
     limits:
       memory: "1Gi"  # increase as needed
   ```

2. Monitor memory usage over time with Container Insights:
   ```kusto
   KubePodInventory
   | where Namespace == "squad"
   | join kind=inner (
       Perf
       | where ObjectName == "K8SContainer"
       | where CounterName == "memoryWorkingSetBytes"
   ) on InstanceName
   | summarize avg(CounterValue) by bin(TimeGenerated, 5m), ContainerName
   ```

3. Check for memory leaks in agent plugins or custom skills — long-running sessions accumulate context.

4. Set `KEDA minReplicaCount: 0` so idle pods are terminated and memory is released between work bursts.

---

## Deep readiness not available (#1577)

> ⚠️ **Current limitation:** Squad does not expose HTTP health or readiness endpoints. There is no `/healthz` or `/readyz` endpoint, and no `SQUAD_HEALTH_PORT` variable. Kubernetes cannot confirm that Squad has connected to the GitHub API and is ready to accept work.
>
> **What this means for operators:**
> - Kubernetes restarts crashed pods automatically (process exit → restart policy). This is the only built-in safety net.
> - If a pod starts but fails to authenticate to GitHub, it will not crash — it will continue polling and logging 401 errors. Kubernetes will not restart it.
> - You cannot use Kubernetes `readinessProbe` to gate traffic until GitHub auth is confirmed.
>
> **Workaround:** Alert on GitHub 401 errors in structured logs (Log Analytics KQL or Grafana log panel). Treat repeated 401s as a readiness failure requiring manual intervention.
>
> Track [#1577](https://github.com/bradygaster/squad/issues/1577) for HTTP health endpoint implementation.

---

## Collecting diagnostics for escalation

Before opening a GitHub issue, collect:

```bash
# 1. Pod logs (current and previous)
kubectl logs -n squad <pod> > squad-agent-current.log
kubectl logs -n squad <pod> --previous > squad-agent-previous.log 2>/dev/null

# 2. Pod description
kubectl describe pod -n squad <pod> > squad-pod-describe.txt

# 3. Events (last 30 minutes)
kubectl get events -n squad --sort-by=.lastTimestamp > squad-events.txt

# 4. ScaledObject status (if KEDA issue)
kubectl describe scaledobject -n squad squad-agents > squad-scaledobject.txt

# 5. State config (redact any tokens)
kubectl exec -n squad <pod> -- cat /app/.squad/config.json 2>/dev/null
```

Open an issue at [bradygaster/squad](https://github.com/bradygaster/squad/issues) and attach the above files. Redact any GitHub tokens, connection strings, or personal data from log excerpts before attaching.

---

## Relation to open issues

| Issue | This runbook covers |
|---|---|
| [#1144](https://github.com/bradygaster/squad/issues/1144) | Embedded host (copilot-sdk) telemetry not available in production — agents must use Squad CLI container mode |
| [#1402](https://github.com/bradygaster/squad/issues/1402) | External state backend for multi-pod deployments — not yet GA |
| [#1555](https://github.com/bradygaster/squad/issues/1555) | FSStorageProvider `rootDir` bug — no configuration-level workaround; run single replica and track issue for fix |
| [#1577](https://github.com/bradygaster/squad/issues/1577) | HTTP health/readiness endpoints — not yet implemented |
