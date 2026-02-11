# SKILL: Community Content Analysis

**Confidence:** medium
**Source:** Fritz video analysis (2026-02-11) — first external video coverage of Squad
**Agent:** McManus

## When to Use

When analyzing external community content about Squad — videos, blog posts, tweets, conference talks — to extract messaging signal, product insights, and documentation opportunities.

## Framework

### 1. What They Highlighted (Messaging Signal)
Identify what the creator chose to emphasize. These are unprompted signals of what resonates with real developers:
- Features they demo'd or called out by name
- Phrases they repeated (repetition = resonance)
- Moments where they paused to editorialize ("this is cool," "check this out")
- Proof points they cited (numbers, outputs, artifacts)

### 2. What They Skipped (Gap Signal)
Identify what was available but not mentioned:
- Shipped features that weren't discovered or shown
- Architecture details that didn't surface
- Workflow steps they edited out or glossed over
- Distinguish between "not relevant to their demo" vs. "not discoverable"

### 3. What Would Strengthen the Story
Based on the gap between what resonated and what was skipped:
- Messaging hooks that worked ("markdown, not magic")
- Documentation changes that would help the next person demo Squad
- Sample prompts or scenarios inspired by their demo

### 4. Product Signal Table
Two tables: "What worked well" and "Potential friction points." Evidence-based — cite the specific moment or quote.

### 5. Draft Community Reference
Write a factual blurb suitable for README or docs. No hype words. Format:
- What the content covers
- Who created it
- Link

## Output Format

Write to `.ai-team/decisions/inbox/mcmanus-{source}-analysis.md` using the standard decision inbox format. Include all five sections above.

## Key Principles

- External coverage is a signal, not a scorecard. Don't grade the creator's demo.
- Repetition in external content = messaging that works. Track what gets repeated.
- Skipped features aren't failures — they indicate discovery priority, not feature quality.
- Quantifiable outputs (test counts, file counts, build results) are the strongest demo beats.
- Facts only. No editorial framing of the creator's opinions.
