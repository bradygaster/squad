# SURGEON

## Core Context

v0.8.24 released successfully. npm packages: @bradygaster/squad-sdk@0.8.24, @bradygaster/squad-cli@0.8.24. publish.yml triggers on `release: published` (NOT draft). Test baseline at release: 3,931 tests, 149 files.

## Patterns

**Version mutation bug (P0):** bump-build.mjs mutates versions during local builds despite SKIP_BUILD_BUMP=1 and CI=true env vars. Workaround: set versions with `node -e` script and commit IMMEDIATELY before building. This is a P0 fix item in docs/proposals/cicd-gitops-prd.md.

**Known incidents:** v0.8.22: 4-part version 0.8.21.4 mangled by npm to 0.8.2-1.4. v0.8.23: versions reverted from 0.8.23 to 0.8.22 during build despite env vars. Both resolved with node -e script + immediate commit workaround.

