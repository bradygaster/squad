# Portability & Extensions
Your squad isn't locked to one repo, one editor, or one set of tools. Export a trained team and import it somewhere else. Install plugins for instant expertise. Inherit org-wide practices from upstream repos. Wire up MCP servers so agents can talk to anything.
---
## Try This
```
Export my team to a file — I want to use them on another project
```
```
Install the AWS deployment plugin
```
```
Add the platform team's repo as an upstream source
```
---
## How It Works
Squad is designed to be **portable by default**. Four systems make this possible:
| System | What It Does |
|--------|-------------|
| **Export/Import** | Snapshot your entire team to a JSON file, import it anywhere |
| **Plugins** | Install community bundles of agent templates, skills, and best practices |
| **Upstream Inheritance** | Inherit skills, decisions, and routing from other repos |
| **MCP Servers** | Extend agents with external services (GitHub, Trello, notifications) |
```
Your Repo (.squad/)
    ↑ inherits from
Upstream Sources (org repo, sibling repo, export snapshot)
    ↑ enhanced by
Plugins (community marketplaces)
    ↑ connected to
MCP Servers (GitHub, Teams, Trello, Aspire, etc.)
```
---
## Export & Import
Squad teams are portable. Export your trained agents, casting state, skills, and decisions to a single JSON file.
### Export
```bash
squad export                          # creates squad-export.json
squad export --out ./backups/team.json  # custom path
```
### What's Included
| Data | Included |
|------|----------|
| Agent charters | ✅ |
| Agent histories | ✅ (split into portable vs project-specific) |
| Casting state | ✅ |
| Skills | ✅ All earned skills from `.copilot/skills/` |
| Decisions | ✅ |
Skills are fully portable — they export and import with perfect fidelity.
### Import
```bash
squad import squad-export.json
```
If `.squad/` already exists, Squad warns you and stops. Use `--force` to archive the existing team and replace it:
```bash
squad import squad-export.json --force
```
Nothing is deleted — the current team moves to an archive.
### History Splitting
During import, agent histories are split into:
- **Portable knowledge** — general patterns and conventions that transfer across projects
- **Project-specific learnings** — context-tagged entries tied to the original repo
Imported agents bring their skills and general knowledge without assuming your project works the same way.
---
## Plugins
Plugins are community-curated bundles of agent templates, skills, and best practices. Install one and your agents get instant expertise.
### What's in a Plugin
- **Agent templates** — specialized role charters (e.g., "AWS DevOps", "Python Data Science")
- **Skills** — reusable `.copilot/skills/SKILL.md` files
- **Instructions** — `decisions.md` snippets for conventions and routing
- **Sample prompts** — ready-to-use prompts that activate plugin capabilities
### Available Marketplaces
| Marketplace | What's Inside |
|-------------|--------------|
| **awesome-copilot** | Frontend frameworks, backend stacks, deployment patterns |
| **anthropic-skills** | Claude-optimized patterns, prompt engineering, RAG |
| **azure-cloud-dev** | Azure VMs, App Service, Cosmos DB, GitHub Actions |
| **security-hardening** | OWASP, input validation, secrets management |
### Installing a Plugin
```
Install the react-component-library plugin from awesome-copilot
```
Or use the command:
```
/plugin install awesome-copilot/react-component-library
```
Squad downloads the bundle, merges agent templates into `.squad/agents/`, adds skills to `.copilot/skills/`, updates `decisions.md`, and seeds agents with the new knowledge.
### Managing Marketplaces
```
/plugin marketplace add github/awesome-copilot       # register
/plugin marketplace browse awesome-copilot            # browse
/plugin marketplace remove awesome-copilot            # unregister
```
Installed plugins remain even after removing a marketplace — you just can't install new ones from it.
### Creating Your Own Marketplace
A plugin marketplace is just a GitHub repo with a specific structure:
```
my-team-plugins/
├── awesome-patterns/
│   ├── charter.md
│   ├── skills/
│   │   └── awesome-skill.md
│   └── decisions.md
├── microservices-template/
│   ├── charter.md
│   └── skills/
│       ├── service-discovery.md
│       └── fault-tolerance.md
└── README.md
```
Register it with `squad` and your team can install from it.
---
## Upstream Inheritance
Declare external Squad sources and automatically inherit their context at session start. Knowledge flows down from org → team → repo without duplicating configuration.
### Three Source Types
| Type | Example | Use Case |
|------|---------|----------|
| **local** | `../org-practices/.squad/` | Sibling repo, monorepo package |
| **git** | `https://github.com/acme/platform-squad.git` | Public or private org repo |
| **export** | `./exports/snapshot.json` | Offline use or version pinning |
### What Gets Inherited
- **Skills** — all `.copilot/skills/*/SKILL.md` files
- **Decisions** — `.squad/decisions.md`
- **Wisdom** — `.squad/identity/wisdom.md`
- **Casting Policy** — `.squad/casting/policy.json`
- **Routing** — `.squad/routing.md`
### Closest-Wins Resolution
```
Org-level upstream
    ↓
Team-level upstream
    ↓
Repo config (local .squad/)
    ↓
Agent instance
```
Upstreams are read in order from `upstream.json` — **later entries override earlier ones** for the same content type. Your local `.squad/` always wins.
### Quick Start
```bash
# Local upstream
squad upstream add ../org-practices/.squad --name org
# Git upstream
squad upstream add https://github.com/acme/platform-squad.git --name platform --ref main
# Export snapshot
squad upstream add ./exports/snapshot.json --name snapshot
# List configured upstreams
squad upstream list
# Sync git upstreams
squad upstream sync
```
Git upstreams clone to `.squad/_upstream_repos/{name}` (auto-added to `.gitignore`). Local and export upstreams are read live at session start — no sync needed.
---
## MCP Setup
MCP (Model Context Protocol) servers extend Squad with external services. Agents discover and use MCP tools automatically — no per-agent configuration required.
### Configuration
| Platform | Config File |
|----------|------------|
| **Copilot CLI** | `.copilot/mcp-config.json` |
| **VS Code** | `.vscode/settings.json` (under `copilot.mcp.servers`) |
### Example: GitHub MCP
```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/absolute/path/to/github-mcp.js"],
      "env": {
        "GITHUB_TOKEN": "$GITHUB_TOKEN"
      }
    }
  }
}
```
Use environment variables instead of hardcoding tokens:
```bash
export GITHUB_TOKEN=$(gh auth token)
```
### Other Integrations
| Service | What Agents Can Do |
|---------|-------------------|
| **GitHub** | List issues/PRs, create branches, post comments |
| **Trello** | Create cards, move between lists, update descriptions |
| **Notifications** | Ping you on Teams, Discord, iMessage, webhooks |
| **Aspire** | Monitor .NET deployments, check service health |
Agents discover tools at spawn time and use them naturally during work. See [GitHub Integration](github-workflow.md) for how notifications connect to your workflow.
---
## VS Code Integration
Squad runs identically in VS Code — same `.squad/` state, same agents, same decisions. Initialize with CLI, open in VS Code, and everything just works.
### Key Differences from CLI
| Feature | CLI | VS Code |
|---------|-----|---------|
| Per-spawn model selection | ✅ | ❌ (uses session model) |
| Agent execution | Background + polling | Parallel sync (results arrive together) |
| SQL tool | ✅ | ❌ (use file-based state) |
| File writes | Automatic | May prompt for approval (once) |
### What's the Same
- Same `.squad/` directory and state
- Same team roster, skills, and decisions
- Parallel execution works (multiple agents per turn)
- MCP tools are inherited from workspace config
### Tips
- Use single-root workspaces (multi-root has path resolution bugs)
- Accept file modification approval once — subsequent writes are automatic
- For heavy parallel work (5+ agents), SQL workflows, or per-spawn model selection → use CLI
- Check the model picker if agents seem slow — switch to Haiku for cost savings
---
## Tips
- Export before running `upgrade` — it's your rollback point.
- The export JSON is human-readable — inspect it to see exactly what your team knows.
- Imported agents keep their names and universe casting.
- Commit `.squad/` after importing so everyone who clones the repo gets the team.
- Order matters in `upstream.json` — later entries override earlier ones. Use `remove` + `add` to reorder.
---
## Sample Prompts
```
export the current team
```
Creates a `squad-export.json` snapshot of the entire team.
```
import squad-export.json into this repo
```
Imports a team snapshot into the current project's `.squad/` directory.
```
install the azure-infrastructure plugin for the DevOps agent
```
Downloads the Azure plugin and seeds the DevOps agent with cloud expertise.
```
show me available plugins for React development
```
Searches all configured marketplaces for React-related plugins.
```
add the platform team's repo as an upstream source
```
Inherits skills, decisions, and routing from a shared org repo.
```
show me all configured MCP servers and which ones are working
```
Tests each MCP server and reports status.
```
squad upstream sync
```
Updates all git upstream clones and validates local/export paths.
```
package our current React conventions into a plugin called react-best-practices
```
Exports your relevant skills and decisions into a reusable plugin bundle for sharing.
