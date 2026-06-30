---
"@bradygaster/squad-sdk": patch
---

Migrate OTel Resource API to `resourceFromAttributes` for compatibility with `@opentelemetry/resources` 2.x (replaces the removed `Resource` class constructor in `packages/squad-sdk/src/runtime/otel.ts` and `test/aspire-integration.test.ts`)