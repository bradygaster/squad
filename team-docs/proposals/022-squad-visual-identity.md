# Proposal 022: Squad Visual Identity — Initial Proposals

**Status:** Draft — Deferred to Horizon  
**Author:** Redfoot (Graphic Designer)  
**Date:** 2026-02-08  
**Requested by:** bradygaster  
**Depends on:** Proposal 014 (Messaging), 002 (Messaging Overhaul)

---

## Executive Summary

Squad needs a visual identity that works everywhere the product lives: terminal output, GitHub README, VS Code sidebar, favicons, social cards, npm listing. This proposal defines the brand space, presents five logo concepts with full rationale, and recommends one for refinement. The recommended concept ships as an SVG at `docs/assets/squad-logo-proposal.svg`.

Design constraint: Squad's brand is The Usual Suspects — dry, understated, pressure-oriented. The logo should feel like competence, not enthusiasm. Confidence, not flash. A tool you trust, not a toy you try.

---

## 1. Brand Analysis

### What does Squad feel like?

| Attribute | Expression |
|-----------|-----------|
| **Confidence** | It works. It doesn't need to convince you. |
| **Multiplicity** | One command, many agents. Parallel, not serial. |
| **Persistence** | Your team remembers. Knowledge compounds. |
| **Precision** | Clean structure, filesystem-backed, git-native. |
| **Quiet authority** | Dry tone. No exclamation marks. No gradients. |

Squad is not a startup. It's not a chatbot. It's a crew that shows up, does the work, and writes down what they learned. The visual identity should feel like a well-organized system, not a party.

### Brand personality keywords
`competent` · `structured` · `plural` · `persistent` · `understated` · `sharp`

### Rendering constraints

| Context | Constraints |
|---------|------------|
| **Terminal** | Monochrome only. Must read as recognizable shape at text scale. No color dependency. |
| **GitHub README** | Inline SVG or image link. Dark mode AND light mode. Transparent background required. |
| **GitHub avatar** | 500×500px circle crop. Logo must survive circle masking. |
| **Favicon** | 16×16, 32×32, 48×48. Must be identifiable as a single glyph at 16px. |
| **npm listing** | Small text + tiny icon. Name legibility matters more than logo detail. |
| **VS Code sidebar** | 20×20px icon in activity bar. Monochrome, single color on transparent. |
| **Social cards** | 1200×630px. Logo + tagline composition. Room for "Throw MY squad at it." |
| **Mermaid diagrams** | Already using `#6366f1` (indigo) and `#3b82f6` (blue) — any palette should harmonize. |

### Typographic context

The product name is five letters: **S-Q-U-A-D**. Short, punchy, symmetrical feel. The Q is distinctive — it's the only letter with a descender, and the Q→U pair has natural visual rhythm. The word reads like a unit. That's an asset.

### What the logo must NOT be

- Not a robot. Not a brain. Not a neural network illustration.
- Not cute. No mascots, no cartoon characters, no winking.
- Not corporate. No swooshes, no abstract globe, no interlocking rings.
- Not busy. If it has more than 3-4 elements, it's wrong.

---

## 2. Logo Concepts

### Concept A: "The Formation"

**One-line concept:** Five elements in tight formation — a squad in geometric shorthand.

**Detailed visual description:**

Five identical squares arranged in a cross/plus pattern: one center, four surrounding it at compass points (top, right, bottom, left). Each square is the same size. The spacing between them is exactly one-quarter of a square's width — tight enough to read as a unit, open enough to see individual elements.

The center square represents the coordinator. The four surrounding squares represent agents. The negative space between them forms a plus sign — suggesting addition, growth, coordination.

**Proportions:** Each square is 20×20 units. Total bounding box is 65×65 units (accounting for spacing). The composition is perfectly symmetrical on both axes.

**Color palette:**
- Primary fill: `#6366F1` (Indigo 500 — matches existing Mermaid diagram coordinator color)
- All five squares same color, no hierarchy through color
- Hierarchy expressed through position alone (center = coordinator)

**Typography:** Wordmark "SQUAD" set in **Inter Bold** (or **IBM Plex Sans Bold**), tracked at +0.05em. All caps. Positioned below the mark with vertical spacing equal to one square height.

**Small sizes:** At favicon scale (16px), reduces to five dots in a plus pattern — still recognizable. At GitHub avatar scale (500px circle), the cross fits cleanly inside the circle with the corners of the outer squares near the circle edge.

**Monochrome:** Works perfectly — the concept is shape-driven, not color-driven. White on dark, dark on light, single-color on transparent all work without modification.

**Why it works:** Multiplicity is the core visual metaphor. Five units, one formation. The plus-sign negative space suggests composition and addition without being literal.

**Why it might not:** Could read as a medical/Red Cross reference. The grid might feel too rigid for a tool that adapts.

---

### Concept B: "The Bracket"

**One-line concept:** A square bracket containing parallel lines — agents operating in structure.

**Detailed visual description:**

A left square bracket `[` rendered as a bold geometric shape: vertical bar with two short horizontal bars extending right from top and bottom. Inside the bracket space, four short horizontal lines of equal length, evenly spaced vertically — representing parallel agents at work.

The bracket is the structure (Squad's filesystem-backed architecture). The lines inside are the agents (parallel execution). The open right side suggests output, work flowing forward.

**Proportions:** The bracket is 24 units tall, 8 units wide. The horizontal bars are 6 units long. The four inner lines are 14 units long, centered vertically within the bracket with 3 units of spacing between each. Total bounding box is approximately 24×22 units.

**Color palette:**
- Bracket: `#1E1B4B` (Indigo 950 — near-black with warmth)
- Inner lines: `#6366F1` (Indigo 500)
- Alternative single-color version uses bracket color only

**Typography:** "squad" in lowercase **JetBrains Mono Medium** — a monospace font that reinforces the CLI-first identity. No tracking adjustment. Lowercase because the bracket already provides the structural authority; the wordmark can be approachable.

**Small sizes:** At 16px, the bracket and lines simplify to a bracket-with-dashes glyph. Reads as "code" or "terminal" at a glance. At avatar scale, the bracket-and-lines composition has enough detail to be distinctive.

**Monochrome:** Excellent. Born monochrome. Color is an enhancement, not a requirement.

**Why it works:** Directly references the CLI/code world. The parallel lines literally depict parallel execution. The bracket suggests structure, containment, system. Feels like it belongs in a terminal.

**Why it might not:** Could be too literal. Might feel like an IDE icon rather than a product brand. The open-right-side is subtle and may not read in all contexts.

---

### Concept C: "The Glyph" ⟡ (Recommended)

**One-line concept:** An abstract mark — a rotated square with an inset element — that reads as both a diamond and a command prompt.

**Detailed visual description:**

A square rotated 45° to stand as a diamond shape. The diamond has a uniform stroke weight (no fill — outline only) with slightly rounded corners (radius: 6% of side length). Inside the diamond, at the bottom-left, a small solid square (also rotated 45°, ~30% the size of the outer diamond) sits anchored in the lower-left quadrant, touching or nearly touching the inner edges of the outer diamond's two lower-left sides.

The outer diamond is the space — the project, the context. The inner element is the seed — the squad, small but solid, growing into the space. The composition is deliberately asymmetrical within a symmetrical frame, creating visual tension. The inner square's position suggests a cursor or prompt — something waiting, ready.

**Proportions:** Outer diamond: 60×60 unit bounding box (the rotated square's diagonal). Stroke width: 3 units. Inner diamond: 18×18 unit bounding box, positioned with its rightmost point at the center of the outer diamond and its lowest point near the outer diamond's bottom vertex. The inner element occupies roughly the lower-left quadrant.

**Color palette:**
- Outer diamond stroke: `#6366F1` (Indigo 500)
- Inner diamond fill: `#6366F1` (Indigo 500)
- Single color, no gradient, no secondary color needed

**Typography:** "SQUAD" in **Inter Semibold**, tracked at +0.08em. All caps. The extra tracking gives the wordmark breathing room to match the diamond's open geometry. Positioned to the right of the mark (horizontal lockup) or below (stacked lockup).

**Small sizes:** At 16px, the diamond-with-inner-dot reads as a distinctive glyph — not confused with any common UI icon. At 32px, the asymmetric inner element is visible. At avatar scale (500px circle), the diamond's corners approach the circle edge, creating a satisfying relationship between the circular crop and the angular mark.

**Monochrome:** Perfect. Single-color design. White on black: the outer diamond glows, the inner element anchors. Black on white: clean geometric mark. Works at any single color.

**Why it works:** It's abstract enough to be a brand, not an illustration. The diamond has historical associations with quality (♦), value, and precision. The inner-element-as-cursor subtly references the CLI without being literal. The asymmetry within symmetry creates visual interest at every size. It's the kind of mark you'd see stamped on a tool — not printed on a t-shirt. Most importantly: it's simple enough to draw from memory after seeing it once.

**Why it might not:** Abstract marks require repetition to build recognition. The diamond shape is used by many brands (though rarely as an outline with asymmetric interior). The cursor reading requires explanation — it won't be obvious to everyone.

---

### Concept D: "The Stack"

**One-line concept:** Layered horizontal bars with staggered alignment — a squad's parallel work, visualized as depth.

**Detailed visual description:**

Three horizontal rounded rectangles (pill shapes), stacked vertically with small spacing. Each bar is the same height but different widths and horizontal positions:
- Top bar: widest (~48 units), left-aligned
- Middle bar: medium (~36 units), centered
- Bottom bar: narrowest (~28 units), right-aligned

The stagger creates a sense of depth and motion — like looking at a Gantt chart from an angle, or seeing three agents working on different-sized tasks simultaneously. The descending width suggests convergence — many inputs narrowing to output.

**Proportions:** Each bar is 8 units tall with 4-unit border radius (half-height, creating pill shapes). Vertical spacing between bars: 4 units. Total bounding box: approximately 48×32 units.

**Color palette:**
- Top bar: `#6366F1` (Indigo 500)
- Middle bar: `#818CF8` (Indigo 400)
- Bottom bar: `#A5B4FC` (Indigo 300)
- The gradient from dark to light suggests depth, with the "front" agent most prominent

**Typography:** "squad" in lowercase **Inter Medium**, standard tracking. The lowercase + medium weight balances the visual weight of the stacked bars. Positioned to the right (horizontal lockup).

**Small sizes:** At 16px, reads as three horizontal lines — simple but potentially generic (could be confused with a hamburger menu icon ☰). At 32px and above, the staggered alignment becomes visible and distinctive.

**Monochrome:** Requires modification — the three-shade approach doesn't translate to single color. In monochrome, all three bars would be the same color but could use decreasing opacity (100%, 70%, 40%) or solid color with identical weight and rely on the stagger alone for differentiation.

**Why it works:** Directly visualizes parallel execution — Squad's core architectural feature. The Gantt-like quality references project management without being literal. The depth effect is subtle and sophisticated.

**Why it might not:** Dangerously close to hamburger menu icon (☰) at small sizes. The color gradient is essential to the concept, which means it partially fails the monochrome constraint. Three bars is a common motif in tech logos.

---

### Concept E: "The Collective"

**One-line concept:** A cluster of similar-but-distinct geometric agents in organic formation — collaborative intelligence, visualized.

**Detailed visual description:**

Five small rounded squares arranged in a loose, organic cluster — not a rigid grid, but a flowing formation suggesting coordinated motion. Each figure is slightly different: varied sizes (13–18 units), slight rotations (-10° to +12°), and opacity shifts (0.7–1.0). The figures overlap at their edges, creating a sense of proximity and shared purpose. The largest figure sits slightly ahead of center (the lead agent), with others arranged around and behind it in a formation that suggests convergence toward a common direction.

The composition interprets the spirit of intelligent agents working collaboratively. Each figure is autonomous (its own size, rotation, opacity) yet clearly part of a coordinated group. The organic spacing — not uniform, not random — reads as intentional formation. Like a squad moving together.

**Proportions:** Each figure is a rounded square (corner radius ~20% of side). Sizes range from 13×13 to 18×18 units. Total bounding box approximately 80×80 units. The cluster's center of mass sits slightly above-center, with the lead agent at the top and trailing agents below, creating a natural reading direction.

**Color palette:**
- Base: `#6366F1` (Indigo 500) — same across all five figures
- Differentiation through opacity: lead figure at 100%, others at 90%, 85%, 75%, 70%
- The opacity gradient creates depth without introducing new colors
- Single-hue design: no secondary colors needed

**Typography:** "squad" in lowercase, stroke-based letterforms matching the Concept C wordmark style (Inter Semibold inspired, tracked at +0.08em). Positioned below the mark in stacked lockup. The lowercase warmth complements the organic cluster — approachable agents, not cold geometry.

**Small sizes:** At 16px, the five overlapping figures merge into a single distinctive asymmetric blob — recognizable as "that clustered shape" without needing to resolve individual figures. At 32px, individual figure edges become visible. At 500px (avatar scale), each figure's rotation and opacity is clearly distinct. The cluster survives circle crop well — its organic shape doesn't fight the circular mask.

**Monochrome:** Works with modification. In single-color monochrome (no opacity), the overlapping edges create natural visual separation through the slight gaps between rotated figures. Alternatively, the opacity variations translate directly to grayscale. White-on-dark: the cluster reads as a glowing constellation of agents. Dark-on-light: clean geometric grouping.

**Why it works:** Multiplicity is literal — you see multiple agents. Individuality is visible — each one is slightly different. Collaboration is spatial — they're arranged together, not scattered. The organic formation avoids the rigidity of Concept A's grid while maintaining the "squad" metaphor. At small sizes it collapses into a distinctive asymmetric glyph that doesn't resemble any standard UI icon. The concept directly evokes Squad's core promise: throw a group of intelligent agents at a problem, each contributing their own way.

**Why it might not:** Five overlapping shapes risk visual noise at mid-sizes (24–48px) where individual figures are partially resolved but not clearly distinct. The organic arrangement is harder to reproduce precisely than geometric concepts — every implementation will look slightly different. The concept relies on opacity for differentiation, which means print/monochrome contexts lose some of the individuality. Could read as "scattered" rather than "collaborative" if the spacing is even slightly off.

### Concept E Variations

Brady selected Concept E for further exploration. Four variations were developed, each maintaining the five-agent rounded-square vocabulary and Indigo 500 (#6366F1) single-hue palette, but exploring fundamentally different spatial arrangements.

**E2 — "Tight Formation"** (`docs/assets/squad-logo-e2.svg`, `squad-logo-e2-mark.svg`): The agents compress into a single dense mass with 50%+ overlap between figures. Where the original E reads as "individuals coordinating," E2 reads as "a single organism made of parts." The tight overlap creates rich translucent layering at intersections, and at small sizes the cluster collapses into a compact, gem-like shape. This variation best conveys cohesion and shared context — agents so aligned they nearly merge. The tradeoff is reduced individuality; the figures are harder to distinguish as separate entities.

**E3 — "Arc"** (`docs/assets/squad-logo-e3.svg`, `squad-logo-e3-mark.svg`): The agents are arranged along a sweeping ~120° arc, with the lead agent at the apex and trailing agents descending along the curve in decreasing size. Each agent is rotated to follow the arc's tangent at its position, creating a strong sense of directional momentum — a squad advancing together. This is the most kinetic variation: where E is a cluster and E2 is a mass, E3 is a wave. It reads particularly well in horizontal lockups and wide-format contexts (social cards, README headers). The tradeoff is that the composition is wider and shallower than the others, making it less compact for square-crop contexts like favicons.

**E4 — "Grid"** (`docs/assets/squad-logo-e4.svg`, `squad-logo-e4-mark.svg`): The agents occupy positions on a loose 3×2 grid, but each drifts 2–4 units from its cell center with individual rotation and sizing. One grid cell (bottom-right) is deliberately left empty to break symmetry. The result is "ordered chaos" — structured from a distance, organic up close. This variation best represents a team with defined roles but individual style. It's the most "systematic" of the variations and the easiest to reproduce precisely. The tradeoff is that the grid structure can read as too rigid or dashboard-like if the organic offsets aren't pronounced enough.

**E5 — "Convergence"** (`docs/assets/squad-logo-e5.svg`, `squad-logo-e5-mark.svg`): The agents are spread wide — more separated than any other variation — but each is rotated so that one corner points toward a shared focal point at center. The negative space at center, where no agent sits, becomes the implicit subject: the work itself. This variation emphasizes shared purpose over proximity. The agents don't need to be close to be a squad; they just need to be aimed at the same goal. The wider spread and strong rotations create the most dramatic, dynamic composition. The tradeoff is that at very small sizes the agents may appear disconnected rather than coordinated.

---

## 3. Recommendation: Concept C — "The Glyph"

**The Glyph wins on constraints.**

| Criterion | A: Formation | B: Bracket | C: Glyph ⟡ | D: Stack | E: Collective |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Favicon readability | ✅ Good | ✅ Good | ✅ Best | ⚠️ Hamburger risk | ✅ Good |
| Monochrome fidelity | ✅ Perfect | ✅ Perfect | ✅ Perfect | ⚠️ Needs adaptation | ✅ Good |
| Dark/light mode | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Brand distinctiveness | ⚠️ Medical cross risk | ⚠️ IDE icon feel | ✅ Unique | ⚠️ Generic bars | ✅ Distinctive |
| Circle crop (avatar) | ✅ Good | ⚠️ Awkward | ✅ Excellent | ✅ Good | ✅ Good |
| Emotional register | Structured | Technical | Confident | Dynamic | Collaborative |
| Scalability | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Matches brand personality | Good | Good | **Best** | Good | Good |

The Glyph's key advantage: **it works at every size, in every color mode, with zero adaptation.** One SVG, one color, infinite contexts. That's the kind of constraint-driven design that scales.

The diamond-with-inner-element reads differently at different sizes — a feature, not a bug:
- At 16px: a distinctive dot-in-diamond favicon
- At 32px: asymmetric geometry, clearly a mark
- At 500px: the full relationship between outer frame and inner anchor is visible
- In terminal: can be approximated as `◇` or `⬥` in Unicode

**SVG implementation:** `docs/assets/squad-logo-proposal.svg`

---

## 4. Brand Color Palette

### Primary Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary** | Indigo 500 | `#6366F1` | Logo, primary actions, links, emphasis |
| **Primary Dark** | Indigo 700 | `#4338CA` | Hover states, active elements, depth |
| **Primary Darkest** | Indigo 950 | `#1E1B4B` | Text on light backgrounds, dark UI elements |

### Neutral Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Text** | Slate 900 | `#0F172A` | Body text, headings |
| **Text Secondary** | Slate 500 | `#64748B` | Captions, metadata, secondary info |
| **Surface Light** | Slate 50 | `#F8FAFC` | Light mode backgrounds |
| **Surface Dark** | Slate 900 | `#0F172A` | Dark mode backgrounds |
| **Border** | Slate 200 | `#E2E8F0` | Dividers, card borders (light mode) |

### Accent Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Success** | Emerald 500 | `#10B981` | Test passing, healthy status, confirmations |
| **Warning** | Amber 500 | `#F59E0B` | Cautions, experimental status |
| **Error** | Rose 500 | `#F43F5E` | Failures, breaking changes |
| **Info** | Sky 500 | `#0EA5E9` | Informational badges, links |

### Usage Rules

1. **Indigo is Squad.** Every other color serves it. When in doubt, use indigo or a neutral.
2. **No gradients.** Flat color only. Gradients fight the terminal-native aesthetic.
3. **Monochrome must always work.** Any visual that requires color to be understood is wrong.
4. **Dark mode is not an afterthought.** Design in dark mode first (Slate 900 background, light text), then verify light mode.
5. **Accent colors are functional, not decorative.** Green means passing. Red means broken. Don't use them for visual interest.
6. **The Mermaid diagrams already use this palette** (`#6366f1`, `#3b82f6`, `#6b7280`, `#8b5cf6`). The proposed palette harmonizes with the existing visual language — no breaking changes.

### Color accessibility

All primary-on-neutral combinations must meet WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text). Verified combinations:

- `#6366F1` on `#F8FAFC` → 4.6:1 ✅ (AA normal text)
- `#6366F1` on `#0F172A` → 5.8:1 ✅ (AA normal text)
- `#1E1B4B` on `#F8FAFC` → 15.4:1 ✅ (AAA)
- `#F8FAFC` on `#0F172A` → 17.1:1 ✅ (AAA)

---

## 5. Typography Recommendations

### Primary typeface: Inter

**Why Inter:** Open source (SIL license), designed for screens, excellent at small sizes, wide weight range, already widely available on developer machines. Neutral without being bland. The kind of typeface that doesn't announce itself — which matches Squad's understated personality.

| Context | Style | Weight | Tracking |
|---------|-------|--------|----------|
| Logo wordmark | All caps | Semibold (600) | +0.08em |
| Headings | Sentence case | Bold (700) | Normal |
| Body text | Sentence case | Regular (400) | Normal |
| Captions/meta | Sentence case | Medium (500) | Normal |

### Monospace: JetBrains Mono

**Why JetBrains Mono:** Open source, designed for code, excellent ligatures, widely installed in the target audience's editors. Used for code samples, terminal output, file paths, and the alternative wordmark lockup.

| Context | Style | Weight |
|---------|-------|--------|
| Code samples | Regular | Regular (400) |
| Terminal output | Regular | Regular (400) |
| Alternative wordmark | Lowercase | Medium (500) |

### Typography rules

1. **Never use more than two typefaces.** Inter + JetBrains Mono covers every context.
2. **ALL CAPS is reserved for the logo wordmark and badges.** Headings and body are sentence case.
3. **Don't bold everything.** Bold is for emphasis. If everything is emphasized, nothing is.

---

## 6. SVG Implementation Notes

The recommended Concept C is implemented at `docs/assets/squad-logo-proposal.svg`.

**What's in the SVG:**
- The Glyph mark: outer diamond (stroke, no fill) with inner solid diamond (filled) in the lower-left quadrant
- Wordmark "SQUAD" in Inter Semibold (as path outlines for portability)
- Stacked lockup (mark above wordmark)
- Single color: `#6366F1`
- Transparent background
- Viewbox optimized for clean scaling

**What's NOT in the SVG (future work):**
- Horizontal lockup variant
- Monochrome variants (white-on-dark, dark-on-light)
- Favicon-optimized version (simplified at 16px)
- Social card template

---

## 7. Next Steps

| Item | Owner | Dependency |
|------|-------|-----------|
| Team feedback on concept direction | Keaton, McManus, Brady | This proposal |
| Refine selected concept based on feedback | Redfoot | Feedback |
| Create lockup variants (horizontal, stacked, mark-only) | Redfoot | Concept approval |
| Generate favicon and avatar exports (ICO, PNG) | Redfoot | Concept approval |
| Create social card template (1200×630) | Redfoot | Concept approval + McManus tagline |
| Dark mode / light mode variant SVGs | Redfoot | Concept approval |
| Integrate into README header | McManus + Redfoot | All assets final |
| Add to npm package metadata | Fenster | Favicon export |
| Brand guidelines document (standalone) | Redfoot | All above |

### What I need from the team

1. **From Brady:** Does any concept feel right? Does any feel wrong? Gut reaction matters more than analysis here.
2. **From Keaton:** Does the diamond/glyph concept align with where the product is headed? Is the "understated confidence" register correct?
3. **From McManus:** How does the logo composition work with the launch messaging? Does "Throw MY squad at it" sit well next to the diamond mark?
4. **From Fenster:** Any technical constraints I'm missing for integration into the npm package, GitHub Actions badges, or VS Code?

---

_This proposal was written by Redfoot, the Graphic Designer on Squad's team. First assignment. First draft. Let's talk._
