---
"@bradygaster/squad-cli": minor
---

Add `squad upgrade --self` to upgrade the CLI package itself (#798)

- `squad upgrade --self` → installs `@bradygaster/squad-cli@latest` (stable)
- `squad upgrade --self --insider` → installs `@bradygaster/squad-cli@insider` (prerelease)
- After self-upgrade, automatically continues with repo upgrade to apply new templates
- Detects package manager (npm/pnpm/yarn) from npm_config_user_agent
- Clear error on permission denied (suggests sudo or npx)
- Help text updated with new flags
