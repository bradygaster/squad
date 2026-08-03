---
title: Azure Container Apps Deployment
description: Deploy Squad as a managed container agent on Azure Container Apps — workload identity, Key Vault secrets, KEDA scaling, ACA Jobs for one-shot dispatch, and troubleshooting.
order: 20
---

# Azure Container Apps Deployment

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Azure Container Apps (ACA) is the lowest-friction path to running Squad in production on Azure. ACA provides managed KEDA scaling, managed TLS/ingress, and native workload identity — so you get autoscaling and secretless authentication without managing a Kubernetes control plane.

This guide takes you from zero to a running Squad agent that polls a GitHub repository and executes issues automatically.

**Prerequisites:**
- An Azure subscription with Contributor access
- `az` CLI 2.53+ and the `containerapp` extension: `az extension add --name containerapp`
- A container image pushed to ACR or GHCR (see [Container Image reference](/squad/docs/reference/container-image/))
- A GitHub repository with Squad initialized (`squad init`)

---

## Architecture Overview

```
GitHub Issues
     │
     ▼
┌─────────────────────────────────────────┐
│  Azure Container Apps Environment       │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │  Squad Agent Container App         │ │
│  │  • KEDA HTTP or queue scaler       │ │
│  │  • Workload identity (no PATs)     │ │
│  │  • Key Vault secret references     │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │  ACA Jobs (optional)               │ │
│  │  • One-shot issue dispatch         │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
         │
         ▼
  Azure Key Vault   Azure Monitor / Log Analytics
```

---

## Step 1 — Resource Setup

```bash
# Variables — adjust to your environment
RESOURCE_GROUP="rg-squad-prod"
LOCATION="eastus2"
ACA_ENV="squad-aca-env"
LOG_WORKSPACE="squad-logs"
ACR_NAME="squadregistry"        # must be globally unique
KEYVAULT_NAME="squad-kv-prod"   # must be globally unique
APP_NAME="squad-agent"
IDENTITY_NAME="squad-agent-id"

# Resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Log Analytics workspace (required for ACA environment)
az monitor log-analytics workspace create \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_WORKSPACE

LOG_WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_WORKSPACE \
  --query customerId -o tsv)

LOG_WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_WORKSPACE \
  --query primarySharedKey -o tsv)

# Container Apps environment
az containerapp env create \
  --name $ACA_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --logs-workspace-id $LOG_WORKSPACE_ID \
  --logs-workspace-key $LOG_WORKSPACE_KEY
```

Reference: [Azure Container Apps environments](https://learn.microsoft.com/azure/container-apps/environment)

---

## Step 2 — Managed Identity

Using a user-assigned managed identity is the recommended authentication strategy. It replaces long-lived GitHub PATs for Azure service access and enables OIDC federation for GitHub API calls.

```bash
# Create user-assigned managed identity
az identity create \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP

IDENTITY_CLIENT_ID=$(az identity show \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query clientId -o tsv)

IDENTITY_RESOURCE_ID=$(az identity show \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query id -o tsv)
```

Reference: [Managed identities in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/managed-identity)

### ACR pull with managed identity

Grant the identity `AcrPull` on your registry so the container can pull the Squad image without a stored password:

```bash
ACR_ID=$(az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)

az role assignment create \
  --assignee $IDENTITY_CLIENT_ID \
  --role AcrPull \
  --scope $ACR_ID
```

---

## Step 3 — Key Vault and GitHub Token Secret

Store the GitHub token (or any other secrets) in Key Vault rather than in the container environment.

```bash
# Create Key Vault
az keyvault create \
  --name $KEYVAULT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --enable-rbac-authorization true

# Grant the managed identity read access to secrets
KV_ID=$(az keyvault show --name $KEYVAULT_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)

az role assignment create \
  --assignee $IDENTITY_CLIENT_ID \
  --role "Key Vault Secrets User" \
  --scope $KV_ID

# Store the GitHub token
az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name github-token \
  --value "<your-github-token>"
```

Reference: [Key Vault secret references in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/manage-secrets?tabs=azure-portal#reference-secret-from-key-vault)

---

## Step 4 — Deploy the Container App

```bash
KV_SECRET_URI=$(az keyvault secret show \
  --vault-name $KEYVAULT_NAME \
  --name github-token \
  --query id -o tsv)

az containerapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $ACA_ENV \
  --image "${ACR_NAME}.azurecr.io/squad-agent:latest" \
  --registry-server "${ACR_NAME}.azurecr.io" \
  --registry-identity $IDENTITY_RESOURCE_ID \
  --user-assigned $IDENTITY_RESOURCE_ID \
  --secrets "github-token=keyvaultref:${KV_SECRET_URI},identityref:${IDENTITY_RESOURCE_ID}" \
  --env-vars \
    "GITHUB_TOKEN=secretref:github-token" \
    "SQUAD_DEPLOYMENT_MODE=agent-per-node" \
    "OTEL_SERVICE_NAME=squad-agent" \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 0 \
  --max-replicas 5 \
  --ingress internal \
  --target-port 3000
```

> **No public ingress by default.** Squad agents poll GitHub and do not need to receive inbound HTTP traffic. Setting `--ingress internal` (or omitting ingress entirely) restricts access to the ACA environment. If you add a webhook-triggered scaler or health dashboard in the future, switch to `--ingress external`.

---

## Step 5 — KEDA Scaling

Azure Container Apps has [built-in KEDA support](https://learn.microsoft.com/azure/container-apps/scale-app?pivots=azure-cli). You can add scaling rules after creation or inline during `az containerapp create`.

### Option A — ACA built-in HTTP scaler

For HTTP-triggered workflows (webhook dispatch, future `--remote` mode — see [#1189](https://github.com/bradygaster/squad/issues/1189)):

```bash
az containerapp update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --scale-rule-name http-scaler \
  --scale-rule-type http \
  --scale-rule-http-concurrency 10
```

### Option B — KEDA external scaler (GitHub issue queue)

Use the Squad KEDA external scaler to scale based on GitHub issue queue depth. This matches the pattern documented in [KEDA Autoscaling](/squad/docs/features/keda-scaling/).

The KEDA external scaler must be deployed as a separate container in the same ACA environment:

```bash
# Deploy external scaler service
az containerapp create \
  --name squad-external-scaler \
  --resource-group $RESOURCE_GROUP \
  --environment $ACA_ENV \
  --image "ghcr.io/bradygaster/squad-external-scaler:latest" \
  --env-vars "PORT=8080" \
  --ingress internal \
  --target-port 8080 \
  --min-replicas 1 \
  --max-replicas 1
```

Then add a custom KEDA scaling rule to the Squad agent app using the KEDA external scaler protocol:

```bash
az containerapp update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --scale-rule-name github-queue \
  --scale-rule-type external \
  --scale-rule-metadata \
    "scalerAddress=squad-external-scaler:8080" \
    "owner=<your-org>" \
    "repo=<your-repo>" \
    "labels=squad:ready" \
    "targetQueueLength=5" \
  --scale-rule-auth "trigger=github-token" "secretRef=github-token"
```

Reference: [KEDA scaling rules in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/scale-app?pivots=azure-cli#custom)

### Scaling to zero — cold start tradeoffs

Setting `--min-replicas 0` eliminates idle cost but introduces a cold start penalty (typically 15–45 seconds for a Node.js container). During a cold start, issues that arrive are queued by KEDA and picked up when the first replica becomes ready.

For time-sensitive workloads, set `--min-replicas 1` to keep one warm replica.

---

## Step 6 — Health Probes

ACA supports startup, liveness, and readiness probes. Squad exposes `/healthz` (liveness) and `/readyz` (readiness) when `SQUAD_HEALTH_PORT` is set.

```bash
az containerapp update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --env-vars "SQUAD_HEALTH_PORT=3000" \
```

Health probes are configured in the app's YAML revision spec. Use `az containerapp show --name $APP_NAME --resource-group $RESOURCE_GROUP -o yaml` to export, then apply:

```yaml
# Excerpt from container spec in revision YAML
probes:
  - type: liveness
    httpGet:
      path: /healthz
      port: 3000
    initialDelaySeconds: 10
    periodSeconds: 30
    failureThreshold: 3
  - type: readiness
    httpGet:
      path: /readyz
      port: 3000
    initialDelaySeconds: 5
    periodSeconds: 10
    failureThreshold: 3
```

Reference: [Health probes in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/health-probes)

---

## ACA Jobs — One-Shot Issue Dispatch

For triggered, one-shot agent runs (e.g., a single issue dispatched by a webhook), use [ACA Jobs](https://learn.microsoft.com/azure/container-apps/jobs) instead of a long-running Container App:

```bash
az containerapp job create \
  --name squad-job \
  --resource-group $RESOURCE_GROUP \
  --environment $ACA_ENV \
  --image "${ACR_NAME}.azurecr.io/squad-agent:latest" \
  --registry-server "${ACR_NAME}.azurecr.io" \
  --registry-identity $IDENTITY_RESOURCE_ID \
  --user-assigned $IDENTITY_RESOURCE_ID \
  --trigger-type Manual \
  --replica-timeout 1800 \
  --replica-retry-limit 1 \
  --replica-completion-count 1 \
  --parallelism 1 \
  --secrets "github-token=keyvaultref:${KV_SECRET_URI},identityref:${IDENTITY_RESOURCE_ID}" \
  --env-vars \
    "GITHUB_TOKEN=secretref:github-token" \
    "SQUAD_DEPLOYMENT_MODE=agent-per-node"
```

Trigger a job run manually:

```bash
az containerapp job start \
  --name squad-job \
  --resource-group $RESOURCE_GROUP
```

> **Future:** Remote dispatch (`squad --remote`) is being designed in [#1189](https://github.com/bradygaster/squad/issues/1189). Once available, ACA Jobs will be the recommended execution backend for remote dispatch.

---

## State Persistence Caveats

By default, Squad uses the `local` state backend — files written to `.squad/` inside the container. Container filesystem is ephemeral: **state is lost when a replica restarts.**

For durable state:

1. **Orphan/two-layer backend** (recommended): State is committed to an orphan Git branch; persists across pod restarts. Requires `GITHUB_TOKEN` write scope.
2. **Azure Files volume mount**: Mount an Azure Files share to `/app/.squad/` for shared file-system persistence across replicas.
3. **Single replica**: If scaling to one replica (min=max=1), ephemeral state survives in-memory but not across restarts.

> ⚠️ **Multi-replica safety:** The `local` state backend is **not safe for concurrent writes** from multiple replicas. Use the orphan or two-layer backend, or constrain to one replica. See [State Backends](/squad/docs/features/state-backends/) and [#1402](https://github.com/bradygaster/squad/issues/1402).

---

## Troubleshooting

### Missing or invalid `GITHUB_TOKEN`

**Symptom:** Squad starts but immediately logs `401 Unauthorized` or `GitHub API rate limit exceeded` for an invalid token.

```bash
# Check live logs
az containerapp logs show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --type console \
  --follow

# Verify the secret is set
az containerapp secret list \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP
```

Ensure the Key Vault secret URI is correct and the managed identity has `Key Vault Secrets User` on the vault. Check the identity assignment:

```bash
az containerapp identity show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP
```

### KEDA scaler not triggering

**Symptom:** Issues are labeled `squad:ready` but no new replicas start.

- Verify the external scaler container is running: `az containerapp show --name squad-external-scaler --resource-group $RESOURCE_GROUP --query properties.runningStatus`
- Check scaler logs for GitHub API errors (rate limit, auth failure).
- Confirm the `targetQueueLength` is below the current issue count.
- Check the ACA scaling logs in Log Analytics: `az monitor log-analytics query --workspace $LOG_WORKSPACE_ID --analytics-query "ContainerAppConsoleLogs_CL | where ContainerName_s == 'squad-agent' | take 50"`

### Cold start failures

**Symptom:** First request after scale-from-zero times out; KEDA marks the replica unhealthy before readiness probe passes.

- Increase `initialDelaySeconds` on the readiness probe.
- Set `--min-replicas 1` to keep one warm replica.
- Use a smaller base image (ensure `node:22-alpine` not `node:22`).

### Container exits immediately

**Symptom:** Container starts and exits with code 1 within seconds.

- Check that `GITHUB_TOKEN` is injected correctly (test with `az containerapp exec` if available).
- Verify the image tag matches what was pushed to ACR.
- Check startup logs: `az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP --type system`

---

## Current Limitations and Future Work

| Feature | Status |
|---|---|
| `--remote` dispatch (webhook-triggered issue execution) | RFC — [#1189](https://github.com/bradygaster/squad/issues/1189) |
| External state gap for multi-replica deployments | Design — [#1402](https://github.com/bradygaster/squad/issues/1402) |
| FSStorageProvider rootDir bug | Open — [#1555](https://github.com/bradygaster/squad/issues/1555) |
| ACA Dynamic Sessions / Sandbox execution | Planned — [#1564](https://github.com/bradygaster/squad/issues/1564) |

---

## Further Reading

- [Azure Container Apps documentation](https://learn.microsoft.com/azure/container-apps/) — official reference
- [Managed identities in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/managed-identity) — first-party guide
- [KEDA scaling in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/scale-app) — built-in and custom scalers
- [Key Vault secret references](https://learn.microsoft.com/azure/container-apps/manage-secrets?tabs=azure-portal#reference-secret-from-key-vault) — secretless secret management
- [Container Image contract](/squad/docs/reference/container-image/) — environment variables, health endpoints, Dockerfile reference
- [KEDA Autoscaling](/squad/docs/features/keda-scaling/) — Squad-specific KEDA ScaledObject configuration
- [State Backends](/squad/docs/features/state-backends/) — choosing a backend safe for container deployments
