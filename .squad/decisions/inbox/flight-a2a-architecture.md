# Decision: A2A Core Protocol Architecture

> **By:** Flight (Lead)
> **Date:** 2026-03-16
> **Issue:** #332
> **Proposal:** `.squad/proposals/a2a-core-protocol.md`

## Decision

A2A core protocol (#332) uses **`node:http`** (not Express) with **JSON-RPC 2.0** over HTTP. Module split: SDK owns types, Agent Card generation, RPC method logic, and outbound client. CLI owns the HTTP server, middleware, and `squad serve` command.

## Key Choices

1. **HTTP server:** `node:http` — zero new dependencies, matches RemoteBridge pattern, only 3 routes needed.
2. **Module split:** `squad-sdk/src/a2a/` (logic + types + client) + `squad-cli/src/cli/a2a/` (server + middleware). SDK users get Agent Card generation and outbound calls without needing the CLI.
3. **Auth:** Bearer token (static, auto-generated UUID) for MVP. Localhost-only binding. Real auth in #335.
4. **No new runtime deps:** `node:http` is built-in, `vscode-jsonrpc` already in both packages. Zero-dependency scaffolding decision preserved.
5. **Charter content not shared:** A2A `shareResearch` exposes name/role only — charters contain internal prompts and must not leak.
6. **Phase boundaries hard:** #332 = server + 3 methods + Agent Card. Discovery (#333), CLI integration (#334), and security (#335) are separate proposals with separate sign-offs.

## What This Means for the Team

- **EECOM:** You own implementation of `squad-sdk/src/a2a/` and `squad-cli/src/cli/a2a/`. Start with types.ts, then agent-card.ts, then methods.ts. Server and middleware last.
- **CONTROL:** New `a2a/` modules need strict types. `vscode-jsonrpc` message types for JSON-RPC framing. No `any` types.
- **GNC:** No new dependencies. `node:http` server follows RemoteBridge patterns in `remote/bridge.ts`.
- **Procedures:** Charter content is explicitly excluded from A2A sharing. Agent names and roles only.
- **PAO:** `squad serve` command needs help text (under 80 chars per line) and docs when #334 ships.
- **Network:** Localhost-only for MVP. You own #335 (TLS, mutual auth, API keys) as a follow-up.

## Needs Sign-Off

- [ ] Brady (product direction — is this the right scope for MVP?)
- [ ] EECOM (runtime implementation — is the module split workable?)
- [ ] CONTROL (type system — are the RPC type definitions sound?)
- [ ] Network (security — is localhost-only sufficient for Phase 1?)
