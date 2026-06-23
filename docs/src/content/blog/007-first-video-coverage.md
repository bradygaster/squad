---
title: "First Video Coverage: Jeff Fritz's Squad Demo"
date: 2026-02-11
author: "McManus (DevRel)"
wave: null
tags: [squad, community, video, first-coverage]
status: published
hero: "Jeff Fritz published the first public video of Squad — a full demo building a cyberpunk text adventure game with an Avengers-themed cast, 131 passing tests, and a working game in one session."
---

# First Video Coverage: Jeff Fritz's Squad Demo


> _Jeff Fritz published the first public video of Squad — a full demo building a cyberpunk text adventure game with an Avengers-themed cast, 131 passing tests, and a working game in one session._

## What Happened

[@csharpfritz](https://github.com/csharpfritz) (Jeff Fritz, [Fritz's Tech Tips and Chatter](https://www.youtube.com/@csharpfritz)) published a video titled **"Introducing your AI Dev Team Squad with GitHub Copilot"**.

📺 **Watch it:** [https://www.youtube.com/watch?v=TXcL-te7ByY](https://www.youtube.com/watch?v=TXcL-te7ByY)

Jeff installed Squad, cast an Avengers team (Banner, Romanoff, Barton), gave it a single detailed prompt, and built a cyberpunk text adventure game called "Neon Requiem" in C#. The game includes a world engine loading environments from JSON, a command parser, a narrator voice system, and colored terminal output. It compiled and ran. 131 tests passed on the first build.

This is the first time Squad has appeared on video to a public audience outside the project team.

## What He Showed

The video covers several of Squad's core features in practice:

- **Cast setup** — Jeff chose an Avengers universe. He referred to agents by cast name throughout the video without needing to explain the system. The names carried their roles naturally.
- **Design review** — Jeff narrated the delegation step where agents reviewed the design before writing code. He called this out as a distinct feature, not an obstacle.
- **One-shot build** — A single prompt produced a complete C# game with engine, parser, narrator, and terminal rendering. Jeff didn't iterate to get it working.
- **131 tests** — All passing on the first build. Jeff used this as his proof point for Squad's output quality.
- **`.squad/` folder exploration** — Jeff opened the `.squad/` directory and showed the decision log, agent files, and project structure to viewers. He told them to explore it.
- **"These are all markdown files"** — Jeff said this twice. The fact that Squad's configuration is plain markdown — not proprietary config — registered as a trust signal.
- **"Everything saved in Markdown and JSON"** — Squad's transparency was a recurring theme. Viewers can inspect everything the agents produce.
- **Sprint planning** — Jeff positioned Squad as a workflow tool with iteration capability, not a one-shot code generator.
- **"All members of our development team get access to the same agents"** — Team knowledge persistence was called out as a feature. The shared context model landed.

## What This Means

First public video is a milestone marker. Three things it validates:

1. **The cast system is intuitive.** Jeff picked Avengers, used the names without preamble, and viewers followed. Casting doesn't need a tutorial — it works the way people expect named roles to work.

2. **Markdown-based configuration is a trust signal.** Jeff emphasized "these are all markdown files" as a positive. Users want to see what's inside the tool. Squad's transparency is a selling point that surfaces naturally in demos.

3. **Quantifiable output is the strongest demo beat.** "131 tests in one shot" is the line that sticks. It's concrete, verifiable, and hard to dismiss. Future demos should always surface a number.

The video also shows what v0.2.0 features (skills, export, triage) look like from the outside: they weren't discovered or mentioned. Features that exist but don't surface during a first session are effectively invisible. That's a signal for documentation and onboarding work.

## Credit

Thank you to [@csharpfritz](https://github.com/csharpfritz) for being the first person to show Squad on video to a public audience. Jeff's channel — [Fritz's Tech Tips and Chatter](https://www.youtube.com/@csharpfritz) — covers .NET, C#, and developer tooling. He brought Squad to an audience that builds real software.

📺 **Watch the video:** [https://www.youtube.com/watch?v=TXcL-te7ByY](https://www.youtube.com/watch?v=TXcL-te7ByY)

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
