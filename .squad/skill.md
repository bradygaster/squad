---
name: "{skill-name}"
description: "{what this skill does and when to use it — include trigger keywords, max 1024 chars}"
license: "MIT"
metadata:
  domain: "{e.g., testing, api-design, error-handling}"
  confidence: "low|medium|high"
  source: "{how this was learned: manual, observed, earned}"
  compatibility: "GitHub Copilot CLI, VS Code Copilot Chat"
  # SDK extensions — the SDK's simple parser flattens metadata, so these are
  # accessible as top-level fields at runtime. Move to top-level if a full
  # YAML parser is adopted.
  triggers: [keyword1, keyword2, keyword3]
  roles: [developer, tester]
# allowed-tools: "{space-delimited list of pre-approved tools}"
---

## Context
{When and why this skill applies}

## Patterns
{Specific patterns, conventions, or approaches}

## Examples
{Code examples or references}

## Anti-Patterns
{What to avoid}
