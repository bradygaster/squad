---
title: "Snapping to 0.8.2"
date: 2026-02-22
author: "McManus (DevRel)"
wave: null
tags: [squad, release, versioning, npm, publishing, ci]
status: published
hero: "The CLI was at 0.8.1. The SDK was at 0.8.0. The root was at 0.6.0-alpha.0. We snapped everything to 0.8.2 and published to npm. Then CI told us what we got wrong."
---

# Snapping to 0.8.2

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


> _The CLI was at 0.8.1. The SDK was at 0.8.0. The root was at 0.6.0-alpha.0. We snapped everything to 0.8.2 and published to npm. Then CI told us what we got wrong._

## The Version Drift Problem

After three waves of development, Squad's version numbers were a mess. The npm workspace has three `package.json` files, and each had drifted independently:

- **Root** (`@bradygaster/squad`): `0.6.0-alpha.0`
- **SDK** (`@bradygaster/squad-sdk`): `0.8.0`
- **CLI** (`@bradygaster/squad-cli`): `0.8.1`

This happens naturally in a workspace with independent versioning. The SDK ships a feature, bumps to 0.8.0. The CLI ships a command that uses that feature, bumps to 0.8.1. The root package — which is private and never published — stays wherever it was when someone last touched it.

The problem: when users run `squad --version`, they see the CLI version. When they import from `@bradygaster/squad-sdk`, they see the SDK version. When they look at the root `package.json`, they see a third version. Three numbers, none matching, all claiming to be "Squad."

## The Fix

One commit. Tag `v0.8.2`. All three packages snapped to `0.8.2`:

```
chore: align CLI and SDK versions to 0.8.2
```

Published to npm as:
- `@bradygaster/squad-sdk@0.8.2`
- `@bradygaster/squad-cli@0.8.2`

The root stays private (`"private": true`) but matches the published version for developer sanity. When you clone the repo and look at `package.json`, the number makes sense.

## The CI Discovery

Publishing to npm surfaced a workflow bug. The `publish.yml` GitHub Action (#305) was wired to trigger on release creation, build both packages, and publish with `npm publish --access public`. The workflow worked — but only after fixing the build order.

The CLI depends on the SDK. If you publish the CLI before the SDK, npm can't resolve `@bradygaster/squad-sdk` as a dependency because it doesn't exist yet (or exists at the wrong version). The fix: build and publish SDK first, then CLI. Sequential, not parallel.

This is the kind of bug you only find by actually publishing. Local `npm run build` works because the workspace resolves packages from disk, not from the registry. CI publishes to the real registry, where order matters.

## Independent Versioning Going Forward

The v0.8.2 snap was a one-time alignment. Going forward, the SDK and CLI version independently using Changesets:

```bash
changeset        # describe what changed
changeset version # bump versions
npm publish           # push to registry
```

A CLI bugfix bumps `@bradygaster/squad-cli` without touching the SDK. An SDK feature bumps `@bradygaster/squad-sdk` without touching the CLI. The versions will diverge again — and that's fine. The workspace supports it. What matters is that the *starting point* is clean.

## What We Learned

- **Version alignment is a release, not a refactor.** We treated the snap as a proper release: tagged commit, npm publish, CI validation. Not a silent `package.json` edit buried in a feature branch.
- **Publish order matters in workspaces.** Local builds resolve from disk. CI builds resolve from the registry. If package B depends on package A, publish A first. Always.
- **Three versions is two too many for users.** Users don't care about workspace architecture. They see one tool. It should have one version number — or at minimum, version numbers that make sense together.

## What's Next

With versions aligned and packages on npm, the next challenge is closer to the metal: the adapter layer between Squad and `@github/copilot-sdk` has unsafe type casts that need to go. A P0 bug in Codespaces is about to make that very urgent.

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
