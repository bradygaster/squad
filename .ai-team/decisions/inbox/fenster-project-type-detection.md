# Decision: Project Type Detection for Workflow Generation

**By:** Fenster (Core Developer)
**Issue:** #87
**Branch:** `squad/87-project-type-detection`
**Date:** 2026-02-21

## Decision

Implement project type detection in `index.js` so that `squad init` and `squad upgrade` do not install broken npm/Node.js workflow commands into non-Node projects.

## Detection Logic

Marker files checked in target directory, first-match wins:

| Marker | Detected Type |
|--------|--------------|
| `package.json` | `npm` |
| `go.mod` | `go` |
| `requirements.txt` or `pyproject.toml` | `python` |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | `java` |
| `*.csproj` or `*.sln` | `dotnet` |
| (none of the above) | `unknown` |

## Affected Workflows (project-type-sensitive)

These workflows contain hardcoded Node.js/npm commands and are now adapted:

- `squad-ci.yml`
- `squad-release.yml`
- `squad-preview.yml`
- `squad-insider-release.yml`
- `squad-docs.yml`

These workflows use only GitHub API (no build commands) and are always copied verbatim:

- `squad-heartbeat.yml`, `squad-main-guard.yml`, `squad-triage.yml`, `squad-issue-assign.yml`, `sync-squad-labels.yml`, `squad-label-enforce.yml`

## Behavior

- **npm projects**: All workflows copied verbatim (existing behavior unchanged).
- **Non-npm known types**: Project-type-sensitive workflows get a stub with `# TODO: Add your {type} build/test commands here` and example commands for all supported types.
- **Unknown type**: Stub with `# TODO: Project type was not detected — add your build/test commands here`.

## Implementation

Three functions added to `index.js`:
- `detectProjectType(dir)` — first-match file scan
- `generateProjectWorkflowStub(workflowFile, projectType)` — returns YAML string per workflow + type
- `writeWorkflowFile(file, srcPath, destPath, projectType)` — dispatches to copy or stub

All three workflow copy paths updated: init, upgrade, and upgrade-already-current paths.

## Constraint Respected

Stub-with-comment is the correct strategy. No attempt to generate perfect workflows for every language — the stub is honest about what needs to be done.

## Test Impact

Two tests in `test/workflows.test.js` updated to add `package.json` to temp dirs before init, preserving the "npm verbatim copy" semantic. All 72 tests pass.
