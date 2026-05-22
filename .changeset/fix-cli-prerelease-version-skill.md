---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

fix: bump CLI version to 0.9.7-preview and relax E2E skill version check

The insider publish workflow stamped `@bradygaster/squad-cli` at `0.9.6-build.4`, which violates the prerelease version policy gate. Per CONTRIBUTING.md, the correct local dev version is `{next-version}-preview`.

- `packages/squad-cli/package.json`: `0.9.6-build.4` → `0.9.7-preview`
- All 4 copies of `e2e-template-testing/SKILL.md`: relaxed version check wording from "should show the `-preview` tag" to "outputs a version string (e.g., `0.9.7-preview` on a dev branch)" — making the `-preview` example descriptive rather than prescriptive
