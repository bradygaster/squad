### 2026-02-20: Branch content policy — what ships where
**By:** Squad (Coordinator), requested by Brady
**What:** Formal policy defining which files belong on each protected branch
**Why:** 164 forbidden files leaked onto insider when branch was created from dev. Need a checklist to prevent this on every branch creation.

---

## Branch Content Policy

### ✅ ALLOWED on all protected branches (main, preview, insider)

| Path | Description |
|------|-------------|
| `.github/agents/` | Agent definition (squad.agent.md) |
| `.github/workflows/` | CI/CD workflows |
| `.github/copilot-instructions.md` | Copilot coding agent instructions |
| `.gitattributes` | Merge driver config |
| `.gitignore` | Git ignore rules |
| `.npmignore` | npm publish ignore rules |
| `index.js` | CLI entry point |
| `package.json` | Package manifest |
| `templates/` | Files copied to consumer repos during init |
| `docs/` (except `docs/proposals/`) | Public documentation, blog, features, scenarios |
| `test/` | Test suite |
| `README.md` | Project readme |
| `CHANGELOG.md` | Release changelog |
| `CONTRIBUTING.md` | Contribution guide |
| `CONTRIBUTORS.md` | Contributors list |
| `LICENSE` | License file |

### ❌ FORBIDDEN on all protected branches (main, preview, insider)

| Path | Why | Enforced by |
|------|-----|-------------|
| `.ai-team/` | Runtime team state — dev/feature branches only | squad-main-guard.yml |
| `.ai-team-templates/` | Internal format guides — dev only | squad-main-guard.yml |
| `team-docs/` | Internal team content — dev only | squad-main-guard.yml |
| `docs/proposals/` | Internal design proposals — dev only | squad-main-guard.yml |
| `_site/` | Build output — never committed | .gitignore |

### 🔀 Branch-specific extras

| Branch | Extra files allowed | Notes |
|--------|-------------------|-------|
| **main** | — | Cleanest. Tagged releases cut from here. |
| **preview** | — | Pre-release. Same content rules as main. |
| **insider** | `docs/insider-program.md`, `.github/workflows/squad-insider-release.yml`, `templates/workflows/squad-insider-release.yml` | Early access channel. Auto-tags on push. |
| **dev** | `.ai-team/`, `.ai-team-templates/`, `team-docs/`, `docs/proposals/` | Development. All internal files live here. |
| **squad/* feature** | Same as dev | Feature branches inherit dev rules. |

### 📋 Branch Creation Checklist

When creating a new protected branch from dev:

1. `git checkout -b {branch} dev`
2. Remove forbidden paths:
   ```bash
   git rm -r --quiet .ai-team/ .ai-team-templates/ docs/proposals/ 2>/dev/null; true
   git rm -r --quiet team-docs/ 2>/dev/null; true
   ```
3. Commit: `git commit -m "chore: remove dev-only files from {branch}"`
4. Push: `git push -u origin {branch}`
5. Verify: `git ls-tree -r --name-only origin/{branch} | grep -E "^\.ai-team|^team-docs|^docs/proposals"` (should return nothing)
