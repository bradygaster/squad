# Project Context

- **Owner:** bradygaster
- **Project:** Squad — multi-agent orchestration for GitHub Copilot CLI. One command gives developers a persistent AI team with memory, personality, and parallel execution.
- **Stack:** Node.js, GitHub Copilot CLI, zero dependencies
- **Created:** 2026-02-07
- **Design context:** Squad's brand universe is The Usual Suspects — dry, understated, pressure-oriented. The product is CLI-first but renders in GitHub markdown, VS Code, and web contexts. Tone governance: no AI-flowery language, dry humor, growth-attitude, kindness first.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **Brand register is "quiet confidence."** Squad's tone governance (The Usual Suspects, dry, understated) demands a visual identity that conveys competence without flash. No gradients, no mascots, no startup energy. The logo should feel like a tool stamp, not a poster.
- **Existing color precedent: Indigo.** The README's Mermaid diagrams already use `#6366F1` (Indigo 500) for the coordinator and `#3b82f6` (Blue 500) for agents. The brand palette must harmonize with these — not replace them.
- **Rendering constraints are severe.** The logo must work at 16px (favicon), in monochrome (terminal), in circle crop (GitHub avatar), in dark AND light mode, and in markdown. Any concept that depends on color, gradient, or fine detail fails these constraints.
- **Typography: Inter + JetBrains Mono.** Two typefaces cover every context. Inter for brand/UI, JetBrains Mono for code/CLI. Both open source, both widely installed in the target audience's environment.
- **Recommended concept: "The Glyph" — diamond outline with inner solid diamond.** Chosen for constraint performance: single-color, scalable, monochrome-native, distinctive at every size. SVG at `docs/assets/squad-logo-proposal.svg`.
- **Key files:** Proposal at `docs/proposals/022-squad-visual-identity.md`. SVG at `docs/assets/squad-logo-proposal.svg`. Brand palette defined in the proposal (Section 4).
- **SVG rebuild (first version had wrong geometry).** The original SVG used arbitrary coordinates that didn't match Proposal 022's specification. Problems: (1) outer square was 100×100 units instead of side=42.426 (for 60×60 AABB), (2) stroke width was 5 instead of 3, (3) inner diamond was 30×30 instead of side=12.728 (for 18×18 AABB / 30% of outer), (4) corner radius was a round `6` instead of 6% of side length (2.55), (5) inner diamond was not mathematically positioned — it floated in roughly the right area but wasn't tangent to the outer edges, (6) wordmark was off-center relative to the mark. Fix: rebuilt from first principles using diamond-space coordinates. Inner diamond center placed at (-9, 12) relative to outer center, making its left vertex (-18, 12) and bottom vertex (-9, 21) both satisfy |x|+|y|=30, tangent to the outer diamond's two left-side edges. Verified all coordinates through rotation math.
- **Wordmark changed to lowercase "squad".** Per Brady's request, replaced all five uppercase letter paths (S, Q, U, A, D) with lowercase letterforms (s, q, u, a, d). Metrics: baseline=171, x-height=159 (12 units), ascender=152 (for d), descender=178 (for q). Round letters (q, a, d) use consistent 6-unit radius ellipses. The s uses a stroke-only double-curve path. The u uses a stroke-only open curve. Diamond mark unchanged. ViewBox extended to accommodate q descender.
- **Concept C variants created.** Split the existing `squad-logo-proposal.svg` into `squad-logo-c.svg` (with wordmark, identical copy) and `squad-logo-c-mark.svg` (diamond glyph only, no letter paths, viewBox tightened to 66 66 68 68 to fit just the mark).
- **Concept E: "The Collective" designed and implemented.** Brady's brief: "GitHub Copilot logo but a bunch of them, each with slight variation — collaborative intelligent agents." Design: five rounded squares in organic cluster formation, each varied in size (13–18u), rotation (-10° to +12°), and opacity (0.7–1.0). Lead agent largest/full opacity at front, others arranged behind in flowing formation. Overlapping edges create cohesion. Files: `squad-logo-e.svg` (with wordmark), `squad-logo-e-mark.svg` (mark only). Wordmark reuses same lowercase stroke-based letterforms from Concept C. Concept E description added to Proposal 022 after Concept D, and recommendation table updated to include Concept E column.
- **Concept E variations (E2–E5) created.** Brady selected Concept E for exploration. Created four distinct variations, each with wordmark + mark-only files (8 SVGs total). E2 "Tight Formation" — agents compressed into a dense overlapping mass, reads as single organism. E3 "Arc" — agents along a sweeping semicircle, kinetic/directional, widest composition. E4 "Grid" — agents in a loose 3×2 grid with organic offsets, ordered chaos, one empty cell breaks symmetry. E5 "Convergence" — agents spread wide but all rotated to point toward a shared focal center, negative space as subject. All reuse the same wordmark letter paths, same #6366F1 palette with opacity variations. Proposal 022 updated with "Concept E Variations" subsection. Key learning: the same five-element vocabulary (rounded squares, opacity differentiation, rotation individuality) supports a surprisingly wide range of spatial metaphors. The arrangement *is* the message — tight=cohesion, arc=momentum, grid=structure, convergent=purpose.


📌 Team update (2026-02-08): Brand voice guidance for visual identity — design should feel competent, dry, developer-native; avoid AI imagery, gradients, chat bubbles — decided by McManus


📌 Team update (2026-02-08): Team introduction blog post (003) published — Redfoot welcomed as newest team member — decided by McManus

📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney

📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan

📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal


📌 Team update (2026-02-08): Logo SVGs parked, Proposal 022 kept. Redfoot redirected to README polish, UI, and presentation instead of logo SVGs. — decided by Brady


📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal

📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal


📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal


📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal


📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi

📌 Team update (2026-02-10): Per-agent model selection approved for v0.3.0 — Designer role maps to Opus for vision capabilities. — decided by Keaton


📌 Team update (2026-02-10): Clean branch config at init time — impacts release workflows — decided by bradygaster


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Provider abstraction is prompt-level command templates, not JS interfaces. Platform section replaces Issue Source in team.md. — decided by Fenster, Keaton

📌 Team update (2026-02-10): Actions automation ships as opt-in templates in templates/workflows/, 3 workflows in v0.3.0. — decided by Keaton, Kujan

📌 Team update (2026-02-10): Label taxonomy (39 labels, 7 namespaces) drives entire GitHub-native workflow. — decided by bradygaster, Verbal

📌 Team update (2026-02-10): CCA governance must be self-contained in squad.agent.md (cannot read .ai-team/). — decided by Kujan

📌 Team update (2026-02-10): Proposal migration uses three-wave approach — active first, shipped second, superseded/deferred last. — decided by Keaton

📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

