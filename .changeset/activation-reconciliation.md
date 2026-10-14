---
"@bradygaster/squad-sdk": patch
---

Validate real numeric task and epic issue references and add an explicit activation
reader for independently verified current-state-authorized reconciliations.
Preserve valid legacy activation records while rejecting ambiguous, malformed,
or unverified replacements without rewriting historical acceptance.
Require exactly one matching verifier evidence record and bind any selected
phase scope to its canonical, independently verified phase IDs.
Require activation-source phases to exactly match verifier evidence, rejecting
internally inconsistent caller-supplied evidence without changing verifier trust.
Reject malformed legacy phase scopes with non-positive, unsafe, nonnumeric, or
duplicate phase IDs consistently with the packaged activation checker.
Allow a verifier-supplied full frozen-plan assignment context to validate complete
epic identity sets across phase subsets; retain strict exact-row validation when
that independent context is absent.
Normalize verifier and producer display names consistently with trim/lowercase
while retaining exact stable agent identity checks.
Reject task issues that collide with the origin or any epic issue, and prevent
non-origin epics from reusing the origin issue.
Support explicit verifier-authorized pending-source reconciliation with matching
capture metadata, frozen plan and registry digests, and phase scope. Pending
reservations and their prior references never authorize activation on their own.
Select complete transitive phase histories only when every reconciliation has an
independent verifier proof and exact source links form one fully consumed chain
with consistent frozen snapshots, expanding phases, and preserved prior mappings.
Ignore unrelated discussion in scoped pairs and complete histories while retaining
rejection of extra activation or pending candidates and ambiguous chains.
Require a nonempty, strictly shorter positional phase prefix across ancestors;
reject whole-plan phase expansion and explicitly selected phases absent from the
frozen plan without requiring consecutive phase IDs.
