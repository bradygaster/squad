---
"@bradygaster/squad-sdk": patch
---

Fix `squad preset save/apply` to round-trip custom routing configuration. Previously, `routing.md` was not included in preset snapshots, so custom label tables, module ownership mappings, and other routing rules were lost on `preset apply`. Now `savePreset` captures the full `routing.md` and `applyPreset` restores it faithfully.
