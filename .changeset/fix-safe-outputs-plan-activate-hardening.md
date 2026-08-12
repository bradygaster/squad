---
"squad-cli": patch
---

Harden Plan Activate safe-output reliability:
- Increase create-issue max from 50 to 75 (supports larger plans)
- Add label pre-flight validation before issue creation
- Add transient failure handling with single retry for 5xx errors
- Add output budget awareness and bounded phasing guidance
- Add graceful fallback for sub-issue API failures (404/422)

Forward-port of intended changes from PR #1683, rebased on compressed prompt architecture (PR #1685). Ref: #1678
