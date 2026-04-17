---
'@bradygaster/squad-cli': minor
---

feat(watch): load external WatchCapabilities from .squad/capabilities/

Users can now define custom watch capabilities as .js files in `.squad/capabilities/`.
Each file default-exports a WatchCapability object (name, phase, preflight, execute).
Capabilities are loaded at watch startup and participate in the normal phase-based round cycle.
