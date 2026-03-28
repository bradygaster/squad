# JSDoc API Reference Documentation PRD

> Auto-generate discoverable, searchable API reference docs for Squad SDK and CLI using TypeDoc + Markdown.

## Problem Statement

The Squad SDK has a mature, well-typed TypeScript codebase, but **developers lack a canonical source for API documentation**. Today:

1. **No dedicated API reference** — Developers must dig through TypeScript source files or JSDoc comments in the IDE to understand the public API surface (SquadCoordinator, StorageProvider, SquadState, config types).

2. **Documentation debt** — JSDoc coverage is uneven (8%–81% across modules). Config schema, state I/O functions, and some core utilities lack @param/@return documentation, making the API harder to learn.

3. **Discoverability** — There's no searchable, linkable page for "what methods does StorageProvider expose?" or "how do I implement a custom AgentHandle?". External developers evaluating Squad can't quickly assess the SDK's public API surface.

4. **Integration docs lag** — StorageProvider (Phase 2 state layer, PR #481) has no user-facing documentation of the interface contract or implementation patterns.

5. **Search misses** — Pagefind indexes guide docs but not API symbols. Searching "SquadState" on the docs site returns zero results despite the type being central to Squad's architecture.

**Impact**: New SDK users experience friction during onboarding. Contributors struggle to understand which modules to extend. Evaluating Squad's API surface requires reading source code.

---

## Goals & Success Metrics

### Primary Goals

1. **Generate production-ready API reference docs** for Squad SDK (packages/squad-sdk/src/) covering all exported symbols (classes, interfaces, functions, type aliases).

2. **Achieve searchable API surface** — Every exported symbol indexed by Pagefind and discoverable via `/squad/` search.

3. **Improve JSDoc coverage** to 100% for all exported public APIs (StorageProvider, SquadState, SquadCoordinator, config types, state I/O functions).

4. **Enable self-service developer discovery** — External developers can answer "what's the API?" without filing issues or reading source.

### Success Metrics

- ✅ **100% JSDoc coverage** for all exported symbols across packages/squad-sdk/src/
- ✅ **API landing page** at /reference/api-reference/ with overview + navigation
- ✅ **Auto-generated API pages** for 50+ public types/classes/functions
- ✅ **Pagefind indexing** — search "StorageProvider" or "SquadCoordinator" and get instant results
- ✅ **Build integration** — `npm run build` auto-generates API docs (no extra step)
- ✅ **Zero broken internal links** in generated docs (validated by CI)
- ✅ **Mobile-friendly** API pages rendering correctly on docs site
- ✅ **Maintenance overhead < 2 hours/sprint** — JSDoc updates happen with code changes, not in separate passes

---

## Key User Scenarios

### Scenario 1: New SDK Consumer — "How do I use SquadState?"

> A developer building a custom agent using the SDK imports `SquadState` but doesn't know what methods are available or what properties the domain types expose.

**Today**: Opens TypeScript IDE, searches in node_modules, reads source comments.

**Future**: Visits /reference/api/classes/squad-state/, sees complete method signatures, usage examples, and links to guides like "Building Custom Agents".

### Scenario 2: Contributor — "What does StorageProvider require?"

> A contributor wants to implement a custom StorageProvider but needs to understand the interface contract—what methods are mandatory, what are the error semantics, what does SquadState expect?

**Today**: Reads PR #481, searches interface definition in state/domain-types.ts, cross-references implementation tests.

**Future**: Visits /reference/api/interfaces/storage-provider/, sees full interface documentation with method descriptions, error types, and links to FSStorageProvider implementation.

### Scenario 3: Agent Author — "What are AgentHandle methods?"

> An agent in .squad/agents/ needs to understand what operations it can perform on squad state (get an agent's decisions, read team config, etc.).

**Today**: Grep for AgentHandle, read method names from type definition, reverse-engineer from example agents.

**Future**: Visits /reference/api/interfaces/agent-handle/, sees method signatures with descriptions, returns types, and examples.

### Scenario 4: Evaluator — "What's Squad's API surface?"

> A technical leader deciding whether to adopt Squad wants to see the public API surface and assess stability/maturity.

**Today**: Reads README, glances at a few source files, asks on Discussions.

**Future**: Visits /reference/api/, sees organized module list, scans interfaces/classes, assesses API surface in 5 minutes.

---

## Scope

### In Scope ✅

- **TypeDoc configuration** (typedoc.json, Astro integration hook)
- **JSDoc improvements** for:
  - Config schema (config/schema.ts) — currently 8% coverage
  - State I/O functions (state/io/*.ts) — add @param/@return tags
  - StorageProvider interface (state/domain-types.ts) — review + enhance docs
  - Core types (runtime/config.ts, agents/lifecycle.ts) — spot-check and refine
- **Generated API markdown** output structure (classes/, interfaces/, functions/, types/ directories)
- **API landing page** (docs/src/content/docs/reference/api-reference.md) — conceptual overview + links to generated docs
- **Navigation integration** — add API reference to docs site navigation (navigation.ts)
- **Pagefind indexing** — verify API pages are searchable via existing plugin
- **Build pipeline integration** — Astro hook to auto-run TypeDoc on every build
- **Phase 1 foundation** — TypeDoc setup + proof-of-concept generation

### Out of Scope ❌

- **CLI reference generation** — may be future Phase 2 (separate TypeDoc config for packages/squad-cli/src/)
- **Code examples/tutorials** — those belong in guide/ and concept/ pages, not API reference
- **Starlight migration** — keeping plain Astro 5 setup
- **Custom CSS styling** for API pages — use existing Astro design system
- **Multi-version API docs** (v0.8 vs v0.9 side-by-side) — single current version only
- **CI/CD automation** (pre-generate as artifact, auto-regenerate on release) — Phase 2 optimization
- **TypeDoc plugin authoring** — use typedoc-plugin-markdown only

---

## Approach

### Architecture: TypeDoc in the Astro Build Pipeline

**Why TypeDoc:**
- ✅ Zero migration — Astro 5 + Tailwind 4 + Pagefind unchanged
- ✅ Simple setup — one JSON config, one npm package
- ✅ Markdown-first — output drops directly into docs/src/content/docs/reference/api/
- ✅ Pagefind-ready — existing ehype-pagefind-attrs plugin auto-indexes generated pages
- ✅ Open-source standard — industry-standard tool for TypeScript libraries
- ❌ NOT Starlight (would require full docs migration)
- ❌ NOT api-extractor (overkill for SDK, two-step process)

**Build Flow:**

```
npm run build (from docs/)
  ↓
Astro.build()
  ↓
astro:build:start hook → exec('npx typedoc --config ../typedoc.json')
  ↓
TypeDoc generates markdown → docs/src/content/docs/reference/api/
  ↓
Astro processes with remark/rehype plugins
  ↓
ehype-pagefind-attrs marks H1/H2/H3 as searchable
  ↓
Pagefind indexes dist/
  ↓
Final site includes searchable API pages
```

### Configuration: typedoc.json

Create `typedoc.json` at repository root:

```json
{
  "entryPoints": ["./packages/squad-sdk/src/index.ts"],
  "out": "./docs/src/content/docs/reference/api",
  "plugin": ["typedoc-plugin-markdown"],
  "pluginPages": {
    "output": "modules"
  },
  "markdown": {
    "outputFileStrategy": "modules",
    "anchorPrefix": "api"
  },
  "excludePrivate": true,
  "excludeInternal": true,
  "excludeExternals": true,
  "tsconfig": "./packages/squad-sdk/tsconfig.json",
  "gitRevision": "main",
  "readme": "none",
  "hideGenerator": false,
  "sourceLinkExternal": true
}
```

**Key settings:**
- `entryPoints` — packages/squad-sdk/src/index.ts (barrel exports all public API)
- `out` — generates into docs/src/content/docs/reference/api/
- `pluginPages` — uses typedoc-plugin-markdown for markdown output
- `excludePrivate`, `excludeInternal` — hide implementation details
- `markdown.outputFileStrategy: "modules"` — one file per symbol for clean URLs
- `anchorPrefix` — ensures anchors use "api-" prefix to avoid conflicts

### Output Structure: File Organization

```
docs/src/content/docs/reference/
├── api-reference.md          (hand-written landing page, NOT generated)
└── api/                      (TypeDoc-generated output)
    ├── index.md              (modules overview)
    ├── classes/
    │   ├── squad-coordinator.md
    │   ├── squad-state.md
    │   └── storage-provider-base.md
    ├── interfaces/
    │   ├── agent.md
    │   ├── agent-handle.md
    │   ├── squad-config.md
    │   ├── storage-provider.md
    │   ├── squad-state.md
    │   └── ... (50+ more types)
    ├── functions/
    │   ├── parse-charter.md
    │   ├── serialize-charter.md
    │   └── ... (state I/O functions)
    └── types/
        ├── agent-handle.md
        ├── decision.md
        └── ... (type aliases)
```

### URL Structure: Developer-Friendly Paths

```
/reference/api-reference/               (overview landing page)
/reference/api/                         (index of all modules)
/reference/api/classes/squad-coordinator/
/reference/api/classes/squad-state/
/reference/api/interfaces/agent/
/reference/api/interfaces/storage-provider/
/reference/api/functions/parse-charter/
/reference/api/types/decision/
```

### Build Integration: Astro Hook + npm Script

Add integration to `docs/astro.config.mjs`:

```javascript
import { defineConfig } from 'astro/config';
import { execSync } from 'child_process';
import tailwind from '@astrojs/tailwind';
import pageFind from 'astro-pagefind';

export default defineConfig({
  integrations: [
    {
      name: 'typedoc-integration',
      hooks: {
        'astro:build:start': async () => {
          console.log('Generating TypeDoc API reference...');
          try {
            execSync('npx typedoc --config ../typedoc.json', { stdio: 'inherit' });
            console.log('✅ TypeDoc generation complete');
          } catch (error) {
            console.error('❌ TypeDoc generation failed:', error.message);
            throw error;
          }
        },
      },
    },
    tailwind(),
    pageFind(),
  ],
});
```

**Usage:**

```bash
cd docs/
npm run build
# Output includes:
# - TypeDoc API reference at docs/src/content/docs/reference/api/
# - Astro processes markdown
# - Pagefind indexes all content
# - Final site with searchable API pages
```

### JSDoc Improvement Plan: Priority Order

Estimated effort: **8–12 hours** across 1–2 sprints.

#### Priority 1: High-Impact Gaps (6–8 hours)

| Module | Issue | Action | Time |
|--------|-------|--------|------|
| `config/schema.ts` | 8% JSDoc coverage | Add @param/@return tags to all 12 exported functions | 2–3 hrs |
| `state/io/*.ts` | No @param/@return tags on parser/serializer functions | Add to parseCharter, serializeCharter, parseHistory, serializeHistory, parseDecisions, serializeDecisions, parseTeamConfig, serializeTeamConfig, parseRouting, serializeRouting | 3–4 hrs |
| `state/domain-types.ts` | StorageProvider interface — review completeness | Audit docs, add missing @param descriptions to interface methods | 1–2 hrs |

#### Priority 2: Coverage Audit (2–4 hours)

| Module | Status | Action |
|--------|--------|--------|
| `runtime/config.ts` | Good (331% blocks) | Spot-check for clarity, refine descriptions |
| `coordinator/coordinator.ts` | Good (320% blocks) | Ensure return types have clear descriptions |
| `agents/lifecycle.ts` | Good (680% blocks) | Verify example code is up-to-date |
| `platform/*.ts`, `runtime/*.ts` | 60%+ coverage | Light audit for missing @param tags |

#### Checklist

- [ ] Add @param/@return tags to config/schema.ts exports
- [ ] Document state/io/ parser/serializer functions (@param content, @returns ParsedCharter)
- [ ] Review StorageProvider interface docs (interface methods, error types, examples)
- [ ] Audit runtime/ and platform/ for missing @param tags
- [ ] Run TypeDoc locally: `npx typedoc --config typedoc.json`
- [ ] Review generated markdown for accuracy
- [ ] Spot-check 5–10 generated pages in browser

---

## Implementation Phases

### Phase 0: TypeDoc Setup & Proof of Concept (Days 1–2)

**Goal**: Validate that TypeDoc generates working markdown and integrates with Astro build.

**Tasks:**
- [ ] Install TypeDoc + typedoc-plugin-markdown: `npm install --save-dev typedoc typedoc-plugin-markdown`
- [ ] Create typedoc.json at repository root (copy from "Configuration" section)
- [ ] Run TypeDoc locally: `npx typedoc --config typedoc.json`
- [ ] Verify generated markdown in docs/src/content/docs/reference/api/
- [ ] Add Astro integration hook to docs/astro.config.mjs
- [ ] Test full Astro build: `npm run build` from docs/
- [ ] Verify API pages render on docs site
- [ ] Spot-check 3–5 generated pages (SquadCoordinator, StorageProvider, AgentHandle)

**Definition of Done:**
- TypeDoc generates without errors
- Generated markdown is valid and renders on docs site
- At least 50 public symbols documented in generated files
- Astro build completes in <2 min including TypeDoc step

### Phase 1: JSDoc Coverage Improvement (Sprint 1, 5–6 hours)

**Goal**: Achieve 100% JSDoc coverage for all exported public APIs.

**Tasks:**
- [ ] Audit config/schema.ts — add @param/@return tags to all 12 exports
- [ ] Audit state/io/*.ts — add @param/@return tags to parser/serializer functions
- [ ] Review StorageProvider interface — enhance JSDoc clarity
- [ ] Light spot-check of runtime/config.ts, coordinator/coordinator.ts
- [ ] Regenerate TypeDoc: `npx typedoc --config typedoc.json`
- [ ] Review generated markdown for new/improved documentation

**Success Criteria:**
- [ ] No exported symbols lack @param/@return JSDoc
- [ ] StorageProvider interface has complete documentation
- [ ] config/schema.ts JSDoc coverage improves from 8% → 100%
- [ ] state/io/ functions have clear parameter/return descriptions

### Phase 2: Astro Integration & Navigation (Sprint 1–2, 3–4 hours)

**Goal**: Surface API reference in docs navigation, ensure discoverability.

**Tasks:**
- [ ] Create docs/src/content/docs/reference/api-reference.md — hand-written landing page with:
  - Problem statement: "Why you need API docs"
  - Quick nav to key symbols (SquadCoordinator, StorageProvider, SquadConfig)
  - Links to related guides (Building Custom Agents, Implementing StorageProvider)
- [ ] Add "API Reference" entry to docs/src/navigation.ts pointing to /reference/api-reference/
- [ ] Add breadcrumb links from guides → API reference (where relevant)
- [ ] Test build: `npm run build` from docs/
- [ ] Verify Pagefind indexes API pages: grep "classes/squad-coordinator" dist/.pagefind/pagefind.json
- [ ] Manual spot-check: search "StorageProvider" on docs site, verify results

**Success Criteria:**
- [ ] /reference/api-reference/ page exists and renders
- [ ] Navigation includes "API Reference" entry
- [ ] Pagefind indexes 50+ API symbols
- [ ] Search returns instant results for "SquadCoordinator", "StorageProvider", etc.

### Phase 3: CI/CD & Maintenance Automation (Phase 2, Optional, 2–4 hours)

**Goal**: Prevent API docs from going stale, catch broken links.

**Tasks:**
- [ ] Add CI/CD check to validate API docs regenerate correctly on every commit
- [ ] Set up pre-generation of API docs as CI artifact (avoid rebuild overhead)
- [ ] Add link validator to catch broken internal references in generated docs
- [ ] Document JSDoc style guide for contributors (comment every @export symbol)

**Success Criteria:**
- [ ] CI workflow validates TypeDoc generation
- [ ] Link validation catches broken references
- [ ] Contributor docs clarify JSDoc requirements for new exports

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| TypeDoc breaks on SDK changes | Builds fail silently | Add CI gate: TypeDoc must generate without errors before docs build |
| Generated markdown becomes stale | API docs lag behind code | JSDoc coverage requirement: 100% for all exports, enforced in code review |
| Link validation too strict | Builds blocked on minor issues | Start with warnings only (CI info-only), escalate to errors in Phase 2 |
| Pagefind indexing misses API pages | Search doesn't find API symbols | Manually verify indexing after each build (check dist/.pagefind/pagefind.json) |
| TypeDoc config needs updates for new SDK features | Config maintenance overhead | Document config in CONTRIBUTING.md, update as SDK evolves |
| Large number of generated files slows build | Build time regression | Monitor build performance; if >3 min, consider pre-generation as artifact |
| Breaking changes to public API break existing docs | Outdated links | Future: implement link redirects or version docs (Phase 2+) |

---

## Architecture Review Section

**For CONTROL (TypeScript/Architecture Authority):**

Please review and approve:

1. **TypeScript Export Strategy** — Are all public symbols correctly exported via packages/squad-sdk/src/index.ts (barrel file)?
   - Should StorageProvider implementations be exported separately or only documented as examples?
   - Should internal utilities be marked `/** @internal */` in JSDoc?

2. **TypeDoc Configuration** — Is the config appropriate for Squad's SDK surface?
   - Are excludePrivate/excludeInternal settings correct?
   - Should we document types vs interfaces differently?

3. **JSDoc Standards** — Should we establish guidelines for contributors?
   - Suggested template: `/** Description. @param name Type description. @returns Type description. */`
   - Should we enforce @example blocks for complex APIs (StorageProvider, SquadState)?

4. **Stability Commitment** — Are all exported symbols stable, or should some be marked `@beta`/`@alpha`?
   - StorageProvider (Phase 2) — ready for stable?
   - SquadState collection map navigation — stable?
   - Config schema validation — stable?

---

## Success Criteria Checklist

- [ ] TypeDoc setup complete, auto-runs on `npm run build`
- [ ] 100% JSDoc coverage for packages/squad-sdk/src/ exports
- [ ] 50+ public symbols auto-documented in generated markdown
- [ ] API landing page created at /reference/api-reference/
- [ ] Navigation updated with "API Reference" entry
- [ ] Pagefind indexes all API pages — search returns results for key symbols
- [ ] All internal links in generated docs are valid (manual spot-check)
- [ ] Mobile rendering looks good on docs site
- [ ] Build time increase <1 min (TypeDoc generation overhead)
- [ ] Zero broken links in generated markdown
- [ ] Documentation matches code (automated via JSDoc → generated docs)

---

## Timeline & Effort Summary

| Phase | Duration | FTE | Notes |
|-------|----------|-----|-------|
| **Phase 0: Setup + PoC** | 1–2 days | 1 | Validate TypeDoc generation + Astro integration |
| **Phase 1: JSDoc Improvement** | 1 sprint (5–6 hrs) | 0.25–0.5 | Focus on high-impact gaps (config/, state/io/) |
| **Phase 2: Integration + Navigation** | 1 sprint (3–4 hrs) | 0.25–0.5 | Create landing page, update nav, verify Pagefind |
| **Phase 3: CI/CD (Optional)** | 2–4 hrs | — | Phase 2: Link validation, artifact pre-gen |
| **Total (Phases 0–2)** | **2–3 weeks** | **0.5 FTE** | Production-ready API reference |

---

## References

- **Research Document**: docs/research/jsdoc-api-reference-research.md (findings, tool comparison, effort estimates)
- **TypeDoc**: https://typedoc.org/
- **typedoc-plugin-markdown**: https://github.com/tgreyuk/typedoc-plugin-markdown
- **Astro Integration API**: https://docs.astro.build/en/guides/integrations-guide/
- **Pagefind**: https://pagefind.app/
- **Related PR**: #481 (StorageProvider interface, Phase 2 state layer)
