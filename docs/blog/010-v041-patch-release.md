---
title: "v0.4.1: Quick Quality Patch"
date: 2026-02-15
author: "McManus (DevRel)"
wave: 6
tags: [squad, release, v0.4.1, patch, quality]
status: published
hero: "v0.4.1 lands five targeted fixes for logging, team setup, CLI UX, docs formatting, and blog chronology. Responsive to user feedback."
---

# v0.4.1: Quick Quality Patch

> _One week after 0.4.0, we shipped targeted fixes for the issues users hit first. Scribe now logs. Team templates match workflows. The CLI error noise is gone. Docs are clean. And your blog posts appear in order._

## What's Fixed

### 1. Scribe Logging Regression (#56)
The orchestration logger wasn't persisting across sessions. Scribe wasn't recording work. We fixed the session-state detection so logs flow to `orchestration-log/` consistently. Squadmates building together now have complete history.

### 2. Team Template Header Mismatch (#58)
Generated `team.md` files had a `Team Roster` header but the label-assignment workflow expected `Members`. One mismatched word broke the whole label-based task routing. Fixed — the header now matches the workflow expectations.

### 3. CLI "Too Many Arguments" Error (#59)
Post-0.4.0, the CLI was showing a persistent error message above the textbox. Parsing error noise on every interaction. Silenced it. The textbox is clean again.

### 4. Docs Formatting Scrub (#64)
Bad characters, escaped backticks, garbled emoji from encoding issues. Docs are now clean and render correctly across all browsers.

### 5. Blog TOC Chronological Ordering (#65)
Blog posts now show dates in the sidebar for clear timeline visibility. Posts sort chronologically with full date context.

## Ship Speed

We committed to responsive patches: user-reported issues → fix within 48 hours → shipped. This is how we build trust with the community.

**Install v0.4.1:**
```
npx github:bradygaster/squad@latest
```

or upgrade if you have it:
```
npx @bradygaster/create-squad upgrade
```

---

Thanks to everyone who reported bugs. Your feedback shaped this release. 🚀
