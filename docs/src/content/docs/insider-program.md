# Insider Program

Get early access to Squad development builds and shape the future of the project.

---

## What Is the Insider Program?

The Insider Program gives you continuous access to development builds of Squad. Insiders run code published from the `dev` branch — the bleeding edge where new features land first. It's a lightweight, honor-system program designed for developers who want to:

- **Try new features early** — Before they ship in a release
- **Help catch bugs** — Report issues before they reach stable versions
- **Shape the roadmap** — Your feedback directly influences what we build next
- **Move fast** — No waiting for monthly releases; updates flow as commits land

---

## How It Works

Insider builds are published from the `dev` branch to the npm `insider` dist-tag via a manual workflow dispatch. There is no separate `insider` branch — `dev` is the single source of truth for all development.

```
dev (development)  → npm @insider tag (on demand)
  ↓
preview (staging)  → release candidate validation
  ↓
main (stable)      → npm @latest tag
```

---

## How to Install and Upgrade

### Install Insider Build

```bash
npm install -g @bradygaster/squad-cli@insider
```

### Upgrade Existing Repo to Insider

```bash
npm install -g @bradygaster/squad-cli@insider
squad upgrade
```

This updates Squad-owned files (`squad.agent.md`, workflows, templates) to the latest insider build. Your `.squad/` team state (agents, decisions, casting, history) is always preserved.

### Self-Upgrade to Insider

```bash
squad upgrade --self --insider
```

---

## What to Expect

### You'll Get

- **Continuous updates** — Insider publishes from `dev` whenever maintainers trigger it
- **New features** — Preview functionality before stable releases
- **Direct access** — Install latest with a single command
- **Community input** — Your feedback shapes prioritization

### You Might Hit

- **Rough edges** — Features may not be fully polished
- **Occasional bugs** — Development builds are less tested than releases
- **Breaking changes** — API surface may shift between insider versions
- **Missing documentation** — New features may not have guides yet

**This is expected.** The insider program trades stability for speed.

---

## Reporting Issues

Found a bug? We want to hear about it.

**Open a GitHub issue** with:

1. **Version** — Full version from `squad --version`
2. **What happened** — Clear description of the bug
3. **Steps to reproduce** — Exact steps to trigger it
4. **Environment** — CLI or VS Code, Node version, OS

**Label it with `[INSIDER]`** so we can track insider-specific issues.

---

## Opting Out

Want to go back to stable releases?

```bash
npm install -g @bradygaster/squad-cli@latest
```

This installs the latest stable version. Your `.squad/` state is safe — it'll work with any version.

---

## FAQ

### Q: Will insider builds break my project?

**A:** Unlikely, but possible. Insider builds from `dev` are tested via CI, but less stable than releases. Make sure you can roll back if needed.

### Q: Can I switch between insider and stable builds?

**A:** Yes. Insider builds are backward compatible with stable installs. Your `.squad/` directory works with any version.

### Q: How often do insider builds update?

**A:** Whenever maintainers trigger the insider publish workflow from `dev`. Run `npm install -g @bradygaster/squad-cli@insider` again to fetch the latest.

### Q: Will my team state be preserved?

**A:** Yes. `.squad/` is never overwritten on upgrade. All your agents, decisions, and histories are safe.

### Q: What if an insider build has a bad bug?

**A:** Roll back immediately:

```bash
npm install -g @bradygaster/squad-cli@latest   # Back to stable
squad upgrade                                   # Apply stable version
```

Then [report the issue](https://github.com/bradygaster/squad/issues).

---

## Thank You

Insiders help us ship better software. Your bug reports, feature requests, and feedback make Squad stronger. Thank you for being part of the journey.

Have questions? [Start a discussion](https://github.com/bradygaster/squad/discussions).
