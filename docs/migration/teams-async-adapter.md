# Migration Guide: Teams Adapter — Async Factory + Token Security

> **Applies to:** Squad SDK ≥ v0.10.0 (PR #768)

## Breaking Change: `createCommunicationAdapter` is now async

PR #768 changed `createCommunicationAdapter` from a synchronous function to an async function that returns `Promise<CommunicationAdapter>`.

### Why

The Teams adapter (`teams-graph` channel) requires interactive OAuth authentication (browser PKCE or device-code flow). These operations are inherently asynchronous. Making the factory async ensures all adapters — including those requiring network auth — can be created through the same interface.

### Before (v0.9.x — synchronous)

```typescript
import { createCommunicationAdapter } from '@bradygaster/squad-sdk';

const adapter = createCommunicationAdapter(repoRoot);
await adapter.postUpdate({ title: 'Hello', body: 'World' });
```

### After (v0.10.x — async)

```typescript
import { createCommunicationAdapter } from '@bradygaster/squad-sdk';

const adapter = await createCommunicationAdapter(repoRoot);
await adapter.postUpdate({ title: 'Hello', body: 'World' });
```

### Migration steps

1. Add `await` before every `createCommunicationAdapter()` call
2. Ensure the calling function is `async`
3. If the adapter is created at module top-level, wrap it in an async IIFE or move it into an `async` init function

**Find affected code:**

```bash
# Find all call sites in your codebase
grep -rn "createCommunicationAdapter" --include="*.ts" --include="*.js"
```

**Common patterns:**

```typescript
// ❌ Module-level (breaks)
const adapter = createCommunicationAdapter(root);

// ✅ Module-level (works)
let adapter: CommunicationAdapter;
async function init() {
  adapter = await createCommunicationAdapter(root);
}

// ✅ Inside an async function (simplest fix)
async function setup() {
  const adapter = await createCommunicationAdapter(root);
  // ...
}
```

---

## New: Token Security Improvements

These changes ship alongside the async migration and require no code changes — they're internal to the Teams adapter.

### 1. Identity-scoped token cache

**Before:** All tenants shared a single token file (`~/.squad/teams-tokens.json`). In multi-tenant environments, one tenant's token could be served to another.

**After:** Tokens are stored per-identity at `~/.squad/teams-tokens-{hash}.json`. The hash is derived from both the configured `tenantId` and `clientId`, preventing cross-tenant and cross-app token reuse. The actual authenticated identity (`tid` and `oid` from the JWT) is stored as metadata for audit. Legacy token files are automatically migrated on first use and then deleted.

**Configuration:** Set `tenantId` in your `.squad/config.json` to explicitly scope tokens:

```json
{
  "communications": {
    "channel": "teams-graph",
    "adapterConfig": {
      "teams-graph": {
        "tenantId": "contoso.onmicrosoft.com",
        "recipientUpn": "bradyg@contoso.com"
      }
    }
  }
}
```

> **Note:** When using the default multi-tenant authority (`organizations`), all users on the same OS account share one cache file per `clientId`. If you switch Microsoft accounts, call `logout()` or wait for token expiry. For true per-account isolation, configure an explicit `tenantId`.

### 2. Explicit logout (`logout()`)

The Teams adapter now exposes `logout()` for explicit credential cleanup:

```typescript
const adapter = await createCommunicationAdapter(root);

// ... use the adapter ...

// Logout: clears in-memory tokens + deletes cached token file
if (adapter.logout) {
  await adapter.logout();
}
```

This is a local credential purge — it does not revoke server-side tokens (not supported for public-client AAD flows). The `CommunicationAdapter` interface now includes an optional `logout?(): Promise<void>` method.

### 3. Device-code timeout guard

**Before:** The device-code auth flow timeout was server-controlled (could be arbitrarily long).

**After:** A 15-minute maximum timeout is enforced client-side. The poll interval is also clamped to 2–30 seconds to prevent both rapid polling and excessively slow polling from malformed server responses.

### 4. Stale token cleanup

**Before:** On token refresh failure, stale tokens remained on disk and would be reloaded on the next attempt.

**After:** On permanent auth errors (`invalid_grant`, `interaction_required`, `consent_required`), the stale token file is deleted before re-authenticating. Transient failures (network errors, 5xx) preserve the token for retry.

---

## Checklist

- [ ] Updated all `createCommunicationAdapter()` calls to use `await`
- [ ] Verified calling functions are `async`
- [ ] Set explicit `tenantId` in config (recommended for multi-tenant)
- [ ] Tested auth flow still works after upgrade
