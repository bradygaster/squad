---
"@bradygaster/squad-sdk": minor
---

Add `.squad/.scratch/` directory for organized temp file management (#790)

- `scratchDir()` — resolve and optionally create the scratch directory
- `scratchFile()` — create named temp files inside `.scratch/`
- Init scaffolds `.squad/.scratch/` and adds it to `.gitignore`
- Agents and CLI should use these utilities instead of writing temp files to repo root
