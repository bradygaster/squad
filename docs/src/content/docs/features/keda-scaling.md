---
title: KEDA Autoscaling
description: Autoscale Squad agents based on GitHub issue queue depth using the KEDA external scaler template.
order: 38
---

# KEDA Autoscaling

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to understand your scaling needs:**
```
How many issues are currently queued for Squad agents?
```

KEDA (Kubernetes Event-Driven Autoscaling) is an open-source component that scales Kubernetes workloads based on external event sources. Squad ships an external scaler template that scales agent pods up and down based on the depth of your GitHub issue queue.

---

## When to Use This

Use KEDA autoscaling when:

- Squad agents run as Kubernetes pods (not local machines)
- Issue volume is unpredictable — bursts of work should spawn more agents automatically
- You want zero-agent idle cost when there is no work

## Prerequisites

- A Kubernetes cluster with KEDA installed ([keda.sh](https://keda.sh))
- Squad agents packaged as container images and deployed as a `Deployment`
- A GitHub token with `repo` scope for issue queue polling

## Setup

1. Install KEDA on your cluster:
   ```bash
   helm repo add kedacore https://kedacore.github.io/charts
   helm install keda kedacore/keda --namespace keda --create-namespace
   ```

2. Apply the Squad KEDA `ScaledObject` template from `templates/keda/scaled-object.yaml`:
   ```yaml
   apiVersion: keda.sh/v1alpha1
   kind: ScaledObject
   metadata:
     name: squad-agents
   spec:
     scaleTargetRef:
       name: squad-agent-deployment
     minReplicaCount: 0
     maxReplicaCount: 10
     triggers:
       - type: external
         metadata:
           scalerAddress: squad-external-scaler:8080
           owner: your-org
           repo: your-repo
           labels: "squad:ready"
           targetQueueLength: "5"
         authenticationRef:
           name: github-token-secret
   ```

3. Create the GitHub token secret:
   ```bash
   kubectl create secret generic github-token-secret \
     --from-literal=personalAccessToken=<your-token>
   ```

## Configuration Reference

| Field | Description |
|-------|-------------|
| `minReplicaCount` | Agents to keep running when idle (use `0` for zero-cost idle) |
| `maxReplicaCount` | Hard ceiling on agent pods |
| `targetQueueLength` | Issues per agent pod (tune for task duration) |
| `labels` | Issue labels to count as "queued work" |

## See Also

- [Capability Routing](capability-routing.md) — route specific issues to specific agent types
- [Ralph — Work Monitor](ralph.md) — how Ralph picks up queued issues
