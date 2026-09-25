# Squad Artifact Inventory

**Document class:** Informative

**Audit date:** 2026-09-25

**Purpose:** Repository-derived traceability, profile planning, and
interoperability maturity evidence for issue #2069.

Paths in this table are Squad-root-relative. Repository-local installations
render them beneath `.squad/`.

| Surface | Repository evidence | Disposition | Specification | Maturity or promotion rationale |
|---|---|---|---|---|
| Discovery, negotiation, authority identity, shared evidence, secrets | Core/profile metadata, registry IDs, events, audit records | Experimental shared schema; no claim | Interoperability Conventions v0.1 | Evidence schema exists; discovery and negotiation need a manifest |
| Agent charter | `agents/{id}/charter.md`, compiler, validator, fixtures | Normative profile now | Charter v0.1 | Stable parser and round-trip evidence |
| Team roster | `team.md`, roster templates, presets | Requirements draft; no claim | Team and Routing v0.1 | Promote independently with roster parsing, mutation, join, and diagnostic cases |
| Routing ownership | `routing.md`, routing parser, coordinator tests | Requirements draft; no claim | Team and Routing v0.1 | Promote independently with priority, fallback, ambiguity, stale-write, and resolution cases |
| Runtime configuration | `config.json`, config schema and loaders | Requirements draft; no claim | Configuration and Casting v0.1 | Promote independently with precedence and source-evidence cases |
| Casting identity | `casting/registry.json`, `policy.json` | Requirements draft; no claim | Configuration and Casting v0.1 | Promote independently with identity, recast, join, and migration cases |
| Casting provenance | `casting/history.json` | Requirements draft; no claim | Configuration and Casting v0.1 | Promote independently with append-only history, revision, replay, and CAS cases |
| Governance and review | `governance.md`, reviewer protocol, PR requirements | Experimental evidence schema; no claim | Governance and Review v0.1 | Add complete transition manifest beyond the representative rejection fixture |
| Execution preferences | charters, config, model selector, lifecycle manager | Requirements draft; no claim | Execution Preferences v0.1 | Add provider-neutral resolution cases and loss reporting |
| PRD intake and planning | `prd-intake.md`, planning ontology, gh-aw workflows | Requirements draft; no claim | Planning and Activation v0.1 | Add portable planning-record and activation manifest |
| Ceremonies | `ceremonies.md`, ceremony reference, retro workflow | Requirements draft; no claim | Ceremony v0.1 | Normalize event vocabulary and prove cooldown with injected clocks |
| Work lifecycle | issue lifecycle template, platform interfaces, worktree tests | Requirements draft; no claim | Work Lifecycle v0.1 | Run complete transition traces against two providers |
| GitHub lifecycle | GitHub adapter, gh-aw workflows, issue/PR templates | Requirements binding draft; no claim | GitHub Work Lifecycle Binding v0.1 | Add deterministic sanitized provider transcripts |
| Handoffs and sessions | spawn reference, lifecycle manager, event buses | Requirements draft; no claim | Coordination and Handoff v0.1 | Add portable envelope, ordering, expiry, and recovery cases |
| State backends | state backend interfaces, worktree/orphan/two-layer implementations | Informative requirements now | State and Memory Requirements v0.1 | Authority and recovery vary by backend; promotion requires backend-neutral CAS fixtures |
| Memory governance | memory classes, providers, audit records | Informative requirements now | State and Memory Requirements v0.1 | Classification is promising but provider naming and durable authority are not stable |
| Automation | schedule manifest, scheduler, local and GitHub providers | Requirements draft; no claim | Automation v0.1 | Add portable trigger, clock, retry, drift, and result cases |
| Portable export/import | `squad export`, `squad import`, CLI round-trip tests | Informative observed surface; no claim | `squad-portable-bundle/v1.0` coverage below | Tested implementation exists without a published schema or conformance manifest |
| Skills | `skills/{name}/SKILL.md`, loader and discovery | Deferred | Future Skills Profile | Promote after metadata precedence, imports, script trust, and compatibility fixtures stabilize |
| Coordinator prompts and UI wording | templates, generated agent prompt, shell | Informative guidance | Implementation documentation | Prompts and wording are implementation inputs, not interoperability contracts |
| Telemetry and cost accounting | OpenTelemetry and cost modules | Deferred | Future Observability Binding | Promote after common event identity and privacy/redaction contracts stabilize |
| Communications providers | GitHub Discussions, ADO, Teams, file log adapters | Deferred provider bindings | Future Communication Bindings | Common update/reply shape exists; authorization and delivery guarantees differ materially |
| Azure DevOps and Planner lifecycle | platform adapters and issue lifecycle template | Deferred provider bindings | Future ADO and Planner Bindings | Require provider-specific fixtures for hierarchy, review, checks, and closure |
| Plugins, marketplace, MCP, and external tools | marketplace and MCP modules | Deferred extension bindings | Future Extension Discovery Profiles | Discovery, signatures, grants, and trust policy require separate security review |
| Generated capability blocks | team capability generator | Informative guidance | Implementation documentation | Reproducible output is implementation-derived, not authority |
| `.github/agents/squad.agent.md` | generated prompt and workflow installation | Informative guidance | Implementation documentation | Product integration artifact; prompts and internal algorithms remain non-normative |

## Charter conformance audit

The active repository charters demonstrate three families:

1. Specialist charters use `Identity ID`, `Identity Purpose`, and the canonical
   responsibility headings selected by Charter Profile v0.1.
2. Built-in support charters use legacy `Name`/`Role` identity fields and
   `What I Own`/`Boundaries` variants.
3. The distributed charter template uses legacy `Name`, `Role`, `Expertise`,
   `Style`, `What I Own`, `Boundaries`, and `Collaboration`.

Before this profile, the parser recognized only the third family for
responsibility sections, while the active specialists used the first. It also
parsed `Reasoning Effort` and `Context Tier`, but the charter serializer omitted
both fields. The reference implementation now recognizes canonical and legacy
aliases, preserves both behavioral fields in serialization, and exposes a
deterministic validator plus an independently declared runtime capability. The
portable conformance manifest is governed by a language-neutral JSON Schema and
covers every normative diagnostic code.

## Promotion roadmap

The v0.1 suite establishes clean boundaries rather than claiming every surface
is equally mature. The next promotion sequence is:

1. Add cross-implementation fixtures for team/config/governance evidence.
2. Prove provider-neutral work lifecycle behavior against GitHub and one
   non-GitHub binding.
3. Prove state authority, compare-and-swap, recovery, and migration across
   local, orphan-ref, and external backends before promoting state/memory.
4. Standardize skills only after discovery, imports, executable content, and
   trust policy have interoperable fixtures.
5. Add communication and observability bindings only when delivery guarantees,
   event identity, redaction, and authorization can be stated without encoding
   a single product implementation.

## Known unstable and non-conforming behavior

**Recorded:** 2026-09-25

- Current `.squad/governance.md` permits accountable-owner revision after a
  rejection; the reviewer protocol and Governance Profile require independent
  revision-author lockout.
- Current model selectors contain vendor names and fallback lists. Those are
  implementation policy and do not conform as portable preference vocabulary.
- Current ceremony conditions are natural language. They are compatible input,
  not canonical deterministic trigger definitions.
- Current state backends do not share one backend-neutral recovery and
  migration fixture set, so state/memory remains informative.
- Current GitHub adapters rely on installed `gh` behavior and do not yet expose
  API-version negotiation evidence required by the GitHub binding.
- Casting universe lists and persona names are volatile display metadata and
  must not be used as authority identity.
- Publication requires an independent reviewer for each normative profile and
  binding; this working draft supplies reviewable contracts, not publication.
- The reusable conformance dialect still needs shared document-case,
  diagnostic, transition-trace, provider-transcript, result, and security-case
  schemas before runtime or provider claims can be published.
- Column, tab, Unicode normalization, JSON duplicate-key and number handling,
  canonical JSON digests, idempotency retention, snapshot clocks, evidence
  ordering, provider transcript sanitization, partial-failure taxonomy,
  pass/fail/skip semantics, required extensions, and deprecation windows remain
  explicit publication blockers.
- The portable export/import bundle uses implementation version `1.0`, not the
  Core `vMAJOR.MINOR` profile grammar, and has no published schema. Its histories,
  decisions, skills, registry, and policy content require explicit privacy and
  secrets review before sharing.

## Portable export and import bundle

The tested CLI surface exports and imports `team.md`, `routing.md`,
`decisions.md`, casting registry/history/policy, agent charters and histories,
and skills. Local files and GitHub repository transport are implemented.

This surface is informative coverage under the provisional identifier
`squad-portable-bundle/v1.0`; it is not a profile or capability claim. Core
path-containment and version-separation rules apply conceptually. Interop
privacy rules also apply: credentials, authorization headers, hidden prompts,
secret environment values, private tool output, and unrelated personal data
do not belong in a portable bundle. Current CLI warnings tell users to review
histories, decisions, and team content, but the bundle has no field-level
redaction declaration.

Promotion requires a language-neutral schema, explicit required and optional
fields, canonical serialization and digest rules, compatibility fixtures for
legacy `team`/`decisions` aliases, import conflict semantics, version
negotiation, secret and privacy mutation cases, and round trips that cover
local and repository transport without provider credentials in evidence.
