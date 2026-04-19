# Decision: CLI SDK Local Compatibility Barrel

**Date:** 2026-04-19T19:44:18.986+05:30
**Author:** CONTROL

## Context

`packages/squad-cli` was importing newer SDK symbols that exist in the workspace SDK build, but the installed `@bradygaster/squad-sdk` package available to the CLI build and runtime still exposed an older root export surface. This blocked `tsc` and broke the Ralph/watch startup path before the command could run.

## Decision

Add `packages/squad-cli/src/cli/sdk-local.ts` as a CLI-scoped compatibility barrel. Route missing SDK symbols through sibling `packages/squad-sdk/dist/` entrypoints, and update CLI imports for the affected symbols to use that local barrel instead of the published root barrel.

## Why

- Keeps the fix surgical and TypeScript-focused.
- Restores CLI build and runtime without broad runtime refactors.
- Works in the monorepo and in scoped package installs where `@bradygaster/squad-cli` and `@bradygaster/squad-sdk` sit side-by-side under the same scope.

## Follow-up

Once the published SDK barrel/export map is refreshed, the compatibility barrel can be reduced or removed in favor of direct package imports again.
