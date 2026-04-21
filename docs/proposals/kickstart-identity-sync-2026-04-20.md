# Kickstart Identity Sync Proposal

**Date:** 2026-04-20  
**Author:** Flight (Lead)  
**Status:** DRAFT — Awaiting Ahmed's review  
**Scope:** GitHub App identity improvements only  
**Source analysis:**  
- `sabbour/kickstart` `.squad/scripts/resolve-token.mjs` vs Squad template `packages/squad-cli/templates/scripts/resolve-token.mjs`  
- `sabbour/kickstart` `.squad/identity/config.json` vs Squad's own `.squad/identity/config.json`  
- Squad SDK: `packages/squad-sdk/src/identity/{tokens,role-slugs,exec,storage,formatting,types}.ts`  
- Squad CLI: `packages/squad-cli/src/cli/commands/identity.ts`  
- Squad template: `packages/squad-cli/templates/squad.agent.md.template`

---

## Executive Summary

Kickstart's `resolve-token.mjs` has diverged from the Squad product template in five substantive ways. The most consequential is the addition of `resolveTokenWithDiagnostics` paired with a `--required` flag: without this, the `|| exit 1` fail-closed pattern used in `issue-lifecycle.md` spawn scripts fails silently when identity is misconfigured — the token is simply empty, no error is surfaced, and the agent proceeds under human credentials. The second major change is a config-aware `ROLE_ALIASES` table that resolves agent character names (Leela → lead, Fry → frontend, Bender → backend) to configured role slugs, bridging the gap between Squad's generic SDK role patterns and real-world teams that use character names. Three of the five changes are non-breaking additions to the template file; one requires a corresponding SDK change; one (the `scribe` role) requires a type system decision.

---

## Findings

### 1. `resolveTokenWithDiagnostics` — Structured Error Reporting

**What kickstart changed:**  
Added a new function `resolveTokenWithDiagnostics(projectRoot, roleKey)` that returns a structured result object instead of a nullable token:

```js
// Kickstart
const result = await resolveTokenWithDiagnostics(projectRoot, roleKey);
// result.token: string | null
// result.resolvedRoleKey: string | null
// result.error: string | null — specific reason on failure
```

The old `resolveToken()` becomes a one-line wrapper that forwards to `resolveTokenWithDiagnostics`:

```js
async function resolveToken(projectRoot, roleKey) {
  const result = await resolveTokenWithDiagnostics(projectRoot, roleKey);
  return result.token;
}
```

Error messages are now specific and actionable:
- `"No GitHub App mapping configured for role \"lead\"."` — role not in config
- `"Incomplete environment credentials for role \"lead\". Expected SQUAD_LEAD_APP_ID, SQUAD_LEAD_PRIVATE_KEY, and SQUAD_LEAD_INSTALLATION_ID."` — partial CI secrets
- `"No app registration found for role \"lead\" in .squad/identity/apps/lead.json."` — missing apps file
- `"No private key found for role \"lead\" at .squad/identity/keys/lead.pem."` — key file missing
- Any exception message from the JWT/API layer

**Squad's current behavior:**  
`resolveToken()` catches all errors and returns `null`. There is no way for callers to distinguish "not configured" from "config broken" from "API down." The existing `catch { return null }` swallows every error class indiscriminately.

**Problem it solves:**  
The `issue-lifecycle.md` spawn scripts use the fail-closed pattern:
```bash
TOKEN=$(node "{team_root}/.squad/scripts/resolve-token.mjs" --required "{role_slug}") || exit 1
```
With Squad's current template, if `--required` isn't supported (it isn't), this silently assigns an empty string to `TOKEN`. The `|| exit 1` never fires because the script exits 0. Agents proceed under human credentials without any warning.

**Belongs in Squad?** ✅ Yes — generic reliability improvement. The structured result type also enables the SDK to surface identity errors to the `squad identity status` command and to `execWithRoleToken`.

**Breaking?** ❌ Non-breaking — `resolveToken()` signature is preserved as a backward-compatible wrapper. The new function is purely additive.

**Target files:**
- `packages/squad-cli/templates/scripts/resolve-token.mjs` — add `resolveTokenWithDiagnostics` function
- `packages/squad-sdk/src/identity/tokens.ts` — add `resolveTokenWithDiagnostics` TypeScript counterpart and export it
- `packages/squad-sdk/src/identity/index.ts` — ensure new function is exported

**Priority:** CRITICAL  
**Effort:** small (the function is written; it's a port + type annotation)

---

### 2. `--required` Flag: Fail-Closed CLI Behavior

**What kickstart changed:**  
Added a `parseCliArgs()` function that parses `--required` (or `--write` as an alias). When `--required` is set and token resolution fails, the CLI exits with code 1 and prints the error message to stderr:

```js
if (result.token) {
  process.stdout.write(result.token);
} else if (required) {
  console.error(result.error ?? `Failed to resolve GitHub App token for role "${roleSlug}".`);
  process.exit(1);
}
```

Without `--required`, failure is silent (exit 0, empty stdout) — graceful degradation for `squad.agent.md.template`'s `if [ -n "$TOKEN" ]` style.

**Squad's current behavior:**  
The CLI takes only a positional role slug. On failure: empty stdout, exit 0. There is no `--required` flag. The fail-closed pattern in lifecycle scripts doesn't work.

**Problem it solves:**  
The `issue-lifecycle.md` has two distinct caller styles:
1. **Graceful** (spawn template): `TOKEN=$(node ... 'lead'); if [ -n "$TOKEN" ]; then export GH_TOKEN="$TOKEN"; fi` — fine with current behavior
2. **Fail-closed** (lifecycle scripts): `TOKEN=$(node ... --required 'lead') || exit 1` — requires `--required`

Without `--required`, the second pattern never actually fails closed. The agent receives an empty `TOKEN`, skips the `export GH_TOKEN` line, and all subsequent `gh` commands run under human credentials — silently, with no error.

**Belongs in Squad?** ✅ Yes.

**Breaking?** ❌ Non-breaking — purely additive flag; callers using positional-only invocation are unaffected.

**Target file:** `packages/squad-cli/templates/scripts/resolve-token.mjs`

**Priority:** CRITICAL  
**Effort:** trivial (5 lines)

---

### 3. `isCliInvocation` Guard — Dual-Mode File (CLI + Module)

**What kickstart changed:**  
Added a guard before the CLI entry point that checks whether the script is being invoked directly or imported:

```js
const isCliInvocation =
  typeof process.argv[1] === 'string' &&
  resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliInvocation) { /* CLI code */ }
```

Kickstart also exports `{ clearTokenCache, resolveRoleSlug, resolveToken, resolveTokenWithDiagnostics }` at module level, making the file usable as an ES module import.

**Squad's current behavior:**  
The CLI entry block runs unconditionally — the file is CLI-only, can't be imported. No exports.

**Problem it solves:**  
Makes `resolve-token.mjs` dual-mode: agents can `node ... lead` from the CLI (existing use), but squad workflows and scripts can also `import { resolveTokenWithDiagnostics } from '.squad/scripts/resolve-token.mjs'` in Node.js contexts. This is how kickstart's `ralph-triage.js` and other workflow scripts consume identity resolution without spawning a subprocess.

**Belongs in Squad?** ✅ Yes — this enables future workflow scripts to consume identity directly without forking a process.

**Breaking?** ❌ Non-breaking — existing CLI invocations continue to work. The guard only adds the ESM path.

**Target file:** `packages/squad-cli/templates/scripts/resolve-token.mjs`

**Priority:** HIGH  
**Effort:** trivial (10 lines)

---

### 4. Config-Aware `resolveRoleSlug` with `ROLE_ALIASES` Table

**What kickstart changed:**  
Added `loadIdentityConfig()`, `normalizeRoleKey()`, and `resolveRoleSlug(projectRoot, roleKey)` to `resolve-token.mjs`. The function:

1. Reads `config.json` to know what roles are actually registered
2. For `tier: 'shared'`, returns `'shared'` if `config.apps.shared` exists
3. Checks for an exact match in `config.apps` (e.g. `'lead'` → `'lead'`)
4. Falls through to `ROLE_ALIASES` lookup, but **only returns a resolution if the target role is in `config.apps`** — avoids resolving to a role that has no credentials

```js
const ROLE_ALIASES = {
  lead: ['lead', 'leela', 'architect', 'architecture', 'coordinator', 'squad'],
  zapp: ['zapp'],
  nibbler: ['nibbler'],
  ralph: ['ralph'],
  backend: ['backend', 'bender', 'core', 'core-dev', 'backend-dev'],
  frontend: ['frontend', 'fry', 'ui', 'frontend-dev'],
  tester: ['tester', 'hermes', 'qa', 'test', 'observability'],
  scribe: ['scribe'],
};
```

**Squad's current behavior:**  
`resolve-token.mjs` uses `roleKey` directly as the lookup key against `apps/{roleKey}.json` — no alias resolution. The SDK's `role-slugs.ts` does substring matching on role _titles_ (e.g., "Lead" → `lead`, "Frontend Developer" → `frontend`) but this code runs in the SDK, not in the stamped script. The two resolution strategies are diverging: SDK knows about role titles, the script knows only exact slugs.

**Problem it solves:**  
When an agent spawn prompt passes `role_slug: 'leela'` or `role_slug: 'bender'` (character names, not canonical slugs), the current script looks for `apps/leela.json` and fails silently. With the alias table, `'leela'` maps to `'lead'` and finds `apps/lead.json`. The config-awareness means a squad using only 3 roles (no `devops`, no `security`) won't accidentally resolve to a role it hasn't configured.

**Belongs in Squad?** ✅ Yes — the alias table is the right layer for agent name → role slug normalization. However, the kickstart alias table is Futurama-specific (contains `leela`, `fry`, `bender`, `hermes`, `zapp`, `nibbler`). The generic Squad alias table should include the generic patterns but not the character names.

**Recommended approach:** Port the mechanism and generic aliases; leave character-name aliases for user configuration. The generic aliases for Squad's template:
```js
const ROLE_ALIASES = {
  lead: ['lead', 'architect', 'architecture', 'coordinator', 'squad'],
  backend: ['backend', 'core', 'core-dev', 'backend-dev', 'api'],
  frontend: ['frontend', 'ui', 'frontend-dev'],
  tester: ['tester', 'qa', 'test', 'observability'],
  scribe: ['scribe'],
  devops: ['devops', 'infra', 'platform'],
  security: ['security', 'sec'],
  docs: ['docs', 'documentation', 'devrel', 'writer'],
  data: ['data', 'database', 'analytics'],
};
```
Character-name aliases (`leela`, `fry`, etc.) should NOT be in the generic template — they'd pollute all Squad installs with kickstart's cast.

**Alignment with SDK `role-slugs.ts`:** The SDK currently uses a substring-on-title approach and is consumed during `squad identity create` (to map team member roles to app slugs). The `resolve-token.mjs` alias table is complementary — it resolves at runtime, not setup time. These can coexist, but the canonical slug set should be aligned. See Finding #6 on the `scribe` type gap.

**Breaking?** ❌ Non-breaking — adds a resolution layer; direct-slug invocations still work.

**Target file:** `packages/squad-cli/templates/scripts/resolve-token.mjs`

**Priority:** HIGH  
**Effort:** small

---

### 5. Partial Env Credential Detection in `resolveEnvCredentials`

**What kickstart changed:**  
Changed `resolveEnvCredentials` to return `{ credentials, error }` instead of `credentials | null`. It now explicitly detects the case where some but not all env vars are set:

```js
const presentCount = [appIdStr, pemRaw, installIdStr].filter(Boolean).length;
if (presentCount === 0) return { credentials: null, error: null };       // not configured
if (presentCount !== 3) {
  return {
    credentials: null,
    error: `Incomplete environment credentials for role "${roleKey}". Expected SQUAD_${envKey}_APP_ID, SQUAD_${envKey}_PRIVATE_KEY, and SQUAD_${envKey}_INSTALLATION_ID.`,
  };
}
```

**Squad's current behavior:**  
```js
if (!appIdStr || !pemRaw || !installIdStr) return null;
```
If `SQUAD_LEAD_APP_ID` and `SQUAD_LEAD_PRIVATE_KEY` are set but `SQUAD_LEAD_INSTALLATION_ID` is forgotten, Squad returns `null` and falls through to the filesystem lookup, which may succeed with **different credentials** (the locally stored ones, not the CI-injected ones). This is a silent credential mismatch.

**Problem it solves:**  
Catches misconfigured GitHub Actions secrets — a common error when rotating credentials. The partial detection means a CI run with two of three secrets set will fail loudly with a specific message instead of silently falling back to local filesystem credentials.

The same bug exists in `packages/squad-sdk/src/identity/tokens.ts` `resolveEnvCredentials`.

**Belongs in Squad?** ✅ Yes.

**Breaking?** ❌ Non-breaking in behavior for correctly configured setups; previously-silent failures now surface.

**Target files:**
- `packages/squad-cli/templates/scripts/resolve-token.mjs`
- `packages/squad-sdk/src/identity/tokens.ts` — same fix, TypeScript version

**Priority:** HIGH  
**Effort:** small (10 lines per file)

---

### 6. `scribe` Role — Config and Type Gap

**What kickstart added:**  
Kickstart registers a dedicated GitHub App for the `scribe` role:
- `config.json`: `"scribe": { "appId": 3414032, "appSlug": "sabbour-squad-scribe", ... }`
- `ROLE_ALIASES`: `scribe: ['scribe']`

Squad's own `config.json` and `apps/` directory: 4 roles — `lead`, `backend`, `tester`, `frontend`. No `scribe`.

Squad's `types.ts` `RoleSlug` type: `'lead' | 'frontend' | 'backend' | 'tester' | 'devops' | 'docs' | 'security' | 'data'` — `scribe` is not in the type.

Squad's `ALL_ROLES` in `identity.ts`: same 8 roles — no `scribe`.

**Why Scribe needs its own identity:**  
Scribe posts retro-log PRs, pulse issues, velocity reports, and docs sweep issues. Without a scribe GitHub App:
- Retro-log PRs appear under the human user's account, not the bot
- The `squad-auto-merge.yml` trusted retro-log bypass (`TRUSTED_RETRO_AUTHORS`) can't match the expected bot author
- Pulse issues and velocity reports are unattributed to an agent identity

Kickstart's `squad-auto-merge.yml` already hardcodes `'sabbour-squad-scribe[bot]'` in `TRUSTED_RETRO_AUTHORS`. Without the scribe identity, the trusted bypass never fires.

**Belongs in Squad?** ✅ Yes — this is a generic improvement. Scribe is a first-class Squad team member that does meaningful automated work requiring bot identity.

**Breaking?** ❌ Non-breaking in terms of existing functionality — adding `scribe` as a role is purely additive. However, it requires a type system change in Squad's SDK.

**Changes required:**
1. `packages/squad-sdk/src/identity/types.ts` — add `'scribe'` to `RoleSlug` union
2. `packages/squad-cli/src/cli/commands/identity.ts` — add `'scribe'` to `ALL_ROLES` array and add a description to `ROLE_DESCRIPTIONS`
3. `packages/squad-cli/templates/scripts/resolve-token.mjs` — add `scribe: ['scribe']` to alias table (this is in Finding #4 but needs the type backing it)

**Open question:** Should `ralph` also get its own identity? Kickstart's `ROLE_ALIASES` includes `ralph: ['ralph']` but there's no registered Ralph app (no `apps/ralph.json`). Adding `ralph` to the type system without a clear use case adds noise. Recommendation: add `scribe` now (clear use case), defer `ralph` until there's a concrete need.

**Priority:** MEDIUM  
**Effort:** small

---

### 7. `execWithRoleToken` — Silent Fallback vs Diagnosed Failure

**Squad's current behavior in `exec.ts`:**  
```ts
try {
  token = await resolveToken(teamRoot, roleSlug);
} catch {
  // Identity not configured or PEM missing — proceed without injection
}
```
`resolveToken()` never throws (it catches internally), so this outer `catch` is dead code. When identity fails, `execWithRoleToken` silently runs the command with no `GH_TOKEN` injection — the human user's ambient auth is used without any log message.

**What kickstart implies (not explicitly changed, but enabled by #1):**  
With `resolveTokenWithDiagnostics` available, `execWithRoleToken` can log a diagnostic when identity is expected but missing, rather than silently proceeding. The fix is:
```ts
const result = await resolveTokenWithDiagnostics(teamRoot, roleSlug);
if (result.token) {
  process.env['GH_TOKEN'] = result.token;
} else if (result.error) {
  console.warn(`[identity] Token resolution failed for role "${roleSlug}": ${result.error}`);
  // Still proceeds — graceful fallback
}
```

**Belongs in Squad?** ✅ Yes — surfaces identity failures that currently go completely unnoticed.

**Breaking?** ❌ Non-breaking — behavior is unchanged; adds a warning log.

**Target file:** `packages/squad-sdk/src/identity/exec.ts`

**Priority:** MEDIUM  
**Effort:** trivial

---

### 8. Cache Key Uses Resolved Role Slug, Not Input Key

**What kickstart changed (subtle but correct):**  
In Squad's current `resolve-token.mjs`, the token cache is keyed by `roleKey` (the raw input). In kickstart, the cache is keyed by `resolvedRoleKey` (the output of `resolveRoleSlug`).

This matters when the same role can be addressed by multiple names: if you first resolve `'leela'` (which maps to `'lead'`) and then resolve `'lead'`, Squad's version populates the cache twice — both `leela` and `lead` entries — and fetches a new installation token for the second call. Kickstart's version finds the cached token on the second call because both inputs resolve to the same `resolvedRoleKey`.

The same bug exists in `packages/squad-sdk/src/identity/tokens.ts`, though it manifests there only when callers use different alias forms in separate `resolveToken` calls (less common in TypeScript context where callers usually pass canonical slugs).

**Belongs in Squad?** ✅ Yes.

**Breaking?** ❌ Non-breaking — eliminates redundant token fetches; no behavior change for single-alias callers.

**Target files:**
- `packages/squad-cli/templates/scripts/resolve-token.mjs`
- `packages/squad-sdk/src/identity/tokens.ts`

**Priority:** LOW (optimization)  
**Effort:** trivial

---

## Anti-List: Do NOT Port

| Item | Reason |
|------|--------|
| **`ROLE_ALIASES` Futurama names** (`leela`, `fry`, `bender`, `hermes`, `zapp`, `nibbler`) | These are kickstart's specific cast names. Shipping them in Squad's template would pollute all installs with names that mean nothing to other teams. Teams should add their own cast aliases locally. |
| **`ralph: ['ralph']` in `ROLE_ALIASES`** | Kickstart includes Ralph in the alias table but has no registered Ralph app. Until there's a concrete use case for Ralph-attributed GitHub API calls, don't add it to Squad's canonical role set. |
| **`nibbler: ['nibbler']` and `zapp: ['zapp']` in `ROLE_ALIASES`** | Same reasoning — kickstart-specific role names without generic equivalents. |
| **Kickstart's `config.json` scribe app credentials** (appId 3414032) | These are Ahmed's personal GitHub App credentials. The GENERIC Squad improvement is adding `scribe` to the type system and role set — not copying kickstart's specific app registration. |
| **`--write` as alias for `--required` in CLI** | Kickstart uses `--write` as a synonym for `--required`. This alias has no semantic meaning outside kickstart's conventions. Only port `--required`. |

---

## Breaking vs Non-Breaking Summary

| Finding | Breaking? | Notes |
|---------|-----------|-------|
| #1 `resolveTokenWithDiagnostics` | ❌ Non-breaking | New function; `resolveToken` wrapper preserved |
| #2 `--required` flag | ❌ Non-breaking | New flag; existing positional invocations unchanged |
| #3 `isCliInvocation` guard + ESM exports | ❌ Non-breaking | Adds module export path; CLI path unchanged |
| #4 Config-aware `resolveRoleSlug` + generic aliases | ❌ Non-breaking | Adds resolution layer; direct slug calls still work |
| #5 Partial env credential detection | ⚠️ Behavioral | Previously-silent partial-config failures now exit 1 with `--required`. Any CI job with partial secrets set will now fail loudly (correct behavior, but teams need to notice). |
| #6 `scribe` role addition | ⚠️ Type change | Adds to `RoleSlug` union. Non-breaking for callers, but requires SDK version bump. |
| #7 `execWithRoleToken` warning log | ❌ Non-breaking | Adds stderr warning; no behavior change |
| #8 Cache key fix | ❌ Non-breaking | Eliminates redundant fetches; no observable behavior change for single-alias callers |

---

## Recommended Execution Order

These form a clear dependency chain:

1. **#1 + #2 + #3 + #5 together** — `resolveTokenWithDiagnostics`, `--required`, `isCliInvocation` guard, and partial env detection are all changes to the same section of `resolve-token.mjs`. Land them as one PR to avoid multiple churn passes on the same file. This is the highest-leverage change and has zero dependencies.

2. **#4 `resolveRoleSlug` + generic `ROLE_ALIASES`** — can land in the same PR as #1-3 (same file), or as a follow-up. Requires deciding the generic alias set (see Open Questions).

3. **#6 `scribe` role** — `types.ts` + `identity.ts` + alias table. Requires a Squad SDK version bump. Can land independently; does not depend on #1-5.

4. **#7 `execWithRoleToken` warning** — trivial follow-up to #1; depends on `resolveTokenWithDiagnostics` being in the SDK.

5. **#8 Cache key fix** — trivial; can land with any of the above or independently.

---

## Open Questions for Ahmed

1. **Generic alias set for `ROLE_ALIASES`:** The proposal above suggests a generic set excluding Futurama names. Should Squad's template include any character-name stubs as documentation examples, or keep the alias table strictly generic?

2. **`scribe` vs `ralph` in canonical roles:** Scribe has a clear need (retro-log PRs, pulse issues). Ralph's GitHub API usage is read-heavy (listing issues, reading PRs) — does Ralph need to author any GitHub objects that require bot identity, or can it continue using human auth for read operations?

3. **SDK version bump for `scribe` in `RoleSlug`:** Adding `scribe` to the `RoleSlug` type is technically a minor version change per semver (new member in a union). Is there a target milestone for this, or does it ship in the next available release?

4. **`resolveTokenWithDiagnostics` in SDK public API:** Should this function be exported from `@bradygaster/squad-sdk` as a stable public API, or kept as an internal implementation detail (only the template's `.mjs` file surfaces it)? The answer affects how third-party workflow scripts consume identity.

5. **`--write` alias:** Kickstart uses `--write` as a synonym for `--required`. Is this alias meaningful in Squad's context, or should it be omitted from the template entirely?
