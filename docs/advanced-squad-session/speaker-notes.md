# Advanced Squad Patterns — Speaker Notes

Target length: 45-60 minutes.

## Presenter stance

This is not a Squad introduction. Assume the audience already knows how to initialize and use Squad. The useful frame is:

> "The hard part is not giving agents memory. The hard part is deciding what gets loaded, when it expires, where it is stored, and how we prove it changed."

Keep the repo open beside the deck. The most important fallback files are:

- `outputs/15-context-budget-issue-1037.md`
- `outputs/18-governed-memory-pr-1145.md`
- `outputs/21-real-memory-session-extract.md`
- `outputs/12-two-layer-real-demo-transcript.txt`
- `outputs/13-two-layer-real-demo-branch-proof.txt`
- `outputs/14-two-layer-real-demo-commands.md`
- `outputs/16-split-agent-issue-1036.md`
- `outputs/19-context-slimming-pr-1035.md`
- `outputs/06-delegate-presets-evidence.txt`
- `outputs/20-fanout-squads-pr-1022.md`

## Slide-by-slide talk track

1. **Start with context** — Open with context as a finite data plane. Memory is architecture, not personalization.
2. **Issue #1037** — Show the token table. Say: "Full agents are slow agents."
3. **Memory loading as query plan** — Explain that every spawn needs a query plan for state, not a blind folder dump.
4. **Layer map** — Distinguish history, decisions, inbox, skills, governed memory, git notes, and orphan state.
5. **Governed memory model** — Explain classes and load guidance. This is the vocabulary architects need.
6. **Classifier boundary** — Classification happens before storage. FORBIDDEN/TRANSIENT content should not reach durable providers.
7. **Real memory proof** — Open `outputs/01-*` through `05-*` if challenged. Do not claim remote Copilot Memory.
8. **Session extract** — Open `outputs/21-real-memory-session-extract.md`; use PR #1145's baseline vs memory-governance diagnostic events.
9. **State pressure** — Use Tamir Part 7/7b essay analogy: don't send the teacher the essay plus private notes.
10. **Two-layer thesis** — Explain "why on this commit" vs durable mutable state.
11. **Activation** — `.squad/config.json` selects `stateBackend: "two-layer"`; `resolveStateBackend()` creates `TwoLayerBackend`.
12. **Real write proof** — Open transcript lines 29-51. Working tree stays clean; state lands in `squad-state`.
13. **Git notes proof** — Open transcript lines 54-60. The backend bulk note is real Git state.
14. **Caveat** — Be honest: `refs/notes/squad` collides with nested `refs/notes/squad/flight`; demo uses `squad-flight`.
15. **Promotion proof** — Open transcript lines 75-125. `promote_to_permanent` and `archive_on_close` become orphan files.
16. **Git log proof** — Show refs and logs. The proof is inspectable with normal Git commands.
17. **Context slimming** — #1036 framed the problem; PR #1035 implemented prompt/reference splitting.
18. **Presets** — Presets are reusable squad shapes, not state backups.
19. **Cross-squad contracts** — Manifests and issues, not shared internal state.
20. **Delegate** — `squad delegate` creates a GitHub issue after discovery and acceptance checks.
21. **Squads spawning squads** — HQ pattern; child squads are mission-scoped and evidence-bound.
22. **E2E feedback pattern** — Tie Holodeck testing to user-feedback squads.
23. **Takeaway** — Bounded context, typed memory, two-layer state, lazy references, presets, cross-squad contracts.

## Live proof commands

Use the real demo repo generated under the session workspace if it is still present:

```powershell
cd C:\Users\tamirdresher\.copilot\session-state\854abecd-cee7-42f6-972a-e5f6abbaf32d\files\two-layer-demo-repo
git log --oneline --decorate --graph main squad-state
git notes --ref=squad show 52ca56bcf65a9303e13c28c55a72a15c6ec70000
git notes --ref=squad-flight list
git show squad-state:promoted/squad-flight/385a57d0c516df5a7ed8e7577feea61be1390279.json
git show squad-state:archive/squad-flight/52ca56bcf65a9303e13c28c55a72a15c6ec70000.json
```

If the session workspace is gone, use the checked-in transcript and commands files.

## Claims to state carefully

- Issue #1037's token counts are issue-reported/proposal evidence, not universal benchmark numbers.
- Governed local memory is proven by CLI outputs. Real Copilot Memory provider persistence is not proven locally.
- `stateBackend: "external"` is currently a stub/fallback path in the SDK; use `squad externalize` for the implemented relocation path.
- The two-layer demo surfaced a real namespace collision between `refs/notes/squad` and `refs/notes/squad/flight`.
- Squads spawning squads is a pattern backed by PR #1022 and Tamir's posts; do not imply a fully managed fleet scheduler exists.
