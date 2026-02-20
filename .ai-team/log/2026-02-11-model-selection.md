# Session: 2026-02-11 Model Selection

**Requested by:** Brady (bradygaster)

## What Happened

- Verbal implemented per-agent model selection in squad.agent.md
- Brady's directive applied: cost-first unless writing code
- Updated all spawn templates, agent charters, and registry
- Two decisions merged into team memory

## Key Decisions

1. **User Directive — Model Selection Cost Optimization**
   - Agents pick their own models
   - Optimize for cost first unless writing code
   - Non-coding agents use cheaper models (haiku)
   - Coding agents use quality models (sonnet)
   - Principle: cost > quality unless code involved

2. **Per-agent Model Selection Implementation**
   - Coordinator instructions updated
   - All spawn templates modified
   - Charters and registry updated
   - Applied Brady's cost-first directive
   - Deployed as v0.3.0

## Outcomes

- Model selection feature complete and documented
- Team directive captured and embedded in all agent charters
- Cost-first principle now governs model selection across the squad
