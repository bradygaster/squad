---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Advertise the squad's real capabilities in `.github/agents/squad.agent.md` so an outer Agentic Workflows coordinator can route to it.

A new generated `Team Capabilities` block lists the actual cast — available specialists with their roles and charter-grounded focus, supported task types, domain-to-agent routing hints, and honest capability boundaries (what the squad *cannot* do is stated explicitly, derived from the absence of evidence rather than from a wish list). The block is rewritten whenever cast composition changes: on `squad init`, on `squad upgrade`, and on casting, so recast and retired members never leave stale names behind.

Generation is deterministic and reuses the existing roster/routing parsers and charter metadata reader rather than introducing a second routing model. All metadata is treated as untrusted data: values are sanitized against markdown table breakage, HTML/comment injection, canary and marker forgery, invisible and bidi characters, and common prompt-injection phrasings before they are embedded.
