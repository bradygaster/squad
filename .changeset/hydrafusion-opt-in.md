---
"@bradygaster/squad-sdk": minor
---

Add opt-in HydraFusion support (#2014). `hydrafusion` and `hydrafusion-max` are catalog entries marked `preview` (premium tier) and are excluded from every default chain and GA profile. A new opt-in `hydrafusion` quality profile sends architecture, research, verification, review, security and design tasks to `hydrafusion` first, then the quality-first premium chain; Scribe and mechanical work stay on the fast tier. `hydrafusion-max` is used only when named explicitly. If HydraFusion is unavailable (live model list, or `createSession` rejecting a profile-picked `hydrafusion`, for example under org policy), `AgentLifecycleManager.spawnAgent` falls forward to the premium chain within the cost ceiling instead of failing the spawn, and tells the user once (console warning plus an `agent:milestone` `model.unavailable` event). `ModelRegistry.getRecommendedModels` never recommends preview entries; they stay available through explicit catalog lookup.
