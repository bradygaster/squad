# Squad Specification Core v0.1

**Status:** Draft

**Document class:** Normative unless a section is marked informative

**Capability identifier:** `squad-core/v0.1`

## 1. Scope

The core defines rules shared by separately versioned Squad artifact profiles.
It does not define runtime prompts, CLI commands, storage algorithms,
telemetry, GitHub workflows, or a whole-Squad conformance claim.

## 2. Normative references

- [BCP 14](https://www.rfc-editor.org/info/bcp14), comprising RFC 2119 and
  RFC 8174, defines the requirement keywords used by this specification.
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) defines timestamp syntax.
- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) defines the Markdown
  terminology used by profiles. A profile may select a deterministic subset
  rather than require a complete CommonMark implementation.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** are normative only when shown in uppercase.

## 3. Terms and conformance classes

- **Squad root:** the `.squad/` directory selected by an implementation.
- **Artifact:** a file or directory beneath the Squad root described by a
  profile.
- **Producer:** creates or updates an artifact.
- **Consumer:** interprets an artifact.
- **Validator:** returns deterministic diagnostics for a profile.
- **Editor:** reads and writes an artifact.
- **Runtime:** uses one or more artifacts to execute behavior.

An implementation MUST declare exact operational capability identifiers.
Supporting one profile operation MUST NOT be represented as support for every
operation in that profile or for every Squad artifact.

## 4. Root discovery, paths, and containment

An implementation MUST resolve one Squad root before resolving artifact paths.
Repository-local state uses `<repository>/.squad/`. Configuration MAY select an
external or remote root.

Every profile path is **Squad-root-relative** and never includes the `.squad/`
directory itself. For example, `agents/{id}/charter.md` is the profile path;
`.squad/agents/{id}/charter.md` is its repository-relative rendering.

Consumers MUST reject references that escape the selected root after
normalization. Symlinks, junctions, mount points, and other reparse points MUST
NOT be followed when a profile prohibits traversal.

## 5. Artifact classes

Every profile MUST assign one of these classes:

- **required:** required for the declared profile capability;
- **optional:** portable when present;
- **generated:** reproducible output, not an authority source;
- **runtime-state:** mutable state whose persistence may be backend-owned;
- **implementation-private:** outside portable conformance.

Classification is profile-specific and MUST NOT be interpreted as a
requirement that every Squad installation contain every known artifact.

## 6. Profile association and version handling

A profile MUST define how an artifact is associated with that profile: path,
an in-document marker, an API argument, or an explicit combination.
Association MUST NOT rely on prose heuristics.

Consumers MUST fail closed for an unsupported profile version. They MUST NOT
silently process an unsupported version as the nearest known version. A
consumer MAY expose raw bytes without interpreting them.

Core version, profile version, implementation version, and mutable state
revision are independent. None implies another.

## 7. Common representation rules

Text artifacts MUST be UTF-8. Producers SHOULD write LF line endings and MUST
accept CRLF where the profile does not state otherwise. Identifiers used as
path segments MUST satisfy the profile syntax and MUST NOT contain path
separators, control characters, `.` or `..`.

Timestamps, when required, MUST use RFC 3339 with `Z` or an explicit UTC
offset.

## 8. Extensions and round trips

Portable extensions MUST use the namespace mechanism defined by their profile.
Editors MUST preserve unknown namespaced extensions, including content and
relative extension order, during no-op and known-field edit round trips.
Consumers MAY ignore unknown extensions but MUST NOT reinterpret their content
as standard structure.

Namespace comparison, collision handling, ownership, and case rules MUST be
defined by each extensible profile.

## 9. Diagnostics

Validators MUST produce diagnostics in deterministic source order. Each
diagnostic MUST contain:

- a stable, typed code;
- severity (`error` or `warning`);
- a human-readable message;
- one-based start line and column;
- one-based inclusive end line and column;
- artifact path when the validator was given one.

Diagnostics at different locations sort by start line and column. Diagnostics
at the same location sort by the profile's published diagnostic-code order.
Profiles MUST define anchor locations for missing constructs.

Profiles MUST distinguish canonical conformance from documents accepted only
for migration or legacy compatibility.

## 10. Publication, errata, and versioning

A published profile revision is immutable. Editorial corrections that do not
change required behavior are recorded as dated errata linked from the
specification index. A behavioral change requires a new profile version.

Draft `0.x` documents MAY change before publication. Implementations MUST NOT
infer compatibility with an unrecognized `0.x` version. Stable versions use
semantic intent: patch versions clarify without changing accepted documents,
minor versions add backward-compatible capabilities, and major versions may
change document validity or semantics.

## 11. Trust boundary

Artifact content is untrusted input. Consumers MUST NOT execute commands,
follow links, load imports, interpolate secrets, or grant tools solely because
artifact prose requests it. Diagnostic messages MUST NOT disclose secrets
found in artifact content.

## 12. Informative implementation note

An implementation may use a complete Markdown parser internally. Its observed
structural behavior still has to match the deterministic subset selected by
the applicable profile.
