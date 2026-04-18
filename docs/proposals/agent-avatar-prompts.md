# Agent Avatar Image Generation Prompts

**Author:** INCO (CLI UX & Visual Design)
**Date:** 2026-03-28
**Status:** Ready for generation
**Related:** [Agent GitHub Identity Proposal](./agent-github-identity.md)

---

## Design System

### Shared Style Directive

All prompts share this base directive — prepend it to every role prompt:

> **Base style:** Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

### Color System

| Role | Accent Color | Hex | Rationale |
|------|-------------|-----|-----------|
| Lead | Gold / Amber | `#F0883E` | Authority, decision-making, warmth |
| Frontend | Cyan / Electric blue | `#58A6FF` | Screens, interfaces, React's blue |
| Backend | Green / Terminal | `#3FB950` | Server, CLI, terminal green |
| Tester | Violet / Purple | `#BC8CFF` | Lab/experiment connotation, QA distinction |
| DevOps | Orange / Infra | `#D29922` | Pipelines, CI warmth, caution/ops |
| Docs | Teal / Writer | `#39D2C0` | Readability, calm, knowledge |
| Security | Red / Alert | `#F85149` | Threat, protection, urgency |
| Data | Blue-violet / Analytics | `#79C0FF` | Charts, data flow, cool precision |

### Background

All avatars use GitHub's dark theme base color (`#0D1117`) as background. This ensures:
- Clean appearance on dark GitHub themes (native match)
- Strong contrast on light GitHub themes (dark circle stands out)
- Cohesive family appearance across all roles

---

## Role Prompts

### 1. Lead / Architect (`lead`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. A minimal abstract compass rose or asterisk shape made of 6-8 thin intersecting lines radiating from a center point, rendered in amber (#F0883E) with white (#E6EDF3) accents at the endpoints. The center has a small solid circle suggesting a decision node. Subtle luminous glow on the amber lines. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** The compass/asterisk motif signals navigation and direction-setting — the Lead charts the path. Radiating lines suggest connections to all other roles. Amber conveys authority without aggression. The center node represents the single decision point that architecture demands.

---

### 2. Frontend Dev (`frontend`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Three nested rounded rectangles (or rounded squares) of decreasing size, centered and slightly offset to suggest depth/layering, rendered in electric blue (#58A6FF) with thin white (#E6EDF3) outlines. The innermost rectangle is a solid filled shape. The composition suggests a component hierarchy or nested UI frames. Subtle luminous glow on the blue elements. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** Nested rectangles are the universal metaphor for UI components — containers within containers. The layered depth hints at the component tree that Frontend developers navigate daily. Electric blue ties to the screen/interface mental model and echoes React's brand color.

---

### 3. Backend Dev (`backend`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. A minimal abstract shape composed of three horizontal parallel lines connected by two vertical lines on alternating sides, forming a zigzag circuit-path or data-flow pattern, rendered in terminal green (#3FB950) with white (#E6EDF3) node dots at each connection point. Subtle luminous glow on the green lines. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** The zigzag circuit-path evokes data flowing through a pipeline or API chain — request in, processing, response out. Terminal green is the universal color of server/CLI environments. Connection-point dots suggest endpoints and service nodes, which are the Backend developer's domain.

---

### 4. Tester / QA (`tester`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. An abstract diamond or rhombus shape with a checkmark (tick) inscribed inside it, rendered in violet (#BC8CFF) with thin white (#E6EDF3) lines. The diamond suggests a decision gate, and the checkmark suggests passing validation. Subtle luminous glow on the violet elements. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** The diamond shape comes from flowchart decision nodes — the yes/no gate that QA enforces. The checkmark inside it represents passing tests and quality gates. Violet distinguishes Tester from all other roles while carrying a lab/experimental connotation that fits quality analysis.

---

### 5. DevOps / Platform (`devops`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. An abstract infinity loop or continuous cycle formed by two overlapping rounded triangles (or a stylized figure-eight), rendered in warm orange (#D29922) with white (#E6EDF3) directional arrow-tips at two points along the loop. Subtle luminous glow on the orange lines. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** The infinity/continuous loop is the literal symbol of CI/CD — continuous integration, continuous delivery. Arrow tips convey the pipeline's directionality. Warm orange signals operational awareness (think alert dashboards, pipeline status) and sits between the caution of infrastructure work and the energy of deployment.

---

### 6. DevRel / Writer (`docs`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Three horizontal lines of decreasing width stacked vertically (like an abstract text block or left-aligned paragraph), with a small angular bracket (>) or cursor mark to the left of the top line, rendered in teal (#39D2C0) with white (#E6EDF3) accents. Subtle luminous glow on the teal elements. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** Stacked horizontal lines universally represent text/documentation. The angle bracket adds a developer-specific twist — it could be a markdown blockquote marker, a terminal prompt, or a code comment prefix. Teal conveys calm readability and knowledge, distinct from the more urgent colors used by action-oriented roles.

---

### 7. Security (`security`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. An abstract hexagonal shield outline — a regular hexagon with a vertical line bisecting it from top to bottom, rendered in red (#F85149) with white (#E6EDF3) line accents. The bisecting line suggests a lock mechanism or sealed boundary. Subtle luminous glow on the red elements. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** The hexagon combines the shield metaphor (protection) with a geometric/technical feel that avoids the cliché padlock icon. The bisecting line turns it into a boundary — sealed, guarded. Red is the universal security/alert color, immediately signaling this role's protective function. The hexagonal shape also subtly references honeycomb security patterns.

---

### 8. Data Engineer (`data`)

**Prompt:**
> Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Three to four vertical bars of varying heights arranged side by side (like a minimal bar chart), with small diamond-shaped data points connected by a thin diagonal line overlaid across the tops of the bars, rendered in blue-violet (#79C0FF) with white (#E6EDF3) accents. Subtle luminous glow on the blue-violet elements. No text, no human features. Clean vector developer-tool aesthetic. Square 1:1 format, high contrast, legible at 40px. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered.

**Design rationale:** Bar chart + trend line is the most compact visual shorthand for data and analytics. The dual representation (discrete bars + continuous line) suggests both storage and analysis — the Data Engineer's two domains. Blue-violet is cool and precise, evoking dashboards and data visualization tools.

---

## Usage Notes

### How to use these prompts

1. **Combine base + role prompt.** Prepend the shared style directive to each role prompt for maximum consistency.
2. **Generate at 1024×1024 minimum.** GitHub will downscale — start high for clean results.
3. **Test at target sizes.** After generation, resize to 256×256 and 40×40 to verify legibility.
4. **Batch-generate variations.** Run each prompt 3-4 times and pick the clearest result.

### Post-generation checklist

- [ ] All 8 avatars share the same dark background tone
- [ ] Each role is distinguishable by color alone (colorblind test: check with deuteranopia simulation)
- [ ] Icons are recognizable at 40×40px GitHub comment avatar size
- [ ] No avatar contains text, words, or letter-like shapes
- [ ] Set appears cohesive when displayed side-by-side

### Recommended generators

- **DALL-E 3** — Best for following precise geometric instructions
- **Midjourney v6** — Add `--style raw --ar 1:1` for cleaner icon output
- **Ideogram** — Strong with flat/vector styles and text avoidance

---

## Copy-Pastable Prompts

Complete, self-contained prompts ready to paste into any image generator. Base style is pre-combined.

### Lead

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. A minimal abstract compass rose or asterisk shape made of 6-8 thin intersecting lines radiating from a center point, rendered in amber (#F0883E) with white (#E6EDF3) accents at the endpoints. The center has a small solid circle suggesting a decision node. Subtle luminous glow on the amber lines.
```

### Frontend

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. Three nested rounded rectangles of decreasing size, centered and slightly offset to suggest depth/layering, rendered in electric blue (#58A6FF) with thin white (#E6EDF3) outlines. The innermost rectangle is a solid filled shape. The composition suggests a component hierarchy or nested UI frames. Subtle luminous glow on the blue elements.
```

### Backend

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. A minimal abstract shape composed of three horizontal parallel lines connected by two vertical lines on alternating sides, forming a zigzag circuit-path or data-flow pattern, rendered in terminal green (#3FB950) with white (#E6EDF3) node dots at each connection point. Subtle luminous glow on the green lines.
```

### Tester

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. An abstract diamond or rhombus shape with a checkmark inscribed inside it, rendered in violet (#BC8CFF) with thin white (#E6EDF3) lines. The diamond suggests a decision gate, and the checkmark suggests passing validation. Subtle luminous glow on the violet elements.
```

### DevOps

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. An abstract infinity loop or continuous cycle formed by two overlapping rounded triangles or a stylized figure-eight, rendered in warm orange (#D29922) with white (#E6EDF3) directional arrow-tips at two points along the loop. Subtle luminous glow on the orange lines.
```

### Docs

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. Three horizontal lines of decreasing width stacked vertically like an abstract text block, with a small angular bracket (>) to the left of the top line, rendered in teal (#39D2C0) with white (#E6EDF3) accents. Subtle luminous glow on the teal elements.
```

### Security

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. An abstract hexagonal shield outline — a regular hexagon with a vertical line bisecting it from top to bottom, rendered in red (#F85149) with white (#E6EDF3) line accents. The bisecting line suggests a lock mechanism or sealed boundary. Subtle luminous glow on the red elements.
```

### Data

```
Flat geometric icon horizontally and vertically centered on a solid dark navy (#0D1117) background. Minimal, abstract, no text, no human features. Thin precise lines and shapes using a single accent color plus white (#E6EDF3). Subtle glow or luminance effect on the accent color to add depth. Clean vector aesthetic — think developer tool logo, not illustration. Square 1:1 aspect ratio. High contrast, legible at 40×40px. No gradients, no shadows, no 3D effects. The icon should fill approximately 80% of the canvas area and be perfectly horizontally and vertically centered. Three to four vertical bars of varying heights arranged side by side like a minimal bar chart, with small diamond-shaped data points connected by a thin diagonal line overlaid across the tops of the bars, rendered in blue-violet (#79C0FF) with white (#E6EDF3) accents. Subtle luminous glow on the blue-violet elements.
```
