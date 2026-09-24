# Squad Charter Profile v0.1

<!-- cspell:ignore xhigh -->

**Status:** Working Draft

**Document class:** Normative unless a section is marked informative

**Profile identifier:** `squad-charter/v0.1`

**Editor:** Squad project maintainers

**Draft date:** 2026-09-24

**Working-draft provenance:** [PR #2074](https://github.com/bradygaster/squad/pull/2074),
whose revision lineage starts at immutable review baseline
[`ab80da18087b7d37755db2c3cc5880d194a10f52`](https://github.com/bradygaster/squad/commit/ab80da18087b7d37755db2c3cc5880d194a10f52).
Each subsequent draft snapshot is identified by its immutable Git commit in
that pull request.

**Immutable publication tag:** None; this working draft is not a publication

**Feedback:** [Issue #2069](https://github.com/bradygaster/squad/issues/2069)

**Errata:** [§14](#14-errata)

**Artifact class:** required

**Squad-root-relative path:** `agents/{id}/charter.md`

**Repository-relative example:** `.squad/agents/{id}/charter.md`

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** in this document are to be interpreted as described in BCP 14
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they
appear in all capitals, as shown here.

## 1. Purpose and authority

A charter identifies one agent and supplies human-readable operating guidance
plus optional runtime preferences. Team membership, routing ownership,
authorization, and configuration overrides are outside this profile.

The path segment `{id}` is the reference identity. When profile path context is
available, `Identity ID` MUST equal `{id}` after converting Windows separators
to `/`. Paths that are neither exactly `agents/{id}/charter.md` nor terminated
by `.squad/agents/{id}/charter.md` provide no profile path context.

## 2. Normative references

- [Squad Specification Core v0.1](core-v0.1.md) defines common paths,
  conformance, diagnostics, versioning, publication, and trust requirements.
- [BCP 14](https://www.rfc-editor.org/info/bcp14), comprising RFC 2119 and
  RFC 8174, defines requirement-keyword interpretation.
- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) defines the Markdown
  terms used by the deterministic subset below.

## 3. Association and unsupported versions

The artifact path associates a charter with the charter artifact family. The
profile version is selected by the calling API or surrounding manifest; v0.1
has no in-document version marker.

An API that claims portable conformance MUST require the caller to supply the
profile identifier. Missing selection produces `SQC014`. A language-specific
implementation MAY expose a separately named convenience validator or compiler
that defaults a profile, but that default is implementation-specific and MUST
NOT be treated as portable conformance behavior. The TypeScript reference
implementation's `validateCharterMarkdown` and `compileCharterFull` convenience
paths default to `squad-charter/v0.1` and report the selected profile.

A consumer asked to process a profile other than one it supports MUST return an
unsupported-profile error and MUST NOT reinterpret the document as v0.1.

## 4. Canonical document shape

```markdown
# Display Name — Role

## Identity
- **ID:** `agent-id`
- **Purpose:** Non-empty single-line purpose text.

## Accountable Responsibilities
...

## Non-Responsibilities
...

## Collaboration and Review Authority
...

## Model
- **Preferred:** auto
- **Reasoning Effort:** auto
- **Context Tier:** auto
```

The H1, `Identity`, and three canonical responsibility sections define the
canonical presentation. `Model` is optional. Producers MUST emit canonical
sections in this order: `Identity`, `Accountable Responsibilities`,
`Non-Responsibilities`, `Collaboration and Review Authority`, optional
`Model`, then extensions. Producers MUST use the em dash (`—`) H1 separator
and canonical responsibility headings unless an API caller explicitly requests
legacy output.

`Purpose` is one non-empty, single-line Markdown field value. The profile does
not attempt to determine whether prose is grammatically a sentence.

## 5. Deterministic Markdown subset

Structural recognition uses these rules, in order:

1. Only ATX H1 and H2 headings beginning in column one are structural. Exactly
   one structural H1 is allowed. Setext headings and H3-H6 headings are prose.
2. A machine field is a single line with zero to three leading spaces, an
   optional list marker, then `**Label:** value`.
3. Headings and fields inside fenced code are ignored. Fences use at least
   three backticks or tildes, may have up to three leading spaces, and close
   with the same character and at least the opening length.
4. Lines in indented code (four spaces or one tab) and block quotes are ignored.
5. A line whose first non-space characters are `<!--` begins an HTML comment;
   structural recognition resumes after a line containing `-->`.
6. The first `X-` H2 begins the opaque extension tail. Within that tail, only
   another `X-` H2 starts a new extension. Standard-looking headings and fields
   in extension bodies are opaque text.
7. Canonical producers MUST place all standard sections before the first
   extension section.

These rules are the required observable behavior. Implementations need not use
the same scanner internally.

## 6. Machine-readable fields

Labels and standard section names are ASCII case-insensitive. Every field in
this table has cardinality zero-or-one within its owning section.

| Section | Field | Canonical requirement | Semantics |
|---|---|---:|---|
| Identity | `ID` | required | Lowercase kebab-case: `[a-z0-9]+(?:-[a-z0-9]+)*` |
| Identity | `Purpose` | required | Non-empty single-line purpose |
| Identity | `Name` | compatibility only | Display name |
| Identity | `Role` | compatibility only | Role |
| Identity | `Expertise` | compatibility only | Comma-separated informative list |
| Identity | `Style` | compatibility only | Informative style text |
| Model | `Preferred` | optional | Model identifier or `auto` |
| Model | `Rationale` | optional | Informative prose |
| Model | `Fallback` | compatibility only | Informative hint, not a portable fallback chain |
| Model | `Reasoning Effort` | optional | `auto`, `low`, `medium`, `high`, `xhigh`, or `max` |
| Model | `Context Tier` | optional | `auto`, `default`, or `long_context` |

Every standard semantic section also has cardinality zero-or-one. A canonical
heading and its legacy alias count as the same semantic section.

The compatibility fields `Name`, `Role`, `Expertise`, `Style`, and `Fallback`
are accepted for legacy ingestion but make the document
**noncanonical-compatible**. Editors preserve them when their canonical
semantics cannot be represented without data loss. They are not behavioral
inputs except that `Name` and `Role` may supply legacy display metadata.
Each present compatibility field produces its own `SQC107`, independently of
whether any other optional field, including `Context Tier`, is present.

Missing behavioral fields mean no charter preference. `auto` preserves the
author's request for runtime selection and MUST NOT become a literal runtime
override. Unsupported model identifiers MAY be preserved as authored text but
MUST NOT be claimed as executable without runtime support. Invalid reasoning
or context values are validation errors and MUST NOT become runtime overrides.

## 7. Canonical and legacy handling

Consumers MAY accept these legacy aliases:

| Legacy form | Canonical semantic |
|---|---|
| H1 identity without `Identity ID` | Display name and role only |
| `Identity Name` | Display name |
| `Identity Role` | Role |
| `Identity Expertise` | Informative expertise list |
| `Identity Style` | Informative style |
| `What I Own` | `Accountable Responsibilities` |
| `Boundaries` | `Non-Responsibilities` |
| `Collaboration` | `Collaboration and Review Authority` |

A document with only warning diagnostics is **noncanonical-compatible**, not
canonical. Validators expose both canonical `conforms` and broader `accepted`
status. Legacy output requires an explicit editor mode. Canonical known-field
edits emit standard sections in the order defined by §4. If required canonical
identity semantics are unavailable, the editor preserves compatibility fields
and the result remains noncanonical-compatible rather than inventing values.

## 8. Extensions

Extension headings use `## X-<namespace>-<name>`. The namespace is the first
non-hyphen segment after `X-` and matches `[a-z0-9]+`. The name is every
remaining segment and matches `[a-z0-9]+(?:-[a-z0-9]+)*`. Therefore
`X-example-deploy-policy` has namespace `example` and name `deploy-policy`.
The namespace `squad` is reserved for the Squad specification project.

Extension identity is the complete `namespace-name` pair. Comparison is ASCII
case-insensitive; two headings with the same pair collide even when casing
differs. Noncanonical casing produces `SQC106`; a collision additionally
produces `SQC012`. Third parties MUST use a namespace they control. Unknown
consumers MUST treat extension bodies as opaque, untrusted bytes.

Editors:

- MUST return the original bytes for a canonical no-op round trip;
- MUST preserve every unknown extension section byte-for-byte and in relative
  extension order during known-field edits;
- MAY rewrite known standard sections into canonical form;
- MUST NOT interpret extension body content as standard charter structure.

## 9. Diagnostics

Missing constructs are anchored at line 1 or, when present, the nearest owning
H1/H2 heading. Duplicate diagnostics point to the second and later occurrence.
Diagnostics sort by line, column, then the code order below.

| Code | Severity | Condition |
|---|---|---|
| `SQC001` | error | Empty charter |
| `SQC002` | error | Missing H1 identity |
| `SQC003` | warning | Noncanonical H1 |
| `SQC004` | error | Duplicate machine-readable field |
| `SQC005` | error | Invalid Identity ID |
| `SQC006` | error | Empty Preferred model |
| `SQC007` | error | Invalid Reasoning Effort |
| `SQC008` | error | Invalid Context Tier |
| `SQC009` | error | Empty Identity Purpose |
| `SQC010` | error | Identity ID/path mismatch |
| `SQC011` | error | Duplicate standard semantic section |
| `SQC012` | error | Case-insensitive extension collision |
| `SQC013` | error | Unsupported profile |
| `SQC014` | error | Explicit profile omitted from conformance API |
| `SQC015` | error | Duplicate structural H1 identity |
| `SQC101` | warning | Missing canonical Identity section |
| `SQC102` | warning | Missing canonical Identity ID |
| `SQC103` | warning | Missing canonical Identity Purpose |
| `SQC104` | warning | Missing canonical responsibility section |
| `SQC105` | warning | Legacy responsibility heading; one diagnostic per heading |
| `SQC106` | warning | Noncanonical extension heading |
| `SQC107` | warning | Compatibility field present |
| `SQC108` | warning | Unknown or noncanonically ordered standard section |

## 10. Operational capabilities

Implementations claim operations individually:

| Capability | Required behavior |
|---|---|
| `squad-charter/v0.1/parse` | Parse standard fields with the deterministic subset |
| `squad-charter/v0.1/validate` | Emit the diagnostics and classification above |
| `squad-charter/v0.1/edit` | Canonical serialization plus lossless extension preservation |
| `squad-charter/v0.1/legacy-consume` | Accept documented legacy aliases without calling them canonical |
| `squad-charter/v0.1/runtime` | Validate before applying portable behavioral fields, reject invalid input, and expose normalized runtime results |

An implementation claiming a capability MUST pass every manifest case that
lists that capability. A validation result reports only the validator
capability because running validation does not prove that parsing or editing
was exercised.

## 11. Runtime validation and security

Charters are instructions, not authorization. A runtime MUST independently
enforce tool, filesystem, network, model, and review policy. It MUST NOT grant
capabilities because a charter requests them. Links, commands, encoded text,
HTML comments, code blocks, and extension content are untrusted data.

A runtime claiming `squad-charter/v0.1/runtime` that applies `Preferred`,
`Reasoning Effort`, or `Context Tier` MUST validate the charter first and MUST
reject invalid input without applying any of those fields. Runtime expectations
in the manifest apply only to cases that declare this capability.

The TypeScript reference compiler validates before resolving behavior. Its
default profile and its compatibility path that generates a canonical,
behavior-neutral charter when `charterContent` is omitted are convenience
behaviors of that implementation, not requirements for generic validators or
other runtimes. Explicitly empty or invalid content is rejected.

## 12. Mandatory conformance suite

Implementations claiming a capability MUST run the applicable cases in
`test-fixtures/spec/charter-v0.1/manifest.json`. The suite defines exact
diagnostic code, severity, location, ordering, path behavior, parsed semantics,
capability reporting, profile handling, and round-trip output. It includes
every standard field and section duplicate, fenced and opaque fake structure,
CRLF behavior, path mismatch, extension ordering, canonical output, legacy
ingestion, and `auto` runtime semantics. The manifest, not the TypeScript
harness, defines case inputs, profile selection, paths, edits, outputs,
classifications, parsed semantics, and ordered diagnostic ranges.

The language-neutral field contract is
[`manifest.schema.json`](../../test-fixtures/spec/charter-v0.1/manifest.schema.json).
Every manifest contains:

- `$schema`, `schemaVersion`, `profile`, the complete `capabilities` list, and
  uniquely identified `cases`;
- per-case `capabilities`, exactly one input source (`fixture` or `text`),
  nullable path/profile inputs, and the named validation API;
- an always-present validation expectation with classification, capability
  report, and ordered diagnostic ranges;
- parsed semantics only for `parse` cases, input/edit/output data only for
  `edit` cases, and compile/rejection results only for `runtime` cases.

For a failing runtime case, `errorCodes` is the exact ordered validation-code
sequence returned with the rejection. For a successful runtime case, the three
`resolved*` values are the normalized behavior inputs, where `null` means no
override. Harnesses MUST reject unknown capabilities, missing declared
capability coverage, missing diagnostic-code coverage, and disagreement between
an operation's capability declaration and its expectation fields.

## 13. Informative TypeScript implementation details

The exported TypeScript names, module paths, and example below are informative.
They do not constrain implementations in other languages.

```ts
import {
  CHARTER_CAPABILITIES,
  parseCharterMarkdown,
  serializeCharter,
  validateCharterConformance,
} from '@bradygaster/squad-sdk/parsers';

const validation = validateCharterConformance(markdown, {
  profile: 'squad-charter/v0.1',
  path: '.squad/agents/reviewer/charter.md',
});

if (!validation.accepted) {
  throw new Error(validation.diagnostics[0]?.message);
}

const charter = parseCharterMarkdown(markdown);
charter.identity.purpose = 'Review public API compatibility.';
const updated = serializeCharter(charter);

console.log(CHARTER_CAPABILITIES.edit, updated);
```

## 14. Errata

No published revision exists, so there are no publication errata. Working-draft
corrections are recorded as new immutable commits in
[PR #2074](https://github.com/bradygaster/squad/pull/2074). Errata for a future
tagged publication will list its publication date, affected section, and
correction here.
