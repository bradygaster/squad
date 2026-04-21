# Identity Hardening Roadmap

**Author:** Flight (Squad Lead)  
**Date:** 2026-04-20  
**Status:** Proposal — awaiting Ahmed's prioritisation  
**Context:** Full code audit of `packages/squad-sdk/src/identity/tokens.ts`, `exec.ts`, `types.ts`, `storage.ts`, `role-slugs.ts`, `packages/squad-cli/src/cli/commands/identity.ts`, and `packages/squad-cli/templates/scripts/resolve-token.mjs`  
**Related:** `docs/proposals/kickstart-identity-sync-2026-04-20.md` (kickstart diff findings)

---

## Executive Summary

The identity system has a solid foundation: RS256 JWTs with correct clock-skew handling, a 10-minute cache refresh margin, `GH_TOKEN` restoration in a `finally` block, and a reasonable test suite covering JWT structure, cache behaviour, env-var override, and root derivation.

What it lacks is **production hardening**: timeouts, retry, structured errors, and observability. The result is a system that works perfectly in the happy path and fails silently or hangs on every deviation from it. An agent running a long pipeline can hang indefinitely on a network hiccup, proceed silently under human credentials when an identity isn't configured correctly, or surface a cryptic crypto error when a PEM is malformed — none of which give the operator enough information to act.

This roadmap identifies **14 items** across reliability, security, observability, and ergonomics. It also documents what is already working well so reviewers can calibrate the severity of remaining gaps.

---

## What's Already Working Well

| Area | Status |
|------|--------|
| JWT `iat` backdated 60s for clock-skew tolerance | ✅ |
| JWT 9-minute TTL (stays within GitHub's 10-minute max) | ✅ |
| RS256 signing, correct header (`alg: RS256, typ: JWT`) | ✅ |
| 10-minute cache refresh margin | ✅ |
| `clearTokenCache()` exported as test hook | ✅ |
| `GH_TOKEN` restored in `finally` block after `withRoleToken` | ✅ |
| `.squad/identity/keys/` excluded in `.gitignore` | ✅ |
| Base64 PEM decoding from env vars (safe for CI secrets) | ✅ |
| Tests: JWT structure, cache, env-var override, no-token-disclosure, root derivation | ✅ |

---

## Findings by Priority

### CRITICAL

---

#### H-01 · No timeout on `fetch()` in `getInstallationToken`
**Files:** `tokens.ts` line ~83, `resolve-token.mjs` line ~88  
**Effort:** S · **Priority:** CRITICAL

**Problem:**  
Both the SDK and the stamped script call `fetch()` with no timeout. If GitHub's API is slow or unresponsive, the call hangs indefinitely. An agent script spawned by `issue-lifecycle.md` during a pipeline run will block the entire workflow step — no timeout, no exit.

**Proposed fix:**  
```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10_000); // 10s
try {
  const response = await fetch(url, { headers, signal: controller.signal });
} finally {
  clearTimeout(timer);
}
```
Throw a clear `IdentityError('network_timeout', ...)` on abort rather than letting the `AbortError` surface raw.

**Impact if not fixed:** Any GitHub API latency spike silently hangs all agent workflows that attempt token resolution.

---

#### H-02 · PEM format not validated before `createSign`
**Files:** `tokens.ts` line ~55, `resolve-token.mjs` line ~60  
**Effort:** S · **Priority:** CRITICAL

**Problem:**  
`generateAppJWT(appId, pem)` passes the raw PEM string to `createSign('RSA-SHA256').sign(pem)`. If the PEM is corrupted, wrong format (e.g., an EC key instead of RSA), or truncated, Node.js throws `ERR_INVALID_ARG_VALUE` or `ERR_OSSL_PEM_NO_START_LINE`. Both are caught by the outer `try/catch` in `resolveToken` and swallowed — the caller gets `null` with no indication that the key file itself is the problem.

**Proposed fix:**  
Add a lightweight format check before signing:
```typescript
if (!privateKeyPem.includes('PRIVATE KEY')) {
  throw new IdentityError('invalid_pem', `PEM at path does not appear to be a private key`);
}
// For strict validation, attempt createPrivateKey() and catch up front:
try {
  createPrivateKey(privateKeyPem); // from node:crypto
} catch (e) {
  throw new IdentityError('invalid_pem', `Key file is not a valid private key: ${(e as Error).message}`);
}
```

**Impact if not fixed:** A rotated key file saved incorrectly gives no useful error — the operator sees `null` token and must guess what went wrong.

---

### HIGH

---

#### H-03 · No retry for transient GitHub API failures
**Files:** `tokens.ts` `getInstallationToken`, `resolve-token.mjs`  
**Effort:** M · **Priority:** HIGH

**Problem:**  
`getInstallationToken` makes a single `fetch()` attempt. GitHub returns 429 (rate-limited) and 5xx errors routinely at scale. A single transient failure silently returns `null` from `resolveToken`, and the agent proceeds under human credentials. There is no indication that a retry would have succeeded.

**Proposed fix:**  
Exponential backoff with jitter, bounded to 3 attempts:
```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  const response = await fetch(url, { headers, signal });
  if (response.ok) return parseToken(response);
  if (response.status === 429 || response.status >= 500) {
    if (attempt < 2) {
      await sleep(250 * 2 ** attempt + Math.random() * 100);
      continue;
    }
  }
  throw new IdentityError('api_error', `GitHub API ${response.status}`);
}
```

**Impact if not fixed:** Any CI run during a GitHub API blip silently downgrades all agents to human credentials.

---

#### H-04 · `resolveToken` silently swallows all errors
**Files:** `tokens.ts` lines ~215–225, `resolve-token.mjs` lines ~195–205  
**Effort:** S · **Priority:** HIGH

**Problem:**  
The entire resolution chain is wrapped in `try { ... } catch { return null }`. This is correct for "not configured" cases (PEM missing, no registration file) but wrong for unexpected runtime errors (filesystem permission denied, JSON parse failure on registration file, Node.js internal error). Both cases return `null` — callers cannot distinguish "not configured" from "broken."

**Proposed fix:**  
Distinguish expected failures (not configured) from unexpected failures (runtime error):
```typescript
// Internal helper — throws IdentityError only for expected failures
async function resolveTokenOrThrow(root, roleKey): Promise<string | null> { ... }

export async function resolveToken(root, roleKey): Promise<string | null> {
  try {
    return await resolveTokenOrThrow(root, roleKey);
  } catch (e) {
    if (e instanceof IdentityError && e.code === 'not_configured') return null;
    // Unexpected error — log to stderr, still return null (graceful) but surfaced
    console.error(`[squad identity] unexpected error resolving ${roleKey}: ${(e as Error).message}`);
    return null;
  }
}
```

**Design question for Ahmed:** Should unexpected errors hard-fail rather than gracefully returning null? (See "Requires Design Decision" section.)

---

#### H-05 · Key file permissions not enforced
**Files:** `identity.ts` `saveCredentials` (line ~362), `identity.ts` `rotate` (line ~1026)  
**Effort:** S · **Priority:** HIGH

**Problem:**  
`writeFileSync(pemPath, pem, 'utf-8')` creates the key file with mode `0o644` (readable by all users on the system). Squad does protect the directory in `.gitignore`, but that only prevents git commits — a shared dev machine or CI runner still has the key readable by any local process.

**Proposed fix:**  
```typescript
writeFileSync(pemPath, pem, { encoding: 'utf-8', mode: 0o600 });
```
Apply to all three write sites: `saveCredentials`, `rotate --import`, and `importAppCredentials`.

Also add a runtime read-time warning in `tokens.ts`:
```typescript
if (process.platform !== 'win32') {
  const stat = statSync(pemPath);
  const mode = stat.mode & 0o777;
  if (mode & 0o044) {
    console.warn(`[squad identity] Warning: key file ${pemPath} is world/group-readable (mode ${mode.toString(8)}). Run: chmod 600 ${pemPath}`);
  }
}
```

**Impact if not fixed:** On shared CI runners or development machines, private keys are readable by any local process under any user account.

---

#### H-06 · No `.gitignore` guard verification during `squad identity create`
**Files:** `identity.ts` `saveCredentials`  
**Effort:** S · **Priority:** HIGH

**Problem:**  
Squad's own `.gitignore` has `.squad/identity/keys/` excluded (good). But when a user runs `squad init` in a new project, there is no check that the resulting `.gitignore` covers the keys directory. The `saveCredentials` function writes the PEM without ever verifying that the key won't be committed.

**Proposed fix:**  
After writing the PEM, verify `.gitignore` coverage:
```typescript
function ensureKeysIgnored(projectRoot: string): void {
  const gitignorePath = join(projectRoot, '.gitignore');
  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const covered = content.includes('.squad/identity/keys') ||
                  content.includes('.squad/identity/keys/') ||
                  content.includes('*.pem');
  if (!covered) {
    appendFileSync(gitignorePath, '\n# Squad: private keys must never be committed\n.squad/identity/keys/\n');
    console.log(`  ${GREEN}✓${RESET} Added .squad/identity/keys/ to .gitignore`);
  }
}
```
Call from `saveCredentials`, `rotate --import`, and `importAppCredentials`.

---

### MEDIUM

---

#### H-07 · No `SQUAD_IDENTITY_MOCK` environment variable for integration tests
**Files:** `tokens.ts`, `resolve-token.mjs`  
**Effort:** S · **Priority:** MEDIUM

**Problem:**  
SDK-level tests use `vi.stubGlobal('fetch', ...)` for network isolation. But the standalone `resolve-token.mjs` script has no mock injection path — testing it end-to-end requires real GitHub App credentials. This blocks CI from testing the full token resolution flow on the script.

**Proposed fix:**  
```javascript
// In resolve-token.mjs (and tokens.ts)
if (process.env.SQUAD_IDENTITY_MOCK === '1') {
  const mockToken = process.env.SQUAD_IDENTITY_MOCK_TOKEN ?? 'ghs_mock_token_for_testing';
  console.log(mockToken);
  process.exit(0);
}
```
This enables `resolve-token-root.test.ts` to verify the end-to-end CLI path (`{ env: { SQUAD_IDENTITY_MOCK: '1' } }`) without real GitHub credentials.

---

#### H-08 · No clock injection in `generateAppJWT` — deterministic tests not possible
**Files:** `tokens.ts` line ~44, `resolve-token.mjs` line ~54  
**Effort:** S · **Priority:** MEDIUM

**Problem:**  
`generateAppJWT` uses `Date.now()` internally. Tests can only verify JWT structure, not exact `iat`/`exp` values — the window check (`expect(payload.iat).toBeGreaterThanOrEqual(beforeTime - 61)`) is a timing assertion that is inherently flaky on slow CI runners. There's no way to golden-file test the JWT output.

**Proposed fix:**  
Make `now` an injectable parameter:
```typescript
export async function generateAppJWT(
  appId: number,
  privateKeyPem: string,
  nowOverride?: number, // seconds since epoch; defaults to Date.now()/1000
): Promise<string> {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  // ...
}
```
Deterministic tests:
```typescript
const jwt = await generateAppJWT(42, TEST_PEM, 1_700_000_000);
const payload = JSON.parse(decodeBase64url(jwt.split('.')[1]!));
expect(payload.iat).toBe(1_699_999_940); // 1_700_000_000 - 60
expect(payload.exp).toBe(1_700_000_540); // 1_700_000_000 + 540
```

---

#### H-09 · `generateAppJWT` is `async` in TypeScript SDK but sync in .mjs — vestigial async
**Files:** `tokens.ts` line ~43  
**Effort:** S · **Priority:** MEDIUM

**Problem:**  
`generateAppJWT` is declared `async` in TypeScript. It uses only synchronous Node.js crypto APIs (`createSign`, `sign`). The function never awaits anything. The `async` keyword is vestigial — it changes the calling convention (callers must `await`) and wraps the return in a Promise unnecessarily. The `.mjs` counterpart is correctly sync. The inconsistency is a correctness signal that the SDK function was never reviewed after being ported.

**Proposed fix:**  
```typescript
export function generateAppJWT(appId: number, privateKeyPem: string): string { ... }
```
Update all callers: `identity.ts` line ~504, `identity.ts` line ~670, and any test usages.

**Note:** This is a breaking change to the exported SDK API. Requires a minor version bump to `@bradygaster/squad-sdk`.

---

#### H-10 · `squad identity status` does not perform a live token fetch
**Files:** `identity.ts` `runStatus`  
**Effort:** M · **Priority:** MEDIUM

**Problem:**  
`squad identity status` shows: tier, registered apps, key file presence, installation ID, and lists agents. It does NOT:
- Verify the PEM can actually sign a JWT (no crypto test)
- Attempt a live GitHub API call to fetch an installation token
- Report whether the GitHub App installation is still active
- Check key file permissions
- Verify `.gitignore` covers the keys directory

A user can have a perfectly-formatted `status` output and still have a broken identity (key file corrupted, app uninstalled, installation token revoked).

**Proposed fix:**  
Add a `squad identity doctor [--role <role>]` command that runs the full diagnostic chain:

```
squad identity doctor --role lead

Checking identity for role: lead
  ✓ App registration exists       (app 12345, sabbour-squad-lead)
  ✓ PEM key file present          (.squad/identity/keys/lead.pem)
  ✓ Key file permissions          (mode 600)
  ✓ .gitignore covers keys/       (.squad/identity/keys/ excluded)
  ✓ PEM format valid              (RSA private key, 2048 bits)
  ✓ JWT signed successfully       (iss=12345, exp in 9m40s)
  ✓ GitHub App reachable          (GET /app → 200)
  ✓ Installation active           (installationId 99999 → active)
  ✓ Installation token fetched    (expires in 59m)
  ✓ Token has required scopes     (contents:write, issues:write, pull_requests:write)

All checks passed for role: lead
```

If any step fails, the command exits 1 with the failing step highlighted in red and a remediation hint.

---

#### H-11 · No `squad identity explain <role>` resolution trace
**Files:** `identity.ts`  
**Effort:** S · **Priority:** MEDIUM

**Problem:**  
When `resolve-token.mjs` returns empty, there is no way to trace why. The resolution path — env vars → filesystem → not found — is invisible. Operators must add debug logging manually or read the source.

**Proposed fix:**  
```
squad identity explain lead

Resolving token for role: lead
  Step 1  Env var override
            SQUAD_LEAD_APP_ID          not set
            SQUAD_LEAD_PRIVATE_KEY     not set
            SQUAD_LEAD_INSTALLATION_ID not set
            → env credentials: absent

  Step 2  Filesystem lookup
            .squad/identity/apps/lead.json  ✓ found (appId 12345, installationId 99999)
            .squad/identity/keys/lead.pem   ✓ found
            → filesystem credentials: present

  Step 3  Token cache
            cache key: 'lead'
            → cache miss (no entry)

  Step 4  GitHub API call
            POST /app/installations/99999/access_tokens
            → would fetch token (dry-run: skipping actual API call)

Resolution path: filesystem → API fetch
```

Use `--live` to actually fetch the token and confirm end-to-end.

---

### LOW

---

#### H-12 · Concurrent same-role fetch deduplication
**Files:** `tokens.ts` `resolveToken`  
**Effort:** M · **Priority:** LOW

**Problem:**  
Two concurrent calls to `resolveToken(root, 'lead')` that both miss the cache will both fire a `getInstallationToken` request to GitHub. The second call's result overwrites the first in the cache. Both tokens are valid but the double-fetch wastes a GitHub API call and increases rate-limit exposure.

**Proposed fix:**  
Maintain an in-flight `Map<string, Promise<string | null>>` for deduplication:
```typescript
const inflightFetches = new Map<string, Promise<string | null>>();

export async function resolveToken(root, roleKey): Promise<string | null> {
  const cacheKey = `${root}:${roleKey}`;
  if (inflightFetches.has(cacheKey)) return inflightFetches.get(cacheKey)!;
  const promise = resolveTokenInternal(root, roleKey).finally(
    () => inflightFetches.delete(cacheKey)
  );
  inflightFetches.set(cacheKey, promise);
  return promise;
}
```

**Impact:** Low — only relevant for multi-agent setups where two agents resolve the same role concurrently in the same process (rare).

---

#### H-13 · `GITHUB_TOKEN` vs `GH_TOKEN` ambient fallback is undocumented
**Files:** `exec.ts` lines ~44, ~86  
**Effort:** S · **Priority:** LOW

**Problem:**  
`withRoleToken` and `execWithRoleToken` set `GH_TOKEN` for the child command. When token resolution fails, the command runs with whatever `GH_TOKEN` was already set. In GitHub Actions, the runner sets `GITHUB_TOKEN` (not `GH_TOKEN`) automatically. The `gh` CLI reads both (preferring `GH_TOKEN`), so this works transitively in most cases. But the precedence is implicit, undocumented, and not tested.

**Proposed fix:**  
Document the precedence explicitly in a comment, and optionally add a log line at `warn` verbosity when falling back:
```typescript
// Ambient fallback: GH_TOKEN takes precedence over GITHUB_TOKEN for `gh` CLI.
// In GitHub Actions, GITHUB_TOKEN is auto-set; GH_TOKEN is set here by Squad.
// When identity resolution fails, gh CLI will use GITHUB_TOKEN as its ambient credential.
```
No behavioural change needed unless a conflict is detected (GH_TOKEN and GITHUB_TOKEN set to different values simultaneously — log a warning).

---

#### H-14 · No key age / rotation reminder
**Files:** `identity.ts` app registration JSON, `storage.ts`  
**Effort:** S · **Priority:** LOW

**Problem:**  
App registrations store `appId`, `appSlug`, `installationId`, `tier`, and `roleSlug`. No `createdAt` timestamp is stored. There is no way to warn that a key has been in production for > 365 days. GitHub doesn't expire GitHub App private keys, but security best practice is annual rotation.

**Proposed fix:**  
Add `createdAt: string` (ISO 8601) to `AppRegistration` type. Populate it in `saveCredentials` and `saveAppRegistration`. In `runStatus` (and `doctor`), emit a warning if `createdAt` is > 365 days ago:
```
  ⚠ Key for 'lead' was created 412 days ago. Consider running: squad identity rotate --role lead
```

---

## Quick Wins (S effort + HIGH/CRITICAL priority)

These 5 items can land in a single PR with minimal risk:

| ID | Change | Files |
|----|--------|-------|
| H-01 | Add 10-second `AbortController` timeout to `fetch()` | `tokens.ts`, `resolve-token.mjs` |
| H-02 | Validate PEM format before `createSign` | `tokens.ts`, `resolve-token.mjs` |
| H-04 | Distinguish expected vs. unexpected errors in `resolveToken` | `tokens.ts` |
| H-05 | `chmod 600` on PEM write (`mode: 0o600` in `writeFileSync`) | `identity.ts` (3 sites) |
| H-06 | Auto-append `.squad/identity/keys/` to `.gitignore` if missing | `identity.ts` |
| H-07 | `SQUAD_IDENTITY_MOCK` env var for script integration tests | `resolve-token.mjs`, `tokens.ts` |
| H-08 | `nowOverride` parameter in `generateAppJWT` | `tokens.ts`, `resolve-token.mjs` |
| H-09 | Remove vestigial `async` from `generateAppJWT` | `tokens.ts` (minor semver bump) |

These require no API design decisions and carry no behavioural risk to existing callers.

---

## Requires Design Decision

These items have a clear correct answer but require Ahmed's sign-off before implementation:

### D-01 · Hard-fail vs. graceful null for unexpected errors (H-04)

**Option A (current):** All errors → `null`, agent always proceeds.  
**Option B:** Expected "not configured" → `null`, unexpected runtime error → process exit 1.  
**Option C:** Expected → `null`, unexpected → structured log to stderr, null returned (no exit).  

Recommendation: **Option B** for `resolve-token.mjs` (the CLI script), **Option C** for the SDK (library callers may have their own error strategies). This aligns with the kickstart `--required` / `resolveTokenWithDiagnostics` approach (see H-03 in `kickstart-identity-sync-2026-04-20.md`).

### D-02 · Fork PR protection (out of scope for token.mjs, needs workflow changes)

Identity injection in fork PR contexts could grant write access to a PR from an untrusted fork. The correct fix is in the GitHub Actions workflow (`issue-lifecycle.md` / `squad-triage.yml`) — not in the token script itself. The token script has no awareness of whether it's running in a fork context. The workflow should check `github.event.pull_request.head.repo.fork == true` and skip identity injection. This is a workflow-layer decision, not a token-layer one.

### D-03 · `generateAppJWT` async removal is a breaking SDK change

Removing `async` from `generateAppJWT` (H-09) changes the return type from `Promise<string>` to `string`. Any caller using `await generateAppJWT(...)` will still work (awaiting a non-Promise value is a no-op), but any caller using `.then(...)` will break. A minor semver bump is required. Ahmed should confirm whether this is the right moment for a version bump given current release cadence.

---

## Dependency Graph

```
H-02 (PEM validation)
  └─→ H-01 (add timeout)       — both touch getInstallationToken; land together
      └─→ H-03 (retry)         — retry wraps the now-timeout-guarded fetch

H-04 (error distinction)
  └─→ D-01 (design decision)   — can't implement until fail strategy is confirmed

H-05 (key permissions)
  └─→ H-06 (gitignore guard)   — both touch saveCredentials; land together

H-08 (clock injection)
  └─→ H-09 (remove async)      — H-08 adds param, H-09 removes async; same function, same PR

H-10 (squad identity doctor)
  └─→ H-11 (explain command)   — both are new CLI subcommands; can share same PR
  └─→ H-02 (PEM validation)    — doctor uses PEM validation as a check step; H-02 first
  └─→ H-01 (timeout)           — doctor's live token fetch should respect timeout; H-01 first
```

---

## Before / After Determinism Table

| Failure scenario | Before hardening | After hardening |
|-----------------|-----------------|-----------------|
| GitHub API hangs (no response) | Agent hangs indefinitely | Times out after 10s with clear error |
| GitHub 429 rate limit | Silent null, agent uses human credentials | 3 retries with backoff |
| PEM file corrupted | Silent null, no diagnostic info | "invalid PEM format: ..." error |
| PEM readable by all users | Silent security risk | Blocked at write time; warned at read time |
| `.gitignore` missing key entry | Silent commit risk | Auto-appended at key creation time |
| 2-of-3 env vars set | Falls through to filesystem silently | "Incomplete env credentials" error (from H-identity-sync) |
| Unexpected runtime error (FS permission denied) | Silent null, no trace | Logged to stderr with stack |
| Clock drift in tests | Timing assertions, flaky on slow CI | Deterministic via `nowOverride` |
| Concurrent same-role fetch | 2 API calls, 2 tokens | 1 API call, deduped |
| App uninstalled mid-session | Silent null, human credentials | Doctor detects and surfaces it |

---

## Effort Summary

| Priority | Count | Total Effort |
|----------|-------|-------------|
| CRITICAL | 2 | 2S |
| HIGH | 4 | 1M + 3S |
| MEDIUM | 5 | 2M + 3S |
| LOW | 3 | 3S |
| **Total** | **14** | **~3M + 11S** |

S ≈ 1 hour, M ≈ half-day.

**Recommended phasing:**

- **Sprint 1 (Quick wins):** H-01, H-02, H-04, H-05, H-06, H-07, H-08, H-09 → single PR, ~5 hours
- **Sprint 2 (Design decision):** Resolve D-01, then implement H-03 (retry) + full error taxonomy  
- **Sprint 3 (Observability):** H-10 (`doctor` command) + H-11 (`explain` command)  
- **Backlog:** H-12, H-13, H-14

---

*Authored by Flight · Squad Lead · `sabbour/squad`*
