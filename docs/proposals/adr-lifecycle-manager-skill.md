# Proposal: ADR Lifecycle Manager Skill

**Author:** Squad
**Date:** 2026-07-29
**Status:** Proposal

---

## Problem Statement

Squad routes architecture decisions to its lead/architect role, but it does not ship a reusable procedure for creating, accepting, amending, deprecating, superseding, or auditing architecture decision records. Teams must recreate ADR lifecycle rules in prompts or apply them inconsistently.

## Proposed Approach

Ship `adr-lifecycle-manager` as a manifest-curated built-in skill. Keep the skill in `.squad/skills/` as the canonical source, synchronize it to the CLI and SDK template packages, and install it at `.github/skills/adr-lifecycle-manager/SKILL.md` during init and upgrade.

Use the existing skill metadata contract:

- `domain: architecture, governance`
- ADR lifecycle trigger phrases
- `roles: [lead, architect]`

The existing skill registry then adds role affinity for architecture agents without new coordinator wiring or runtime behavior.

## Fit with Existing Architecture

- Procedures owns the skill and prompt contract.
- Flight owns architecture governance and proposal review.
- `TEMPLATE_MANIFEST` remains the CLI init/upgrade manifest.
- `MANIFEST_SKILL_NAMES` remains the SDK init manifest.
- `scripts/sync-skill-templates.mjs` remains the canonical distribution path.

## What Changes

- Add the canonical ADR lifecycle skill under `.squad/skills/`.
- Register the skill in CLI and SDK manifests.
- Synchronize the CLI and SDK template packages.
- Add tests for manifest registration, template presence, and lead/architect role affinity.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| CLI and SDK manifests drift | Test both manifests and use the existing sync tool. |
| Skill is installed but never selected | Parse the shipped template and assert ADR trigger plus architecture-role affinity. |
| Repository-specific ADR conventions differ | The skill discovers local ADR directories/templates and asks before scaffolding ambiguous layouts. |

## Out of Scope

- Changing ADR file formats in existing repositories.
- Adding a new architecture role or coordinator routing mechanism.
- Automatically accepting ADRs before their triggering change is merged.