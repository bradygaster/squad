# Session: 2026-02-20T17:34 — Squad PR Repo Creation & Directives

## Participants

- **Keaton (Lead):** Creating milestones + issues on bradygaster/squad-pr from 14 PRDs
- **Kujan (SDK Expert):** Feature risk punch list for replatform
- **Scribe:** Logging directives and merging decisions

## What Happened

1. **Brady requested** creation of `bradygaster/squad-pr` (private repository) for the squad-sdk replatform project.

2. **New directives captured** for team memory:
   - **Single .squad/ directory:** Everything (agents, config, state) lives in one `.squad/` folder. No `.ai-team/`, no multi-directory fragmentation.
   - **Global installation:** Squad should support machine-wide (non-project-specific) installation. Not just source repos — expand scope.
   - **Agent repositories:** Agents must be pullable from flexible sources (disk, cloud, API, marketplace). First impl local; architecture pluggable.
   - **Zero-config:** Installation and setup should work out of the box. No manual configuration friction.

3. **SDK repo decision** (from Fenster):
   - `C:\src\squad-sdk` created as new peer repo with complete TypeScript scaffold
   - Aligned to 14-PRD architecture (PRD 1 is gate)
   - v0.5.3-insiders release scheme finalized

## Decisions Merged

5 new decision blocks merged into `.ai-team/decisions.md`:
- `copilot-directive-single-squad-dir.md`
- `copilot-directive-global-install.md`
- `copilot-directive-agent-repositories.md`
- `copilot-directive-zero-config.md`
- `fenster-squad-sdk-repo.md`

All inbox files deleted after merge.

## Key Outcomes

- Team memory updated with Brady's architectural directives
- Decision log current and consolidated
- Ready for PRD implementation sprint
