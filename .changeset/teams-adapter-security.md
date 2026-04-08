---
'@bradygaster/squad-sdk': patch
---

Teams adapter token security: tenant-scoped token cache (keyed by tenant ID hash), explicit revoke() for logout, 15-minute device-code timeout guard, stale token cleanup on permanent auth errors, per-instance user ID cache. Migration guide for async createCommunicationAdapter change.
