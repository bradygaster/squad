# Init Command Implementation — PRD 16

**Decision Date:** 2026-02-22  
**Decided By:** Fenster (Core Developer)  
**Context:** Issue #165 — Implement the full init command for squad-sdk CLI

## Decision

Port the beta CLI init logic (index.js, lines 1098-1662) to TypeScript with zero dependencies, async/await, and Windows compatibility.

## Implementation

**New Modules Created:**

1. **src/cli/core/init.ts** — Main init command handler (~350 lines)
   - Template copying from templates/ directory using TEMPLATE_MANIFEST
   - squad.agent.md installation to .github/agents/ with version stamping
   - Directory structure creation (decisions/inbox/, casting/, agents/, skills/, plugins/, identity/)
   - Project type detection (npm/go/python/java/dotnet/unknown)
   - Workflow generation (project-type-aware stubs for non-npm)
   - Starter skills copying
   - Identity file creation (now.md, wisdom.md)
   - MCP sample config generation
   - .gitattributes merge=union rules
   - .gitignore log exclusions
   - Idempotent (skips existing files, never overwrites user state)
   - Deprecation warning for .ai-team/ directories

2. **src/cli/core/project-type.ts** — Project type detection (~25 lines)
   - Detects npm, go, python, java, dotnet, or unknown
   - Checks for marker files (package.json, go.mod, requirements.txt, pom.xml, *.csproj, etc.)

3. **src/cli/core/version.ts** — Version utilities (~50 lines)
   - getPackageVersion() — reads version from package.json
   - stampVersion() — replaces {version} placeholders in squad.agent.md
   - readInstalledVersion() — reads version from HTML comment in agent file

4. **src/cli/core/workflows.ts** — Workflow generation (~190 lines)
   - generateProjectWorkflowStub() — creates project-type-aware workflow stubs
   - Generates stubs for squad-ci.yml, squad-release.yml, squad-preview.yml, squad-insider-release.yml, squad-docs.yml
   - Non-npm projects get TODO placeholders with build command hints

**CLI Integration:**
- Wired runInit() into src/index.ts (replaces "not yet implemented" stub)
- Default command (no args) calls init
- Updated barrel exports in src/cli/index.ts

**Key Design Choices:**

1. **Zero Dependencies:** Uses only Node.js stdlib (fs, path, url) — no external packages
2. **Async/Await:** All file operations use fs.promises (not sync variants)
3. **Windows Compatible:** All paths use path.join(), no hardcoded separators
4. **Template Resolution:** Uses import.meta.url to resolve package-relative paths
5. **Idempotent:** Running init twice never destroys user state (skips existing files)
6. **Legacy Support:** Detects both .squad/ and .ai-team/ with deprecation warning

## Verification

- Build: ✅ `npm run build` — compiles successfully
- Tests: ✅ 1,551 tests pass (3 pre-existing copilot-install failures unrelated to init)
- PR: #175 opened on bradygaster/squad-pr

## Rationale

This is the core command that users run first. It must be rock-solid, zero-dep, and never break existing state. The implementation matches beta CLI quality but modernizes it with TypeScript strict mode, ESM, and proper async handling.

The project-type detection and workflow generation ensure Squad works correctly for non-npm projects (Go, Python, .NET, Java) without requiring manual workflow edits.

## Files Changed

- src/cli/core/init.ts (new)
- src/cli/core/project-type.ts (new)
- src/cli/core/version.ts (new)
- src/cli/core/workflows.ts (new)
- src/index.ts (modified — wired init)
- src/cli/index.ts (modified — barrel exports)
