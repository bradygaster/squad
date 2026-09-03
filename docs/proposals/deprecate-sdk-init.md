# Proposal: Deprecate SDK-First Initialization

> **Authors:** Brady Gaster and Tamir Dresher
> **Date:** 2026-09-01
> **Status:** Accepted
> **Goal:** Make markdown-first configuration the single recommended authoring model before v2.

## Decision

Deprecate `squad init --sdk` immediately and remove it in v2. Keep the flag functional during the transition, but print a warning and stop recommending it for new teams.

Existing `squad.config.ts` projects retain `squad build` compatibility during the transition.
This decision deprecates the file-authoring mode, not the programmatic `@bradygaster/squad-sdk` APIs.

## Rationale

The SDK-first builder schema and `squad build` generator represent only a subset of current Squad behavior. Maintaining parity requires two competing configuration models and weakens Squad's portable, CLI-independent markdown model.

## Compatibility

- `squad init --sdk` continues to generate `squad.config.ts` until v2.
- Existing `squad.config.ts` projects can continue using `squad build`.
- Default `squad init` behavior is unchanged.
- User-facing help and documentation identify SDK-first initialization as deprecated.
