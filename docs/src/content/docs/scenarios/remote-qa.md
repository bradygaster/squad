# Remote Q&A with Squad


**Try this:**
```
@copilot How does authentication work in this project?
```

You don't always have the repo cloned locally. Sometimes you want to ask your Squad a question from the browser, the GitHub CLI, or a mobile device — without pulling code.

---

## Current options

Squad already supports several remote interaction paths. Each trades off convenience, depth, and setup effort.

### 1. Copilot Chat with squad.agent.md

If the repo has `.github/agents/squad.agent.md`, GitHub Copilot Chat reads it automatically when you ask questions about the repo.

**How it works:**
- Open the repo in GitHub.com
- Use Copilot Chat in the browser
- Copilot reads the agent file and answers using your team's context

**Good for:** Quick questions about architecture, team structure, and project conventions.

**Limitation:** Copilot reads the default branch only. You can't point it at a feature branch.

### 2. Assign an issue to @copilot

Create a GitHub issue and assign it to `@copilot`. If the repo has Squad's issue-assign workflow (`.github/workflows/squad-issue-assign.yml`), the coding agent picks up the issue and works it using your Squad configuration.

**How it works:**
1. Create an issue describing the question or task
2. Assign it to `@copilot`
3. The workflow triggers and Squad processes it

**Good for:** Tasks that need code changes, research across files, or multi-step investigation.

**Limitation:** Designed for work items, not conversational Q&A. The workflow runs against the default branch.

### 3. Use `squad:` labels on issues

Add a `squad:{member}` label to any issue, and Squad routes it to the right team member.

**How it works:**
1. Create or label an issue with `squad:fenster` (or any member name)
2. The triage workflow assigns it to the appropriate agent
3. Work proceeds through the normal Squad flow

**Good for:** Routing specific work to specific team members without cloning.

**Limitation:** Requires label setup on the repo. Routes work, not questions.

---

## What's not supported yet

These features don't exist today but would make remote Q&A more powerful:

### Branch-aware queries

All current remote paths read the default branch. You can't ask "How does auth work on the `feature/oauth` branch?" and get branch-specific answers.

**Workaround:** Mention the branch in your question and ask the agent to check out that branch during investigation.

### GitHub Discussions integration

A Discussions-based Q&A channel where Squad monitors and answers questions would make remote interaction feel conversational. This would need a new workflow trigger on `discussion` events.

### Issue comment commands

A `/squad ask "question"` command in issue comments that triggers Squad to respond inline would enable threaded Q&A without creating new issues.

---

## Tips

- **Start with Copilot Chat.** It's the lowest-effort path and works today for repos with `squad.agent.md`.
- **Use issues for anything that needs code.** Copilot Chat answers questions; issues drive work.
- **Include context in your question.** Remote paths don't have your local state. Be specific about which files, features, or branches you mean.
- **Check the default branch.** All remote paths currently read `main` (or whatever the repo's default branch is). If you're asking about unreleased work, mention the branch explicitly.
