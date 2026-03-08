# Fortier — History

## Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

📌 **Team update (2026-03-08):** Currently triaging #265 (Node 24+ ESM import crash) — investigating if v0.8.23 fix landed or if v0.8.24 needs resolution. This is release-blocking for Trejo. Secret handling skill created (`.squad/skills/secret-handling/SKILL.md`). All 13 team decisions merged to decisions.md for your reference. Fenster's lazy imports + postinstall patch designed to unblock `squad init` on Codespaces.

## Core Context

**SDK Architecture & OTel (Feb 21–22):** Implemented StreamingPipeline bridge + ShellRenderer for streaming event handling. Implemented ShellLifecycle for agent discovery from team.md + state management. Decided runtime/event-bus.ts as canonical (colon-notation, error isolation) vs client/event-bus.ts. Implemented Coordinator + RalphMonitor with EventBus subscriptions + cleanup patterns. Wired full OTel provider (NodeSDK) + bridge (TelemetryEvent → OTel spans) with version skew mitigation. Wired session traces (sendMessage span parent/child, closeSession alias) + latency metrics (TTFT, duration, tokens/sec) with opt-in tracking via markMessageStart(). Phase 2 shipped in parallel with Fenster/Edie/Hockney (1940 tests passing). Wired REPL Shell coordinator (lazy session creation, parallel MULTI routing via Promise.allSettled). **[CORRECTED — Feb 24 work summary, final state]** Wave 2 polish: rich welcome header (brand + version + team roster with emoji + focus), compact inline AgentPanel (flexWrap + role emoji + status indicators), MessageStream (cyan/dim/green user/system/agent messages, thin separators, ThinkingIndicator with braille spinner), InputPrompt dynamic prompt. All startup data loading non-blocking via useEffect + filesystem reads. Role-to-emoji mapping lives in lifecycle.ts alongside team manifest parsing (design cohesion).

## Learnings

### From Beta (carried forward)
- Event-driven over polling: always prefer event-based patterns
- Streaming-first: async iterators over buffers — this is a core design principle
- Graceful degradation: if one session dies, others survive
- Node.js ≥20: use modern APIs (structuredClone, crypto.randomUUID, fetch, etc.)
- ESM-only: no CJS shims, no dual-package hazards
- Cost tracking and telemetry: runtime performance is a feature, not an afterthought

### Architecture Patterns (Issues #239, #240, #303)

---

📌 Team update (2026-02-24T07:20:00Z): Wave D Batch 1 work filed (#488–#493). Cheritto: #488–#490 (UX precision — status display, keyboard hints, error recovery). Kovash: #491–#492 (hardening — message history cap, per-agent streaming). Fortier: #493 (streamBuffer cleanup on error). See .squad/decisions.md for details. — decided by Keaton

📌 Team update (2026-02-24T08:12:21Z): Wave D Batch 1 COMPLETE — all 3 PRs merged to main, 2930 tests passing (+18 new). Fortier: #499 shipped Per-Agent Streaming Content. — decided by Scribe


### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

---

## Version Context — v0.6.0 vs v0.8.17

**[CORRECTED — 2026-03-03]:** Team discussions included confusion around public release version target. Brady initially directed v0.6.0, then EXPLICITLY REVERSED it. Correct target: v0.8.17 for both npm packages AND public repo GitHub tag. All migration documentation (docs/migration-checklist.md, docs/migration-guide-private-to-public.md) correctly reference v0.8.17. This is documented in .squad/decisions.md lines 787–1610 with detailed corrections.

---

## History Audit — 2026-03-03

**Audit Results:** 2 corrections made.
- Clarified Feb 24 wave work summary as final state (not intermediate)
- Added critical v0.6.0 vs v0.8.17 version context to prevent future spawn confusion

---

## Issue #265 Triage — npx Install Failure (2026-03-08)

**Problem:** `npx @bradygaster/squad-cli` crashes with `ERR_MODULE_NOT_FOUND` on Node 24+ due to upstream `@github/copilot-sdk@0.1.32` ESM bug (`session.js` imports `vscode-jsonrpc/node` without `.js` extension). Global install works (postinstall patch runs), but npx fails (cache skips postinstall on 2nd+ run).

**Root cause:** NPX uses `~/.npm/_cacache` and **skips lifecycle hooks on cache hits** for performance (documented npm behavior: npm#8079, npm#10379). Postinstall-only patching can't fix npx.

**Solution:** Implemented **hybrid approach**:
1. ✅ Keep postinstall patch (`scripts/patch-esm-imports.mjs`) for global installs
2. ✅ Add runtime fallback (`cli-entry.ts`) that patches `Module._resolveFilename` before any imports
3. ✅ Works everywhere: npx (cache hit/miss), global install, CI/CD

**Key learning:** For ESM import patching, **runtime > install-time** when npx is a supported install method. Runtime patches survive cache optimizations, install-time patches don't.

**Code:** `packages/squad-cli/src/cli-entry.ts` lines 40-58  
**Priority:** P1 — High (affects primary onboarding path, workaround exists)  
**Status:** Fixed (pending next release)  
**Upstream:** https://github.com/github/copilot-sdk/issues/707 (still open)
