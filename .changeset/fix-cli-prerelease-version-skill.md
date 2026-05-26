---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

fix: bump CLI version to 0.9.7-preview; align E2E skill and policy gate with CONTRIBUTING.md

The insider publish workflow stamped `@bradygaster/squad-cli` at `0.9.6-build.4`,
which violates the prerelease version policy gate. Per CONTRIBUTING.md, the correct
local dev version is `{next-version}-preview`.

- `packages/squad-cli/package.json`: `0.9.6-build.4` → `0.9.7-preview`
- All 4 copies of `e2e-template-testing/SKILL.md` (root `templates/`,
  `packages/squad-sdk/templates/`, `packages/squad-cli/templates/`,
  `.squad-templates/`):
  - **Build commands** aligned with CONTRIBUTING.md (lines 253–256): use workspace
    flags `npm run build -w packages/squad-sdk && npm run build -w packages/squad-cli`
    and `npm link -w packages/squad-cli` instead of shell `cd` + bare `npm run build`
  - **Version verify text** updated to version-agnostic `x.y.z-preview` placeholder
    with an explicit note that the `-preview` suffix is required, linking to
    CONTRIBUTING.md for the full local dev setup
- `.github/workflows/squad-ci.yml` — Prerelease Version Guard: relaxed regex from
  `/-/` (any hyphen) to `/-/ && not /^\d+\.\d+\.\d+-preview$/` so the CONTRIBUTING.md-
  sanctioned `-preview` suffix is allowed while all other prerelease tags (e.g.
  `-build.4`, `-alpha`, `-beta`) are still blocked
