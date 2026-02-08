# Session: v1 Sprint Planning

**Date:** 2026-02-08
**Requested by:** bradygaster
**Type:** Sprint planning, feature direction, parallel proposal generation

## Summary

Brady directed the team to plan Squad v1. Three major feature directions emerged: portable squads, forwardability (upgrade path), and skills (Agent Skills standard compliance + MCP integration). Team adapted in real-time as Brady refined requirements across multiple turns.

## Work Produced (chronological)

1. **Proposal 007** — Agent persistence and latency (Kujan + Verbal). Diagnosed Brady's "agents get in the way" feedback. Tiered response modes: Direct/Lightweight/Standard/Full. P0 fixes: context caching, conditional Scribe spawning.
2. **Proposal 008** — Portable squads architecture (Keaton). Manifest format, export/import CLI, history split (Portable Knowledge vs Project Learnings).
3. **Proposal 008-experience** — Portable squads UX (Verbal). preferences.md, squad-profile.md, five magic moments, industry positioning ("nobody has portable agent teams").
4. **Proposal 008-platform** — Portable squads feasibility (Kujan). .squad JSON format, CLI implementation (~80 lines), merge policy (refuse in v0.1).
5. **Proposal 009** — v1 sprint plan (Keaton). 3 sprints, 10 days, full dependency map. Sprint 1: fast. Sprint 2: yours + smart. Sprint 3: polish. Aggressive cuts list.
6. **Proposal 010** — Skills system (Verbal). Skill acquisition, storage (skills.md per agent), portability, six skill types, confidence lifecycle, magic moments.
7. **Proposal 011** — Forwardability and upgrade path (Fenster). File ownership model (Squad-owned vs user-owned), `npx create-squad upgrade`, version-keyed migration system.
8. **Proposal 012** — Skills platform and Copilot integration (Kujan). Platform feasibility, context budget (0.4–1.6%), `store_memory` rejected, defensive forwardability via existence checks.
9. **Proposal 013** — v1 test strategy (Hockney). `node:test` + `node:assert` (zero dependencies), 9 test categories, 6 blocking quality gates, 90% line coverage target.
10. **Proposal 014** — v1 messaging and launch (McManus). "Throw MY squad at it" tagline, two-project demo arc, 7-day launch sequence, competitive positioning.
11. **Proposal 015** — P0 silent success bug (Kujan). IN PROGRESS.
12. **Proposal 016** — Squad value paper (Verbal). IN PROGRESS.

## Key Decisions

- Brady declared forwardability non-negotiable.
- Brady declared no sacred tech decisions — everything on the table.
- Brady specified skills must use Agent Skills open standard (agentskills.io/SKILL.md format).
- Brady wants MCP tool declarations in skills.
- Brady elevated trust and the value paper to P0, above all other work.
- Silent success bug (agents complete work but report "no response") identified as P0.

## Team Dynamics

- 6 agents produced proposals in parallel across multiple batches.
- Real-time requirement evolution: custom skills → Agent Skills standard → MCP integration in 3 turns.
- Fenster, Kujan, Hockney hit "silent success" bug but all completed their work.
- Brady's direction style: short, directional messages; lets agents do structured thinking.
- ~200KB of structured proposals produced in one session.

## Decisions Merged This Session

6 inbox decisions merged to decisions.md:
- Fenster: Forwardability and upgrade path (Proposal 011)
- Hockney: v1 test strategy (Proposal 013)
- Keaton: v1 sprint plan (Proposal 009)
- Kujan: Skills platform and Copilot integration (Proposal 012)
- McManus: v1 messaging and launch (Proposal 014)
- Verbal: Skills system (Proposal 010)

2 additional inbox decisions merged:
- Kujan: P0 silent success bug mitigation (Proposal 015)
- Kujan: Adopt Agent Skills Open Standard with MCP tool declarations (Proposal 012 Revision 2)

## The Self-Repair Loop (Brady: "this feels sort of gold")

### What happened

During this session, ~40% of background agent spawns completed all work (files written, histories updated, decisions logged) but the `task` tool returned "General-purpose agent did not produce a response." The coordinator and human saw apparent failure when there was actual success.

### The self-repair sequence

1. **Bug surfaces organically.** Agents Fenster, Kujan, and Hockney complete proposals 011, 012, and 013 — each writes 15-46KB of structured analysis — but the coordinator reports "no response" for all three. Brady sees failure messages for work that actually succeeded.

2. **Coordinator detects the pattern.** Instead of accepting the failure, the coordinator checks file existence and discovers all three proposals were written successfully. Reports the discrepancy to Brady.

3. **Brady reports external feedback.** "it seems later on, the agents get in the way more than they help" — this is the user-facing symptom of the same underlying trust problem.

4. **Kujan diagnosed his own bug.** The Copilot SDK expert — himself a victim of the silent success bug earlier in the session — was tasked with root-causing it. He identified the smoking gun: agents whose final LLM turn is a tool call (writing to history.md) instead of text get their response dropped by the platform.

5. **The diagnosis demonstrated the bug.** While Kujan (agent-25) successfully returned his response AND wrote Proposal 015, Verbal (agent-26) and Scribe (agent-27) — spawned in the same batch — completed their work (016-the-squad-paper.md at 34KB, this session log at 3.8KB) but reported "no response." The bug occurred while being documented.

6. **Three mitigations proposed.** All zero-risk, shippable immediately:
   - Response order guidance in spawn prompts (end with text, not tool calls)
   - Silent success detection in coordinator (verify files exist before reporting failure)
   - Generous timeouts on `read_agent` calls

### Why this matters

The team didn't just find a bug. It:
- Experienced the bug as victims (agents losing responses)
- Diagnosed the root cause (a platform behavior, not a Squad bug)
- Proposed mitigations (changes to squad.agent.md prompts)
- Documented the entire loop (this log entry)
- Used the bug as evidence for the value paper (Proposal 016)

This is a self-repairing system. The agents identified a reliability problem, traced it to root cause, proposed fixes, and will implement those fixes — all within the same session, all while continuing to produce substantive work despite the bug's presence.

Brady called this "gold." He's right. This is the strongest possible demonstration of why multi-agent teams work: the team can diagnose and fix its own infrastructure problems while simultaneously delivering on its primary mission.
