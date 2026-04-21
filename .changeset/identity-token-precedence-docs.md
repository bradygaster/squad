---
"@bradygaster/squad-cli": patch
---

Docs: document GITHUB_TOKEN vs GH_TOKEN precedence (H-13) and remove unused test import

- Add `docs/identity/token-precedence.md` explaining how Squad agents choose between GITHUB_TOKEN and GH_TOKEN environment variables, with decision tables and troubleshooting
- Remove unused `withRetry` import from `test/identity/retry.test.ts` (PR #23 review nit)
