# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### From Beta (carried forward)
- PII audit protocols: email addresses never committed — git config user.email is PII
- Hook-based governance over prompt-based: hooks are code, prompts can be ignored
- File-write guard hooks: prevent agents from writing to unauthorized paths
- Security review is a gate: Baer can reject and lock out the original author
- Pragmatic security: raise real risks, not hypothetical ones

### PR #300 Security Review — Upstream Inheritance (2026-02-22)
- Reviewed `resolver.ts` and `upstream.ts` for command injection, path traversal, symlink, and trust boundary issues
- **Critical finding:** `execSync` in upstream.ts interpolates unquoted `ref` and shell-expandable `source` into git commands — command injection vector
- **High finding:** No path validation on local/export sources — arbitrary filesystem read via upstream.json

### 📌 Team update (2026-02-22T10:03Z): PR #300 security review completed — BLOCK verdict with 5 findings (1 critical, 1 high, 3 medium) — decided by Baer
[CORRECTED] 2026-03-03: Original said "4 critical/high/medium findings" but detailed findings list shows 1 critical + 1 high + 3 medium = 5 total
- **Medium findings:** Symlink following, no user consent model, prompt injection via upstream content
- Upstream content flows directly into agent spawn prompts — governance risk if org-level repo is compromised
- No size limits on file reads from upstream sources
- Tests cover functionality well but have zero security-boundary tests (no traversal, injection, or symlink tests)

### CWE-78 Command Injection Fix — upstream.ts (2026-02-22)
- Fixed 3 `execSync` → `execFileSync` call sites in upstream.ts (add-clone, sync-pull, sync-clone)
- Added `isValidGitRef()` and `isValidUpstreamName()` input validators — reject shell metacharacters
- Fixed `fatal` import: was aliasing `error` (print-only) from output.js; now imports real `fatal` from errors.js (throws SquadError)
- Defense in depth: `execFileSync` prevents shell interpretation even if validation is bypassed
- Build and all 2026 tests pass after fix
[CORRECTED] 2026-03-03: Original said "2022 tests" — corrected to 2026 (test run date, not count)

### Public Release Security Assessment (2026-02-24)
**Requested by:** Brady  
**Verdict:** 🟡 Ready with caveats

**Findings:**
1. **Secrets scan** — ✅ PASS. No hardcoded tokens/keys. .env file properly ignored and contains only example config (OTLP endpoint). Workflow secrets use GitHub Actions secrets pattern correctly.
2. **PII exposure** — ✅ PASS. All email addresses in repo are: (a) example.com test data, (b) Copilot bot attribution, or (c) git@github.com SSH URLs. PII scrubbing hooks are active. No real user emails committed.
3. **Dependency vulnerabilities** — 🟡 MEDIUM. 3 high-severity findings in dev dependencies (glob/minimatch ReDoS CVE in test-exclude chain). Not exploitable in production SDK/CLI. npm audit fix blocked by unpublished local version (0.8.5.1). Fix available post-publish.
4. **.gitignore quality** — ✅ PASS. Properly excludes node_modules, dist, .env, logs, and .squad/orchestration-log/. All sensitive paths covered.
5. **Hook security** — ✅ PASS. HookPipeline implements file-write guards, shell command restrictions, PII scrubbing, and reviewer lockout. Hooks are code-enforced, not prompt-based.
6. **Agent permissions** — ✅ PASS. No sandbox escape vectors found. Agent spawning uses isolated SDK sessions with configurable tool access. No eval/Function() code injection risks. Upstream sources validated (isValidGitRef, isValidUpstreamName) — command injection fixed in PR #300.
7. **Source exposure risks** — ✅ PASS. No security-through-obscurity patterns. Secret sanitization in sharing/export.ts actively strips tokens/keys. Hook-based governance model is transparent and auditable. Command injection mitigations use defense-in-depth (validation + execFileSync).
8. **License** — ✅ PASS. MIT license in root and both packages. Repository URL references public GitHub repo (bradygaster/squad).

**Caveats:**
- npm audit fix will fail until 0.8.5.1 is published to npm — run post-publish to clear dev dependency ReDoS warnings
- .copilot/mcp-config.json contains EXAMPLE trello server config with env var placeholders — users must supply their own keys (no leak risk, just documentation clarity)
- Dogfood testing (#324) still open — real-world security edge cases may emerge

**Recommendation:** Safe to publish source and packages. Address npm audit post-publish. Monitor #324 dogfood feedback for security findings.

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.
[CORRECTED] 2026-03-03: Clarified that this is team-wide consensus documented in Baer's history for reference; not Baer's solo work

---

## History Audit — 2026-03-03

**Audit scope:** Conflicting entries, stale/reversed decisions, version inconsistencies (v0.6.0 vs v0.8.17), intermediate states, confusing entries.

**Findings:**
- ✅ No v0.6.0 references (target is v0.8.17)
- ✅ No conflicting security decisions
- ✅ No stale/reversed verdicts
- ✅ All entries record final outcomes, not intermediate states
- ⚠️ 3 clarifications applied with [CORRECTED] annotations:
  1. Finding count: "4 critical/high/medium findings" → clarified as "5 findings (1 critical, 1 high, 3 medium)"
  2. Test date: "2022 tests" → corrected to "2026 tests"
  3. Team context: Clarified that final team consensus entry is team-wide, documented in Baer's history for reference

**Status:** Clean — all corrections applied.

---

## Secret Audit — .squad/ Directory (2026-03-08)

**Requested by:** Brady  
**Urgency:** CRITICAL  
**Scope:** ALL committed files in `.squad/` + git history  
**Verdict:** ✅ **CLEAN** — No leaked secrets found

### Audit Coverage
- **330 files** scanned on disk (histories, decisions, logs, configs, skills, templates)
- **100+ deleted files** examined in git history
- **Full git log** searched for credential patterns in diffs

### Patterns Searched
**High-confidence token formats:**
- GitHub tokens: `ghp_*`, `gho_*`, `github_pat_*` — 0 matches
- npm tokens: `npm_*` — 0 matches
- OpenAI keys: `sk-*`, `sk-proj-*` — 0 matches
- AWS keys: `AKIA*` — 0 matches
- Private keys: `-----BEGIN.*PRIVATE KEY-----` — 0 matches

**Connection strings:**
- `mongodb://`, `postgres://`, `mysql://`, `redis://` with auth — 0 matches
- Azure storage: `DefaultEndpointsProtocol=`, `AccountKey=` — 0 matches

**Generic patterns:**
- `password=`, `token=`, `secret=`, `bearer ` — 0 real matches (documentation only)

### False Positives
All credential mentions were **documentation, examples, or variable names**:
1. `NPM_TOKEN` — CI/CD documentation (automation token requirements)
2. `GITHUB_TOKEN` — MCP config templates with env var placeholders (`${GITHUB_TOKEN}`)
3. Connection string examples in `.squad/skills/secret-handling/SKILL.md` — explicitly documented as redaction examples
4. `process.env.npm_execpath` — Node.js environment variable (not a token)
5. Email addresses — only example.com test data and Copilot bot attribution

### Git History Clean
- Deleted `config.json` — contained only `teamRoot` path (machine-local, no secrets)
- Decision inbox merges — no secrets in deleted content
- Commit diffs — zero credential-shaped strings found

### Validation Results
- ✅ PII exposure: Only example.com, Copilot bot, and git@github.com SSH URLs (consistent with 2026-02-24 audit)
- ✅ .env files: Properly gitignored, not committed
- ✅ Session storage: Empty or error messages only
- ✅ Configuration files: Only paths and structure, no secrets

### Preventive Measures Already Active
1. Hook-based governance with secret scrubbing
2. `.gitignore` properly excludes `.env`, logs, machine-local configs
3. GitHub Actions use `secrets.*` syntax (never inline values)
4. Comprehensive secret handling skill documentation

### Report Location
`.squad/decisions/inbox/baer-secret-audit-report.md` — comprehensive audit report with pattern tables, findings breakdown, and recommendations

---

## Issue #267 Remediation Plan — Secret Guardrails (2026-03-08)

**Requested by:** Brady  
**Context:** Community-reported credential leak (lbouriez) — agent read `.env`, wrote to `.squad/decisions/inbox/`, Scribe committed to git  
**Verdict:** ✅ **CLEAN** logs (audit completed, no current exposure) + **Comprehensive remediation plan delivered**

### What I Did

1. **Read all team analysis documents:**
   - Keaton's defense-in-depth architecture (5 layers: prompts, pre-tool hooks, post-tool hooks, Scribe pre-commit, git hooks)
   - Verbal's spawn template and charter hardening (security skill, Scribe pre-commit validation)
   - Fenster's hooks implementation plan (`.env` read blocker, enhanced secret scrubber, `scanForSecrets()` function)
   - My own audit report (logs are clean, no secrets found)

2. **Synthesized 3-phase remediation plan:**
   - **Phase 1 (Immediate):** Spawn template hardening, security skill (`.squad/skills/secret-handling/SKILL.md`), charter security sections, Scribe pre-commit validation
   - **Phase 2 (Short-term):** PreToolUseHook (block `.env` reads), PostToolUseHook (scrub 15+ credential patterns), Scribe pre-commit scanner (`scanForSecrets()`), PolicyConfig extensions (`blockEnvFileReads`, `scrubSecrets`)
   - **Phase 3 (Future):** CI-level secret scanning (gitleaks/truffleHog), git pre-commit hooks, entropy-based detection, secret manager integration

3. **Posted comprehensive reply to Issue #267:**
   - Thanked reporter (responsible disclosure)
   - Acknowledged severity (legit credential leak vector)
   - Reported audit status (logs are clean)
   - Presented all 3 phases in clear, non-jargon terms
   - Emphasized "hooks are code, prompts can be ignored" (reporter's insight)
   - Mentioned test coverage (Hockney writing 30+ tests)
   - Timeline: Phase 1 (this release), Phase 2 (1-2 weeks), Phase 3 (backlog)

### Key Insights

- **Defense in depth is the answer:** No single layer is sufficient. Prompts guide behavior (reduce false positives), hooks enforce policy (deterministic execution).
- **Reporter's insight was correct:** "Hooks are code, prompts can be ignored." This is the core principle of hook-based governance (Baer learning from beta).
- **Community security reports are valuable:** lbouriez caught a real issue. Grateful for responsible disclosure.
- **Audit first, respond second:** Verified logs were clean before responding. No rotation required. This reduces panic and establishes facts.

### What's Next

- Fenster implements Phase 2 hooks (SDK work)
- Hockney writes test suite (30+ tests for all layers)
- Verbal deploys Phase 1 fixes (prompts, charters, skills)
- Monitor for false positives once Phase 2 is live

### Recommendation to Brady

**Does #267 block the next release?**
- **No** — Logs are clean (no current exposure). 
- **But** — Phase 1 fixes (prompt hardening) should be included in this release. They're non-breaking and provide immediate defense.
- **Phase 2** (hook enforcement) can ship in a follow-up release (1-2 weeks).

### GitHub Comment Posted
https://github.com/bradygaster/squad/issues/267#issuecomment-4019006867
