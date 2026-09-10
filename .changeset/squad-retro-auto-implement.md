---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Extend the standard gh-aw stack to six workflows. Retrospective action issues
can opt into bounded ordinary-fix dispatch and independent retry reconciliation.
The improvement worker requires an exact human approval comment, content
revision and file scope; its final gate validates the actual patch. Both paths
produce draft PRs with verified provenance, suppress all-state duplicates, and
leave review and merge to humans. Report/proposal-only remains the default.

Duplicate suppression now also recognizes GitHub's native issue<->pull request
link (the "Development" sidebar), not just a closing-keyword reference or the
worker's own branch naming. A human-linked pull request -- open, merged, or
closed unmerged, with no body text at all -- permanently excludes its issue
from further auto-dispatch, at the receiver duplicate gate for both worker
paths and at the retrospective's own reconciliation check before it dispatches.
An incomplete or failed native lookup fails closed, the same as an incomplete
REST pull-request scan.
