---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Publish and validate a versioned producer-owned agent identity provenance
contract with stable IDs, rename preservation, retirement tombstones, and
optional repository avatar references. Activation artifacts now carry a
versioned repository-scoped work-to-agent binding linked to the exact registry
revision, with explicit fail-closed omission, cross-row reconciliation, and
stale-data semantics. Preset registry updates are serialized and atomically
committed with their matching history snapshots, recover abandoned same-host
locks only after proving the owner is dead, and roll forward or back from
interrupted commits without losing monotonic revisions or history.
