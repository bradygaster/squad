# Session: 2026-02-20 — Docs Release Publish

**Date:** 2026-02-20  
**Topic:** docs-release-publish  
**Agents:** McManus, Kobayashi, Keaton  
**Status:** ✅ Complete

## What Happened

- **McManus** added What's New sections to README (v0.4.1–v0.5.2), updated upgrading and insider-program docs, verified migration docs
- **Keaton** wrote content architecture plan: README latest-only, docs/whatsnew.md for full history
- **McManus** created docs/whatsnew.md with releases v0.1.0–v0.5.2, trimmed README to v0.5.2 + link
- **Kobayashi** audited release state: v0.5.2 release exists, 86 tests pass, preview stale
- **Kobayashi** executed selective docs push: `git checkout dev -- docs/` → main, zero contamination, CI triggered

## Key Decisions

- Content split: Latest release in README (quick ref), full history in whatsnew.md
- Selective branch merge: docs only, no .ai-team/ files to main
- CI workflows: squad-docs for Pages, squad-release idempotent

## Outcomes

✅ Docs release ready for publication  
✅ CI triggered for Pages deployment  
✅ Release v0.5.2 published to GitHub  
✅ Team state isolated from main branch  
