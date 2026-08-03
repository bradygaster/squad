---
title: Container Image — Environment Variable Contract
description: Canonical reference for Squad container image configuration — environment variables, config/state paths, process lifecycle, graceful shutdown, and secret injection patterns.
order: 10
---

# Container Image — Environment Variable Contract

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

This page is the canonical reference for running `@bradygaster/squad-cli` in a container. Every environment variable, volume mount, and behavioral expectation is defined here. [Azure Container Apps](../scenarios/azure-container-apps) and [AKS deployment](../scenarios/aks-deployment) pages cross-link to this reference.

---

## Environment Variables

### Required — runtime identity

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | **Required** | — | GitHub personal access token **or** (preferred) an identity token issued by workload identity / OIDC. Grants Squad access to the GitHub API for issue polling, PRs, and commits. |
| `SQUAD_DEPLOYMENT_MODE` | Optional | `agent-per-node` | Deployment topology. Set to `squad-per-pod` when multiple Squad containers run concurrently against the same repository. See [Dual-Mode Deployment](/squad/docs/features/dual-mode-deployment/). |
| `SQUAD_POD_ID` | Conditional | — | Required when `SQUAD_DEPLOYMENT_MODE=squad-per-pod`. Must be unique per pod replica. Kubernetes: set via `fieldRef.fieldPath: metadata.name`. |

### Optional — observability

| Variable | Required | Default | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional | — | OTLP endpoint for OpenTelemetry traces and metrics (e.g., `https://otelcollector:4317`). When set, Squad emits structured spans for issue dispatch, agent lifecycle, and tool calls. |
| `OTEL_SERVICE_NAME` | Optional | `squad-agent` | Service name reported to your OTLP collector. |
| `OTEL_RESOURCE_ATTRIBUTES` | Optional | — | Key-value pairs appended to every span (e.g., `deployment.environment=production,cluster=aks-eastus`). |

### GitHub API scopes required

`GITHUB_TOKEN` must carry the following scopes depending on the features Squad uses:

| Scope | Why |
|---|---|
| `repo` | Read/write issues, comments, PRs, and commits |
| `read:org` | Org-level label and project read access |
| `workflow` | Trigger GitHub Actions workflows (if used) |

> **Important:** Azure managed identity / workload identity authenticates to **Azure** services (Key Vault, ACR, etc.), not to the GitHub API. `GITHUB_TOKEN` must always be a GitHub personal access token or GitHub App token injected at runtime (via Key Vault reference or Kubernetes Secret). Workload identity does not replace it.

---

## Paths and Volumes

### Default paths inside the container

| Path | Purpose |
|---|---|
| `/app` | Application root; `squad watch --execute` runs here |
| `/app/.squad/` | Default Squad config and state directory |
| `/app/.squad/team.md` | Agent roster and roles |
| `/app/.squad/routing.md` | Issue routing rules |
| `/app/.squad/config.json` | Squad runtime config (state backend, etc.) |

### Volume mount strategies

**Strategy A — bake `.squad/` into the image (simple, immutable)**

```dockerfile
COPY .squad/ /app/.squad/
```

The team config and routing rules are pinned to the image tag. Updates require a new image push. Suitable when the Squad config rarely changes.

**Strategy B — mount `.squad/` as a volume (mutable, shared)**

```yaml
# Kubernetes / ACA example
volumeMounts:
  - name: squad-config
    mountPath: /app/.squad
```

The config is injected at runtime from a ConfigMap or Azure Files share. Supports live config updates without rebuilding the image. Note that FSStorageProvider may resolve state paths relative to the process working directory rather than the volume mount when `rootDir` is not set in `config.json` — see [#1555](https://github.com/bradygaster/squad/issues/1555).

> ⚠️ **Multi-replica state warning:** The `local` state backend (files on disk) is **not safe for concurrent writes** from multiple pod replicas. If you scale beyond one replica, use the `orphan` or `two-layer` state backend, or persist state to an external store. See [State Backends](/squad/docs/features/state-backends/) and [#1402](https://github.com/bradygaster/squad/issues/1402).

---

## Production Dockerfile Reference

The following Dockerfile is the canonical starting point for Squad container images. It uses a multi-stage build, pins Node.js, and runs as a non-root user.

```dockerfile
# syntax=docker/dockerfile:1.7
# Stage 1 — install production dependencies
FROM node:22-alpine AS deps
WORKDIR /build

# Copy manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2 — production image
FROM node:22-alpine AS runtime

# Non-root user (UID 1001 avoids common conflicts with bind mounts)
RUN addgroup --system squad && adduser --system --ingroup squad --uid 1001 squad

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps --chown=squad:squad /build/node_modules ./node_modules

# Copy Squad config (baked-in strategy; use a volume mount for Strategy B)
COPY --chown=squad:squad .squad/ ./.squad/

# Install squad-cli globally so 'squad' is on PATH
RUN npm install -g @bradygaster/squad-cli --ignore-scripts

# Drop privileges
USER squad

# Squad handles SIGTERM: drains in-flight work, then exits cleanly.
STOPSIGNAL SIGTERM

# GITHUB_TOKEN must be provided at runtime — never bake it into the image.
# Inject via Kubernetes Secret, ACA Key Vault reference, or CSI driver.
CMD ["squad", "watch", "--execute"]
```

> **Base image pinning:** `node:22-alpine` is used above. Pin to a specific digest in production (e.g., `node:22.x.y-alpine@sha256:...`) to prevent supply-chain drift. Rebuild on security advisories.

---

## Process Lifecycle and Health

Squad does not expose an HTTP health server or liveness/readiness endpoints. There is no `SQUAD_HEALTH_PORT`, `/healthz`, or `/readyz` — these are planned features tracked in [#1577](https://github.com/bradygaster/squad/issues/1577).

**Current container health behavior:**
- The container is healthy as long as the `squad watch --execute` process is running.
- If `squad` exits for any reason, the container exits. Kubernetes and ACA restart exited containers automatically via the container restart policy — this is sufficient for the current release.
- Do **not** configure HTTP liveness or readiness probes — there is no listener and probes will always fail, crash-looping your pod.

If your cluster policy requires an exec probe, use Node.js (already present in the image) to check that PID 1 is still running. This is a **shallow** check — it only confirms the process table entry for PID 1 exists; it does not verify GitHub API connectivity or queue health. An HTTP readiness endpoint is the tracked solution in [#1577](https://github.com/bradygaster/squad/issues/1577).

```yaml
# Shallow PID-1 existence check (no procps / pgrep required)
# node:22-alpine ships without procps; this probe uses Node.js only.
livenessProbe:
  exec:
    command:
      - node
      - -e
      - |
        const fs = require('fs');
        fs.accessSync('/proc/1/status');
  initialDelaySeconds: 15
  periodSeconds: 30
  failureThreshold: 3
```

> **Tracking:** An explicit HTTP health/readiness contract is planned. See [#1577](https://github.com/bradygaster/squad/issues/1577) for status.

---

## Graceful Shutdown

When Squad receives `SIGTERM` it:

1. Stops accepting new issues from the queue.
2. Waits for any in-flight agent turns to complete (drain).
3. Flushes pending state to the configured backend.
4. Exits with code `0`.

For Kubernetes, set `terminationGracePeriodSeconds` to at least `60` to give Squad time to drain in-flight work before the container runtime forcibly terminates it.

---

## Secret Injection Patterns

### Pattern 1 — environment variable (least secure)

```bash
# Only for local testing. Never use in production.
docker run -e GITHUB_TOKEN=$GITHUB_TOKEN ghcr.io/bradygaster/squad-cli:latest
```

### Pattern 2 — mounted secret (Kubernetes)

```yaml
env:
  - name: GITHUB_TOKEN
    valueFrom:
      secretKeyRef:
        name: squad-github-token
        key: token
```

The secret value is injected into the environment at pod start. The secret object is managed separately (e.g., via External Secrets Operator or sealed secrets).

### Pattern 3 — Azure Key Vault CSI driver (AKS, recommended)

The [Secrets Store CSI Driver](https://learn.microsoft.com/azure/aks/csi-secrets-store-driver) mounts Key Vault secrets as files or environment variables at pod startup, with automatic rotation.

```yaml
# SecretProviderClass (abbreviated)
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: squad-keyvault-secrets
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    clientID: "<workload-identity-client-id>"
    keyvaultName: "<your-keyvault-name>"
    objects: |
      array:
        - |
          objectName: github-token
          objectType: secret
    tenantID: "<your-tenant-id>"
  secretObjects:
    - secretName: squad-github-token
      type: Opaque
      data:
        - objectName: github-token
          key: token
```

Full example in the [AKS deployment runbook](../scenarios/aks-deployment).

### Pattern 4 — ACA managed identity + Key Vault reference (Azure Container Apps)

Azure Container Apps supports [Key Vault secret references](https://learn.microsoft.com/azure/container-apps/manage-secrets?tabs=azure-portal#reference-secret-from-key-vault) natively. No CSI driver required; the platform injects the secret value into the container environment automatically. See [Azure Container Apps deployment](../scenarios/azure-container-apps).

---

## Current Limitations

| Limitation | Status | Workaround |
|---|---|---|
| FSStorageProvider may resolve state paths relative to process working directory instead of volume mount when `rootDir` is not explicit in `config.json` | Open — [#1555](https://github.com/bradygaster/squad/issues/1555) | Set `rootDir` explicitly in `.squad/config.json` to the absolute volume mount path; no env var override exists yet |
| No HTTP health/readiness endpoints | Planned — [#1577](https://github.com/bradygaster/squad/issues/1577) | Use process-check exec probe; Kubernetes restarts exited containers automatically |
| `local` state backend not safe for concurrent multi-replica writes | Design gap — [#1402](https://github.com/bradygaster/squad/issues/1402) | Use `orphan` or `two-layer` backend, or scale to one replica |
| Remote dispatch (`--remote` flag) | RFC in progress — [#1189](https://github.com/bradygaster/squad/issues/1189) | Use KEDA queue-based scaling as a near-term alternative |

---

## Building and Pushing the Image

### GitHub Container Registry (GHCR)

```bash
# Build
docker build -t ghcr.io/<your-org>/squad-agent:latest .

# Authenticate (GitHub token with packages:write)
echo $GITHUB_TOKEN | docker login ghcr.io -u <github-username> --password-stdin

# Push
docker push ghcr.io/<your-org>/squad-agent:latest
```

### Azure Container Registry (ACR)

```bash
# Authenticate with your Azure identity
az acr login --name <your-acr-name>

# Build and push in one step using ACR Tasks (no local Docker daemon needed)
az acr build \
  --registry <your-acr-name> \
  --image squad-agent:latest \
  --file Dockerfile \
  .
```

For AKS, attach the ACR to your cluster to enable pull-through without credentials:

```bash
az aks update \
  --name <aks-cluster> \
  --resource-group <rg> \
  --attach-acr <your-acr-name>
```

---

## See Also

- [Dual-Mode Deployment](/squad/docs/features/dual-mode-deployment/) — `SQUAD_DEPLOYMENT_MODE` and `SQUAD_POD_ID` details
- [State Backends](/squad/docs/features/state-backends/) — choosing a backend safe for multi-replica deployments
- [Azure Container Apps deployment](../scenarios/azure-container-apps) — end-to-end ACA scenario
- [AKS deployment runbook](../scenarios/aks-deployment) — Kubernetes scenario with workload identity and KEDA
- [#1577](https://github.com/bradygaster/squad/issues/1577) — health/readiness endpoint product gap
