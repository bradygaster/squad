# Squad Alongside a Team of Human Developers

**Try this to use Squad for coordination:**
```
My team is all human devs — I just want Squad to help with coordination and memory
```

**Try this to add human team members:**
```
Add Sarah (senior backend engineer) and Jamal (frontend lead) as human members
```

**Try this to route critical decisions:**
```
Route security decisions to Sarah, she's the expert
```

Mixed AI + human teams: AI agents handle implementation, humans review and make critical decisions. Route work to humans just like AI agents.

---

## 1. Add Human Members to the Roster

Mixed AI + human teams. AI agents work, humans review. Route decisions to humans, let AI handle implementation.

Tell Squad about your human team members:

```
> Add two human developers to the roster:
> Sarah (senior backend engineer) and Jamal (frontend lead).
> They're not AI agents, they're on my team.
```

```
✅ Added human members:
   👤 Sarah — Senior Backend Engineer
   👤 Jamal — Frontend Lead

Humans appear in the roster but don't get charters.
Work can be routed to them via routing rules.
```

Squad adds them to `.ai-team/team.md`:

```markdown
## Human Team Members

- **Sarah** — Senior Backend Engineer
- **Jamal** — Frontend Lead
```

---

## 2. Routing Rules for Mixed Teams

Edit `.ai-team/routing.md` to route work to humans:

```markdown
# Routing Rules

**Backend architecture decisions** → Sarah (human)
**Frontend architectural changes** → Jamal (human)
**Payment integration work** → Sarah (human)
**UI component library changes** → Jamal (human)

**Backend implementation tasks** → Morpheus (AI agent)
**Frontend implementation tasks** → Trinity (AI agent)
**Code review** → Neo (AI agent)
**Testing** → Tank (AI agent)
```

Now when you give a task:

```
> Team, we need to add a real-time notification system.
> This is a big architectural change.
```

The coordinator sees "architectural change" and routes to humans:

```
📋 Scribe — routing architectural decision to Sarah and Jamal

⏸️  Coordinator paused. Waiting for Sarah and Jamal to decide on
   the notification architecture (WebSockets vs Server-Sent Events
   vs polling). Resume with their decision.
```

The AI agents **don't start implementation** until the humans decide.

---

## 3. Humans Decide, AI Implements

Sarah and Jamal discuss and decide: WebSockets via Socket.IO.

You relay the decision:

```
> Sarah and Jamal decided on WebSockets using Socket.IO.
> Morpheus, implement the backend. Trinity, integrate on the frontend.
```

```
🔧 Morpheus — building WebSocket server with Socket.IO
⚛️ Trinity  — integrating Socket.IO client in React components

Both agents are reading Sarah and Jamal's decision from decisions.md.
```

Scribe logs the decision:

```markdown
### 2025-07-15: Real-time notifications via WebSockets
**By:** Sarah, Jamal
**What:** Use Socket.IO for real-time notifications
**Why:** Need bi-directional communication, Socket.IO has better mobile client support than raw WebSockets
```

AI agents read this before starting. They know the humans already decided.

---

## 4. AI Agents Work, Humans Review PRs

Agents create pull requests. Humans review them.

```
🏗️ Neo — submitting PR #47: WebSocket notification system

PR includes:
  - Backend: Socket.IO server integration
  - Frontend: React component with socket connection
  - Tests: 12 new tests for connection lifecycle
  - Docs: Socket.IO event protocol

Requesting review from Sarah and Jamal.
```

Sarah and Jamal review the PR on GitHub. If they request changes, relay that back:

```
> Sarah flagged an issue in PR #47: the socket reconnection logic
> doesn't handle token expiration. Morpheus, fix it.
```

```
🔧 Morpheus — fixing socket reconnection to handle token expiration
```

Morpheus pushes a fix. The humans approve. Merge.

---

## 5. Pausing the Coordinator

When work routes to a human, the coordinator **pauses** — it doesn't guess what the human will decide.

```
> Team, should we migrate from REST to GraphQL?
```

```
📋 Scribe — routing API architecture decision to Sarah

⏸️  Coordinator paused. This is a significant architectural change.
   Waiting for Sarah's input before proceeding.
```

You ask Sarah. She says no, stick with REST.

```
> Sarah said no, we're staying with REST. Document that.
```

```
📋 Scribe — logged decision

### 2025-07-15: Staying with REST
**By:** Sarah
**What:** Not migrating to GraphQL
**Why:** Current REST API works well, migration cost isn't justified
```

---

## 6. Use Agents for the Tedious Work

Humans handle high-level decisions and code review. Agents handle implementation, testing, and grunt work.

```
> Tank, we just merged PR #47. Run the full test suite and check
> for regressions. If you find any, fix them.
```

```
🧪 Tank — running full test suite
   Checking for regressions after WebSocket integration...
```

Tank finds a broken test, fixes it, commits. Sarah doesn't have to.

---

## 7. Sample Prompts for Mixed Teams

**Route a decision to a human:**

```
> This payment gateway change is sensitive. Route it to Sarah
> for approval before implementing.
```

**Delegate implementation after human approval:**

```
> Sarah approved the Stripe integration plan. Morpheus, implement it.
> Follow the plan Sarah outlined in issue #23.
```

**Have an agent assist a human:**

```
> Jamal is working on the new dashboard UI. Trinity, help him by
> building the data-fetching hooks and TypeScript types.
```

**Agent-led PR, human review:**

```
> Neo, create a PR for the caching layer work. Assign it to Sarah
> for review.
```

---

## Tips

- **Humans in the roster, not as agents.** Humans don't get charters or histories, but they appear in routing rules.
- **Use routing rules to protect critical paths.** Route payment logic, security changes, and architectural decisions to humans.
- **Agents don't guess.** If a task routes to a human, the coordinator pauses until you relay the human's decision.
- **Agents make PRs, humans review.** Preserve your team's code review culture — agents submit work for approval, not direct commits.
- **Agents handle the tedious stuff.** Test writing, linting fixes, refactoring — offload it to agents so humans focus on high-value work.
