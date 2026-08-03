---
title: Container Image — Environment Variable Contract
description: Canonical reference for Squad container image configuration — environment variables, config/state paths, health behavior, graceful shutdown, and secret injection patterns.
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
| `SQUAD_LOG_LEVEL` | Optional | `info` | Minimum log level: `debug`, `info`, `warn`, `error`. |

### Optional — GitHub Copilot CLI path

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_COPILOT_CLI_PATH` | Optional | resolved from `$PATH` | Absolute path to the `gh copilot` extension binary. Useful when the binary is installed to a non-standard location inside the image. |

### Optional — state and config

| Variable | Required | Default | Description |
|---|---|---|---|
| `SQUAD_CONFIG_DIR` | Optional | `.squad/` (repo root) | Override where Squad reads `.squad/` config and state. Use when the repo is volume-mounted read-only and you want writable state on a separate volume. |
| `SQUAD_STATE_ROOT_DIR` | Optional | — | **Workaround for [#1555](https://github.com/bradygaster/squad/issues/1555) (FSStorageProvider rootDir bug).** When the `local` state backend is used with a volume-mounted `.squad/`, set this to the absolute path of the mounted directory (e.g., `/mnt/squad-state`). Without this, FSStorageProvider may write state relative to the process working directory instead of the volume mount. Remove after #1555 is resolved. |

### GitHub API scopes required

`GITHUB_TOKEN` must carry the following scopes depending on the features Squad uses:

| Scope | Why |
|---|---|
| `repo` | Read/write issues, comments, PRs, and commits |
| `read:org` | Org-level label and project read access |
| `workflow` | Trigger GitHub Actions workflows (if used) |

With workload identity / OIDC (recommended for production), scopes are configured in the trust policy rather than a static token.

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

The config is injected at runtime from a ConfigMap or Azure Files share. Supports live config updates without rebuilding the image. Requires setting `SQUAD_STATE_ROOT_DIR` as a workaround until [#1555](https://github.com/bradygaster/squad/issues/1555) is resolved if using the `local` state backend.

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

# Signal handler — Squad listens for SIGTERM and drains in-flight work before
# exiting. Default drain timeout is 30 s; override with SQUAD_DRAIN_TIMEOUT_MS.
STOPSIGNAL SIGTERM

# Liveness / readiness: Squad exposes a health HTTP endpoint on port 3000
# when SQUAD_HEALTH_PORT is set. See health probe section below.
ENV SQUAD_HEALTH_PORT=3000
EXPOSE 3000

# GITHUB_TOKEN must be provided at runtime — never bake it into the image.
# Preferred: workload identity; fallback: Kubernetes Secret / ACA secret.
CMD ["squad", "watch", "--execute"]
```

> **Base image pinning:** `node:22-alpine` is used above. Pin to a specific digest in production (e.g., `node:22.x.y-alpine@sha256:...`) to prevent supply-chain drift. Rebuild on security advisories.

---

## Health Behavior

Set `SQUAD_HEALTH_PORT=3000` (or any available port) to enable the built-in health HTTP server.

| Endpoint | Method | Use |
|---|---|---|
| `/healthz` | GET | Liveness probe — returns `200 OK` when the process is running |
| `/readyz` | GET | Readiness probe — returns `200 OK` only after Squad has finished startup and connected to the GitHub API |

Kubernetes / ACA probe configuration is covered in the scenario pages.

---

## Graceful Shutdown

When Squad receives `SIGTERM` it:

1. Stops accepting new issues from the queue.
2. Waits for any in-flight agent turns to complete (drain).
3. Flushes pending state to the configured backend.
4. Exits with code `0`.

The default drain timeout is **30 seconds**. Override with `SQUAD_DRAIN_TIMEOUT_MS=<ms>`. After the timeout, Squad exits with code `1` and logs incomplete work.

For Kubernetes, set `terminationGracePeriodSeconds` to at least `60` to give Squad time to drain plus the container runtime overhead.

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
| FSStorageProvider ignores `rootDir` when state is volume-mounted | Open — [#1555](https://github.com/bradygaster/squad/issues/1555) | Set `SQUAD_STATE_ROOT_DIR` to the mount path |
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
