# Plan: API Reference Sidebar Navigation

## Problem

The auto-generated TypeDoc API reference (395 pages) has no sidebar navigation. The sidebar shows a single "API Reference (TypeDoc)" link to the landing page. Users must navigate all 395 pages through the landing page's link lists — no category browsing from the sidebar.

## Current Architecture

- **Sidebar:** `docs/src/components/Sidebar.astro` renders `NAV_SECTIONS` from `navigation.ts`
- **Nav structure:** Flat sections → items. No nested/collapsible groups.
- **Generation script:** `scripts/generate-api-docs.mjs` already categorizes files into Classes, Interfaces, Functions, Type aliases, Variables (Step 4)
- **TypeDoc config:** `flattenOutputFiles: true` — all pages are flat in `reference/api/`
- **File naming:** `class-*.md`, `interface-*.md`, `function-*.md`, `typealias-*.md`, `variable-*.md`

## Approach: Auto-Generated Nav Fragment + Collapsible Sidebar

### Step 1: Generate nav data from the build script

Extend `generate-api-docs.mjs` to output a nav fragment file after categorization:

**Output:** `docs/src/api-nav-generated.json` (gitignored, built at CI/deploy time)

```json
{
  "categories": [
    {
      "title": "Classes",
      "items": [
        { "title": "CastingEngine", "slug": "reference/api/class-castingengine" },
        { "title": "RuntimeEventBus", "slug": "reference/api/class-runtimeeventbus" }
      ]
    },
    {
      "title": "Interfaces",
      "items": [
        { "title": "AgentCapability", "slug": "reference/api/interface-agentcapability" },
        { "title": "SquadConfig", "slug": "reference/api/interface-squadconfig" }
      ]
    },
    {
      "title": "Functions",
      "items": [
        { "title": "defineSquad", "slug": "reference/api/function-definesquad" },
        { "title": "loadConfig", "slug": "reference/api/function-loadconfig" }
      ]
    },
    {
      "title": "Type Aliases",
      "items": [...]
    },
    {
      "title": "Variables",
      "items": [...]
    }
  ]
}
```

### Step 2: Import generated nav into navigation.ts

```typescript
// navigation.ts
import apiNav from './api-nav-generated.json' assert { type: 'json' };

// In the Reference section, replace the single API Reference entry
// with a marker that Sidebar.astro expands into collapsible sub-groups
```

Alternatively, `navigation.ts` can export a separate `API_NAV_SECTIONS` that the sidebar renders differently from the main nav.

### Step 3: Add collapsible groups to Sidebar.astro

The current sidebar renders flat section → items. For API reference categories with 50-200+ items each, we need collapsible groups.

**Option A — Collapsible `<details>` elements:**
```html
<details>
  <summary>Classes (15)</summary>
  <ul><!-- class items --></ul>
</details>
```

**Option B — CSS-driven collapse with state:**
Use a toggle button per category. CSS `max-height` transition. Persist open/closed state in `localStorage`.

**Recommendation:** Option A (`<details>/<summary>`) — semantic HTML, no JS needed, accessible by default. Add a CSS transition for polish.

### Step 4: Handle the "Functions" problem

Functions is the largest category (~200+ items). Even collapsed, opening it would create a very long sidebar section. Options:

1. **Sub-categorize Functions** by module/namespace (if TypeDoc output contains module info)
2. **Show only the top N** with a "Show all →" link to the landing page
3. **Accept the long list** — `<details>` keeps it collapsed by default, user opens on purpose
4. **Add a search/filter** within the sidebar section

**Recommendation:** Start with option 3 (collapsed by default). If UX feedback says it's too much, add option 2 as a follow-up.

### Step 5: Gitignore the generated nav file

Add to `.gitignore`:
```
docs/src/api-nav-generated.json
```

### Step 6: Wire into build pipeline

`npm run docs:api` already runs the generation script. The nav fragment is produced as a side effect. The Astro build reads it at compile time. No separate build step needed.

## File Changes Summary

| File | Change |
|------|--------|
| `scripts/generate-api-docs.mjs` | Add Step 6: write `api-nav-generated.json` |
| `docs/src/navigation.ts` | Import generated nav, export for sidebar |
| `docs/src/components/Sidebar.astro` | Add collapsible group rendering for API categories |
| `.gitignore` | Add `docs/src/api-nav-generated.json` |
| `docs/tests/api-reference.spec.mjs` | Add test: sidebar shows category groups |

## Open Questions

1. Should categories default to collapsed or expanded? (Recommend: collapsed)
2. Should the "SDK Guide" link stay alongside the API categories in Reference? (Recommend: yes — it's the curated companion)
3. Should we add item counts to category headers? e.g., "Classes (15)" (Recommend: yes)
4. Does the Astro build fail gracefully if the generated JSON doesn't exist? (Need fallback for fresh clones before first `docs:api` run)
5. **CI/CD build order:** `npm run docs:api` must run **before** `npm run docs:build` in CI pipelines, since the Astro build reads the generated nav JSON and API markdown at compile time. If the generated `api-nav-generated.json` is missing (e.g., first clone, or `docs:api` was skipped), the sidebar should fall back to showing a single flat "API Reference" link pointing to `/reference/api/` instead of rendering category groups. The build must not fail on a missing nav fragment.
