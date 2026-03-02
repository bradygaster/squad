# Tips and Tricks for Managing Your Squad

> **Quick Start Prompts:**  
> `"Team, build the login feature — include UI, API endpoints, and tests"`  
> `"Always use TypeScript strict mode and named exports"`  
> `"Ralph, start monitoring — handle the backlog while I work on urgent tasks"`  
> `"What did the team accomplish last session?"`

Real patterns from using Squad effectively. These are techniques that work.

---

## Effective Prompt Patterns

### 1. Be Specific About Scope

Good prompts describe the boundary, not just the task.

```
❌ "Build the auth system"
✅ "Build JWT authentication for login/logout/refresh. Sessions stored in Redis. 
   Passwords hashed with bcrypt. No OAuth yet — that's phase 2."
```

The second one tells the team: what's in, what's out, what's coming. Agents don't have to guess or ask.

### 2. Name the Team Roster in Your Spec

If you need specialized agents, say so in the prompt.

```
I'm building a data pipeline that:
- Reads CSV files and validates schema (Backend handles I/O)
- Transforms data with custom rules (Data Specialist handles logic)
- Loads into PostgreSQL with migration tracking (Backend handles schema)
- Generates reports as HTML dashboards (Frontend handles UI)

I need Backend, a Data Specialist (who knows ETL patterns), and Frontend. 
Set up the team and start with the data validation layer.
```

This creates exactly the team you need instead of defaulting to the generic roster.

### 3. Use "Team" When Parallel Work Matters

```
> Team, build the login page.
```

This spawns frontend (UI), backend (endpoints), tester (test cases), and lead (architecture) — all at once. They divide the work naturally.

For sequential work, name the agent:

```
> Dallas (Frontend), build the dashboard layout first.
> When you're done, Kane (Backend) will add the data binding.
```

### 4. Stack Decisions in Your Prompt

Decisions made early prevent agents from asking questions later.

```
> Here are the rules for this sprint:
> - Always use TypeScript strict mode
> - Component file names are PascalCase, never kebab-case
> - All exports are named (no default exports)
> - React hooks only, no class components
> 
> Frontend team, build the form components. These rules are permanent.
```

These go into `decisions.md` automatically. Future agents read them before working.

### 5. Use Bullet Points for Multi-Part Tasks

Agents process lists better than paragraphs.

```
❌ "We need to update the user model to include profile fields like bio and avatar 
   and we should also add validation for those fields and write tests."

✅ "Update the user model:
   - Add bio (string, 500 char max)
   - Add avatar (string, URL)
   - Add phoneNumber (string, optional, E.164 format)
   - Validate all fields
   - Write test cases for validation edge cases"
```

---

## When to Use Direct Commands vs Team Requests

### Use Direct Commands (Name an Agent)

When the work is **sequential** or **highly specialized**.

```
> Keaton, review this PR for architectural fit.
```

| Use Case | Example | Why |
|----------|---------|-----|
| Code review | "Keaton, review the auth endpoints" | Only the lead does design review |
| Specialized skill | "Felix, optimize the database queries" | The performance expert works alone |
| Fix a specific mistake | "Dallas, fix the button styling" | Don't spawn the whole team for one file |
| Unblock someone | "Kane, help Lambert debug the test failure" | Point conversation between two agents |

### Use Team Requests (Say "Team")

When the work is **parallel** or **cross-functional**.

```
> Team, build the checkout flow.
```

| Use Case | Example | Why |
|----------|---------|-----|
| New feature | "Team, build the search feature" | Frontend, backend, tests all start together |
| Sprint planning | "Team, plan the next two weeks" | Lead scopes, backend estimates, tester defines test cases |
| Problem-solving | "Team, we have a performance problem — investigate" | Frontend measures, backend profiles, infra checks caching |
| Iteration round | "Team, fix the feedback from the design review" | Multiple people can tackle different issues in parallel |

### Use General Requests (No Name)

When you don't care who handles it, or when it's context-dependent.

```
> Add error logging to the API.
```

Squad routes this intelligently. Could be backend, could be ops, depends on team.

---

## Getting the Most Out of Parallel Work

### 1. Wait for Work to Complete Before Following Up

Squad agents chain their own work. When you give a task, **don't interrupt**.

```
You:  "Team, build the login page."
      [Squad spawns frontend, backend, tester, lead]
      [Frontend finishes UI, backend finishes endpoints, tester writes test cases]
      
      [Test failures show up → backend picks them up automatically]
      [Tester finds edge cases → backend fixes them → tester re-runs]

      [5 minutes later, everything is done]
```

If you jump in after 2 minutes with "Did you test the form submission?", you break the chain. Let it finish.

### 2. Check the Work Log, Not the Output

When agents finish a batch, read the logs, not the code.

```
> What did the team just do?
```

This asks Scribe to summarize. You'll see:
- What was built
- What decisions were made
- What's left to do
- What surprised them

Much faster than reading 5 agent outputs.

### 3. Run Ralph When the Board is Full

If you have a backlog of issues or PRs, let Ralph process them.

```
> Ralph, go
```

Ralph will:
1. Triage untriaged issues
2. Assign to team members
3. Spawn agents to work through them
4. Report progress every 3-5 rounds
5. Keep going until the board is clear

You can keep using the team for urgent work while Ralph grinds through the backlog.

### 4. Use Parallel Decision-Making

Agents can write decisions in parallel (they go to `/decisions/inbox/`). Scribe merges them.

```
You: "Frontend team, decide on component structure. 
      Backend team, decide on API versioning. 
      Both write your decisions to decisions.md. Don't wait for each other."

[Frontend writes decision about component structure]
[Backend writes decision about API versioning]
[Both decisions merge automatically via Scribe]
[Every agent reads both before the next task]
```

This prevents "we decided different things" surprises.

---

## Tips for Working with Ralph (Work Monitor)

### 1. Activate Ralph When You Have Backlog

Ralph is most useful when you have open issues.

```
> Ralph, start monitoring
```

Ralph will:
- Check GitHub Issues for untriaged work
- Ask the Lead to triage
- Assign issues to team members
- Spawn agents to work through them
- Report every 3 rounds

### 2. Give Ralph a Scope If Needed

By default, Ralph monitors issues, PRs, and CI.

```
> Ralph, scope: just issues
```

Useful when:
- You're in the middle of a PR and don't want Ralph to merge it yet
- You only care about triaging issues, not closing them
- You want to focus on one type of work

### 3. Ralph Reports Automatically Every 3-5 Rounds

Don't ask for status — Ralph tells you.

```
🔄 Ralph: Round 3 complete.
   ✅ 2 issues closed, 1 PR merged
   📋 3 items remaining: #42, #45, PR #12
   Continuing... (say "Ralph, idle" to stop)
```

When you see this, you can:
- Let Ralph keep working (he will)
- Say "Ralph, idle" to stop
- Jump in with a different task
- Check a specific issue

### 4. Use Ralph Between Sessions

The `squad-heartbeat` workflow runs every 30 minutes (or on your schedule).

Ralph will:
- Triage new issues
- Assign them to team members
- Trigger `@copilot` if you have the coding agent enabled

This means your squad works even when you're not at the keyboard.

### 5. Check Ralph's Status Before Wrapping Up

```
> Ralph, status
```

Ralph does one check and reports:

```
📊 Board Status:
   🔴 Untriaged:    0 issues need triage
   🟡 In Progress:  1 issue assigned, 0 draft PRs
   🟢 Ready:        0 PRs approved
   ✅ Done:         7 issues closed this session
```

If the board is clean, you can wrap up. If there's work, start Ralph for the next session.

---

## Managing Decisions and Team Memory

### 1. Set Permanent Rules Early

The first or second session, establish conventions.

```
> Here are the permanent rules for this team:
> - Always use TypeScript strict mode
> - Component naming: PascalCase (never kebab-case)
> - All exports are named exports (no defaults)
> - Test coverage must be > 80%
> - PR must have at least one review before merge
```

These go to `decisions.md`. Every agent reads them before working. **You only have to say them once.**

### 2. Use User Directives for "Never Again" Lessons

When an agent makes a mistake, turn it into a directive.

```
> Never use inline styles. Use CSS classes instead.
> Always validate user input on the backend, not just the frontend.
> Never commit environment variables to git.
```

These get stored as directives and agents follow them automatically in future sessions.

### 3. Check decisions.md When Agents Disagree

If Frontend does something one way and Backend does it another way, the decision is usually missing.

```
Agent A: "I used kebab-case for the file names"
Agent B: "I used PascalCase for the file names"

[You check .squad/decisions.md]
[No decision about file naming conventions]

> Here's the permanent rule: all component files are PascalCase.
```

Now it's in the shared brain. Next agent to work on components will see this.

### 4. Archive Outdated Decisions

When a decision no longer applies, move it to a "Superseded" section.

You can edit `.squad/decisions.md` directly:

```markdown
## Superseded Decisions

- **File naming (v1)**: "All files kebab-case" — SUPERSEDED by PascalCase convention in v2
- **API versioning (v1)**: "Use URL paths for versioning" — SUPERSEDED by headers-based versioning

## Active Decisions
...
```

Agents know to ignore "Superseded" sections.

### 5. Let Scribe Handle Decision Merging

Agents write decisions to `/decisions/inbox/`, Scribe merges them into `/decisions.md`.

You don't have to manually merge. Just ask:

```
> Scribe, merge pending decisions
```

Scribe will:
- Read all files in `/decisions/inbox/`
- Merge them into the canonical `decisions.md`
- Deduplicate overlaps
- Clean up the inbox

This happens automatically in mature teams, but you can force it anytime.

### 6. Personal History Files Build Over Time

Each agent's `.squad/agents/{name}/history.md` grows with every session. Check it when an agent seems lost.

```
[Dallas's history shows]
- React expertise: hooks, context, performance patterns
- Knowledge of routing: react-router v6
- Knows about the design system: established in session 3
- Familiar with the component structure: 50+ components in src/components/
```

If an agent keeps asking "where are the components?", their history might not have the right info. Edit it directly or remind them:

```
> Dallas, your last 5 sessions were all in the same component library. 
> Check your history.md for the path.
```

---

## Common Pitfalls and How to Avoid Them

### Pitfall 1: Vague Scope = Agents Ask Questions Instead of Building

**Problem:** "Build the API" — unclear what endpoints, what data model, what auth.

**Solution:** Be specific. Agents will ask if unclear, but clarity upfront saves rounds.

```
✅ "Build a REST API for a recipe app. Endpoints: /recipes (list, create), 
   /recipes/:id (get, update, delete), /recipes/:id/ingredients (list, add). 
   Auth via JWT. Database: PostgreSQL."
```

### Pitfall 2: Interrupting Parallel Work

**Problem:** You give a task to the team, then jump in after 2 minutes with a follow-up question.

**Solution:** Let parallel work finish. Squad agents chain automatically. Your interruption breaks the chain.

```
❌ You: "Team, build the checkout page"
   [2 minutes later]
   You: "Did you test the payment flow yet?"
   
✅ You: "Team, build the checkout page"
   [Wait for them to finish]
   You: "What did you build?"
```

### Pitfall 3: Forgetting That Decisions Persist

**Problem:** You set a rule in session 1, forget about it, contradict it in session 5.

**Solution:** Read `decisions.md` at the start of every session, or ask Scribe:

```
> Scribe, remind me of the permanent rules.
```

### Pitfall 4: Not Using Ralph on a Full Backlog

**Problem:** You have 10 open issues, but you keep working on small tasks manually.

**Solution:** Use Ralph for the backlog, stay focused on urgent work.

```
> Ralph, start monitoring. I'm going to focus on the payment bug.
```

Ralph handles the backlog, you handle the critical path.

### Pitfall 5: Too Many Agents at Once

**Problem:** You spawn a huge team and context gets confusing.

**Solution:** Start small. 4-5 agents is a good team. Add specialists only when needed.

```
✅ "Start with Lead, Frontend, Backend, Tester. If we need DevOps later, we'll add them."

❌ "I want Lead, Frontend, Backend, Tester, DevOps, Data Engineer, Designer, and a Scribe."
```

### Pitfall 6: Lost Work Because You Didn't Commit `.squad/`

**Problem:** You deleted the repo and lost all your team knowledge.

**Solution:** **Commit `.squad/` to git.** It's permanent team memory.

```bash
git add .squad/
git commit -m "Add squad team state"
git push
```

Now anyone who clones the repo gets your team with all their learned knowledge.

### Pitfall 7: Agents Stuck on the Same Mistake

**Problem:** An agent keeps making the same error even though you fixed it in session 3.

**Solution:** The decision might not be in `decisions.md`. Add it.

```
> Agent keeps importing with `require` instead of `import`. 
> Here's the rule: Always use ES6 import/export syntax.
```

This goes to `decisions.md`. Next time that agent works, they'll read it.

### Pitfall 8: Ralph Running Out of Work Too Quietly

**Problem:** Ralph finishes all the work but doesn't tell you, so you think he's still working.

**Solution:** Ralph reports every 3-5 rounds. If you don't see a report in a while, ask:

```
> Ralph, status
```

Ralph will check once and report. If the board is empty, you know you're done.

---

## Advanced Patterns

### Pattern 1: Decision First, Implementation Second

Before any agent writes code, the team agrees on the design.

```
> Team, design the user model. Don't code yet. 
> Frontend, what fields do you need? Backend, what do you need to persist? 
> Tester, what are the validation edge cases? 
> Write your decisions to decisions.md.

[Team agrees on the design]

> Team, now build it.
```

This prevents "we built different things" surprises.

### Pattern 2: Run Two Parallel Teams on One Repo

If you have a large project, you can run one team on one feature, another team on another.

```
Squad 1: "Team A, build the admin dashboard. You own features/admin/."
Squad 2: "Team B, build the mobile app. You own features/mobile/."

[Both teams work in parallel]
[Shared decisions in .squad/decisions.md prevent conflicts]
```

Requires good routing rules and clear ownership, but it works.

### Pattern 3: Spike → Decision → Build

For hard problems, do a spike first.

```
> Keaton (Lead), do a spike on authentication patterns for this stack. 
> Spend 30 minutes exploring. Write your findings to a decision.

[Keaton researches, writes decision about auth strategy]

> Team, now build the auth system using the strategy Keaton decided.
```

This prevents agents from building the wrong thing.

### Pattern 4: Post-Mortem Decisions

When something goes wrong, capture the lesson.

```
> The API is returning user passwords in the response. This was a mistake.
> Here's the rule going forward: Never include password fields in API responses.
```

This prevents it from happening again.

---

## Prompts You Can Copy

### Getting Started

```
I'm building [brief description]. Set up the team.
Stack: [language, framework, database]
Key requirements:
- [requirement 1]
- [requirement 2]
- [requirement 3]
```

### Asking for Status

```
What did the team accomplish last session? Any blockers?
```

### Parallel Work on Different Features

```
Team, I want you to work on two things in parallel:

Feature A (Frontend + Backend):
- [spec]

Feature B (Backend + Tester):
- [spec]

Divide the team. Start both immediately.
```

### Spike Before Building

```
Keaton, do a 20-minute spike on [problem]. 
Research [specific areas]. 
Write a decision with your recommendation.
When you're done, tell me what you learned.
```

### Closing a Phase

```
Team, we're closing the MVP phase. 
Keaton, what's the current architecture?
Kane, what's left to do on the backend?
Dallas, what UX work is pending?
Lambert, what tests are missing?

Write your summary to history.md.
```

---

## Session Flow Template

A typical high-performing session:

1. **Start:** Open Copilot, say "Team" or name an agent
2. **Set context:** Describe the work (scope, decisions, rules)
3. **Parallel execution:** Let agents work (don't interrupt)
4. **Check logs:** Ask Scribe what happened while you were reading code
5. **Next round:** Based on what Scribe told you, give follow-up work or start Ralph
6. **Wrap up:** Ask Ralph for status, commit `.squad/`, go home

**Time to productive work: usually < 2 minutes.**

---

## Reference: Who Does What

When you're unsure who to ask:

| Task | Ask | Why |
|------|-----|-----|
| Architecture review | Lead (Keaton) | Design decisions are the lead's job |
| Fix a feature | The assigned agent | They know the context |
| Debug a test | Tester + Backend | Usually a logic error or missing setup |
| Design decision | Team (parallel) | All perspectives needed |
| Code review | Lead | Final arbiter |
| What happened last session? | Scribe | Scribe tracks everything |
| What's on the backlog? | Ralph | Ralph monitors the board |
| New decision | Any agent can propose, Scribe merges | Decisions are shared |
| Edit decisions.md | You or Scribe | Plain markdown, editable anytime |

