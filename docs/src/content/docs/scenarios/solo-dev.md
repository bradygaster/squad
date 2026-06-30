# Squad for Solo Developers
**Try this:**
```
I'm working alone on a side project — set up a minimal squad to help with code review and testing
```
Squad gives solo devs what they're missing: code review, test coverage, and architectural second opinions. Start with 3 agents instead of 5.
---
## 1. Why Squad Works for Solo Devs
When you're working alone:
- **No code reviews.** Bugs land in production because no one else looked.
- **No testing discipline.** You skip tests when you're in a hurry.
- **No second opinion.** Architectural decisions go unchallenged.
Squad gives you a **Lead who reviews everything**, a **tester who catches edge cases**, and **specialists who know their domain**. You're one person, but you have a team that remembers everything.
---
## 2. Start Small: 3 Agents Instead of 5
You don't need a full 5-agent team as a solo dev. Customize the roster:
```
> I'm a solo developer building a Python API. I want a small team:
> a Lead for code review, one backend dev, and a tester. No frontend dev.
```
```
Here's your team:
🏗️  Michael  — Lead          Code review, scope, decisions
🔧  Fredo    — Backend Dev   Python, FastAPI, database work
🧪  Kay      — Tester        Tests, edge cases, quality
📋  Scribe   — (silent)      Memory, decisions, session logs
Look right?
```
Lean team. Just what you need.
---
## 3. The Reviewer Protocol Catches Bugs
When you give a task to an agent:
```
> Fredo, add user registration with email verification.
```
Fredo builds it. **Then Michael (the Lead) automatically reviews the code.**
```
🏗️ Michael — reviewing Fredo's user registration implementation
Issues found:
  - Email validation regex allows invalid TLDs
  - Verification tokens aren't rate-limited — brute force risk
  - No test for expired token edge case
Rejected. Fredo, address these issues.
```
This is the safety net you don't have as a solo dev. Michael catches issues before they land.
---
## 4. Skills Accumulate — You Don't Repeat Mistakes
After Michael rejects Fredo's code for missing rate limiting, **it gets encoded as a skill**:
`.copilot/skills/auth-rate-limiting.md`:
```markdown
# Authentication Endpoints Must Be Rate-Limited
When building user-facing auth flows (login, registration, password reset,
email verification), always add rate limiting to prevent brute force attacks.
Use a token bucket or sliding window algorithm. Store counters in Redis
or an in-memory cache with TTL.
```
Next time any agent builds an auth feature, they read this skill first. The mistake doesn't happen again.
---
## 5. You're Solo, But Your Team Remembers Everything
As a solo dev, you juggle dozens of context switches. Squad doesn't forget:
- **Decisions** are logged. "Why did I use PostgreSQL instead of MongoDB?" — check `.squad/decisions.md`.
- **Skills** capture patterns. "How do I structure FastAPI routes?" — check `.copilot/skills/`.
- **Histories** track what each agent learned. Fredo knows your database schema after one session.
You get back to a project after 3 weeks, and the team is still up to speed.
---
## 6. Workflow: Solo Dev + Squad
```
> Fredo, add a /users endpoint with pagination and filtering.
```
Fredo builds it. Michael reviews. Kay writes tests.
```
🔧 Fredo   — building /users endpoint with pagination and filtering
🏗️ Michael — reviewing Fredo's implementation
🧪 Kay     — writing tests for /users endpoint
```
All three work in parallel. You give one prompt, get three agents.
When it's done:
```
✅ /users endpoint implemented
✅ Code review passed (minor refactor for query optimization)
✅ 8 tests written (pagination, filtering, edge cases)
```
You're a solo dev, but you shipped like a team.
---
## 7. Use the Lead as a Sounding Board
```
> Michael, I'm deciding between REST and GraphQL for this API.
> It's a read-heavy app with a mobile client. Thoughts?
```
```
🏗️ Michael — evaluating REST vs GraphQL for your use case
REST pros: Simple, cacheable, mobile SDKs abundant
GraphQL pros: Flexible queries, reduces round trips
For a read-heavy app with a mobile client, I'd lean REST.
You get better HTTP caching (CDN, browser, mobile OS),
simpler mobile integration, and fewer surprises at scale.
If your mobile app needs highly dynamic queries, revisit GraphQL.
```
Michael's not always right, but having a second opinion is invaluable.
---
## Tips
- **Start with 3–4 agents.** You don't need a frontend and backend specialist if you're only building one layer.
- **The Lead is your reviewer.** Use them to review your own code before committing.
- **Skills are YOUR documentation.** After 10 sessions, `.copilot/skills/` is a custom knowledge base.
- **Agents work while you're thinking.** Give a vague task and agents research in parallel.
- **You get testing discipline.** The Tester writes tests you'd skip. Coverage goes up without extra effort.
