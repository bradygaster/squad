---
"@bradygaster/squad-sdk": minor
---

Add opt-in HydraFusion support (#2014). `hydrafusion` and `hydrafusion-max` are catalog entries marked `preview` (premium tier) and are excluded from every default chain and GA profile. A new opt-in `hydrafusion` quality profile sends architecture, research, verification, review, security and design tasks to `hydrafusion` first, then the quality-first premium chain; Scribe and mechanical work stay on the fast tier. `hydrafusion-max` is used only when named explicitly. If HydraFusion is unavailable, resolution falls forward to the premium chain within the cost ceiling.
