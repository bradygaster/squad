# Insider Program

Get early access to Squad development builds and shape the future of the project.

---

## What Is the Insider Program?

The Insider Program gives you continuous access to development builds of Squad. Insiders run code from the `insider` branch — the bleeding edge where new features land first. It's a lightweight, honor-system program designed for developers who want to:

- **Try new features early** — Before they ship in a release
- **Help catch bugs** — Report issues before they reach stable versions
- **Shape the roadmap** — Your feedback directly influences what we build next
- **Move fast** — No waiting for monthly releases; updates flow as commits land

---

## How to Install

```bash
npx github:bradygaster/squad#insider
```

That's it. You're now on insider builds.

Run this same command periodically to get the latest updates. The `npx` cache pulls fresh code regularly, so you'll get new features as they're committed.

---

## What to Expect

### You'll Get

- **Continuous updates** — The insider branch is always ahead of `main`
- **New features** — Preview functionality months before stable releases
- **Direct access** — Pull latest with a single command
- **Community input** — Your feedback shapes prioritization

### You Might Hit

- **Rough edges** — Features may not be fully polished
- **Occasional bugs** — Development builds are less tested than releases
- **Breaking changes** — API surface may shift between insider versions
- **Missing documentation** — New features may not have guides yet

**This is expected.** The insider program trades stability for speed.

---

## Version Format

Insider builds use this version scheme:

```
v0.4.2-insider+abc1234f
```

Where:
- `v0.4.2` — The semver for the upcoming release
- `insider` — Insider build flag
- `abc1234f` — Commit hash (first 8 chars)

You'll see this in your `squad.agent.md` HTML version comment:

```markdown
<!-- version: v0.4.2-insider+abc1234f -->
```

---

## Reporting Issues

Found a bug? We want to hear about it.

**Open a GitHub issue** with:

1. **Version** — Full version from your `squad.agent.md`
2. **What happened** — Clear description of the bug
3. **Steps to reproduce** — Exact steps to trigger it
4. **Environment** — CLI or VS Code, Node version, OS

**Label it with `[INSIDER]`** so we can track insider-specific issues.

Example:

```
Title: [INSIDER] Squad crashes on init with Node 20

Version: v0.4.2-insider+abc1234f
Environment: CLI on macOS 14.1, Node 20.11.0

Steps:
1. npx github:bradygaster/squad#insider
2. Follow quick start
3. Error in squad.agent.md...
```

---

## Opting Out

Want to go back to stable releases?

```bash
npx github:bradygaster/squad
```

This installs the latest stable version. Your `.ai-team/` state is safe — it'll work with any version.

---

## FAQ

### Q: Will insider builds break my project?

**A:** Unlikely, but possible. The insider branch is tested before pushing, but it's less stable than releases. Make sure you can roll back if needed.

### Q: Can I switch between insider and stable builds?

**A:** Yes. Insider builds are backward compatible with stable installs. Your `.ai-team/` directory works with any version.

### Q: How often do insider builds update?

**A:** As often as commits land on the `insider` branch. Could be daily, could be weekly — depends on the dev cycle. Run the install command again to fetch the latest.

### Q: Will my team state be preserved?

**A:** Yes. `.ai-team/` is never overwritten on upgrade. All your agents, decisions, and histories are safe.

### Q: What if an insider build has a bad bug?

**A:** Roll back immediately:

```bash
npx github:bradygaster/squad                  # Back to stable
npx github:bradygaster/squad upgrade          # Apply stable version
```

Then [report the issue](https://github.com/bradygaster/squad/issues).

---

## Thank You

Insiders help us ship better software. Your bug reports, feature requests, and feedback make Squad stronger. Thank you for being part of the journey.

Have questions? [Start a discussion](https://github.com/bradygaster/squad/discussions).
