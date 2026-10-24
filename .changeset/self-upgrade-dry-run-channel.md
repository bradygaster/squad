---
"@bradygaster/squad-cli": patch
---

`squad upgrade --self` now honors `--dry-run` (prints the exact install command, runs nothing), follows the installed channel (a `preview`/`insider` build upgrades via the `insider` dist-tag, stable via `latest`) unless `--insider` overrides, and refuses to install a version older than the running CLI unless `--force` is given (#2295).