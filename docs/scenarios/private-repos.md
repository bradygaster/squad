# Squad on Private Repositories — Privacy & Security

> **Try this:**  
> `"Set up Squad for a private repo with GitHub Enterprise"`  
> `"I need to know Squad's data security model"`

Squad runs entirely in your Copilot session. Nothing leaves your machine except what Copilot already does. Code stays local, no Squad-specific telemetry.

---

## 1. Where Squad Runs

Squad runs entirely in your Copilot session. Nothing leaves your machine except what Copilot already does.

---

## 1. Where Squad Runs

Squad is a **local agent** that runs in your GitHub Copilot CLI session. It doesn't phone home. It doesn't send data to a Squad server. It doesn't use external APIs.

When you run:

```bash
copilot
```

And select **Squad** from the `/agents` list, Squad runs **on your machine** using Copilot's infrastructure.

**What this means:**
- Your code stays local
- Squad sees what Copilot already sees (your repo, your files)
- No additional data transmission beyond Copilot's standard operation
- No Squad-specific telemetry or tracking

---

## 2. What's Stored in `.ai-team/`

Squad writes everything to `.ai-team/` in your repository:

```
.ai-team/
├── team.md              # Roster (agent names, roles)
├── routing.md           # Work routing rules
├── decisions.md         # Architectural decisions
├── casting-state.json   # Agent names, universe theme
├── skills/              # Generic best practices (23 files)
└── agents/
    ├── neo/
    │   ├── charter.md   # Neo's role definition
    │   └── history.md   # Neo's accumulated knowledge
    ├── trinity/
    │   ├── charter.md
    │   └── history.md
    └── ...
```

**You control what's committed.** If you don't want agent histories in your repo, add them to `.gitignore`:

```gitignore
.ai-team/agents/*/history.md
```

Now histories stay local. Charters, skills, and decisions are still committed.

---

## 3. Agent Histories May Contain Project-Specific Info

Agent histories (`history.md`) log what agents learned during sessions:

```markdown
## Session: 2025-07-15

### What I learned
- The users table has columns: id, email, created_at, role
- Auth middleware is in /server/middleware/auth.ts
- Passwords are hashed with bcrypt, salt rounds = 12
```

This is **project-specific knowledge**. If your repo is private and you want to keep it that way, **review histories before sharing exports**.

---

## 4. Skills Are Generic — Safe to Share

Skill files in `.ai-team/skills/` are **intentionally generic**:

`.ai-team/skills/auth-rate-limiting.md`:

```markdown
# Authentication Endpoints Must Be Rate-Limited

When building user-facing auth flows (login, registration, password reset,
email verification), always add rate limiting to prevent brute force attacks.

Use a token bucket or sliding window algorithm. Store counters in Redis
or an in-memory cache with TTL.
```

No project-specific details. No code references. No file paths.

**Skills are safe to share publicly.** They're best practices, not secrets.

---

## 5. Exporting Your Squad — What's Included

When you run:

```bash
npx github:bradygaster/squad export
```

The export includes:

✅ Roster (agent names, roles)  
✅ Charters (agent role definitions)  
✅ Skills (generic best practices)  
✅ Decisions (architectural reasoning)  
✅ Histories — **with project-specific details removed**  
✅ Casting state (agent names, universe)

**Squad strips project-specific info** from histories during export. What remains is **portable knowledge**:

- "Always validate input with Zod" ✅
- "The API is at /server/routes/api.ts" ❌ (removed)

The export is **safe to share** with other projects or teammates, but **review it first** if you're paranoid.

---

## 6. Labels and Workflows Use Standard GitHub APIs

Squad's GitHub Actions workflows (Ralph heartbeat, auto-assign) use GitHub's public APIs:

- **Issue labeling** — uses the GitHub Issues API with your repo's auth token
- **PR creation** — uses the GitHub Pull Requests API
- **Workflow dispatch** — uses the GitHub Actions API

No third-party services. No external webhooks. Just GitHub talking to GitHub.

**Your GitHub token permissions matter.** If your repo is private, make sure the token used by Actions has the appropriate permissions (`issues:write`, `pull_requests:write`).

---

## 7. What Squad DOESN'T Do

❌ Send code to a Squad server  
❌ Use external APIs for processing  
❌ Transmit telemetry or usage data  
❌ Store your team's knowledge in a cloud service  
❌ Require an account or API key (beyond your GitHub Copilot license)

Squad is **entirely local**. It's a GitHub Copilot agent, not a standalone service.

---

## 8. Private Repo Checklist

If your repository is private and you're security-conscious:

- [ ] **Review `.ai-team/agents/*/history.md`** — make sure no secrets or sensitive details are logged
- [ ] **Add `history.md` to `.gitignore`** if you don't want histories committed
- [ ] **Review exports before sharing** — check `squad-export-*.zip` for project-specific details
- [ ] **Audit `.ai-team/decisions.md`** — remove any decisions that reference internal systems or secrets
- [ ] **Use GitHub token permissions wisely** — don't give Actions more permissions than needed
- [ ] **Skills are public-safe** — feel free to share `.ai-team/skills/` publicly

---

## 9. Sample Prompts for Privacy-Conscious Usage

**Check what's in histories:**

```
> Scribe, show me what's in Neo's history. Are there any secrets
> or sensitive project details?
```

**Clean up histories before export:**

```
> Scribe, review all agent histories and remove any references to
> internal APIs, tokens, or database schemas before I export.
```

**Exclude histories from Git:**

```
> Add .ai-team/agents/*/history.md to .gitignore. I don't want
> agent histories committed.
```

**Audit decisions:**

```
> Show me all decisions in decisions.md. I want to check for
> anything we shouldn't share publicly.
```

---

## Tips

- **Squad runs in Copilot, not on a remote server.** Your code stays on your machine.
- **Review histories before exporting.** They may contain project-specific details you don't want to share.
- **Skills are generic by design.** They're safe to share publicly.
- **Use `.gitignore` for sensitive files.** If you don't want histories committed, exclude them.
- **GitHub Actions workflows use your repo's auth.** Make sure token permissions are scoped correctly.
- **No external services.** Squad doesn't phone home or send telemetry.
