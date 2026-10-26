---
"@bradygaster/squad-sdk": patch
---

Governed memory search no longer fails when `externalProviders.hostInjectedCopilotAdapter` is enabled but no host-injected client is supplied, or when that client's search throws. Search skips the adapter, records a content-free `provider-error` audit entry and returns local results, so `memory.search` and `squad memory search` keep working.
