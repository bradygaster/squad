---
'@bradygaster/squad-sdk': minor
---

Add dual-mode deployment support for capabilities routing.

New features:
- `SQUAD_POD_ID` env var for pod-specific capability manifests
- `SQUAD_DEPLOYMENT_MODE` env var (`agent-per-node` | `squad-per-pod`)
- Pod-specific manifest loading: `.squad/machine-capabilities-{podId}.json`
- Fallback chain: pod-specific → shared → user-home → null (opt-in)
- New exports: `getDeploymentMode()`, `getPodId()`, `DeploymentMode` type
