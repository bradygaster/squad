---
"@bradygaster/squad-cli": patch
---

Add context overflow sentinel to copilot-instructions.md and reduce squad.agent.md from ~84KB to ~55KB by extracting detailed sections into on-demand reference files. This prevents silent coordinator drop in long sessions when context budget is exceeded.
