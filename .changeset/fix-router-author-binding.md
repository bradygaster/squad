---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Bind mutating `/squad` command authorization to both the event actor and the author of the classified issue or comment text, preventing privileged edits from dispatching commands authored by an unprivileged user.
