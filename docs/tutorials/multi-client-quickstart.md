# Multi-client quickstart for Squad 2.0

This is the hands-on version of Squad 2.0.

The headline feature is the new `--client` flag on `squad init` and `squad upgrade`, which lets one repo project native files for different hosts while keeping the same underlying Squad team and backend contract.

## What you need

- a repo with Squad available through `npx squad` or a global `squad` install;
- a normal `.squad/` team directory;
- one or more target clients: Copilot, Claude Code, Kiro, OpenCode, or Cursor.

If you already have Squad in the repo, use `upgrade`. If this is a fresh repo, use `init`.

---

## Tutorial 1: Claude Code

### Step 1: initialize the repo for Claude Code

```bash
npx squad init --client claude
```

If the repo already has Squad and you are adding Claude later:

```bash
npx squad upgrade --client claude
```

### Step 2: inspect the generated files

You should see these Claude-facing files:

```text
.claude/
  agents/
    squad.md
.mcp.json
CLAUDE.md
```

What each file does:

- `.claude/agents/squad.md` is the coordinator entrypoint;
- `.mcp.json` wires the `squad_state` MCP bridge;
- `CLAUDE.md` gets a managed marker block instead of being fully overwritten.

### Step 3: understand the `CLAUDE.md` marker block

Squad does **not** take over the whole file. It updates only the managed block:

```md
<!-- squad:begin (managed by Squad; do not edit between markers) -->
## Squad

This project uses Squad. Run `claude --agent squad` ...
<!-- squad:end -->
```

That means your own project notes above or below the block stay yours.

### Step 4: invoke Squad in Claude Code

Use either of these patterns:

```text
claude --agent squad
```

Or, inside Claude Code, delegate to the `squad` subagent and let it route work from there.

### Step 5: what the coordinator does in Claude

The Claude projection tells the coordinator to dispatch specialists with the `Task` tool and to inline each member's charter from `.squad/agents/<member>/charter.md` into the subagent prompt.

---

## Tutorial 2: Kiro

### Step 1: initialize the repo for Kiro

```bash
npx squad init --client kiro
```

Later refresh:

```bash
npx squad upgrade --client kiro
```

### Step 2: inspect the generated files

The Kiro projection is a little different from Claude's:

```text
.kiro/
  steering/
    squad.md
  agents/
    squad.json
  settings/
    mcp.json
```

A practical note: the canonical prompt content lives in `.kiro/steering/squad.md`, while `.kiro/agents/squad.json` is the host registration file that points at that steering doc.

### Step 3: what the files mean

- `.kiro/steering/squad.md` is generated with `inclusion: always`, so the coordinator guidance is always present;
- `.kiro/agents/squad.json` declares the `squad` agent and includes the MCP config;
- `.kiro/settings/mcp.json` adds `squad_state` without deleting your other MCP servers.

### Step 4: use Squad in Kiro

Open the repo in Kiro and select or invoke the `squad` agent defined by `.kiro/agents/squad.json`.

Because the steering file is always included, Kiro gets the same host-agnostic coordinator protocol plus the Kiro-specific dispatch adapter.

---

## Tutorial 3: OpenCode

### Step 1: initialize the repo for OpenCode

```bash
npx squad init --client opencode
```

Or refresh an existing repo:

```bash
npx squad upgrade --client opencode
```

### Step 2: inspect the generated files

```text
.opencode/
  agent/
    squad.md
opencode.json
```

The current implementation writes `.opencode/agent/squad.md` as the agent anchor and `opencode.json` as the MCP/config surface.

### Step 3: what gets configured

- `.opencode/agent/squad.md` is the primary coordinator prompt;
- `opencode.json` receives an additive `mcp.squad_state` entry;
- existing model or MCP settings in `opencode.json` are preserved.

Example generated MCP entry:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "squad_state": {
      "type": "local",
      "command": ["squad", "state-mcp"],
      "enabled": true
    }
  }
}
```

### Step 4: use Squad in OpenCode

Invoke the coordinator with `@squad` if your OpenCode flow uses agent mentions, or use the host `task` primitive and let Squad route from there.

---

## Tutorial 4: Cursor

### Step 1: initialize the repo for Cursor

```bash
npx squad init --client cursor
```

Later refresh:

```bash
npx squad upgrade --client cursor
```

### Step 2: inspect the generated files

```text
.cursor/
  rules/
    squad.mdc
  agents/
    squad.md
  mcp.json
```

### Step 3: why Cursor gets both a rule and an agent

- `.cursor/rules/squad.mdc` keeps the always-apply coordinator guidance nearby;
- `.cursor/agents/squad.md` gives Cursor a named agent anchor;
- `.cursor/mcp.json` adds the `squad_state` bridge.

### Step 4: use Squad in Cursor

Pick the `squad` agent from Cursor's agent surface, or work from the composer with the generated rule in place.

The dispatch adapter tells Cursor to prefer subagents when available and to inline a member charter when the host falls back to ordinary composer/agent turns.

---

## Tutorial 5: one repo, multiple clients

This is where Squad 2.0 gets fun.

### Option A: initialize for every supported client

```bash
npx squad init --client all
```

### Option B: add clients incrementally

```bash
npx squad upgrade --client copilot,claude,cursor
```

### What gets persisted

Squad stores only **portable client slugs** in `.squad/config.json`:

```json
{
  "clients": ["copilot", "claude", "cursor"]
}
```

That list is intentionally boring.

It does **not** contain:

- tokens;
- machine paths;
- URLs;
- provider thread IDs;
- lease tokens;
- checkpoint state.

The SDK enforces this with portable-client hygiene helpers such as `normalizeClientIds()` and `assertPortableClients()`.

### Why this matters

`clients[]` is projection config, not authority.

It answers:

- which host files should Squad generate;
- which projections should `squad upgrade` refresh.

It does **not** answer:

- what capabilities the current session may exercise;
- whether a given backend allows approvals, MCP, or HTTP;
- whether policy allows a client to do something.

That is decided later through negotiated capabilities.

### Non-clobbering JSON merge in practice

Suppose you already had this in `.mcp.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"]
    }
  }
}
```

After `npx squad upgrade --client copilot,claude`, Squad adds its own entry and preserves yours:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"]
    },
    "squad_state": {
      "command": "squad",
      "args": ["state-mcp"],
      "env": {},
      "tools": ["*"]
    }
  }
}
```

Same idea for:

- `.kiro/settings/mcp.json`
- `opencode.json`
- `.cursor/mcp.json`

Malformed user JSON is refused, not overwritten.

### The payoff

You can use the same `.squad/` team from different clients without forking your team memory or your backend contract.

That is the real feature.

---

## Quick verification checklist

After any `init --client ...` or `upgrade --client ...` run:

1. confirm the expected projection files exist;
2. open the generated agent anchor for your host;
3. verify the MCP config still contains your existing servers;
4. confirm `.squad/config.json` contains only canonical slugs;
5. start the host and invoke `squad` once.

---

## When to use `upgrade`

Use `npx squad upgrade --client ...` when:

- you added a new client to an existing repo;
- your `.squad/team.md` roster changed and you want fresh client projections;
- the generated adapter templates changed in a newer Squad build;
- you want to refresh all previously configured client projections from `.squad/config.json`.

If you omit `--client`, `upgrade` refreshes the clients already tracked in config.
