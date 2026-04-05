---
---

ci: re-run PR readiness check after Squad CI completes

Added workflow_run trigger to the readiness check so it refreshes after
CI finishes. Uses PR API for draft status instead of env var (more reliable
for workflow_run events). Includes 3 new draft-override tests.
