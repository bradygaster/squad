---
"@bradygaster/squad-sdk": patch
---

Skill frontmatter parser now supports YAML block-sequence arrays (e.g. `triggers:` followed by `- item` lines) and strips surrounding quotes from scalar and inline-array values, so declared triggers are no longer dropped or quote-polluted.
