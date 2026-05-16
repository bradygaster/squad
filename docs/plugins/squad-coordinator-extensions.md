# Squad Coordinator Extension Fragments — Plugin Author Guide

Any npm package, CLI tool, or internal team script can extend the Squad coordinator's system prompt without forking `squad.agent.md`. Extensions survive Squad upgrades and work for every user who installs your package.

---

## How It Works

When Squad boots, it scans two directories for `.md` files:

| Directory | Scope |
|-----------|-------|
| `~/.squad/extensions/coordinator/` | User-global — applies to every project on this machine |
| `<repo>/.squad/extensions/coordinator/` | Project-local — applies only in this repo |

Every `.md` file in these directories is loaded and its content is appended to the coordinator's context at the location specified by `inject_into`. Project-local files override user-global files **with the same filename**.

---

## Fragment Format

A fragment is a Markdown file with optional YAML front matter:

```markdown
---
name: my-plugin           # unique key; must match the filename (without .md)
version: 0.1.0
extends: squad            # must be "squad" — other values are silently ignored
inject_into:
  - after-mcp-detection   # after the coordinator scans for MCP tools
---

## My Plugin Integration

If tools with the `myplugin_` prefix are present, My Plugin is installed. You can:

- `myplugin_read` — read data from My Plugin
- `myplugin_write` — write data to My Plugin

When the user asks to sync with My Plugin, call `myplugin_read` first to check current state.

### Boundaries

**You DO NOT:**
- Call My Plugin tools when the user has not opted in.
- Invent My Plugin IDs — always look them up via `myplugin_list`.
```

### Inject Targets

| `inject_into` value | When it fires |
|---------------------|---------------|
| `after-mcp-detection` | Immediately after coordinator scans for MCP tool prefixes at task start |

Additional injection targets may be added in future Squad versions.

---

## Style Rules

Fragments extend the coordinator, so they must speak in the coordinator's voice:

- **Imperative, first-person:** "You DO / You DO NOT" — not "the agent should".
- **Detection-guarded:** Every workflow section must start with "If tools with the `{prefix}_` prefix are present…". This ensures graceful degradation when the MCP server isn't installed.
- **Additive only:** Never contradict upstream rules from `squad.agent.md`. If a fragment tries to override coordinator governance, it will be flagged and rejected.
- **≤200 lines.** Coordinator context has a budget. Keep fragments tight.
- **No agent dispatches.** Fragments instruct the coordinator to call tools directly. Never tell the coordinator to spawn an agent to call a tool.
- **No repo-specific paths.** Use `~/.squad/`, `ENV_VARS`, or tool calls. Never hardcode absolute paths.

### Anti-Patterns

```markdown
❌ "Spawn Hockney to handle all My Plugin requests" — dispatching agents
❌ "Read /home/alice/project/config.json" — repo-specific path
❌ "You MUST always call myplugin_sync before any other action" — overriding coordinator flow
❌ Fragment without detection guard — coordinator gets confused when MCP server is absent
```

---

## Postinstall Script Pattern

Install your fragment via `package.json`'s `postinstall` script. This runs automatically when your package is installed globally or locally.

**`scripts/postinstall-coordinator-fragment.mjs`:**

```js
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Opt-out for CI / Docker
if (process.env.MYPLUGIN_SKIP_POSTINSTALL) { process.exit(0); }

const targetDir  = path.join(os.homedir(), '.squad', 'extensions', 'coordinator');
const targetPath = path.join(targetDir, 'my-plugin.md');          // matches fragment name
const srcPath    = path.join(__dirname, '..', 'coordinator-fragment.md');
const MARKER     = '<!-- my-plugin:auto-installed -->';

function sha(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

try {
  fs.mkdirSync(targetDir, { recursive: true });
  let bundled = MARKER + '\n\n' + fs.readFileSync(srcPath, 'utf-8');
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, bundled);
    console.log('✅ Installed My Plugin coordinator fragment');
  } else {
    const existing = fs.readFileSync(targetPath, 'utf-8');
    if (sha(existing) === sha(bundled)) {
      console.log('✅ My Plugin coordinator fragment up to date');
    } else if (existing.includes(MARKER)) {
      fs.writeFileSync(targetPath, bundled);
      console.log('🔄 My Plugin coordinator fragment upgraded');
    } else {
      fs.writeFileSync(targetPath + '.new', bundled);
      console.log('⚠️  User-edited fragment detected — wrote my-plugin.md.new alongside');
    }
  }
} catch (err) {
  console.error('⚠️  Postinstall error:', err.message);
  // Always exit 0 — never break npm install
}
process.exit(0);
```

**`package.json`:**

```json
{
  "scripts": {
    "postinstall": "node scripts/postinstall-coordinator-fragment.mjs"
  },
  "files": ["dist", "coordinator-fragment.md", "scripts/postinstall-coordinator-fragment.mjs"]
}
```

---

## Idempotency Contract

The postinstall pattern above follows these rules:

1. **Own the file via marker.** `<!-- {package}:auto-installed -->` as line 1 signals "this postinstall manages the file". On upgrade, overwrite silently.
2. **Back off if marker absent.** User removed the marker = "I'm customizing". Write `.new` alongside and warn — never overwrite.
3. **SHA dedup.** If SHA matches, do nothing. Avoids filesystem churn on repeated `npm install`.
4. **Exit 0 always.** Postinstall failures must never break `npm install`.
5. **Respect skip var.** `{PACKAGE}_SKIP_POSTINSTALL` env var for CI and Docker environments.

---

## User Override

Users can customise their fragment by:

1. Editing `~/.squad/extensions/coordinator/my-plugin.md` and removing the auto-installed marker.
2. The next `npm install` will write a `.new` file alongside; the user's version is preserved.

For project-specific overrides, copy the fragment to `<repo>/.squad/extensions/coordinator/my-plugin.md` — project-local always wins.

---

## Upgrade Story

When you release a new version:
- Bump `version` in the fragment's front matter.
- The postinstall script runs on `npm install`; it detects the marker → upgrades silently.
- Users who removed the marker see the `.new` file and can merge manually.

---

## Example: Squadboard Fragment

`@sabbour/squadboard` ships a coordinator fragment that activates when Squadboard MCP tools are detected. The fragment tells the coordinator to:
- Capture directives to the board inbox alongside the `.squad/decisions/inbox/` flow.
- Query the board when the user asks for status.
- Record close-outs when agent work completes.

Install: `npm install -g @sabbour/squadboard` → fragment auto-installs to `~/.squad/extensions/coordinator/squadboard.md`.

See [`packages/server/coordinator-fragment.md`](https://github.com/asabbour/squadboard/blob/main/packages/server/coordinator-fragment.md) for the full source.
