---
"@bradygaster/squad-cli": patch
---

Remove the dangling `./shell/sdk-bridge` subpath export: it pointed at `dist/cli/shell/sdk-bridge.js`, a module that does not exist in the package, so importing it failed with `ERR_MODULE_NOT_FOUND`. A new test (`test/package-exports-targets.test.ts`) verifies every `exports` target of both packages exists in the built `dist/`.
