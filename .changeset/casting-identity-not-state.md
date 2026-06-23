---
"@bradygaster/squad-sdk": patch
---

docs: clarify in `init.ts` and `.gitattributes` / `.gitignore` generators that `.squad/casting/*` files are authoritative identity (registry + history), NOT mutable two-layer state. They belong on `main`, must be committed, and should NOT receive a `merge=union` driver or be added to `.gitignore`. Pure comment additions — no runtime behavior change.
