### 2026-02-20: Network Interrupted → Model Unavailable — Root Cause Diagnosis

**Reporter:** Kujan  
**Context:** Brady experiencing "network interrupted followed by model not available" errors both BEFORE and AFTER the 35% squad.agent.md size reduction (commit eee3425).  
**Hypothesis tested (and failed):** Reducing squad.agent.md from 105KB to 68KB would fix the errors.

---

## Root Cause: decisions.md Context Bomb

**The 322KB decisions.md file (~80K tokens) is the actual culprit.**

### Evidence

1. **decisions.md is 322KB** (316,578 chars, 4,074 lines) — approximately **80,000 tokens**
2. **Every Standard mode spawn loads decisions.md** — line 677 in squad.agent.md: `Read .ai-team/decisions.md (team decisions to respect).`
3. **Standard mode is the default** — line 262: "This is the current default"
4. **Each agent reads decisions.md at spawn time** — line 584: "All agents READ from `.ai-team/decisions.md` at spawn time"
5. **squad.agent.md is 68KB** (~17K tokens) — the 35% reduction is real but insufficient
6. **Total context per agent spawn in Standard mode:**
   - squad.agent.md (coordinator): ~17K tokens (always loaded)
   - decisions.md: ~80K tokens (loaded by every agent)
   - Agent charter (inline): ~2K tokens
   - Agent history.md: variable (typically 2-10K tokens)
   - Skills: variable (0-5K tokens)
   - **BASE LOAD: ~100-115K tokens BEFORE any user content**

7. **Context window limit is 128K tokens** — this leaves only 13-28K tokens for:
   - User prompt
   - File content being edited/reviewed
   - Agent reasoning
   - Response generation

### Why the 35% Reduction Didn't Fix It

The squad.agent.md reduction saved ~10.5K tokens (from ~27.5K to ~17K). But decisions.md adds ~80K tokens to EVERY agent spawn. The math:

- **Before reduction:** 27.5K (coordinator) + 80K (decisions) + 10K (agent context) = **117.5K tokens baseline**
- **After reduction:** 17K (coordinator) + 80K (decisions) + 10K (agent context) = **107K tokens baseline**
- **Savings:** 10.5K tokens freed up
- **Problem:** Still hitting 107K baseline, leaving only 21K tokens for actual work

When agents need to read files, diff code, or reason about complex changes, that remaining 21K tokens evaporates instantly.

### The "network interrupted → model not available" Sequence

This is NOT a network issue — it's a context overflow failure mode:

1. **Agent spawn hits context limit** during initial tool calls (reading files)
2. **Platform retries with fallback model** (per fallback chain in squad.agent.md lines 357-389)
3. **Fallback chain exhausts** (3 retries maximum per line 359)
4. **Nuclear fallback** invoked (omit model param, line 367)
5. **Nuclear fallback ALSO fails** because context pressure is structural, not model-specific
6. **Platform surfaces this as:** "network interrupted" (first retry failure) followed by "model not available" (fallback chain exhaustion)

This matches the **"Server Error Retry Loop"** pattern mentioned in line 720 — "context overflow after fan-out."

The prior fix (commit 8ce12e7) moved orchestration logging from coordinator to Scribe specifically to prevent this exact retry loop. That fixed one source of context pressure. decisions.md is another.

### Why Sonnet Might Not Help

Brady's trying Sonnet as the default model. This is unlikely to fix the errors because:

1. **Same context window:** Sonnet has the same 128K token limit as Haiku
2. **Same context pressure:** 107K baseline is still 107K baseline regardless of model
3. **Fallback chain still exhausts:** Sonnet is already IN the fallback chain (line 364: "claude-sonnet-4.6")

Sonnet MIGHT reduce retry frequency if Haiku rate limits are the trigger (Sonnet has higher throughput), but it won't fix the underlying context overflow.

---

## The Actual Fix

**Reduce decisions.md size below 40KB (~10K tokens).**

Three approaches, in order of effectiveness:

### Option 1 (Immediate): Archive Old Decisions

Scribe already has this mitigation (line 756): "If decisions.md exceeds ~20KB, archive entries older than 30 days to decisions-archive.md."

**Problem:** decisions.md is 322KB, so the 20KB threshold check is failing or not running. The threshold should be enforced more aggressively.

**Action:**
1. Lower threshold from 20KB to **40KB** (gives breathing room)
2. Archive aggressively — decisions older than 14 days, not 30 days
3. Manually run archival NOW to clear the backlog
4. Add a coordinator check at session start: if decisions.md > 40KB, spawn Scribe IMMEDIATELY to archive before any other work

**Expected outcome:** decisions.md drops to ~40KB, freeing ~40K tokens. Total baseline becomes ~67K tokens, leaving 61K tokens for actual work.

### Option 2 (v0.5.0): Tiered Decision Loading

Not all agents need all decisions. Implement decision scoping:

- **Lead/Coordinator:** Full decisions.md
- **Specialist agents (Dev/Tester/Designer):** Only decisions tagged for their domain
- **Scribe:** Full decisions.md (needs to merge)

**Implementation:** Add frontmatter tags to decisions, filter reads based on agent role.

**Expected outcome:** Per-agent baseline drops to ~50-70K tokens depending on role.

### Option 3 (v0.5.0): Multi-Agent Split

Verbal's recommendation from the context review — split squad.agent.md into:
- `squad-init.agent.md` (Init mode only)
- `squad-coordinator.agent.md` (Team mode orchestration)
- `squad-features.agent.md` (Feature modes: Ralph, GitHub Issues, PRD)

This doesn't fix decisions.md bloat but reduces coordinator baseline further (from 17K to ~10K tokens), buying more headroom.

**Not a priority** until decisions.md is under control.

---

## Recommendation

**IMMEDIATE (today):**
1. Manually archive decisions.md entries older than 30 days to decisions-archive.md (target: get decisions.md below 80KB)
2. Lower Scribe's archive threshold from 20KB to 40KB
3. Change archive window from 30 days to 14 days
4. Test with Brady's workflow

**v0.5.0:**
1. Implement tiered decision loading (Option 2)
2. Add session-start decision size check with auto-archive

**Decision size monitoring:**
- Add to Ralph's health checks: flag if decisions.md > 40KB
- Add to coordinator session start: spawn Scribe if decisions.md > 60KB

---

## Why This Wasn't Obvious

The error message "network interrupted → model not available" is misleading — it sounds like infrastructure, not context overflow. The actual failure is buried in the retry/fallback chain behavior.

Context pressure is additive across multiple files:
- squad.agent.md (visible, got attention)
- decisions.md (invisible until measured)
- Agent history.md files (variable, typically small)
- Skills (variable, typically small)

The 35% squad.agent.md reduction was directionally correct but insufficient because decisions.md is 4.6x larger than squad.agent.md (322KB vs 68KB).

---

## Validation

After archival:
1. Check decisions.md size: should be < 80KB
2. Run Brady's typical workflow (multi-agent spawns)
3. Monitor for "network interrupted" errors
4. If errors persist, decisions.md needs further reduction (target 40KB)

If errors STILL occur after decisions.md is < 40KB, investigate:
- Agent history.md sizes (check for bloat)
- Skills directory (check for large SKILL.md files)
- Actual model rate limits (separate from context pressure)
