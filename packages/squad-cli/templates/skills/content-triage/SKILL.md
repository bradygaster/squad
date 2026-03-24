---
name: "content-triage"
description: "Boundary heuristic for external content adoption — Squad docs vs IRL tracking"
domain: "documentation, content-strategy, scope-analysis"
confidence: "high"
source: "earned (PR #331 — Tamir Dresher blog analysis)"
---

## Context

Squad grows through community adoption — blog posts, sample repos, conference talks, videos. When someone identifies external content that helps Squad adoption, the team must **triage** that content to determine:

1. **What belongs in Squad's public docs?** (generalizable patterns, feature guides, configuration options)
2. **What belongs in the IRL tracking repo?** (external references, infrastructure patterns, operational content)
3. **What is out of scope?** (infrastructure around Squad, not Squad itself)

This skill codifies the boundary heuristic from PR #331 and defines a repeatable workflow for content triage.

## Patterns

### Boundary Heuristic: "Squad Ships It"

**Litmus test:** If Squad doesn't ship the code/configuration, it's IRL content.

| Content Type | Squad Docs? | IRL Tracking? | Rationale |
|--------------|-------------|---------------|-----------|
| Squad CLI commands | ✅ Yes | No | Squad ships the CLI |
| Squad config options (`.squad/` files) | ✅ Yes | No | Squad defines the schema |
| User behavior within Squad features | ✅ Yes | No | Documents Squad's API surface |
| GitHub features configured *for* Squad | ⚠️ Reframe | Reference | Clarify it's GitHub, not Squad (e.g., "GitHub issue templates work with Squad labels") |
| Infrastructure *around* Squad | ❌ No | ✅ Yes | Squad doesn't own CI/CD, deployment, monitoring setup |
| Operational patterns *using* Squad | ❌ No | ✅ Yes | Squad doesn't ship the ops model |
| External samples/examples | ❌ No | ✅ Yes | Reference, not ownership |
| Blog posts, talks, videos | ❌ No | ✅ Yes | External authorship, not Squad's docs responsibility |

### Triage Workflow

**Trigger:** Issue labeled `content-triage` or issue body references external content (blog post, sample repo, video, talk).

**Steps:**

1. **Ralph detects the trigger** (label or content reference)
2. **Ralph routes to Flight** for boundary analysis
3. **Flight triages the content:**
   - Read the external content (blog post, repo README, talk outline)
   - Apply the "Squad Ships It" litmus test to each concept/pattern/feature
   - Categorize each piece as:
     - **Squad docs** — generalizable pattern, Squad owns the code/config
     - **IRL tracking** — external reference, infrastructure pattern, operational content
     - **Out of scope** — not Squad-related
4. **Flight produces triage output** (see format below)
5. **PAO creates sub-issues** for Squad doc extraction
6. **FIDO verifies** docs-test sync when PAO opens PR
7. **Scribe records** IRL references in tracking repo

### Triage Output Format

Flight writes the triage analysis to:
```
.squad/decisions/inbox/flight-content-triage-{source-slug}.md
```

**Template:**

```markdown
# Content Triage: {Source Name}

**Source:** {URL or reference}  
**Type:** {blog post | sample repo | video | conference talk}  
**Author:** {name}  
**Date:** {YYYY-MM-DD}  

---

## Boundary Analysis

### ✅ Squad Docs (Extractable Patterns)

{List of concepts/patterns that belong in Squad's public docs}

**Rationale:** {Why these belong in Squad's docs — apply "Squad Ships It" test}

**Proposed doc pages:**
- `docs/{section}/{page}.md` — {brief description}
- `docs/{section}/{page}.md` — {brief description}

**Assigned to:** PAO (doc extraction)

---

### 📚 IRL Tracking (External Reference)

{List of concepts/patterns that are external infrastructure/operational content}

**Rationale:** {Why these are IRL content — apply "Squad Ships It" test}

**Tracking entry:**
```yaml
# .github/irl/references.yml
- title: "{Source Name}"
  url: "{URL}"
  type: "{blog | sample | video | talk}"
  author: "{name}"
  date: "{YYYY-MM-DD}"
  topics:
    - "{topic1}"
    - "{topic2}"
  highlights:
    - "{key takeaway 1}"
    - "{key takeaway 2}"
```

**Assigned to:** Scribe (IRL tracking)

---

### ❌ Out of Scope

{List of content that is not Squad-related}

**Rationale:** {Why these are out of scope}

---

## Sub-Issues

- [ ] **PAO:** Extract Squad patterns → `docs/{section}/{page}.md`
- [ ] **FIDO:** Verify docs-test sync when PAO opens PR
- [ ] **Scribe:** Add IRL reference to tracking repo
```

### Label Convention

**Recommended labels:**
- `content-triage` — primary trigger (requires Flight analysis)
- `content:blog` — external blog post
- `content:sample` — external sample repo
- `content:video` — external video/screencast
- `content:talk` — conference talk or presentation

**Label workflow:**
1. User or Ralph applies `content-triage` label to issue
2. Ralph routes to Flight
3. Flight removes `content-triage`, applies specific type label (`content:blog`, etc.)
4. Flight adds `status:triaged` when analysis is complete

### IRL Tracking Repository

**Location:** `.github/irl/references.yml` (or separate repo if external)

**Schema:**

```yaml
- title: "Blog post title"
  url: "https://..."
  type: "blog | sample | video | talk"
  author: "Name"
  date: "YYYY-MM-DD"
  topics:
    - "feature-name"
    - "pattern-name"
  highlights:
    - "Key takeaway 1"
    - "Key takeaway 2"
  squad_docs:
    - "docs/guides/feature-name.md"  # Links to any docs extracted from this source
```

**Why YAML?** Machine-readable, supports aggregation/reporting, enables future IRL showcase generation.

### Ralph Integration

**Ralph's work-check cycle:**

1. Ralph monitors issue labels (including `content-triage`)
2. On detection, Ralph:
   - Reads the issue body for external content URL
   - Routes to Flight: "New content triage request: {URL} — please analyze boundary"
3. Flight performs triage, writes decision file
4. Ralph sees `status:triaged` label:
   - Creates sub-issues for PAO (doc extraction)
   - Notifies Scribe (IRL tracking)
   - Links sub-issues back to parent issue

## Examples

### Example 1: Tamir Dresher Blog Analysis (PR #331)

**Source:** Tamir's blog post on Squad adoption in production environment

**Triage:**

**✅ Squad Docs (Extracted):**
- Scenario-based guides (authentication squad, data migration squad)
- Issue template integration (how to configure GitHub issue templates for Squad labels)
- Reviewer protocol trust levels (documents user choice within Squad's review system)

**Rationale:** These document Squad's features (scenarios, config, behavior). Squad ships the review system and scenario patterns.

**📚 IRL Tracking:**
- Ralph operations guide (monitoring, auto-merge, quality gates)
- Proactive communication patterns (Slack notifications, daily summaries)

**Rationale:** These document infrastructure *around* Squad (CI/CD, monitoring, ops patterns). Squad doesn't ship the CI/CD or Slack bot — those are external integrations.

**❌ Out of Scope:** None (all content was either extracted or tracked)

**Result:**
- PAO extracted 3 doc pages (scenario-based-guides.md, issue-templates.md, reviewer-protocol.md)
- Flight removed 2 infrastructure guides (ralph-operations.md, proactive-communication.md)
- FIDO verified docs-test sync (no new tests needed — docs describe existing features)

### Example 2: Sample Repo with Custom Ops Patterns

**Source:** `example-corp/squad-deployment` (GitHub repo)

**Triage:**

**✅ Squad Docs:**
- `.squad/team.md` configuration examples (agent roles, routing rules)
- Decision file patterns (what decisions to document, format conventions)

**Rationale:** Squad ships the team.md schema and decision.md format. These are configuration guides.

**📚 IRL Tracking:**
- Terraform modules for Squad infrastructure (container orchestration, state persistence)
- Kubernetes deployment manifests
- Monitoring dashboards (Grafana config for Ralph health checks)

**Rationale:** Squad doesn't ship Terraform or K8s configs. These are operational patterns around Squad.

**❌ Out of Scope:**
- Internal company conventions unrelated to Squad (team naming, approval workflows)

**Result:**
- PAO: Create `docs/guides/team-configuration.md` (generalized patterns)
- Scribe: Add IRL reference with link to `example-corp/squad-deployment`
- No extraction of Terraform/K8s — link only

### Example 3: Conference Talk on Squad Patterns

**Source:** "Building AI Teams with Squad" — DevOps Summit 2026

**Triage:**

**✅ Squad Docs:**
- Agent specialization patterns (when to split roles, when to merge)
- Work routing strategies (label-based, domain-based, skill-based)

**Rationale:** Squad ships the routing system and agent framework. These are architectural patterns within Squad's API.

**📚 IRL Tracking:**
- Talk recording (YouTube link)
- Slide deck (Speaker Deck link)
- Case study: Company X's 10-agent team structure

**Rationale:** External authorship, specific case study. Reference, not ownership.

**❌ Out of Scope:**
- Generic DevOps practices not specific to Squad

**Result:**
- PAO: Enhance `docs/architecture/agent-specialization.md` with patterns from talk
- Scribe: Add IRL reference (video + slides + case study note)

## Anti-Patterns

- ❌ Documenting infrastructure *around* Squad in Squad's public docs (belongs in IRL)
- ❌ Copying external content verbatim without generalization (extract patterns, not implementations)
- ❌ Listing external repos in Squad's docs without consent (privacy violation per decisions.md)
- ❌ Skipping triage and directly adding content to docs (boundary analysis required)
- ❌ Treating IRL content as "less valuable" (it's just a different category — references are important)
- ❌ Creating doc pages for every blog post (extract generalizable patterns only)
- ❌ Ignoring external content because "we didn't write it" (community content accelerates adoption)
- ❌ PAO extracting content before Flight completes boundary analysis (wait for triage)
- ❌ Mixing Squad features and GitHub features without clarification (reframe to distinguish platform from product)
