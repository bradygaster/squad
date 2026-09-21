---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Publish and validate a versioned producer-owned agent identity provenance
contract with stable IDs, rename preservation, retirement tombstones, and
optional repository avatar references. Activation artifacts now carry a
versioned repository-scoped work-to-agent binding linked to the exact registry
revision, with explicit fail-closed omission, cross-row reconciliation, and
stale-data semantics. Preset and CLI Cast registry updates now share an
ABA-safe directory lock, and registry/history publication uses a durable
manifest-backed roll-forward transaction plus a consistency-aware pair reader.
Interrupted post-journal commits never roll back, while abandoned same-host
locks recover only after the owner PID is definitively dead. These protocols
provide process-crash consistency on filesystems with local atomic rename;
power-loss durability additionally depends on successful file and parent
directory fsync and the underlying platform and filesystem semantics.
