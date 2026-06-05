---
"@bradygaster/squad-cli": minor
---

iter-9: inject `--yolo --additional-mcp-config @.mcp.json` in all non-interactive copilot spawns; fix path regression from `.copilot/mcp-config.json` (iter-7) to `.mcp.json` (iter-8 canonical location); add fallback warning when `.mcp.json` is absent; add `--yolo` deduplication guard; document Copilot CLI 1.0.59+ folder-trust security gate
