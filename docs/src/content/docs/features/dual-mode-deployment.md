---
title: Dual-Mode Deployment — Pod-Aware Capabilities
description: Run Squad in either agent-per-node or squad-per-pod deployment modes with pod-specific machine capability manifests, controlled by SQUAD_POD_ID and SQUAD_DEPLOYMENT_MODE env vars.
---

# Dual-Mode Deployment — Pod-Aware Capabilities

Dual-mode deployment extends [Capability Routing](/squad/docs/features/capability-routing/) to support both classic single-machine setups and modern containerized/Kubernetes deployments where multiple Squad pods may share an organization's workload — each with potentially different machine capabilities.

It introduces two environment variables and a pod-specific manifest lookup pattern so the same Squad config can run identically in either deployment shape.

---

## The two deployment modes

| Mode | What it means | Capability manifest |
|------|---------------|---------------------|
| **`agent-per-node`** (default) | One Squad instance per machine; the machine's capabilities are the squad's capabilities | `.squad/machine-capabilities.json` (shared) |
| **`squad-per-pod`** | Multiple Squad pods may run on different machines/containers, each with potentially different capabilities | `.squad/machine-capabilities-{podId}.json` (pod-specific) with fallback chain |

Choose the mode via the `SQUAD_DEPLOYMENT_MODE` environment variable:

```bash
# Classic single-machine setup (default)
export SQUAD_DEPLOYMENT_MODE=agent-per-node

# Kubernetes / multi-pod setup
export SQUAD_DEPLOYMENT_MODE=squad-per-pod
export SQUAD_POD_ID=worker-1
```

If neither is set, the SDK defaults to `agent-per-node` for backward compatibility.

---

## Environment variables

### `SQUAD_DEPLOYMENT_MODE`

| Value | Behavior |
|-------|----------|
| `agent-per-node` | Single shared `machine-capabilities.json` |
| `squad-per-pod` | Pod-specific manifests with fallback chain |
| (unset) | Same as `agent-per-node` |

### `SQUAD_POD_ID`

Pod identifier used to construct the pod-specific manifest path. Required when `SQUAD_DEPLOYMENT_MODE=squad-per-pod`; ignored otherwise.

```bash
SQUAD_POD_ID=worker-1          # → .squad/machine-capabilities-worker-1.json
SQUAD_POD_ID=gpu-pool-node-3   # → .squad/machine-capabilities-gpu-pool-node-3.json
```

---

## The fallback chain (squad-per-pod mode)

When `SQUAD_DEPLOYMENT_MODE=squad-per-pod` AND `SQUAD_POD_ID` is set, the SDK looks up capabilities in this order:

1. **`.squad/machine-capabilities-{podId}.json`** — pod-specific (highest priority)
2. **`.squad/machine-capabilities.json`** — shared fallback for capabilities that apply to all pods
3. **`~/.squad/machine-capabilities.json`** — user-home fallback (rarely useful in container deployments)
4. **`null`** — opt-out; capability routing falls back to label-only routing

The first manifest that exists is loaded; the search stops there (no merging). If you need different pods to see different capability sets, give each its own pod-specific file. If you need a shared baseline plus pod-specific additions, merge at the deployment-config level (Helm, Kustomize, etc.) — the SDK doesn't merge automatically.

---

## SDK programmatic access

The new exports from `@bradygaster/squad-sdk/ralph/capabilities`:

```typescript
import {
  getDeploymentMode,
  getPodId,
  type DeploymentMode,
} from '@bradygaster/squad-sdk/ralph/capabilities';

const mode: DeploymentMode = getDeploymentMode();  // 'agent-per-node' | 'squad-per-pod'
const podId: string | undefined = getPodId();       // e.g. 'worker-1', or undefined
```

These are pure env-var readers. They don't cache or memoize — each call reads `process.env` directly so changes between reads are visible.

---

## Typical Kubernetes deployment shape

In a KEDA-scaled deployment (see [KEDA Scaling](/squad/docs/features/keda-scaling/)), each scaled pod gets a unique `SQUAD_POD_ID` from the pod's name or hash:

```yaml
# Deployment env block
env:
  - name: SQUAD_DEPLOYMENT_MODE
    value: squad-per-pod
  - name: SQUAD_POD_ID
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
```

The pod's mounted volume contains per-pod manifests baked in by the image build or pulled from a ConfigMap, e.g.:

```
/app/.squad/
├── machine-capabilities.json           # shared baseline (CPU, memory)
├── machine-capabilities-gpu-pool-node-1.json   # extends baseline with GPU
├── machine-capabilities-gpu-pool-node-2.json   # same shape
└── machine-capabilities-cpu-pool-node-1.json   # no GPU declaration
```

Pods scheduled onto GPU nodes load a manifest declaring GPU capability; pods on CPU-only nodes get a manifest without GPU. Ralph's issue dispatcher routes `needs:gpu`-labeled work only to pods with the GPU capability.

---

## Limitations

- **No automatic pod discovery.** The SDK reads env vars to know who it is; it doesn't enumerate sibling pods or coordinate work distribution. That's the deployment orchestrator's job (KEDA, scheduler).
- **No central capability registry.** Pods don't publish their capabilities back to anything; each pod evaluates issues against its own loaded manifest independently. If you need a central view, your orchestrator must aggregate.
- **Manifest changes require redeploy or restart.** The fallback lookup happens on capability resolution; manifest content is read from disk each time but the manifest *path* is decided by env vars set at process start.

---

## See also

- [Capability Routing](/squad/docs/features/capability-routing/) — the broader machine-capability system
- [KEDA Scaling](/squad/docs/features/keda-scaling/) — autoscaling Squad pods on demand
- [Labels](/squad/docs/features/labels/) — `needs:*` label conventions used for capability matching
