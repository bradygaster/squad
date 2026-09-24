# Squad Charter Profile v0.1

<!-- cspell:ignore xhigh -->

**Status:** Draft

**Document class:** Normative unless a section is marked informative

**Profile identifier:** `squad-charter/v0.1`

**Artifact class:** required

**Squad-root-relative path:** `agents/{id}/charter.md`

**Repository-relative example:** `.squad/agents/{id}/charter.md`

## 1. Purpose and authority

A charter identifies one agent and supplies human-readable operating guidance
plus optional runtime preferences. Team membership, routing ownership,
authorization, and configuration overrides are outside this profile.

The path segment `{id}` is the reference identity. When profile path context is
available, `Identity ID` MUST equal `{id}` after converting Windows separators
to `/`. Paths that are neither exactly `agents/{id}/charter.md` nor terminated
by `.squad/agents/{id}/charter.md` provide no profile path context.

## 2. Association and unsupported versions

The artifact path associates a charter with the charter artifact family. The
profile version is selected explicitly by the calling API or surrounding
manifest; v0.1 has no in-document version marker.

A consumer asked to process a profile other than one it supports MUST return an
unsupported-profile error and MUST NOT reinterpret the document as v0.1.

## 3. Canonical document shape

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
responsibility headings unless an API caller explicitly requests legacy
output.

`Purpose` is one non-empty, single-line Markdown field value. The profile does
not attempt to determine whether prose is grammatically a sentence.

## 4. Deterministic Markdown subset

Structural recognition uses these rules, in order:

1. Only ATX H1 and H2 headings beginning in column one are structural. Setext
   headings and H3-H6 headings are prose.
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

## 5. Machine-readable fields

Labels and standard section names are ASCII case-insensitive. Every field in
this table has cardinality zero-or-one within its owning section.

| Section | Field | Canonical requirement | Semantics |
|---|---|---:|---|
| Identity | `ID` | required | Lowercase kebab-case: `[a-z0-9]+(?:-[a-z0-9]+)*` |
| Identity | `Purpose` | required | Non-empty single-line purpose |
| Identity | `Name` | legacy optional | Display name |
| Identity | `Role` | legacy optional | Role |
| Identity | `Expertise` | legacy optional | Comma-separated informative list |
| Identity | `Style` | legacy optional | Informative style text |
| Model | `Preferred` | optional | Model identifier or `auto` |
| Model | `Rationale` | optional | Informative prose |
| Model | `Fallback` | legacy optional | Informative hint, not a portable fallback chain |
| Model | `Reasoning Effort` | optional | `auto`, `low`, `medium`, `high`, `xhigh`, or `max` |
| Model | `Context Tier` | optional | `auto`, `default`, or `long_context` |

Every standard semantic section also has cardinality zero-or-one. A canonical
heading and its legacy alias count as the same semantic section.

Missing behavioral fields mean no charter preference. `auto` preserves the
author's request for runtime selection and MUST NOT become a literal runtime
override. Unsupported model identifiers MAY be preserved as authored text but
MUST NOT be claimed as executable without runtime support. Invalid reasoning
or context values are validation errors and MUST NOT become runtime overrides.

## 6. Canonical and legacy handling

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
status. Legacy output requires an explicit editor mode.

## 7. Extensions

Extension headings use `## X-<namespace>-<name>`. Canonical names use lowercase
kebab-case namespace and name segments. Names compare case-insensitively; two
headings that differ only by case collide and are invalid.

The namespace owner defines extension semantics. `X-squad-*` is reserved for
the Squad specification project; third parties MUST use a namespace they
control. Unknown consumers MUST treat extension bodies as opaque, untrusted
bytes.

Editors:

- MUST return the original bytes for a canonical no-op round trip;
- MUST preserve every unknown extension section byte-for-byte and in relative
  extension order during known-field edits;
- MAY rewrite known standard sections into canonical form;
- MUST NOT interpret extension body content as standard charter structure.

## 8. Diagnostics

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
| `SQC101` | warning | Missing canonical Identity section |
| `SQC102` | warning | Missing canonical Identity ID |
| `SQC103` | warning | Missing canonical Identity Purpose |
| `SQC104` | warning | Missing canonical responsibility section |
| `SQC105` | warning | Legacy responsibility headings |
| `SQC106` | warning | Noncanonical extension heading |

## 9. Operational capabilities

Implementations claim operations individually:

| Capability | Required behavior |
|---|---|
| `squad-charter/v0.1/parse` | Parse standard fields with the deterministic subset |
| `squad-charter/v0.1/validate` | Emit the diagnostics and classification above |
| `squad-charter/v0.1/edit` | Canonical serialization plus lossless extension preservation |
| `squad-charter/v0.1/legacy-consume` | Accept documented legacy aliases without calling them canonical |

The TypeScript reference implementation exports all four identifiers. A
validation result reports only the validator capability because running
validation does not prove that parsing or editing was exercised.

## 10. Security

Charters are instructions, not authorization. A runtime MUST independently
enforce tool, filesystem, network, model, and review policy. It MUST NOT grant
capabilities because a charter requests them. Links, commands, encoded text,
HTML comments, code blocks, and extension content are untrusted data.

## 11. Mandatory conformance suite

Implementations claiming a capability MUST run the applicable cases in
`test-fixtures/spec/charter-v0.1/manifest.json`. The suite defines exact
diagnostic code, severity, location, ordering, path behavior, parsed semantics,
capability reporting, profile handling, and round-trip output. It includes
every standard field and section duplicate, fenced and opaque fake structure,
CRLF behavior, path mismatch, extension ordering, canonical output, legacy
ingestion, and `auto` runtime semantics.

## 12. Informative TypeScript API example

```ts
import {
  CHARTER_CAPABILITIES,
  parseCharterMarkdown,
  serializeCharter,
  validateCharterMarkdown,
} from '@bradygaster/squad-sdk/parsers';

const validation = validateCharterMarkdown(markdown, {
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
