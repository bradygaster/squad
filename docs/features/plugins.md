# Plugin Marketplace Guide

Your Squad can discover and install **plugins** — curated collections of agent templates, skills, and instructions from community repositories. Plugins solve recurring problems: Azure cloud development, React patterns, security hardening, testing strategies, and more.

---

## What Are Plugins?

Plugins are **community-curated bundles** of reusable knowledge. Each plugin contains:

- **Agent templates** — specialized role charters for common needs (e.g., "AWS DevOps", "Python Data Science")
- **Skills** — reusable `.ai-team/skills/SKILL.md` files encoding patterns and best practices
- **Instructions** — `decisions.md` snippets for conventions and routing rules
- **Sample prompts** — ready-to-use prompts that activate plugin capabilities

A plugin marketplace is a **repository** that hosts these bundles. Squad ships with community marketplaces pre-configured. You can add your own.

---

## Available Marketplaces

| Marketplace | URL | What's Inside |
|-------------|-----|-----------|
| **awesome-copilot** | `github/awesome-copilot` | Frontend frameworks (React, Vue, Svelte), backend stacks (Node, Python, Go), deployment patterns |
| **anthropic-skills** | `anthropics/skills` | Claude-optimized patterns, prompt engineering, token efficiency, RAG patterns |
| **azure-cloud-dev** | `github/azure-cloud-development` | Azure VMs, App Service, Cosmos DB, DevOps with GitHub Actions, infrastructure-as-code |
| **security-hardening** | `github/security-hardening` | OWASP, input validation, secrets management, cryptography, compliance patterns |

---

## Commands

### List registered marketplaces

```
> Show me available marketplaces
```

Squad displays all configured marketplaces with descriptions.

```
/plugin marketplace list
```

Same thing, command-line style.

### Add a marketplace

```
> Add the awesome-copilot marketplace
```

Or use the command:

```
/plugin marketplace add github/awesome-copilot
```

Squad connects to the repository, indexes its plugins, and makes them available for browsing.

### Remove a marketplace

```
> Remove the awesome-copilot marketplace
```

Or:

```
/plugin marketplace remove awesome-copilot
```

Removes the marketplace from your config. Installed plugins remain; new plugins can't be added from it.

### Browse plugins in a marketplace

```
> Browse the awesome-copilot marketplace
```

Squad displays all available plugins with one-line descriptions.

```
/plugin marketplace browse awesome-copilot
```

Same command-line version.

### Search for a plugin

```
> Find a plugin for React testing
```

Squad searches all configured marketplaces for matching plugins and displays results with usage details.

---

## Step-by-Step: Add the Awesome-Copilot Marketplace

### Step 1: Add the marketplace

In your Squad session, say:

```
> Add the awesome-copilot marketplace
```

Squad connects to the repo and indexes all available plugins. You'll see a confirmation:

```
✅ awesome-copilot marketplace added
📦 38 plugins indexed
```

### Step 2: Browse available plugins

```
> Browse awesome-copilot
```

Squad shows a table of plugins:

```
Plugin Name              | Use Case | Install Command
-------------------------|----------|----------------
react-component-library | Frontend | /plugin install awesome-copilot/react-component-library
nextjs-fullstack        | Frontend | /plugin install awesome-copilot/nextjs-fullstack
fastapi-rest-api        | Backend  | /plugin install awesome-copilot/fastapi-rest-api
postgresql-migrations   | Database | /plugin install awesome-copilot/postgresql-migrations
[38 total plugins]
```

### Step 3: Install a plugin

Pick one that matches your needs. For a React project:

```
> Install the react-component-library plugin
```

Or use the exact command:

```
/plugin install awesome-copilot/react-component-library
```

Squad:
1. Downloads the plugin bundle
2. Merges agent templates into your `.ai-team/agents/` folder
3. Adds skills to `.ai-team/skills/`
4. Updates `decisions.md` with plugin conventions
5. Seeds all relevant agents with plugin knowledge

You'll see:

```
✅ react-component-library plugin installed
   ✓ Added React Component Design skill
   ✓ Added React Patterns decision (linting, naming, testing)
   ✓ Seeded 2 agents with React component expertise
```

**Your agents immediately know the plugin conventions** and use them in their next work session.

---

## Step-by-Step: Onboard a New Team Member with Plugins

You're adding a DevOps person to your Azure-heavy team. Instead of manually explaining your Azure setup, you use plugins.

### Step 1: Create the new agent

In your Squad session:

```
> I need a DevOps person
```

Squad spawns a new agent and seeds them with your project context.

### Step 2: Find Azure plugins

```
> Browse marketplaces for Azure plugins
```

Squad searches all configured marketplaces and shows:

```
Plugin Name               | Marketplace | Use Case
--------------------------|-------------|----------
azure-infrastructure      | azure-cloud-dev | VMs, Load Balancers, networking
azure-devops-pipelines    | azure-cloud-dev | GitHub Actions + ARM templates
azure-cosmos-setup        | azure-cloud-dev | Cosmos DB design and optimization
aks-deployment            | azure-cloud-dev | Kubernetes on Azure
```

### Step 3: Install the relevant plugin for the DevOps agent

```
> Install the azure-infrastructure plugin for the DevOps agent
```

Or:

```
/plugin install azure-cloud-dev/azure-infrastructure --agent DevOps
```

Squad:
1. Downloads the Azure infrastructure plugin
2. Adds its skills and conventions to the DevOps agent's history
3. Adds infrastructure decisions to the shared `decisions.md`
4. Seals the DevOps agent with Azure expertise on day 1

Your new DevOps person immediately understands:
- Your Azure resource naming convention
- How you structure ARM templates
- Your monitoring and alerting patterns
- Related decision history (why you chose certain regions, SKUs, etc.)

### Step 4: Verify

```
> DevOps agent, what's your understanding of our infrastructure?
```

The DevOps agent summarizes Azure setup from the plugin without asking questions.

---

## How Squad Uses Plugins During Team Member Creation

When you add a new agent, Squad can **auto-recommend plugins**:

```
> I'm adding someone for machine learning — they'll work with PyTorch and TensorFlow
```

Squad checks configured marketplaces for plugins matching "machine learning", "PyTorch", and "TensorFlow":

```
🔍 Searching marketplaces...

Found 4 plugins:
  ✓ pytorch-training-pipeline (awesome-copilot)
  ✓ tensorflow-mlops (awesome-copilot)
  ✓ ml-data-validation (anthropic-skills)
  ✓ gpu-monitoring (azure-cloud-dev)

Install these plugins for the ML engineer?
```

You say yes, and the agent arrives with full expertise.

---

## Advanced: Creating Your Own Plugin Marketplace

A plugin marketplace is just **a GitHub repository** with a specific structure:

```
my-team-plugins/
├── awesome-patterns/
│   ├── charter.md          # Agent template
│   ├── skills/
│   │   └── awesome-skill.md
│   └── decisions.md        # Conventions
├── microservices-template/
│   ├── charter.md
│   └── skills/
│       ├── service-discovery.md
│       └── fault-tolerance.md
└── README.md               # Plugin descriptions
```

### Step 1: Create the repository

```bash
mkdir my-team-plugins
cd my-team-plugins
git init
```

### Step 2: Add plugins

Create subdirectories for each plugin. Each should contain:
- `charter.md` — a sample agent role
- `skills/` folder with `.SKILL.md` files
- `decisions.md` — conventions the plugin enforces

### Step 3: Add to Squad

```
> Add my-team-plugins marketplace
```

Or in config:

```
/plugin marketplace add github/my-org/my-team-plugins
```

Squad indexes all plugins and makes them available for install.

---

## Sample Prompts

### Browse and install in one go

```
Find a React plugin in awesome-copilot and install it for our Frontend agent.
```

### Create a plugin template

```
Package our current React conventions into a plugin called react-best-practices.
```

Squad exports your relevant skills, decisions, and agent history into a reusable plugin bundle that you can share.

### Search across marketplaces

```
Show me all database migration plugins across all marketplaces.
```

### Recommend plugins based on my team

```
What plugins from awesome-copilot would help my Frontend + Backend + Tester team?
```

### Update plugins

```
Check if any installed plugins have newer versions.
```

Squad compares your installed plugins against marketplace versions and suggests updates.

---

## Troubleshooting

### "Marketplace not found"

**Symptom:** `Error: Could not connect to marketplace github/awesome-copilot`

**Fix:**

1. Verify the marketplace is public on GitHub
2. Check your GitHub token has read access:
   ```bash
   gh auth status
   ```
3. Verify the repository name is spelled correctly

### "Plugin conflicts with existing agent"

**Symptom:** Installing a plugin tries to overwrite an existing agent.

**Fix:**

Squad won't overwrite by default. Instead, it will:
1. Ask which agent to merge the plugin into
2. Or suggest creating a new agent (e.g., "ReactFrontend" if "Frontend" already exists)

You control the merge.

### "Installed plugin isn't being used"

**Symptom:** Agents don't know the plugin conventions.

**Fix:**

1. Verify the plugin was installed:
   ```
   > Show installed plugins
   ```

2. Restart your Squad session so agents reload their history

3. Check that `decisions.md` was updated:
   ```bash
   cat .ai-team/decisions.md | grep -i plugin-name
   ```

### "Marketplace is too slow"

**Symptom:** Browsing or installing plugins takes 30+ seconds.

**Fix:**

1. The marketplace repository is large. This is normal for the first browse.
2. Squad caches marketplace index locally — subsequent browses are instant.
3. To refresh the cache:
   ```
   > Refresh marketplace cache
   ```

---

## See Also

- [Skills System](./skills.md) — how plugins encode reusable knowledge
- [Adding Team Members](../guide.md#adding-members) — plugins speed up onboarding
- [Decisions System](../guide.md#memory-system) — plugins merge conventions into shared decisions
