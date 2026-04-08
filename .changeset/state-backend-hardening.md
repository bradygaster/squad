---
'@bradygaster/squad-sdk': patch
---

State backend hardening: retry with exponential backoff for transient git errors, circuit-breaker to prevent cascading failures, read-only startup verification, and observable error surfacing replacing silent swallowing.
