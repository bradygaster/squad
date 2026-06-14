---
"@bradygaster/squad-cli": patch
---

fix: release pipeline version pinning (#1203, #1204)

- Lower SDK dependency floor from `>=0.10.0` to `>=0.9.0` so the CLI tarball
  resolves against the last published SDK when the current version isn't yet on
  the registry.
- Add `isLocalOrUnpublishedVersion` guard to `buildMcpServerSpecs` so local dev
  builds and versions with build metadata (`+`) fall back to `@insider` instead
  of writing an unresolvable version string into MCP config.
- Extend `resolveSquadStateMcpSpec` to short-circuit for build-metadata versions.
- Add CI step to verify SDK dependency is resolvable before publishing the CLI.
