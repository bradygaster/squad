---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fixed three command-routing defects where a `/squad` command relayed by `squad-command-router.md` via `workflow_dispatch` (instead of arriving as a direct issue comment) could be silently dropped or mis-authorized:

- The lifecycle-repair fallback in the shared `squad.md` coordinator only recognized exact, `/squad`-prefixed issue-comment bodies. A command normalized and relayed by the router (e.g. the bare `activate` dispatch input for a `/squad activate` comment) no longer matched, so terminal activation states went unrepaired. Repair gating and the effective command are now derived the same way for both the `issue_comment` and `workflow_dispatch` event paths.
- `squad-command-router.md` was missing `roles: all`, so gh-aw's default write-role activation gate blocked the router from even running for non-write actors — including modes the router intentionally allows anyone to invoke (e.g. `status`). The router now declares `roles: all` and continues to enforce its own in-script, per-command authorization for mutating modes.
- The router's relayed dispatch dropped the originating issue/comment context, so an embedded `/squad approve-improvement` command could never supply a real `approval_comment_id` and was rejected outright. The router now forwards an `aw_context` pointer (item type/number and originating comment id) through the dispatch, and the improvement-approval gate validates permission against that comment's own live author — never the dispatch actor — so approval binding is unchanged, not weakened.
