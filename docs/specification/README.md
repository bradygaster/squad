# Squad Specification

**Core version:** 0.1

**Status:** Working Draft

**Draft date:** 2026-09-25

**Working-draft provenance:** [PR #2074](https://github.com/bradygaster/squad/pull/2074)
contains the combined Core, Charter, and suite revision. The suite draft
originated in [PR #2078](https://github.com/bradygaster/squad/pull/2078);
the combined branch preserves its source-commit provenance.

The source index keeps `publication.revision` and `publication.digest` null
while it is a working draft. After review, the exact head SHA is recorded in
the PR body and review report. A publication pipeline may copy the source index
into a release artifact, set `publication.status` to `published`, insert that
already-existing reviewed head SHA, and compute the release artifact digest.
The derived release index is attached to the tag or release; it is not committed
back onto the same commit. This records an immutable revision in the suite
index without a self-referential hash that would invalidate the commit.

Publication metadata is not a conformance-claim binding. Every claimable
profile instead carries a non-null `revision` object in the suite registry and
its executable manifest. For Charter v0.1, that object binds the exact Charter
document bytes and the canonical manifest evidence payload with SHA-256
digests. This makes working-draft claims reproducible while publication
metadata remains null.

**Document class:** Informative registry and navigation index

**Foundation profile:** [Squad Charter Profile v0.1](charter-v0.1.md)

This directory maps a working inventory of stable or observable Squad surfaces,
including composition and initialization capabilities without profiles in
the [artifact inventory](artifact-inventory.md). It does not yet specify the
complete model for how independent Squads compose and interact. Publication
status is independent from maturity: this suite is an unpublished working
draft. Charter is the only profile with executable conformance evidence.

## Maturity taxonomy

The suite uses exactly five maturity values:

| Maturity | Meaning | Claimable |
|---|---|---|
| `executable-normative-draft` | Normative working draft with an executable manifest and schema | Yes, only identifiers declared by that manifest; not published |
| `experimental-normative-draft` | Normative working draft whose rules are exercised only through dependent profiles or partial evidence | No standalone claims |
| `experimental-schema` | Machine-valid schema or fixture, but no complete conformance manifest | No |
| `requirements-draft` | Conceptual and behavioral requirements awaiting portable fixtures | No |
| `informative-draft` | Coverage, observations, or volatile requirements | No |

The document-class vocabulary is `normative-profile`, `normative-schema`,
`requirements`, and `informative`. The only conformance-class vocabulary is
`canonical`, `compatible`, `legacy`, and `runtime`. Implementation roles
(`producer`, `consumer`, `editor`, `validator`, and `executor`) describe what
software does; they are not claims.

Capability identifiers use one grammar:
`squad-<profile>/v<major>.<minor>/<operation>`. The suite defines no `#operation`
alias. A registry entry without an executable manifest has no claimable
capabilities or conformance classes.

## Document registry

`Schema/manifest` uses `schema`, `manifest`, `fixture`, or `none`. Known
deviations are summarized here and expanded in the
[coverage matrix](artifact-inventory.md#known-unstable-and-non-conforming-behavior).

| ID | Maturity / class | Dependencies | Claimable capabilities | Schema/manifest | Implementation status | Known deviations | Reader entry path |
|---|---|---|---|---|---|---|---|
| `squad-core/v0.1` | `experimental-normative-draft` / normative profile | None | None | None | Normative rules are exercised by Charter; no standalone Core manifest | Canonical JSON and standalone Core cases incomplete | [Core](core-v0.1.md), then Charter |
| `squad-interop/v0.1` | `requirements-draft` / requirements | Core | None | Reference evidence schema; no manifest | Schema and example records inform future profile design | No discovery, relational-invariant, or replay corpus | [Interoperability](interoperability-conventions-v0.1.md) |
| `squad-charter/v0.1` | `executable-normative-draft` / normative profile | Core | `squad-charter/v0.1/parse`, `squad-charter/v0.1/validate`, `squad-charter/v0.1/edit`, `squad-charter/v0.1/legacy-consume`, `squad-charter/v0.1/runtime` | Manifest, schema, and immutable revision binding | Parser, validator, editor, compiler, and cases implemented | None registered | [Charter](charter-v0.1.md) |
| `squad-team-routing/v0.1` | `requirements-draft` / requirements | Core, Interop, Charter | None | None | Roster and routing exist in multiple shapes | Fallback and ambiguity differ | [Roster, then routing](team-routing-v0.1.md) |
| `squad-configuration-casting/v0.1` | `requirements-draft` / requirements | Core, Interop, Team/Routing | None | None | Configuration, registry, and history implemented | Legacy shapes and runtime-only keys | [Configuration, casting, provenance](configuration-casting-v0.1.md) |
| `squad-governance-review/v0.1` | `requirements-draft` / requirements | Core, Interop, Team/Routing | None | Reference schema and rejection fixture; no manifest | TypeScript checks exercise implementation expectations only | No portable relational-invariant or transition corpus | [Evidence shape, then promotion criteria](governance-review-v0.1.md) |
| `squad-execution-preferences/v0.1` | `requirements-draft` / requirements | Core, Interop, Charter, Configuration/Casting | None | None | Runtime selection exists | Provider catalogs and fallback are policy | [Execution preferences](execution-preferences-v0.1.md) |
| `squad-planning-activation/v0.1` | `requirements-draft` / requirements | Core, Interop, Team/Routing, Work Lifecycle | None | None | gh-aw planning records exist | Safe-output and limits are provider-specific | [Planning and activation](planning-activation-v0.1.md) |
| `squad-ceremony/v0.1` | `requirements-draft` / requirements | Core, Interop, Team/Routing | None | None | Builder preserves triggers and schedules | Event names, `auto`, and cooldown are unstable | [Ceremonies](ceremony-v0.1.md) |
| `squad-work-lifecycle/v0.1` | `requirements-draft` / requirements | Core, Interop, Team/Routing, Governance | None | None | Neutral state design only | No shared transition traces | [Neutral lifecycle](work-lifecycle-v0.1.md) |
| `squad-work-github/v0.1` | `requirements-draft` / requirements binding | Interop, Work Lifecycle, Governance | None | None | GitHub adapters exist | No deterministic provider transcripts | [GitHub binding](github-work-lifecycle-binding-v0.1.md) |
| `squad-coordination-handoff/v0.1` | `requirements-draft` / requirements | Core, Interop, Team/Routing | None | None | Session and handoff implementations exist | Ordering and recovery are provider-specific | [Coordination](coordination-handoff-v0.1.md) |
| `squad-automation/v0.1` | `requirements-draft` / requirements | Core, Interop, Coordination | None | None | Local and GitHub schedulers exist | Time, retry, and drift evidence differ | [Automation](automation-v0.1.md) |
| `squad-state-memory-requirements/v0.1` | `informative-draft` / informative | Core, Interop | None | None | Several state and memory providers exist | No common authority, recovery, or privacy corpus | [State authority, then memory classification](state-memory-requirements-v0.1.md) |
| `squad-portable-bundle/v1.0` | `informative-draft` / observed implementation surface | Core and Interop rules apply conceptually | None | Tested JSON shape; no published schema or manifest | `squad export` and `squad import` round-trip team, routing, decisions, casting, agents, and skills | Bundle `1.0` does not use Core profile grammar; histories, decisions, skills, and casting policy can contain sensitive data | [Coverage and promotion requirements](artifact-inventory.md#portable-export-and-import-bundle) |

The machine-readable registry is
[`test-fixtures/spec/suite-v0.1/index.json`](../../test-fixtures/spec/suite-v0.1/index.json).
The governance JSON is a reference fixture, not portable conformance evidence.
Charter v0.1 is the only registered profile with a manifest, conformance
classes, capability identifiers, and immutable claim revisions.

## Textual dependency adjacency and DAG

Adjacency list:

```text
squad-core/v0.1 -> []
squad-interop/v0.1 -> [squad-core/v0.1]
squad-charter/v0.1 -> [squad-core/v0.1]
squad-team-routing/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-charter/v0.1]
squad-configuration-casting/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-team-routing/v0.1]
squad-governance-review/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-team-routing/v0.1]
squad-execution-preferences/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-charter/v0.1, squad-configuration-casting/v0.1]
squad-work-lifecycle/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-team-routing/v0.1, squad-governance-review/v0.1]
squad-work-github/v0.1 -> [squad-interop/v0.1, squad-work-lifecycle/v0.1, squad-governance-review/v0.1]
squad-planning-activation/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-team-routing/v0.1, squad-work-lifecycle/v0.1]
squad-ceremony/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-team-routing/v0.1]
squad-coordination-handoff/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-team-routing/v0.1]
squad-automation/v0.1 -> [squad-core/v0.1, squad-interop/v0.1, squad-coordination-handoff/v0.1]
squad-state-memory-requirements/v0.1 -> [squad-core/v0.1, squad-interop/v0.1]
squad-portable-bundle/v1.0 -> [conceptual Core and Interop constraints; no profile claim]
```

DAG reading order:

```text
Core
├── Charter (only claimable profile)
├── Interop requirements and reference schema
│   ├── Team/Routing
│   │   ├── Configuration/Casting
│   │   │   └── Execution Preferences
│   │   ├── Governance
│   │   │   └── Work Lifecycle
│   │   │       ├── GitHub Binding
│   │   │       └── Planning/Activation
│   │   ├── Ceremony
│   │   └── Coordination
│   │       └── Automation
│   └── State/Memory Requirements
└── Portable Bundle observation (applies Core/Interop constraints without a claim)
```

There is no dependency cycle. Provider-neutral requirements precede the GitHub
binding. State authority and memory classification remain separate promotion
tracks. This composition diagram is informative: dependency edges do not confer
transitive capabilities or conformance claims.

## External reference policy

Material external assumptions use stable, versioned, section-level links and
are labeled normative or informative in the document that imports them. Core
[§2](core-v0.1.md#2-normative-references) imports BCP 14, RFC 3339, and
CommonMark 0.31.2. Interoperability
[§10](interoperability-conventions-v0.1.md#10-versioned-references-and-precedents)
and the GitHub binding
[§8](github-work-lifecycle-binding-v0.1.md#8-versioned-provider-assumptions-and-references)
identify their narrower assumptions. An informative precedent does not become
a suite requirement merely by being cited.

`test/specification-suite.test.ts` deterministically checks every Markdown file
in this directory for relative targets, local heading anchors, and absolute
HTTPS external citations. It also verifies every indexed specification,
schema, manifest, and fixture path. The check is intentionally offline:
external URL availability and remote anchor existence remain review-time or
publication-pipeline checks.

## Versioning policy

Profile identifiers use `vMAJOR.MINOR`; mutable state revisions, provider API
versions, implementation versions, and the observed portable-bundle `1.0`
version are distinct. Draft documents may change before promotion. Only a
`publication.status` of `published` denotes an immutable publication; published
normative revisions are immutable except for dated errata, and behavior changes
require a new profile version. Claimable working drafts remain bound to exact
content digests through each profile's `revision` object; mutable branch names,
pull request numbers, and null publication fields are never claim revisions.
