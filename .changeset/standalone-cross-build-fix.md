---
"@bradygaster/squad-cli": patch
---

Fix cross-building a POSIX standalone bundle from a Windows host. The builder extracted the entire Node.js runtime archive, which contains symlinks (`bin/npm`, `bin/npx`, `bin/corepack`) that Windows cannot create — so building a `linux` or `darwin` bundle from Windows failed with `Can't create ... Invalid argument`. It now extracts only the `node` binary it actually ships, and reports the underlying tar error when extraction fails.
