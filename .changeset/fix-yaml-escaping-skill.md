---
"@bradygaster/squad-cli": patch
---

Fix YAML escaping in skill command apm.yml generation

Use `JSON.stringify()` for skill descriptions in generated apm.yml files
to properly escape quotes and newlines, preventing invalid YAML output.
