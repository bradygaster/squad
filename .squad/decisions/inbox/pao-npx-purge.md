# Decision: npm-only distribution for all user-facing docs

**Date:** 2026  
**Requested by:** Brady (bradygaster)  
**Owner:** PAO

## Decision

All user-facing Squad documentation uses `npm install -g @bradygaster/squad-cli` as the only install method. The `squad` command is used directly after global install.

## What changed

- Removed all `npx @bradygaster/squad-cli` alternatives from user-facing docs
- Removed all `npx github:bradygaster/squad` references (deprecated distribution method)
- Replaced with `npm install -g @bradygaster/squad-cli` for install steps, `squad <command>` for usage
- Insider builds: `npm install -g @bradygaster/squad-cli@insider` + `squad upgrade`
- Removed the "npx github: hang" troubleshooting section (deprecated distribution is gone)
- Removed "npx cache serving stale version" troubleshooting section

## What was NOT changed

- `npx` for dev tools: changeset, vitest, astro, pagefind — these are not Squad CLI
- Blog posts (001*, 004*, etc.) — historical content reflects what was true at the time
- Migration.md "Before" column and "# OLD" CI/CD examples — valid historical context for migration guidance
- All `agency-agents` references in source files — MIT license attribution, legally required

## Agency audit finding

All occurrences of "agency" in the codebase are attribution strings for the MIT-licensed `agency-agents` project (https://github.com/msitarzewski/agency-agents) from which role catalog content was adapted. These are legally required and must not be removed. The one exception was `cli-entry.ts` line 184 which used `"agency copilot"` as a help text example referencing another product — changed to `"gh copilot"`.
