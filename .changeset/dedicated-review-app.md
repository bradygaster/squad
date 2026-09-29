---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Use the base-controlled deterministic relay's native `Squad Review / review`
job as the authoritative review result only when it validates the exact trusted
automatic workflow run. Authoritative merge enforcement requires a source-bound
required-workflow or equivalent ruleset; where that is unavailable, the context
is advisory and an independent human approving review remains required. This
path needs no separately provisioned reviewer App, token, private key, secret,
environment, or custom Checks API publisher.
