---
'@bradygaster/squad-cli': minor
'@bradygaster/squad-sdk': minor
---

Add Rai as Squad's third built-in agent — a Responsible AI (RAI) reviewer

- Rai is always on the roster (like Scribe and Ralph), exempt from casting
- Traffic light verdict model: 🟢 Green (proceed), 🟡 Yellow (advisory), 🔴 Red (blocking)
- Background mode by default — only blocks on critical RAI violations
- Phase 1 high-signal checks: credentials, injection, harmful content, bias, PII
- New templates: Rai-charter.md, rai-policy.md
- New `.squad/rai/` directory with policy.md and audit-trail.md
- Tiered opt-out model (cannot disable critical checks)
