# Machine Capability Discovery & Label-Based Routing

> Enable Ralph to skip issues requiring capabilities the current machine lacks.

## Overview

When running Squad across multiple machines (laptops, DevBoxes, GPU servers, Kubernetes nodes), each machine has different tooling. The capability system lets you declare what each machine can do, and Ralph automatically routes work accordingly.

## Setup

### 1. Create a Capabilities Manifest

Create `~/.squad/machine-capabilities.json` (user-wide) or `.squad/machine-capabilities.json` (project-local):

```json
{
  "machine": "MY-LAPTOP",
  "capabilities": ["browser", "personal-gh", "onedrive"],
  "missing": ["gpu", "docker", "azure-speech"],
  "lastUpdated": "2026-03-22T00:00:00Z"
}
```

### 2. Label Issues with Requirements

Add `needs:*` labels to issues that require specific capabilities:

| Label | Meaning |
|-------|---------|
| `needs:browser` | Requires Playwright / browser automation |
| `needs:gpu` | Requires NVIDIA GPU |
| `needs:personal-gh` | Requires personal GitHub account |
| `needs:emu-gh` | Requires Enterprise Managed User account |
| `needs:azure-cli` | Requires authenticated Azure CLI |
| `needs:docker` | Requires Docker daemon |
| `needs:onedrive` | Requires OneDrive sync |
| `needs:teams-mcp` | Requires Teams MCP tools |

Custom capabilities are supported — any `needs:X` label works if `X` is in the machine's `capabilities` array.

### 3. Run Ralph

```bash
squad watch --interval 5
```

Ralph will log skipped issues:
```
⏭️ Skipping #42 "Train ML model" — missing: gpu
✓ Triaged #43 "Fix CSS layout" → Picard (routing-rule)
```

## How It Works

1. Ralph loads `machine-capabilities.json` at startup
2. For each open issue, Ralph extracts `needs:*` labels
3. If any required capability is missing, the issue is skipped
4. Issues without `needs:*` labels are always processed (opt-in system)

## Kubernetes Integration

Machine capabilities support two deployment modes on Kubernetes:

### Mode A — Agent-per-node (default)

One Ralph process per Kubernetes node. Each reads the node-local `machine-capabilities.json`. Use `nodeSelector` to pin Ralphs to nodes with the right hardware.

```yaml
# Node labels (set by capability DaemonSet or manually)
node.squad.dev/gpu: "true"
node.squad.dev/browser: "true"

# Pod spec uses nodeSelector
spec:
  nodeSelector:
    node.squad.dev/gpu: "true"
```

No extra environment variables needed — this is the default mode.

### Mode B — Squad-per-pod

Multiple full Squad instances run as separate pods (on the same or different nodes). Each pod gets its own identity via the `SQUAD_POD_ID` environment variable, which enables pod-specific capability manifests.

```yaml
# Deployment spec for squad-per-pod mode
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: squad
          env:
            - name: SQUAD_POD_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: SQUAD_DEPLOYMENT_MODE
              value: squad-per-pod
```

When `SQUAD_POD_ID` is set and `SQUAD_DEPLOYMENT_MODE` is `squad-per-pod`, Ralph looks for a pod-specific manifest first:

1. `.squad/machine-capabilities-{podId}.json` (pod-specific)
2. `.squad/machine-capabilities.json` (shared fallback)
3. `~/.squad/machine-capabilities.json` (user home fallback)
4. `null` (opt-in — all issues pass through)

Example pod-specific manifest (`.squad/machine-capabilities-squad-worker-7b4f6.json`):

```json
{
  "machine": "squad-worker-7b4f6",
  "capabilities": ["gpu", "docker", "azure-cli"],
  "missing": ["browser", "onedrive"],
  "lastUpdated": "2026-06-01T00:00:00Z",
  "podId": "squad-worker-7b4f6"
}
```

A DaemonSet can run capability discovery on each node and maintain labels automatically. See the [squad-on-aks](https://github.com/tamirdresher/squad-on-aks) project for a complete Kubernetes deployment example.