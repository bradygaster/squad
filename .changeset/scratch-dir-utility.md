---
"@bradygaster/squad-sdk": minor
---

Add `.squad/.scratch/` directory for organized temp file management (#790)

- `scratchDir()` — resolve and optionally create the scratch directory
- `scratchFile()` — create named temp files inside `.scratch/`
- Path traversal protection: prefix/ext sanitized to prevent `../` attacks
- Monotonic counter ensures unique filenames even within the same millisecond
- Agents and CLI should use these utilities instead of writing temp files to repo root
