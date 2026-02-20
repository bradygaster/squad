# PRD 12: Distribution & In-Copilot Install

**Owner:** Kujan (Copilot SDK Expert)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1 (v0.6.0 — npm publishing + bundling) / Phase 2 (v0.7.0 — in-Copilot install) / Phase 3 (v1.0.0 — marketplace)
**Dependencies:** PRD 1 (SDK Integration Core), PRD 9 (BYOK)

## Problem Statement

Squad's current distribution is `npx github:bradygaster/squad` — a GitHub tarball fetched via npm. This has three problems: (1) it's invisible to anyone who doesn't already know the exact command, (2) it requires npm/Node.js knowledge, and (3) there's no update mechanism — users must re-run `npx` and hope they get the latest version. Brady's directive: "if there's a way a Copilot user could install/update Squad from within Copilot, that would SERIOUSLY increase adoption." The install experience must be as frictionless as possible across CLI, VS Code, JetBrains, and GitHub.com.

## Goals

1. In-Copilot install: user says "install Squad" or "set up a team" in Copilot and it happens
2. npm registry publishing for standard `npm install` / `npx` workflows
3. Single-file bundled distribution (embedded templates, markdown, workflows)
4. Auto-update mechanism with user consent
5. First-run experience that's immediate and delightful
6. Distribution across: npm, GitHub Releases, GitHub tarball, and Copilot marketplace (future)

## Non-Goals

- Platform-specific installers (homebrew, apt, chocolatey) — npm is sufficient for Node.js users
- Desktop application or Electron wrapper
- Offline-first distribution (npm requires network; GitHub tarball requires network)
- Replacing `create-squad` scaffolding with a different init mechanism

## Background

Current distribution chain:
```
User runs: npx github:bradygaster/squad
  → npm fetches tarball from GitHub (not npm registry)
  → npm extracts to temp directory
  → npm runs index.js
  → index.js copies templates/ to target directory
  → User has .squad/ structure + workflows
```

Limitations:
- **No npm registry presence:** `npx github:bradygaster/squad` is a GitHub-specific npm feature. Not discoverable via `npm search`. No download stats. No semver resolution.
- **No bundling:** Templates are loose files in the package. `node_modules/` is not bundled. SDK dependency will add ~2MB+ to install.
- **No update detection:** User must manually re-run `npx` to get updates. No version check. No "new version available" notice.
- **No in-IDE discovery:** VS Code users must open terminal, know the command. No marketplace listing. No agent picker entry.

The SDK replatform (adding `@github/copilot-sdk` as a dependency) changes the distribution calculus: Squad will be a Node.js package with real dependencies, not just a template copier. This requires proper bundling, dependency management, and distribution strategy.

## Proposed Solution

### 1. npm Registry Publishing

Publish to npm as `@bradygaster/squad` (scoped package):

```json
{
  "name": "@bradygaster/squad",
  "version": "0.6.0",
  "bin": {
    "create-squad": "./dist/cli.js",
    "squad": "./dist/runtime.js"
  },
  "files": ["dist/", "README.md", "LICENSE"],
  "engines": { "node": ">=20.0.0" }
}
```

Two entry points:
- `create-squad` — scaffolding CLI (existing `index.js` behavior)
- `squad` — runtime CLI (new, for SDK-backed orchestration in Phase 2)

Users install via:
```bash
npx @bradygaster/squad init        # Scaffold a new squad
npx @bradygaster/squad upgrade     # Upgrade existing squad
npx @bradygaster/squad orchestrate # Start SDK runtime (Phase 2)
```

**Why scoped package:** `@bradygaster/squad` ties to Brady's npm account. Alternative: `create-squad` (unscoped, follows npm init convention — `npm init squad` works). Decision needed.

### 2. Bundling Strategy (esbuild)

Bundle everything into a single-file distribution:

```
dist/
├── cli.js          # esbuild bundle: index.js + all dependencies
├── runtime.js      # esbuild bundle: SDK orchestrator + dependencies
└── resources/      # Embedded templates, workflows, markdown
    ├── templates.tar.gz    # Compressed template files
    └── manifest.json       # Template file list + checksums
```

esbuild config:
```javascript
// build.js
import { build } from 'esbuild';
import { execSync } from 'child_process';

// Bundle CLI
await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/cli.js',
  format: 'esm',
  external: ['@github/copilot-sdk'],  // SDK has native deps, keep external
  loader: { '.md': 'text', '.yml': 'text' },  // Embed markdown + YAML as strings
  define: {
    'process.env.SQUAD_VERSION': JSON.stringify(pkg.version)
  }
});

// Bundle runtime (Phase 2)
await build({
  entryPoints: ['src/runtime.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/runtime.js',
  format: 'esm',
  external: ['@github/copilot-sdk', 'vscode-jsonrpc'],
  loader: { '.md': 'text' }
});
```

**Embedded resources pattern:** Templates (`.agent.md`, workflows, config files) are embedded into the bundle using esbuild's `text` loader. At runtime, Squad extracts them from the bundle instead of reading from `templates/` directory:

```typescript
// Template embedded as string at build time
import squadAgentTemplate from '../templates/squad.agent.md';
import ciWorkflow from '../templates/workflows/squad-ci.yml';

function writeTemplate(targetDir: string) {
  fs.writeFileSync(path.join(targetDir, '.github/agents/squad.agent.md'), squadAgentTemplate);
  fs.writeFileSync(path.join(targetDir, '.github/workflows/squad-ci.yml'), ciWorkflow);
}
```

This eliminates the need for `templates/` directory in the npm package. Single `dist/cli.js` file contains everything needed. Reduces install surface and avoids path resolution issues.

**SDK as external dependency:** `@github/copilot-sdk` has native dependencies (`vscode-jsonrpc`) and spawns CLI processes. It cannot be bundled into a single file. Keep it as `peerDependency` or `dependency` in package.json. The `cli.js` (scaffolding) doesn't need SDK — only `runtime.js` does.

### 3. In-Copilot Install

The highest-impact channel. Three approaches, ranked by feasibility:

#### Approach A: Custom Agent that Self-Installs (Most Feasible, v0.6.0)

A lightweight `.github/agents/install-squad.agent.md` that users can add to their repo manually or via GitHub template:

```markdown
---
name: install-squad
description: Installs and configures Squad for your project
---

You are a Squad installer. When asked to install Squad, run:

1. `npx @bradygaster/squad init` in the project root
2. Walk the user through team configuration
3. Explain what was created

When asked to update Squad, run:
1. `npx @bradygaster/squad upgrade`
2. Show what changed
```

User flow: Copy this one file → tell Copilot "install Squad" → done.

**Limitation:** User must still manually add the agent file first. Not truly zero-friction.

#### Approach B: Copilot Extension / Agent Marketplace (Medium-term, v0.7.0+)

GitHub is building a Copilot Extension marketplace (announced). If/when it launches:

- Squad registers as a Copilot Extension
- Users install from marketplace (one click)
- Extension registers `@squad` as a chat participant
- User says `@squad init` in any Copilot chat → Squad installs

**Dependency:** GitHub Copilot Extension marketplace availability. Not yet GA. Monitor closely.

SDK relevance: The SDK's `CopilotClient` with `customAgents` API is the programmatic equivalent of a Copilot Extension. When the marketplace launches, Squad's SDK-based runtime IS the extension backend.

#### Approach C: GitHub-Native Agent Registration (Long-term, v1.0.0+)

If GitHub enables repository-level or org-level agent registration:

- Org admin installs Squad once for the organization
- All repos in the org get Squad agent available in Copilot
- No per-repo setup needed

**Dependency:** GitHub feature that doesn't exist yet. Speculative.

### 4. Auto-Update Mechanism

Check for new versions on `squad` command invocation:

```typescript
async function checkForUpdates() {
  const currentVersion = process.env.SQUAD_VERSION;
  try {
    // Check npm registry (lightweight, cached)
    const res = await fetch('https://registry.npmjs.org/@bradygaster/squad/latest', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)  // Don't block startup
    });
    const data = await res.json();
    const latestVersion = data.version;

    if (semver.gt(latestVersion, currentVersion)) {
      console.log(`\n📦 Squad ${latestVersion} available (current: ${currentVersion})`);
      console.log(`   Run: npx @bradygaster/squad upgrade\n`);
    }
  } catch {
    // Silent fail — don't block user if registry is unreachable
  }
}
```

Update check behavior:
- Runs at most once per 24 hours (cache in `~/.squad/last-update-check`)
- 3-second timeout (never blocks startup)
- Silent on failure (network issues shouldn't affect UX)
- Never auto-installs (user must explicitly run `upgrade`)
- Shows changelog summary for the update

For in-Copilot update: user says "update Squad" → Copilot runs `npx @bradygaster/squad upgrade` → shows what changed.

### 5. Install Experience Matrix

| Host | Install Method | First-Run Experience |
|------|---------------|---------------------|
| **CLI (Copilot CLI)** | `npx @bradygaster/squad init` | Interactive prompts: project type detection, team setup, git branch creation |
| **VS Code** | `.github/agents/squad.agent.md` present → agent appears in picker | Tell `@squad` to "set up a team" → guided conversation |
| **JetBrains** | Same as VS Code (JetBrains reads `.github/agents/`) | Same — agent picker, conversational setup |
| **GitHub.com** | Copilot Coding Agent reads `squad.agent.md` if present | Issue-driven: open issue "Initialize Squad" → CCA runs setup |
| **npm** | `npm install -g @bradygaster/squad` → `create-squad` in PATH | Same as CLI |

### 6. First-Run Experience

After `squad init` completes:

```
🎬 Squad v0.6.0 initialized!

Your team:
  🎯 Keaton (Lead) — Scope, decisions, code review
  ⚙️ Fenster (Core Dev) — Architecture, implementation
  🧪 Hockney (Tester) — Tests, quality, CI
  📝 McManus (Scribe) — Documentation, logs

Created:
  .github/agents/squad.agent.md  — Your team coordinator
  .squad/team.md                  — Team roster
  .squad/decisions.md             — Decision log
  .squad/routing.md               — Task routing rules
  .github/workflows/squad-ci.yml  — CI pipeline

Next steps:
  1. Open Copilot and say "Hey Squad, what should we work on?"
  2. Or run: copilot "Review this codebase and suggest improvements"

📖 Docs: https://bradygaster.github.io/squad/
```

The first-run message is the product's first impression. It must:
- Show the team (people connect with named characters)
- List what was created (transparency)
- Give immediate next action (no "now what?" moment)
- Link to docs (escape hatch for confused users)

### 7. Distribution Channels

| Channel | Package Name | Version Strategy | Status |
|---------|-------------|------------------|--------|
| **npm registry** | `@bradygaster/squad` | Semver, `latest` + `preview` dist-tags | Phase 1 (v0.6.0) |
| **GitHub Releases** | `bradygaster/squad` | Git tags, release assets (bundled tarball) | Existing (enhance) |
| **GitHub tarball** | `github:bradygaster/squad` | HEAD of default branch | Existing (keep as alias) |
| **Copilot marketplace** | TBD | Marketplace versioning | Phase 3 (when available) |

npm publishing pipeline:
```yaml
# .github/workflows/squad-release.yml additions
- name: Publish to npm
  run: |
    npm run build           # esbuild bundle
    npm publish --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Preview releases use npm dist-tag:
```bash
npm publish --tag preview   # Users install with: npx @bradygaster/squad@preview
```

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| npm registry publishing as `@bradygaster/squad` | 🔄 Pending | Scoped to Brady's account. Alternative: `create-squad` (unscoped, `npm init` convention). Need Brady's preference. |
| esbuild for bundling (not webpack, rollup) | ✅ Decided | Fastest bundler, zero config for Node.js. Squad is server-side only — no browser compat needed. |
| Embedded resources via esbuild text loader | ✅ Decided | Single-file distribution. No `templates/` directory to manage. No path resolution issues. |
| SDK as external dependency (not bundled) | ✅ Decided | SDK has native deps and spawns processes. Cannot be bundled. `peerDependency` for runtime. |
| In-Copilot install via custom agent file (Phase 1) | ✅ Decided | Most feasible today. Marketplace (Phase 2) requires GitHub feature. |
| Update check once per 24 hours, 3s timeout | ✅ Decided | Never blocks startup. Never nags. Respects user time. |
| Two entry points: `create-squad` + `squad` | ✅ Decided | Scaffolding (create-squad) is separate from runtime (squad). Different concerns, different dependencies. |

## Implementation Notes

### Package Structure After Bundling

```
@bradygaster/squad (npm package)
├── dist/
│   ├── cli.js              # ~200KB bundled (templates embedded as strings)
│   └── runtime.js           # ~150KB bundled (SDK orchestrator, Phase 2)
├── package.json
├── README.md
└── LICENSE

No templates/ directory — everything embedded in dist/cli.js
No node_modules/ — dependencies bundled (except SDK)
```

### Embedded Template Extraction

Templates are imported as strings at build time:

```typescript
// At build time, esbuild converts these to string constants
import squadAgent from '../templates/squad.agent.md';
import teamMd from '../templates/team.md';
import routingMd from '../templates/routing.md';
// ... etc

const TEMPLATES: Record<string, string> = {
  '.github/agents/squad.agent.md': squadAgent,
  '.squad/team.md': teamMd,
  '.squad/routing.md': routingMd,
  // ... all template files
};

function extractTemplates(targetDir: string) {
  for (const [relativePath, content] of Object.entries(TEMPLATES)) {
    const fullPath = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}
```

**Binary files** (images, if any) use esbuild's `dataurl` or `binary` loader:
```javascript
loader: { '.md': 'text', '.yml': 'text', '.json': 'text', '.png': 'dataurl' }
```

### Version Stamping

The existing `stampVersion()` function in `index.js` embeds version into `squad.agent.md` frontmatter. With bundled templates, stamping happens at build time (not install time):

```javascript
// build.js
const version = JSON.parse(fs.readFileSync('package.json')).version;
// esbuild define replaces at build time
define: {
  '__SQUAD_VERSION__': JSON.stringify(version)
}
```

### Copilot Marketplace Preparation

When Copilot Extension marketplace becomes available, Squad would register as:

```json
{
  "name": "squad",
  "displayName": "Squad — AI Team for Your Codebase",
  "description": "AI agent teams that grow with your code",
  "icon": "squad-icon.png",
  "publisher": "bradygaster",
  "capabilities": {
    "chat": true,
    "agents": true
  },
  "activation": {
    "onChat": "@squad"
  }
}
```

The SDK `CopilotClient` would be the extension backend. `customAgents` array = Squad team. Hooks = coordinator logic. This is why the SDK replatform is strategic — it positions Squad for marketplace distribution.

### GitHub Actions Distribution

For CI/CD use cases (Squad in GitHub Actions):

```yaml
- uses: bradygaster/squad-action@v1
  with:
    task: "Review this PR and run tests"
    provider: "azure"
  env:
    AZURE_OPENAI_API_KEY: ${{ secrets.AZURE_KEY }}
```

This is a Phase 3 stretch goal. Requires SDK running headless in Actions environment. The `CopilotClient` supports `githubToken` auth — `${{ secrets.GITHUB_TOKEN }}` works natively.

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| npm name squatting (`create-squad` or `squad` taken) | Medium | Use scoped package `@bradygaster/squad`. Check availability before publishing. |
| esbuild bundle size exceeds npm limits | Low | npm limit is 100MB. Squad bundle estimated at <2MB. Not a concern. |
| Embedded templates increase bundle size | Low | All templates are text (markdown, YAML). Compressed, likely <200KB total. |
| In-Copilot install requires user to add agent file first | High | This is the chicken-and-egg problem. Marketplace solves it. Phase 1 mitigation: prominent one-liner in README, GitHub template repo. |
| SDK as external dependency complicates install | Medium | `create-squad` (scaffolding) doesn't need SDK — zero extra deps for basic install. SDK only needed for `squad orchestrate` (Phase 2). |
| Auto-update check leaks usage data to npm registry | Low | npm registry request is standard `GET`. No auth, no identifying info beyond IP. Same as any `npm install`. |
| Breaking changes in bundled templates | Medium | Version-aware upgrade: `squad upgrade` diffs template versions, shows changes, asks before overwriting user-modified files. |
| Copilot marketplace may never launch or may have different requirements | High | In-Copilot install via custom agent file works today without marketplace. Marketplace is upside, not dependency. |

## Success Metrics

1. **Install friction:** New user goes from zero to working Squad in <3 minutes
2. **npm discoverability:** Appears in `npm search squad` results. Download count tracked.
3. **Bundle size:** `dist/cli.js` < 500KB (scaffolding only), `dist/runtime.js` < 1MB
4. **Update adoption:** >50% of active users on latest version within 2 weeks of release
5. **In-Copilot install:** User can say "install Squad" and have a working team within one Copilot conversation
6. **Cross-host parity:** Squad works identically on CLI, VS Code, JetBrains (same agent file, same templates)

## Open Questions

1. **npm package name:** `@bradygaster/squad` vs. `create-squad` vs. `@squad/cli`? Scoped package is safest but less discoverable. `create-squad` enables `npm init squad` which is elegant. Need Brady's decision.
2. **Monorepo or single package?** If `create-squad` (scaffolding) and `squad` (runtime) have different dependencies, should they be separate npm packages? Monorepo with `@bradygaster/create-squad` + `@bradygaster/squad-runtime`?
3. **GitHub template repository:** Should there be a `squad-template` repo that users can "Use this template" from GitHub? Zero-friction for GitHub-native users. Complements but doesn't replace npm.
4. **Copilot Extension API timeline:** When will GitHub ship the Extension marketplace? This is the unlock for truly frictionless in-Copilot install. Monitor GitHub Copilot roadmap.
5. **Node.js version requirement:** SDK requires Node.js 20+. Is this a barrier for enterprise users on older LTS versions? Likely not (Node 20 is current LTS) but worth validating.
6. **Global install vs. npx:** Should Squad recommend `npm install -g` (always available) or `npx` (always latest)? npx is simpler but slower (downloads every time unless cached).
