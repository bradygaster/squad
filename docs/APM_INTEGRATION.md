# APM Integration for Squad CLI

**Status:** Phase 1 Complete (Basic Generation)  
**Related Issue:** [#824](https://github.com/bradygaster/squad/issues/824)  
**APM Repository:** [microsoft/apm](https://github.com/microsoft/apm)

---

## What is APM?

APM (Agent Package Manager) is a dependency manager for AI agent configuration—think `package.json` for agent context. It enables:

- **Versioned Dependencies:** Install skills and instructions from GitHub/GitLab repos
- **Transitive Resolution:** Packages can depend on other packages (like npm)
- **Portability:** Share Squad skills across projects and teams
- **Marketplace Support:** Browse and install curated skill packages

See the [APM Documentation](https://microsoft.github.io/apm/) for full details.

---

## Current Integration

### Phase 1: Basic Generation (✅ Complete)

When you run `squad init`, an `apm.yml` manifest is automatically generated alongside `.squad/`:

```yaml
# apm.yml
name: my-project
version: 0.1.0
description: Squad team for my-project
author: Your Name
license: MIT

dependencies:
  apm: []
  mcp: []

compilation:
  target: vscode
  strategy: distributed
  exclude:
    - ".squad/**"
    - "node_modules/**"
    - "dist/**"
```

Additionally, `.apmignore` is created to exclude Squad internal state from APM packages:
- Agent history files (`.squad/agents/*/history.md`)
- Orchestration logs (`.squad/orchestration-log/**`)
- Session logs (`.squad/log/**`)
- Temporary markers (`.first-run`, `.init-prompt`, `.squad-workstream`)

### What This Enables

With the generated `apm.yml`, your Squad project is now APM-ready. While full CLI integration is pending, you can use APM directly:

```bash
# Install APM CLI (if not already installed)
npm install -g apm-cli

# Install a skill package from GitHub
apm install microsoft/apm-sample-package#v1.0.0

# Install an APM-compatible skill to use in Squad
apm install owner/repo/skills/security
```

Installed APM content goes to `apm_modules/` by default. For Squad integration, you can manually copy skills to `.squad/skills/`.

---

## Planned Features

### Phase 2: Skill Export

**Command:** `squad skill publish <skill-name>`

Export a Squad skill to APM-compatible format:
- Reads from `.squad/skills/{name}.md`
- Converts to APM `SKILL.md` format
- Generates `.apm/skills/{name}/SKILL.md`
- Updates `apm.yml` if needed
- Optional: Push to GitHub for sharing

**Skill Format Mapping:**

Squad → APM:
```markdown
# Pattern Name
Description

## When to Use
## Pattern
## Example
```

becomes:

```markdown
---
name: pattern-name
description: Brief one-liner
tags: [squad, pattern]
---

# Pattern Name
(Full content from Squad skill)
```

### Phase 3: Skill Import

**Command:** `squad skill install <package-ref>`

Install skills from APM registry into Squad:
- Uses APM resolver to fetch package
- Converts APM format to Squad format
- Writes to `.squad/skills/{name}.md`
- Updates `apm.yml` dependencies
- Generates/updates `apm.lock.yaml`

**Package Reference Examples:**
- `microsoft/apm-sample-package#v1.0.0`
- `owner/repo/skills/security`
- `gitlab.com/acme/coding-standards`

### Phase 4: Marketplace Integration

**Commands:**
- `squad skill browse` — List popular skills
- `squad skill search <query>` — Search APM packages
- `squad skill info <package>` — Show package details

Integrates with existing `squad plugin marketplace` infrastructure.

---

## Design Decisions

### 1. APM CLI Dependency Strategy

**Decision:** Check availability at runtime, don't bundle.

- Squad CLI remains lightweight
- APM is actively developed; bundling risks version skew
- Provide helpful error messages with install instructions
- Squad works without APM; APM integration is additive

### 2. Skill Storage Location

**Decision:** Install directly to `.squad/skills/`, track APM origins in metadata.

- No symlinks or dual directories
- One source of truth for skills
- Add `.squad/skills/.apm-manifest.json` to track APM package origins:
  ```json
  {
    "installed": {
      "security-review": {
        "source": "microsoft/security-skills#v1.0.0",
        "installedAt": "2026-04-09T12:00:00Z"
      }
    }
  }
  ```

### 3. Manifest Location

**Decision:** `apm.yml` at project root (not `.squad/`).

- Follows APM convention
- Allows non-Squad projects to use APM
- Squad-specific overrides can live in `.squad/apm-overrides.yml` if needed

### 4. Skill Versioning

**Decision:** Defer to git commits for now, add explicit versions later.

- Squad skills don't have explicit versions today
- Future: Add optional frontmatter version field
- For export: derive version from git tags/commits

---

## Contributing

### Implementing Phase 2+ Features

If you want to implement skill export/import commands:

1. **Create command file:** `packages/squad-cli/src/cli/commands/skill.ts`
2. **Follow existing patterns:** See `export.ts` or `import.ts` for structure
3. **Add to CLI router:** Register in `packages/squad-cli/src/cli-entry.ts`
4. **Conversion functions:**
   - `convertSquadToApm(squadSkillContent: string): ApmSkill`
   - `convertApmToSquad(apmSkillContent: string): string`
5. **APM integration:**
   - Check if `apm` CLI is available: `which apm` or `where apm`
   - Shell out to `apm install <package>` for package resolution
   - Parse `apm.lock.yaml` to track installed versions

### Testing

```bash
# Test init with APM generation
cd /tmp/test-squad-apm
squad init

# Verify files created
cat apm.yml
cat .apmignore

# Test with APM CLI (if installed)
apm install microsoft/apm-sample-package
```

---

## References

- **APM Repository:** https://github.com/microsoft/apm
- **APM Manifest Spec:** https://microsoft.github.io/apm/reference/manifest-schema/
- **APM Examples:** https://microsoft.github.io/apm/reference/examples/
- **Squad Issue #824:** https://github.com/bradygaster/squad/issues/824
- **Research Doc:** tamresearch1 `.squad/research/2145-apm-integration-research.md`

---

## FAQ

**Q: Do I need APM installed to use Squad?**  
A: No. The `apm.yml` file is optional and doesn't affect Squad's core functionality. It's there for users who want to share/install skills via APM.

**Q: Can I use APM without Squad?**  
A: Yes. APM is a standalone tool for managing AI agent context across any IDE or agent runtime.

**Q: What's the difference between Squad skills and APM skills?**  
A: Squad skills are earned learnings stored in `.squad/skills/`. APM skills are installable packages from a registry. Phase 2+ will bridge them with export/import commands.

**Q: Will APM replace Squad's skill system?**  
A: No. APM is an export/import layer for portability. Squad's skill system (local learning, compressed patterns) remains the core model.

**Q: How do I publish my Squad skills to APM?**  
A: Phase 2 will add `squad skill publish`. For now, manually convert skills to APM format and push to a GitHub repo. See [APM docs on creating packages](https://microsoft.github.io/apm/guides/pack-distribute/).
