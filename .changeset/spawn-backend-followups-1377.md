---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix #1377 follow-ups: spawn-backend fallback, slot-leak guards, timeouts, prompt sanitization

Addresses the six deferred review items from the #1385 review (sub-sessions in the Copilot App). All are hardening fixes to the spawn coordinator (`packages/squad-sdk/src/coordinator/`) plus a template probe-order correction.

**Blockers**

1. **App→task fallback (`fan-out.ts`).** When the platform `SpawnBackend` (e.g. App sub-sessions) returns `success: false` — concurrency cap, unavailable tool, transient error — `spawnSingle()` no longer throws and fails the agent. It emits a `session.spawn_fallback` event and falls through to the direct `createSession` path, honoring the template contract ("if `create_session` fails, retry with `task`"). The direct path is now extracted into a shared `spawnViaCreateSession()` helper.

2. **Concurrency slot leak (`fan-out.ts`).** `registerSpawnRelease()` now (a) treats `completed` as a terminal status (previously only `idle`/`error`/`destroyed` released the slot), and (b) installs an unref'd max-lifetime safety timer (default 1h) that force-releases the slot if a silently-crashed sub-session emits no terminal event. The timer is cleared on normal release.

3. **Template detection-order drift.** Re-synced the canonical `.squad-templates/squad.agent.md` probe order (`create_session` → `runSubagent` → `task` → inline) to all mirror copies, which had `task` and `runSubagent` swapped.

**Risks**

4. **Prompt-injection hardening (`fan-out.ts`).** `buildInitialPrompt()` now runs caller-supplied `task`/`context` through `sanitizePromptValue()` (defense-in-depth): strips control characters, neutralizes forged `**Marker:**` headers, and caps length. Not a complete prompt-injection defense, but it stops trivial structural-marker spoofing.

5. **`createSession` timeout (`spawn-backend.ts`).** Both backends wrap the injected `createSession` call in a timeout (`createSessionTimeoutMs`, default 60s, 0 disables) so a hung factory cannot pin `pendingSpawnCount` / a concurrency slot forever. `SessionSpawnBackend`'s `finally` still decrements the pending counter on timeout.

6. **Honest `isAvailable()` (`spawn-backend.ts`).** Both backends previously returned `true` unconditionally. They now return a real heuristic (`typeof createSession === 'function'`) and accept an injectable `availabilityCheck` predicate via options.

Adds vitest coverage for the fallback path, `completed`-status release, the safety-timeout release, both createSession timeouts, prompt sanitization, and `isAvailable()`.
