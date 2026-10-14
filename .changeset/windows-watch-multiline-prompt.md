---
"@bradygaster/squad-cli": patch
---

Spill multiline and oversized prompt arguments to temporary `.md` files on Windows so `cmd.exe` does not truncate `squad watch --execute` prompts at the first newline, and report dispatched issue counts in the round summary (#2070).
