---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Migrate Squad 0.9.x casting registries that store agents and assignments as arrays, preserve byte-exact originals, keep the rest of `squad upgrade` running when casting evidence still needs repair, and normalize an absolute self `teamRoot` to `"."`.
