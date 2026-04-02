### Replace custom comment moderation with github/ai-moderator (2025-07-25)

**Decision:** Use GitHub's official `github/ai-moderator@v1` action instead of a custom scoring script for comment spam moderation.

**Rationale:** The custom script was 300 lines of hand-tuned heuristics with 46 tests. The marketplace action is AI-powered, GitHub-maintained, and requires zero custom code. Net delta: -872 lines.

**Configuration:** Spam detection and link-spam detection enabled. AI-content detection disabled initially — can be toggled on later. Applies `spam` label and minimizes flagged comments.

**Scope:** Workflow file only. No runtime dependencies, no SDK/CLI impact.
