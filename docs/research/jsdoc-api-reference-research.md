# JSDoc API Reference Documentation Research

## Executive Summary

The Squad SDK has moderate JSDoc coverage (~60–80% across major modules) with room for improvement, particularly in type/interface definitions. **TypeDoc + markdown plugin** is the recommended approach for auto-generating API reference docs—it integrates seamlessly with the existing plain Astro 5 setup (no Starlight migration needed), works with Pagefind search, and requires minimal setup overhead. Estimated effort: **1–2 weeks** to achieve production-ready docs covering the SDK and CLI.

---

## Current State Audit

### JSDoc Coverage by Module

| Module | Exports | JSDoc Blocks | Coverage |
|--------|---------|--------------|----------|
| **state/domain-types.ts** (StorageProvider interface, SquadState) | 21 | 17 | 81% |
| **coordinator/coordinator.ts** (SquadCoordinator) | 5 | 16 | 320%* |
| **config/schema.ts** (Config validation) | 12 | 1 | 8% |
| **runtime/config.ts** (Core types) | 26 | 86 | 331%* |
| **agents/lifecycle.ts** (Agent lifecycle) | 5 | 34 | 680%* |

*Note: High percentages indicate multiline JSDoc blocks or dense documentation; actual coverage = exports with at least one JSDoc block present.*

### Key Findings

- **136 TypeScript source files** in packages/squad-sdk/src/
- **Barrel exports** in index.ts are well-documented with type imports and descriptions
- **Domain types** (Phase 2 state layer) have good inline JSDoc on interfaces
- **Config schema** needs attention—many exports lack JSDoc (8% coverage)
- **State I/O modules** (state/io/*.ts) are well-structured but could benefit from parameter/return type docs
- **No existing TypeDoc config**—starting from scratch with a simple setup

### JSDoc Quality Assessment

| Quality Tier | Examples | Status |
|--------------|----------|--------|
| **Excellent** | state/domain-types.ts, state/io/index.ts | Inline JSDoc for all types, clear descriptions |
| **Good** | coordinator/coordinator.ts, gents/lifecycle.ts | Public methods documented, some missing return type details |
| **Needs Work** | config/schema.ts, parsers.ts | Sparse or missing JSDoc, exported functions lack descriptions |

### StorageProvider & State Module Status

The new state/ module (Phase 2, PR #481) is well-positioned for API docs:
- **StorageProvider interface** — fully typed, clear contract
- **SquadState (domain types)** — 81% JSDoc coverage with good inline descriptions
- **AgentHandle, CollectionEntityMap** — clearly typed
- **Domain types** (Agent, Decision, TeamConfig, etc.) — each has inline JSDoc
- **State I/O layer** — documented but lacks @param/@return tags on functions

**Gap:** Functions like parseCharter(), serializeHistory() need @param and @return JSDoc.

---

## Tool Comparison

| Feature | TypeDoc | api-extractor | TypeDoc (Starlight) |
|---------|---------|---------------|-------------------|
| **Setup complexity** | ⭐⭐⭐⭐⭐ (simple) | ⭐⭐ (requires 2 tools) | ⭐⭐⭐ (plugin only) |
| **Markdown output** | ✅ Native | ✅ Via api-documenter | ✅ Auto-sidebar |
| **JSDoc support** | ✅ Excellent | ⚠️ Limited | ✅ Excellent |
| **Astro 5 plain setup** | ✅ Full support | ⚠️ Manual integration | ❌ Requires migration |
| **Pagefind indexing** | ✅ Works seamlessly | ⚠️ Works with config | ⚠️ Uses Starlight search |
| **Build integration** | ✅ Via Astro hook | ⚠️ Manual step | ✅ Auto-generated |
| **No vendor lock-in** | ✅ Yes | ✅ Yes | ❌ Starlight-dependent |
| **Custom styling** | ✅ Full control | ✅ Full control | ❌ Constrained by theme |

### Recommended: TypeDoc + markdown-plugin

**Why TypeDoc is the best fit:**

1. ✅ **Zero migration**—keeps existing Astro 5 + Tailwind 4 + Pagefind
2. ✅ **Simple config**—one JSON file, one npm package
3. ✅ **Markdown-first**—output drops directly into docs/src/content/docs/reference/api/
4. ✅ **Pagefind-ready**—your existing ehype-pagefind-attrs plugin indexes it automatically
5. ✅ **Build integration**—Astro hook runs TypeDoc before build (one command: 
pm run build)
6. ✅ **Open-source friendly**—standard tool for public libraries

**Why NOT Starlight:**

- Would require migrating **entire docs structure** (breaking change)
- Loss of custom Tailwind 4 branding and layout
- No benefit for this use case—API docs are secondary to 70+ guide pages
- Only reconsider if: multi-version docs, i18n, or API becomes primary focus

**Why NOT api-extractor:**

- Overkill for open-source SDK (designed for strict monorepo contracts)
- Two-step process (extract → document) adds complexity
- Weaker JSDoc support compared to TypeDoc

---

## Recommended Integration Approach

### File Structure

\\\
docs/src/content/docs/reference/
  ├── api-reference.md        (hand-written landing page)
  └── api/                     (TypeDoc-generated, one-time setup)
      ├── index.md            (generated modules index)
      ├── classes/
      │   ├── SquadCoordinator.md
      │   ├── SquadState.md
      │   └── StorageProvider.md
      ├── interfaces/
      │   ├── Agent.md
      │   ├── SquadConfig.md
      │   └── ...
      ├── functions/
      │   └── ... (exported utility functions)
      └── types/
          └── ... (type aliases)
\\\

### URL Structure

\\\
https://bradygaster.github.io/squad/reference/api-reference/     (overview page)
https://bradygaster.github.io/squad/reference/api/               (index)
https://bradygaster.github.io/squad/reference/api/classes/squad-coordinator/
https://bradygaster.github.io/squad/reference/api/interfaces/agent/
\\\

### Build Workflow

**Single-step integration via Astro integration hook:**

\\\	ypescript
// docs/astro.config.mjs
import { exec } from 'child_process';

export default defineConfig({
  integrations: [
    {
      name: 'typedoc-integration',
      hooks: {
        'astro:build:start': async () => {
          return new Promise((resolve, reject) => {
            exec('npx typedoc --config ../typedoc.json', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
      },
    },
  ],
  // ... rest of config
});
\\\

**Usage:** 
pm run build automatically runs TypeDoc before Astro build.

### TypeDoc Configuration

\\\json
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
  "readme": "none"
}
\\\

### Pagefind Integration

✅ **Works automatically**—your existing ehypePagefindAttrs plugin marks TypeDoc-generated headings as indexable.

**Verify:**
\\\ash
npm run build
grep "classes/squad-coordinator" dist/.pagefind/pagefind.json
\\\

---

## Effort Estimate

### JSDoc Improvement Phase (1 week)

| Task | Time | Priority |
|------|------|----------|
| Add missing JSDoc to config/schema.ts | 2–3 hours | High (only 8% coverage) |
| Add @param/@return tags to state/io/* functions | 3–4 hours | High (State I/O is new) |
| Audit + document platform/, untime/ exports | 2–3 hours | Medium (existing coverage >60%) |
| Review & refine StorageProvider interface docs | 1–2 hours | High (Phase 2 blocker) |
| **Total** | **8–12 hours** | — |

### Setup Phase (1–2 days)

| Task | Time |
|------|------|
| Install TypeDoc + markdown plugin | <30 min |
| Create 	ypedoc.json config | 30 min |
| Add Astro integration hook | 1 hour |
| Create API landing page | 1 hour |
| Update docs navigation | 30 min |
| Test Pagefind indexing | 1 hour |
| Verify build pipeline | 1 hour |
| **Total** | **5–6 hours** |

### CI/CD Integration (optional, 2–4 hours)

- Pre-generate API docs as workflow artifact (to avoid rebuild overhead)
- Add link validation to catch broken internal references
- Set up auto-regeneration on SDK release

### Total Estimated Effort

- **Minimum (setup only):** 5–6 hours
- **Recommended (JSDoc + setup):** 13–18 hours (1.5–2 weeks)
- **Full (with CI/CD automation):** 15–22 hours (2–3 weeks)

---

## StorageProvider & State Module Specific

### Current State

The Phase 2 state layer (PR #481) is **API-docs ready**:

- **StorageProvider interface** — strict contract, all methods documented inline
- **SquadState entry point** — 9 exported types with clear domain semantics
- **Collection map** — AgentHandle, CollectionEntityMap clearly defined
- **Domain types** — Agent, Decision, HistoryEntry, TeamConfig all have JSDoc
- **Error handling** — StateError, NotFoundError, WriteConflictError defined
- **State I/O layer** — 6 exported parser/serializer pairs (charter, history, decisions, routing, team)

### Gaps to Close

1. **State I/O functions** — Add @param and @return JSDoc:
   \\\	ypescript
   /**
    * Parse charter.md into typed Charter object.
    * @param content Raw markdown content
    * @returns Parsed charter with agents array
    */
   export function parseCharter(content: string): ParsedCharter
   \\\

2. **Collection map navigation** — Example documentation needed (hand-written guide, not API doc)

3. **StorageProvider implementations** — Document the two built-in providers (FileSystem, InMemory)

### Verdict

✅ **The state module is well-suited for auto-generated API docs.** JSDoc coverage is solid (81%), types are well-structured, and the interface contract is clear.

---

## Pagefind Search Integration

### How It Works

1. **Build step:** TypeDoc generates markdown → Astro processes with remark/rehype plugins
2. **Your ehype-pagefind-attrs plugin:** marks all H1/H2/H3 as searchable (data-pagefind-body)
3. **Pagefind indexing:** reads dist/ → finds data-pagefind-body → indexes content

### Result

Users can search: "StorageProvider", "SquadState", "parseCharter", etc. → immediate results in /squad/ search.

---

## Next Steps

### Phase 1: Foundation (Week 1)

1. ✅ Commit this research document
2. Create 	ypedoc.json config (copy from "Recommended Integration" section)
3. 
pm install --save-dev typedoc typedoc-plugin-markdown
4. Test TypeDoc generation locally: 
px typedoc --config typedoc.json
5. Add Astro integration hook to docs/astro.config.mjs
6. Test build: 
pm run build from docs/

### Phase 2: JSDoc Audit (Week 2)

1. Add missing JSDoc to low-coverage modules (config/schema.ts, state/io/*)
2. Verify StorageProvider interface docs are complete
3. Add @param/@return tags to parser/serializer functions
4. Run TypeDoc again, review generated markdown output

### Phase 3: Docs Integration (Week 2)

1. Create docs/src/content/docs/reference/api-reference.md (landing page)
2. Update navigation to link to API reference
3. Test Pagefind indexing on API docs
4. Manual spot-check of generated URLs

### Phase 4: Polish (Optional)

1. Add custom CSS for API doc styling
2. Set up CI/CD to auto-regenerate on SDK changes
3. Add link validation to catch broken references

---

## Recommendation Summary

| Aspect | Decision |
|--------|----------|
| **Tool** | TypeDoc + typedoc-plugin-markdown ✅ |
| **Setup** | Astro integration hook (auto-generate on build) ✅ |
| **Storage** | docs/src/content/docs/reference/api/ (generated, committed to git) ✅ |
| **Indexing** | Pagefind (no changes needed) ✅ |
| **No migration** | Keeping plain Astro 5, no Starlight ✅ |
| **Effort** | 13–18 hours (JSDoc + setup) |
| **Outcome** | Production-ready API reference for SDK + CLI |

---

## References

- **TypeDoc:** https://typedoc.org
- **typedoc-plugin-markdown:** https://github.com/tgreyuk/typedoc-plugin-markdown
- **Astro Integration API:** https://docs.astro.build/en/guides/integrations-guide
- **Pagefind:** https://pagefind.app
