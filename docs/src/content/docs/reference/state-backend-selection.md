---
title: State Backend Selection
description: Decision matrix for choosing a Squad state backend in containerized and multi-replica deployments — single-pod, multi-pod, PVC, and external state options with write-contention warnings.
order: 15
---

# State Backend Selection

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> 🔗 **Full backend documentation:** [State Backends](/squad/docs/features/state-backends/) · [Container Image — Env Var Contract](/squad/docs/reference/container-image/) · [#1402](https://github.com/bradygaster/squad/issues/1402) (external state gaps — tracked separately)

---

## Decision matrix

Choose a backend based on your deployment shape:

| Deployment shape | Recommended backend | Notes |
|---|---|---|
| **Local developer machine** (single user, local clone) | `local` (default) | Files in `.squad/`. Simple, no Git overhead. Acceptable branch-switch risk on dev machines. |
| **Single pod — stateless replica** (container, no PVC) | `local` + PVC mount | Mount a Kubernetes PersistentVolumeClaim (or Azure Files share) at `/app/.squad/` so state survives pod restarts. Without a volume, state is lost on every restart. |
| **Single pod — with Git access** (container, Git available) | `two-layer` | Uses the `squad-state` orphan branch. Safe for a single writer; state persists across restarts if the branch is pushed. |
| **Multi-pod (horizontal scale, concurrent writers)** | **External state only** | See warning below. No built-in backend is safe for concurrent multi-pod writes. |
| **CI/CD ephemeral runner** | `local` (in-run) or `two-layer` | `local` is fine for single-run CI jobs with no cross-run state. `two-layer` if you need decisions to persist across pipeline runs. |

---

> ## ⚠️ Multi-pod write-contention warning
>
> **The `local`, `orphan`, and `two-layer` backends are all single-writer designs.**
>
> - **`local`:** Files on disk. Two pods writing to the same PVC simultaneously will corrupt state — no locking, no merge. This is data loss, not a merge conflict.
> - **`orphan` / `two-layer`:** Branch-based. The second pod to push `squad-state` gets a non-fast-forward rejection. The losing pod's state changes are silently discarded unless the operator manually resolves the conflict. Under high concurrency this causes regular state loss.
>
> **If you run more than one Squad replica at a time, you must use an external state store.** The external state backend ([#1402](https://github.com/bradygaster/squad/issues/1402)) is not yet GA — see [External State](/squad/docs/features/external-state/) for current status and workarounds.
>
> The `squad-per-pod` deployment mode (via `SQUAD_DEPLOYMENT_MODE=squad-per-pod`) assigns each pod a stable identity and partition of the issue queue — but it does not eliminate shared-state write conflicts. It reduces them by partitioning work, but does not make any built-in backend safe for concurrent writers.

---

## Configuring `local` backend with a PVC (single pod)

When running a single Squad pod in Kubernetes, mount a PVC at `/app/.squad/` to persist state across pod restarts:

```yaml
volumes:
  - name: squad-state
    persistentVolumeClaim:
      claimName: squad-state-pvc

containers:
  - name: squad-agent
    volumeMounts:
      - name: squad-state
        mountPath: /app/.squad
```

Create the PVC (Azure Disk — `ReadWriteOnce`, appropriate for a single pod):

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: squad-state-pvc
  namespace: squad
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: managed-premium
  resources:
    requests:
      storage: 1Gi
```

> **Important:** `ReadWriteOnce` (RWO) PVCs can only be mounted by a single pod at a time on most storage classes. If you scale your Deployment to more than one replica, the second pod will fail to mount the volume. Use `ReadWriteMany` (RWX) with Azure Files if you need multi-pod mounts — but this does not resolve the write-contention issue; it only allows both pods to attempt writes simultaneously, which will corrupt state.

---

## Backup and restore

### Backup

For `local` backend with a PVC, back up `/app/.squad/` to Azure Blob Storage using a CronJob:

```bash
# Example backup command (run inside the pod or a sidecar with access to the volume)
az storage blob upload-batch \
  --destination squad-state-backup \
  --source /app/.squad \
  --account-name <storage-account>
```

For `two-layer` backend, back up the `squad-state` orphan branch:

```bash
git push origin squad-state
# The remote branch IS the backup. Protect it with branch protection rules.
```

### Restore

For `local` backend:

```bash
az storage blob download-batch \
  --destination /app/.squad \
  --source squad-state-backup \
  --account-name <storage-account>
```

For `two-layer` backend:

```bash
git fetch origin squad-state:squad-state
# All state is restored from the remote branch.
```

---

## Known bug: FSStorageProvider `rootDir` (#1555)

> ⚠️ **Open bug [#1555](https://github.com/bradygaster/squad/issues/1555):** `FSStorageProvider` is constructed without a `rootDir` argument in `resolveSquadState()`. All relative state keys resolve against the Node.js process working directory (the repo root) rather than `.squad/`, silently creating a shadow state tree that diverges from the authoritative `.squad/` copy agents actually read.
>
> **There is no configuration-level workaround.** Because `FSStorageProvider` is constructed with zero arguments regardless of any user configuration, setting `rootDir` in `config.json` has no effect — the constructor call ignores it. This must be fixed in the SDK itself ([#1555](https://github.com/bradygaster/squad/issues/1555)).
>
> **Until #1555 is resolved:** Run only a single Squad replica. Avoid deployment paths where the MCP server process `cwd` differs from the volume mount path. Track [#1555](https://github.com/bradygaster/squad/issues/1555) for the fix.

---

## Multi-pod: external state (future)

The external state backend — designed to be safe for concurrent writers via a centralized, transactional store — is tracked in [#1402](https://github.com/bradygaster/squad/issues/1402). It is not yet available as a GA backend.

Until #1402 lands, the recommended mitigation for multi-pod deployments is:

1. Use KEDA autoscaling with `minReplicaCount: 0` and `maxReplicaCount: 1` — one active pod at a time for each repository. See [KEDA Autoscaling](/squad/docs/features/keda-scaling/).
2. Use `SQUAD_DEPLOYMENT_MODE=squad-per-pod` with a stable pod identity to partition the issue queue — this reduces write overlap but does not eliminate it.
3. Treat all squad state as ephemeral and regenerate it from GitHub issue history on pod restart.

See [External State](/squad/docs/features/external-state/) for current external state options.

---

## Persistence comparison

| Property | `local` (no PVC) | `local` + PVC (RWO) | `two-layer` | External state (#1402) |
|---|---|---|---|---|
| Survives pod restart | ❌ | ✅ | ✅ (if pushed) | ✅ |
| Safe for single pod | ✅ | ✅ | ✅ | ✅ |
| Safe for multi-pod | ❌ data loss | ❌ mount conflict or data loss | ❌ push conflict / data loss | ✅ (when available) |
| Backup strategy | Not needed (ephemeral) | Azure Blob / AzureBackup | Git push | Backend-native |
| Restore complexity | None | Medium | Low (git fetch) | Backend-native |
| Currently GA | ✅ | ✅ (infra work required) | ✅ | ❌ tracked in #1402 |
