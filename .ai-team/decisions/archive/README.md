# Archived Decisions

Decisions are archived here quarterly once they are older than 30 days and not marked `status: permanent`.

## Navigation

Files are named `{YYYY-QX}.md` where:
- `Q1` = January–March
- `Q2` = April–June  
- `Q3` = July–September
- `Q4` = October–December

## Finding Historical Context

```bash
# Search all archived decisions for a topic
grep -r "topic keyword" .ai-team/decisions/archive/

# View a specific quarter
cat .ai-team/decisions/archive/2026-Q1.md

# Browse git history for a decision
git log --all -p -- .ai-team/decisions/archive/
```

## Why Archive?

Every agent reads `decisions.md` at spawn time. A large file adds thousands of tokens to every agent's context window, causing context overflow. Archival keeps agents fast and reliable while preserving the full historical record here.
