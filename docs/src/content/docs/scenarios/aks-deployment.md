---
title: AKS Deployment Runbook
description: Deploy Squad on Azure Kubernetes Service with workload identity, KEDA autoscaling, Key Vault CSI secrets, and production-grade security context. Includes troubleshooting for ≥4 failure modes.
order: 21
---

# AKS Deployment Runbook

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

This runbook walks you from a bare AKS cluster to a running, autoscaling Squad agent fleet with secretless authentication, Key Vault-backed secrets, and KEDA-driven GitHub issue queue scaling.

**Prerequisites:**
- An AKS cluster (1.28+) with workload identity enabled
- KEDA installed on the cluster (AKS add-on or Helm)
- An Azure Container Registry attached to the cluster
- `kubectl`, `helm`, and `az` CLI installed locally
- Squad container image built and pushed (see [Container Image reference](/squad/docs/reference/container-image/))

---

## Architecture Overview

```
GitHub Issues
     │
     ▼
KEDA External Scaler ──── Squad KEDA ScaledObject
                               │
                               ▼
                    ┌────────────────────────┐
                    │  squad-agent Deployment │
                    │  • Workload Identity    │
                    │  • CSI Secrets Driver   │
                    │  • Non-root, read-only  │
                    └────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              Azure Key Vault         Azure Monitor
              (GitHub token,          (OTel traces,
               any other secrets)      container logs)
```

---

## Step 1 — AKS Prerequisites

### Enable AKS add-ons

```bash
RESOURCE_GROUP="rg-squad-prod"
CLUSTER_NAME="aks-squad-prod"
ACR_NAME="squadregistry"
KEYVAULT_NAME="squad-kv-prod"
NAMESPACE="squad"

# Enable workload identity (required for secretless auth)
az aks update \
  --name $CLUSTER_NAME \
  --resource-group $RESOURCE_GROUP \
  --enable-oidc-issuer \
  --enable-workload-identity

# Enable KEDA add-on (AKS-managed KEDA — no Helm chart required)
az aks update \
  --name $CLUSTER_NAME \
  --resource-group $RESOURCE_GROUP \
  --enable-keda

# Enable Secrets Store CSI driver add-on
az aks enable-addons \
  --name $CLUSTER_NAME \
  --resource-group $RESOURCE_GROUP \
  --addons azure-keyvault-secrets-provider

# Attach ACR for image pull without stored credentials
az aks update \
  --name $CLUSTER_NAME \
  --resource-group $RESOURCE_GROUP \
  --attach-acr $ACR_NAME

# Retrieve kubeconfig
az aks get-credentials \
  --name $CLUSTER_NAME \
  --resource-group $RESOURCE_GROUP
```

References:
- [AKS workload identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- [AKS KEDA add-on](https://learn.microsoft.com/azure/aks/keda-about)
- [AKS Secrets Store CSI driver](https://learn.microsoft.com/azure/aks/csi-secrets-store-driver)

---

## Step 2 — Workload Identity Setup

Azure Workload Identity federates a Kubernetes ServiceAccount with an Azure AD managed identity. The Squad pod gets a short-lived OIDC token automatically — no long-lived PATs stored in secrets.

```bash
OIDC_ISSUER=$(az aks show \
  --name $CLUSTER_NAME \
  --resource-group $RESOURCE_GROUP \
  --query oidcIssuerProfile.issuerUrl -o tsv)

IDENTITY_NAME="squad-agent-id"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# Create managed identity
az identity create \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP

IDENTITY_CLIENT_ID=$(az identity show \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query clientId -o tsv)

IDENTITY_OBJECT_ID=$(az identity show \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query principalId -o tsv)

# Kubernetes namespace and service account
kubectl create namespace $NAMESPACE

kubectl create serviceaccount squad-agent \
  --namespace $NAMESPACE

# Annotate the service account with the managed identity client ID
kubectl annotate serviceaccount squad-agent \
  --namespace $NAMESPACE \
  azure.workload.identity/client-id=$IDENTITY_CLIENT_ID

# Federated credential — links the K8s ServiceAccount to the Azure identity
az identity federated-credential create \
  --name squad-agent-fedcred \
  --identity-name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --issuer $OIDC_ISSUER \
  --subject "system:serviceaccount:${NAMESPACE}:squad-agent" \
  --audience api://AzureADTokenExchange
```

Reference: [Use Azure workload identity with AKS](https://learn.microsoft.com/azure/aks/workload-identity-deploy-cluster)

---

## Step 3 — Key Vault and Secrets

```bash
# Create Key Vault
az keyvault create \
  --name $KEYVAULT_NAME \
  --resource-group $RESOURCE_GROUP \
  --enable-rbac-authorization true

KV_ID=$(az keyvault show --name $KEYVAULT_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)

# Grant managed identity read access to secrets
az role assignment create \
  --assignee-object-id $IDENTITY_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope $KV_ID

# Store GitHub token
az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name github-token \
  --value "<your-github-token>"
```

### SecretProviderClass

Create a `SecretProviderClass` to mount the Key Vault secret into the pod:

```yaml
# squad-secret-provider.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: squad-keyvault-secrets
  namespace: squad
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    clientID: "<IDENTITY_CLIENT_ID>"        # from Step 2
    keyvaultName: "<KEYVAULT_NAME>"
    objects: |
      array:
        - |
          objectName: github-token
          objectType: secret
          objectVersion: ""
    tenantID: "<TENANT_ID>"
  # Sync as a Kubernetes Secret so it can be injected as an env var
  secretObjects:
    - secretName: squad-github-token
      type: Opaque
      data:
        - objectName: github-token
          key: token
```

```bash
kubectl apply -f squad-secret-provider.yaml
```

Reference: [Use the Secrets Store CSI Driver with AKS](https://learn.microsoft.com/azure/aks/csi-secrets-store-driver)

---

## Step 4 — ConfigMap for Squad Config

Bake the `.squad/` configuration into a ConfigMap so it can be volume-mounted into pods without rebuilding the image on every config change.

```bash
# Create ConfigMap from your .squad/ directory
kubectl create configmap squad-config \
  --namespace $NAMESPACE \
  --from-file=team.md=./.squad/team.md \
  --from-file=routing.md=./.squad/routing.md \
  --from-file=config.json=./.squad/config.json
```

> The ConfigMap covers static config files. Dynamic state (decisions, histories, etc.) should use the orphan or two-layer state backend rather than a ConfigMap, which does not support concurrent writes. See [State Backends](/squad/docs/features/state-backends/).

---

## Step 5 — Deployment YAML

```yaml
# squad-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: squad-agent
  namespace: squad
  labels:
    app: squad-agent
spec:
  replicas: 1          # KEDA will manage this; start at 1 for warmup
  selector:
    matchLabels:
      app: squad-agent
  template:
    metadata:
      labels:
        app: squad-agent
        azure.workload.identity/use: "true"   # required for workload identity
    spec:
      serviceAccountName: squad-agent         # from Step 2
      terminationGracePeriodSeconds: 60       # allow Squad to drain in-flight work

      securityContext:
        runAsNonRoot: true
        runAsUser: 1001                        # matches non-root user in Dockerfile
        runAsGroup: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault

      containers:
        - name: squad-agent
          image: <ACR_NAME>.azurecr.io/squad-agent:latest
          imagePullPolicy: Always

          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "1Gi"

          env:
            - name: GITHUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: squad-github-token   # synced by SecretProviderClass
                  key: token

            - name: SQUAD_DEPLOYMENT_MODE
              value: "squad-per-pod"

            - name: SQUAD_POD_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name   # unique per pod replica

            - name: SQUAD_HEALTH_PORT
              value: "3000"

            - name: SQUAD_STATE_ROOT_DIR
              value: "/app/.squad"           # workaround for #1555

            # Optional — OpenTelemetry
            # - name: OTEL_EXPORTER_OTLP_ENDPOINT
            #   value: "http://otel-collector.monitoring:4317"
            # - name: OTEL_SERVICE_NAME
            #   value: "squad-agent"

          ports:
            - containerPort: 3000
              name: health

          livenessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 30
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /readyz
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3

          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false    # Squad writes state to /app/.squad
            capabilities:
              drop: ["ALL"]

          volumeMounts:
            # CSI secret volume (required even if using secretObjects sync)
            - name: secrets-store
              mountPath: "/mnt/secrets"
              readOnly: true
            # Squad config from ConfigMap
            - name: squad-config
              mountPath: /app/.squad/team.md
              subPath: team.md
            - name: squad-config
              mountPath: /app/.squad/routing.md
              subPath: routing.md
            - name: squad-config
              mountPath: /app/.squad/config.json
              subPath: config.json

      volumes:
        - name: secrets-store
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: squad-keyvault-secrets
        - name: squad-config
          configMap:
            name: squad-config
```

```bash
kubectl apply -f squad-deployment.yaml
kubectl rollout status deployment/squad-agent --namespace $NAMESPACE
```

---

## Step 6 — KEDA ScaledObject

Scale Squad based on GitHub issue queue depth using the Squad external scaler. See [KEDA Autoscaling](/squad/docs/features/keda-scaling/) for scaler configuration details.

First, deploy the Squad external scaler:

```bash
helm repo add kedacore https://kedacore.github.io/charts
# If using AKS KEDA add-on, skip the helm install below
# helm install keda kedacore/keda --namespace keda --create-namespace

kubectl apply -f templates/keda/scaler-deployment.yaml  # from Squad repo
```

Then apply the ScaledObject:

```yaml
# squad-scaledobject.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: squad-agents
  namespace: squad
spec:
  scaleTargetRef:
    name: squad-agent-deployment
  minReplicaCount: 0    # scale to zero when no work
  maxReplicaCount: 10
  pollingInterval: 30   # seconds between queue depth checks
  cooldownPeriod: 300   # seconds to wait before scaling down
  triggers:
    - type: external
      metadata:
        scalerAddress: squad-external-scaler.squad:8080
        owner: <your-org>
        repo: <your-repo>
        labels: "squad:ready"
        targetQueueLength: "5"   # issues per replica
      authenticationRef:
        name: squad-scaler-auth
---
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: squad-scaler-auth
  namespace: squad
spec:
  secretTargetRef:
    - parameter: personalAccessToken
      name: squad-github-token
      key: token
```

```bash
kubectl apply -f squad-scaledobject.yaml
kubectl get scaledobject -n squad
```

Reference: [KEDA + AKS workload identity](https://learn.microsoft.com/azure/aks/keda-workload-identity)

---

## Step 7 — Persistent Volume for State (Optional)

For durable state across pod restarts without using the orphan Git backend, mount an Azure Disk or Azure Files PVC:

```yaml
# squad-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: squad-state-pvc
  namespace: squad
spec:
  accessModes:
    - ReadWriteOnce   # use ReadWriteMany (Azure Files) for multi-replica
  storageClassName: managed-csi-premium
  resources:
    requests:
      storage: 5Gi
```

Add to `squad-deployment.yaml` volumes and volumeMounts:

```yaml
# In spec.volumes:
- name: squad-state
  persistentVolumeClaim:
    claimName: squad-state-pvc

# In containers[].volumeMounts:
- name: squad-state
  mountPath: /app/.squad/state
```

> ⚠️ **Multi-replica write safety:** `ReadWriteOnce` (Azure Disk) only supports one writer pod at a time. For multiple replicas, use `ReadWriteMany` with an Azure Files storage class, **and** switch to the orphan or two-layer state backend. See [#1402](https://github.com/bradygaster/squad/issues/1402).

---

## Upgrade Strategy

```bash
# Build and push new image
az acr build \
  --registry $ACR_NAME \
  --image squad-agent:v<new-version> \
  --file Dockerfile \
  .

# Rolling update (zero-downtime by default with RollingUpdate strategy)
kubectl set image deployment/squad-agent \
  squad-agent=<ACR_NAME>.azurecr.io/squad-agent:v<new-version> \
  --namespace $NAMESPACE

kubectl rollout status deployment/squad-agent --namespace $NAMESPACE

# Rollback if needed
kubectl rollout undo deployment/squad-agent --namespace $NAMESPACE
```

---

## Troubleshooting

### OOMKilled — pod restarts with exit code 137

**Symptom:** `kubectl describe pod <pod> -n squad` shows `OOMKilled`; `kubectl get events -n squad` shows memory limit exceeded.

```bash
# Check current resource usage
kubectl top pods --namespace $NAMESPACE

# Check recent events
kubectl get events --namespace $NAMESPACE --sort-by='.lastTimestamp'
```

**Fix:** Increase `resources.limits.memory`. Start at `1Gi`; agent runs processing large repos or many parallel tools may need `2Gi+`.

---

### KEDA not firing — replicas stay at 0

**Symptom:** Issues are labeled `squad:ready` but `kubectl get scaledobject -n squad` shows `READY=false` or `ACTIVE=false`.

```bash
# Check ScaledObject status
kubectl describe scaledobject squad-agents --namespace $NAMESPACE

# Check KEDA operator logs
kubectl logs -l app=keda-operator --namespace keda --tail=100

# Check external scaler logs
kubectl logs -l app=squad-external-scaler --namespace $NAMESPACE --tail=50
```

Common causes:
- External scaler pod is not running (`kubectl get pods -n $NAMESPACE`)
- `personalAccessToken` in `TriggerAuthentication` is invalid or rate-limited
- `owner`/`repo`/`labels` in ScaledObject metadata don't match your repository
- ScaledObject was created before the target Deployment existed

---

### GitHub API 401 — unauthorized

**Symptom:** Squad logs `401 Unauthorized` when calling the GitHub API; no issues are processed.

```bash
# Exec into the pod to test the token
kubectl exec -it <pod-name> --namespace $NAMESPACE -- \
  wget -qO- --header="Authorization: Bearer $(cat /mnt/secrets/github-token)" \
  https://api.github.com/user

# Verify the CSI secret mount
kubectl exec -it <pod-name> --namespace $NAMESPACE -- \
  ls /mnt/secrets/
```

Common causes:
- The managed identity does not have `Key Vault Secrets User` on the vault
- Federated credential subject does not match `system:serviceaccount:<namespace>:<sa-name>` exactly
- The pod is not labeled `azure.workload.identity/use: "true"`
- The ServiceAccount annotation `azure.workload.identity/client-id` is missing or wrong

Reference: [Troubleshoot workload identity in AKS](https://learn.microsoft.com/azure/aks/workload-identity-overview#troubleshoot)

---

### State backend contention — multiple pods stepping on each other

**Symptom:** Duplicate issue processing; corrupted state files; agent history entries missing or overwritten.

```bash
# Check how many replicas are running
kubectl get pods --namespace $NAMESPACE --selector app=squad-agent

# Check which state backend is configured
kubectl exec -it <pod-name> --namespace $NAMESPACE -- \
  cat /app/.squad/config.json | grep stateBackend
```

**Fix:** Switch to the `orphan` or `two-layer` state backend, which uses Git-native structures safe for concurrent access. See [State Backends](/squad/docs/features/state-backends/) and open issue [#1402](https://github.com/bradygaster/squad/issues/1402).

The `local` (file-based) backend is **not safe** for multi-replica deployments.

---

### Pod stuck in Pending — image pull failure

**Symptom:** `kubectl describe pod <pod>` shows `ErrImagePull` or `ImagePullBackOff`.

```bash
kubectl describe pod <pod-name> --namespace $NAMESPACE | grep -A 10 Events
```

Common causes:
- ACR not attached to the cluster: `az aks update --attach-acr $ACR_NAME --name $CLUSTER_NAME --resource-group $RESOURCE_GROUP`
- Image tag or name typo in the Deployment spec
- ACR is in a different subscription than the AKS cluster — requires explicit role assignment

---

## State Backend Warning

> ⚠️ The `local` state backend (default) is **not safe for concurrent writes** from multiple Squad pods. The orphan-branch state backend uses a dedicated Git branch (`squad-state`) that is safe for multi-replica deployments because commits serialize writes. The two-layer backend further separates immutable assets from mutable state for better concurrency. Use one of these backends when scaling beyond a single replica.
>
> See [State Backends](/squad/docs/features/state-backends/) and [#1402](https://github.com/bradygaster/squad/issues/1402) for details and planned improvements.

---

## Current Limitations and Future Work

| Feature | Status |
|---|---|
| Remote dispatch (`--remote` flag for webhook-triggered runs) | RFC — [#1189](https://github.com/bradygaster/squad/issues/1189) |
| External state backend safety for multi-replica writes | Design — [#1402](https://github.com/bradygaster/squad/issues/1402) |
| FSStorageProvider rootDir bug (set `SQUAD_STATE_ROOT_DIR` as workaround) | Open — [#1555](https://github.com/bradygaster/squad/issues/1555) |
| Helm chart for Squad (community request) | Not planned in this issue — contributions welcome |

---

## Further Reading

- [AKS workload identity overview](https://learn.microsoft.com/azure/aks/workload-identity-overview) — Microsoft Learn
- [KEDA with AKS and workload identity](https://learn.microsoft.com/azure/aks/keda-workload-identity) — Microsoft Learn
- [Secrets Store CSI Driver with AKS](https://learn.microsoft.com/azure/aks/csi-secrets-store-driver) — Microsoft Learn
- [AKS security concepts](https://learn.microsoft.com/azure/aks/concepts-security) — Microsoft Learn
- *Scaling AI Agents on Kubernetes with KEDA and Workload Identity* — Tamir Dresher, March 2026. Describes a reference deployment pattern for AI agent fleets on AKS using Helm, KEDA ScaledObjects, and Azure Workload Identity federation. The Squad configuration and KEDA trigger patterns in this runbook are informed by and consistent with that approach. [tamirdresher.com/blog/2026/03/26/scaling-ai-part8-pathfinder](https://www.tamirdresher.com/blog/2026/03/26/scaling-ai-part8-pathfinder)
- [squad-on-aks reference repository](https://github.com/tamirdresher/squad-on-aks) — Tamir Dresher's Helm + KEDA + Workload Identity reference repo, demonstrating the full deployment topology this runbook is based on.
- [Container Image contract](/squad/docs/reference/container-image/) — environment variables, Dockerfile, health endpoints
- [KEDA Autoscaling](/squad/docs/features/keda-scaling/) — Squad KEDA ScaledObject configuration
- [Dual-Mode Deployment](/squad/docs/features/dual-mode-deployment/) — `SQUAD_DEPLOYMENT_MODE` and `SQUAD_POD_ID`
- [State Backends](/squad/docs/features/state-backends/) — choosing and migrating state backends
