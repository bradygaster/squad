# TEST-SCRIPT.md — Autonomous Pipeline Demo Walkthrough

> Step-by-step script for presenting the autonomous pipeline demo at MVP Summit.

---

## Pre-Demo Setup

1. **Build the sample:**
   ```bash
   cd samples/autonomous-pipeline
   npm install
   npm run build
   ```

2. **(Optional) Start Aspire dashboard for live telemetry:**
   ```bash
   docker run -d \
     -p 18888:18888 \
     -p 4317:18889 \
     -e DASHBOARD__FRONTEND__AUTHMODE=Unsecured \
     -e DASHBOARD__OTLP__AUTHMODE=Unsecured \
     mcr.microsoft.com/dotnet/aspire-dashboard:latest
   ```

3. **Verify build:**
   ```bash
   npm run start
   ```
   You should see the full pipeline run with colored output.

---

## Demo Script (3-5 minutes)

### Act 1: The Cast (30 seconds)

**Say:** "Squad doesn't use `agent-1`, `agent-2`. It casts a team with real personalities."

**Show:** The CASTING section — four agents from The Usual Suspects universe, each with a name, role, and personality trait.

**Key point:** "These identities persist across sessions. You build a relationship with your agents."

### Act 2: The Queue (30 seconds)

**Say:** "Here's a realistic development pipeline — 10 tasks from API design to security audit."

**Show:** The TASK QUEUE with progress bar and task list.

**Key point:** "Each task has a role affinity. The SDK knows which agent should handle it."

### Act 3: Tier Selection (30 seconds)

**Say:** "Not every task needs the same resources. The SDK selects the right tier automatically."

**Show:** The RESPONSE TIER SELECTION section — different tasks get different tiers.

**Key point:** "A security audit gets the full multi-agent tier. A doc update gets lightweight. This saves cost."

### Act 4: Autonomous Execution (90 seconds)

**Say:** "Now watch. The agents work autonomously."

**Show:** The scrolling execution log — agents picking up tasks, completing them, showing token counts.

**Highlight these moments:**
- 📚 **Skill matching** — "The SDK matched the JWT auth skill to this task automatically"
- 🔀 **squad_route** — "McManus just routed a follow-up task to Fenster — the tester"
- 📋 **squad_decide** — "Keyser recorded a team decision: 'Use JWT with RS256'"
- 🧠 **squad_memory** — "Fenster saved a learning about token refresh behavior"

**Key point:** "This is programmatic orchestration. Not prompt engineering. Code enforces the routing."

### Act 5: The Dashboard (30 seconds)

**Show:** The final dashboard — agent scoreboard, cost breakdown, timeline.

**Key point:** "Every token tracked. Every decision logged. Full observability."

### Act 6: OTel / Aspire (30 seconds, if Aspire is running)

**Say:** "And all of this feeds into Aspire."

**Show:** Switch to browser at http://localhost:18888. Show traces and metrics.

**Key point:** "Same OTel pipeline used in production. One line of code to enable."

---

## Talking Points

- **SDK vs Prompt orchestration:** "Prompts suggest. Code enforces."
- **squad_route:** "Agents hand off work to each other — like a real team."
- **squad_decide:** "Decisions propagate to every agent. No context silos."
- **squad_memory:** "Agents learn. Next session, they remember."
- **Cost tracking:** "Every token is accounted for. Per-agent. Per-session."
- **OTel native:** "One call: `initSquadTelemetry()`. Traces and metrics flow to Aspire."

---

## If Something Goes Wrong

- **No colors:** Terminal doesn't support ANSI. Try Windows Terminal or iTerm2.
- **Import errors:** Run `npm install` from the sample directory.
- **OTel not showing:** Check that `OTEL_EXPORTER_OTLP_ENDPOINT` is set and Aspire is running on port 4317.
- **TypeScript errors:** Run `npm run build` to check for compilation issues.

---

## Run Tests

```bash
npm test
```

All tests validate SDK integration patterns — they don't require live Copilot access.
