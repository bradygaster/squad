---
"@bradygaster/squad-cli": patch
---

Fix two upgrade-pipeline gaps from #1190: the postinstall ESM patcher now patches every search root instead of stopping at the first already-patched copy, and `squad upgrade` re-runs it against the repo-local node_modules so globally-installed CLIs no longer leave the consumer repo's vscode-jsonrpc/copilot-sdk unpatched. `squad doctor` now also verifies the pre-commit/post-commit hooks required by the two-layer/orphan state backends, instead of only the four sync hooks.
