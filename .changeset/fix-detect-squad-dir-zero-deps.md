---
"@bradygaster/squad-cli": patch
---

fix(cli): revert detect-squad-dir to zero-dependency bootstrap

The StorageProvider refactor (26047dc5) accidentally converted this bootstrap utility from raw node:fs to FSStorageProvider. This file runs before the SDK is loaded and must not depend on @bradygaster/squad-sdk. Adds regression guard test.
