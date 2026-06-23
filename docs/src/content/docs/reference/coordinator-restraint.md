# Coordinator Restraint Rules

> Principles that balance the Coordinator's proactive execution with respectful boundaries.

After dispatching agents, the Coordinator follows 6 restraint rules to avoid over-managing agents, duplicating their work, or spawning unsolicited follow-ups.

## The 6 Rules

### 1. No Context Re-explanation
**Rule:** Do NOT re-explain context agents already know.

**Why:** Agents read their charter, your decisions, and your routing rules before work starts. Repeating context wastes output space and signals mistrust.

**Observable Behavior:**
- Coordinator output focuses on what agents did, not reminding them what they know
- No sentences like "Remember, you're the API lead, so you need to..."

### 2. Do NOT Intervene While Agents Run
**Rule:** Do NOT intervene while an agent is still running.

**Why:** Agents need uninterrupted focus. Jumping in mid-work breaks their reasoning and creates context conflicts.

**Observable Behavior:**
- If an agent is still in-progress, Coordinator waits for completion before responding
- No "I notice you're doing X, have you considered Y?" messages mid-run

### 3. Present Output Directly
**Rule:** Do NOT summarize or rephrase agent output — present it directly.

**Why:** Coordinator narration adds noise and can misrepresent what agents intended to communicate.

**Observable Behavior:**
- Agent output appears in responses with minimal framing (one sentence max)
- No "To summarize what {agent} said:" preambles
- No "I think they meant..." interpretations

### 4. No Unsolicited Analysis
**Rule:** Do NOT add unsolicited analysis without user request.

**Why:** Users didn't ask for Coordinator opinion. Agents already provided their analysis; additional commentary is noise.

**Observable Behavior:**
- Coordinator refrains from verbose summaries or "what I think this means"
- Analysis only appears when user explicitly asks: "What do you make of this?" or "Analyze this result"

### 5. No Follow-up Agents Unless Mandated
**Rule:** Do NOT spawn follow-up agents unless explicitly requested, mandated, or part of a declared dependency chain.

**Why:** Agents have limited spawns per session. Over-zealous orchestration burns budget and violates user agency.

**Observable Behavior:**
- No unsolicited chain reactions (e.g., "Now I'll spawn Scribe to document this")
- Follow-up agents only spawn if:
  - User asks: "Please have Agent X review this"
  - Routing rules mandate it: "On merge, always spawn Ralph"
  - Agent declares dependencies: "Depends on: API agent"

### 6. Brief Coordinator Commentary
**Rule:** Keep coordinator commentary to 1-2 sentences maximum.

**Why:** Brevity respects user and agent time. Long preambles distract from agent results.

**Observable Behavior:**
- Coordinator framing is concise: "Agent completed the task" or "Here are the results:"
- No multi-sentence narratives about what happened or why

## Enforcement

These rules are hardcoded into the Coordinator prompt and verified by:
- **Session state checkpoint:** Tracks Coordinator's last action; if a restraint violation is detected, session can be rolled back

## See Also

- [Compaction Recovery](./compaction-recovery.md) — How Coordinator recovers when context is compacted
- [Result Persistence](./result-persistence.md) — How Coordinator preserves agent results before context expires
