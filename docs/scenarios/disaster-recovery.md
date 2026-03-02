# Disaster Recovery — When Things Go Wrong

**Try this to recover from data loss:**
```
My .squad/ directory was deleted — help me recover the team state
```

**Try this to revert bad code:**
```
An agent wrote bad code — how do I revert it?
```

**Try this to reset confused agents:**
```
The squad is confused — reset their context
```

Recovery procedures for deleted `.squad/`, bad agent code, confused squads, and upgrade issues. Most problems are fixable with Git or re-init.

---

## 1. "I accidentally deleted `.squad/`"

Recovery scenarios: deleted `.squad/`, bad agent code, confused squad, upgrade issues.

**Solution:** It's in Git. Restore it.

```bash
git checkout .squad/
```

If you haven't committed `.squad/` yet, it's gone. Rebuild:

```bash
npx github:bradygaster/squad
```

Start from scratch. If you exported your squad before, import the export:

```bash
npx github:bradygaster/squad import squad-export-2025-07-15.zip
```

**Prevention:** Commit `.squad/` early. Don't let it stay uncommitted for long.

---

## 2. "An agent wrote bad code"

**What happened:** Morpheus implemented a feature, but it has a bug. Michael (the Lead) didn't catch it during review.

**Solution:** Use the reviewer rejection protocol.

```
> Michael, review Morpheus's latest commit. There's a bug in the
> payment validation logic.
```

```
🏗️ Michael — reviewing Morpheus's commit

Issue found: Payment validation allows negative amounts.

Rejected. Morpheus, fix the validation to reject negative amounts.
```

Morpheus fixes it:

```
🔧 Morpheus — fixing payment validation to reject negative amounts
```

Alternatively, have a **different agent** fix it:

```
> Sonny, fix the payment validation bug Morpheus introduced.
> It's allowing negative amounts.
```

Sonny reads the code, fixes the issue, commits.

**Prevention:** Use code review. Michael should always review code before it lands.

---

## 3. "An agent made a wrong decision"

**What happened:** Neo decided to use REST when GraphQL was the better choice. The decision is logged in `.squad/decisions.md`.

**Solution:** Add a directive to override it.

```
> Team, I'm overriding Neo's decision from last session. We're using
> GraphQL, not REST. The client needs flexible queries. Document this.
```

```
📋 Scribe — logged decision override

### 2025-07-15: Using GraphQL instead of REST
**By:** You (overriding Neo's recommendation)
**What:** API will use GraphQL, not REST
**Why:** Client needs flexible queries, REST would require too many endpoints

Neo's previous recommendation archived.
```

Agents now read the new decision and build accordingly.

**Prevention:** Review major decisions before agents implement them. Use the Lead as a sounding board, not a dictator.

---

## 4. "My squad is confused after a bad session"

**What happened:** Agents learned incorrect information during a session. Now they're making mistakes.

**Solution:** Have the Scribe archive old learnings and start fresh.

```
> Scribe, archive agent histories from the last session. We made
> mistakes and I don't want agents repeating them.
```

```
📋 Scribe — archiving recent session histories

Moved to .squad/history-archive/:
  - Neo's session from 2025-07-14
  - Morpheus's session from 2025-07-14
  - Trinity's session from 2025-07-14

Agents now only have context from earlier sessions.
```

Agents **forget** the bad session. They still have their long-term skills and decisions.

**Prevention:** End sessions if agents are going in the wrong direction. Don't let them accumulate bad context.

---

## 5. "I want to start over completely"

**Solution:** Delete `.squad/` and reinstall.

```bash
rm -rf .squad/
npx github:bradygaster/squad
```

```
Squad is ready. What are you building?
```

You're back to day one. Clean slate.

**Prevention:** Only do this if the squad is truly beyond repair. Usually archiving histories (above) is enough.

---

## 6. "Upgrade broke something"

**What happened:** You upgraded Squad to a new version, and now something doesn't work.

**Solution:** Squad upgrades **never touch** `.squad/`. The issue is likely in:

1. **Workflow templates** — check `.squad-templates/`
2. **Squad agent definition** — check `.github/agents/squad.agent.md`
3. **Model configuration** — check `.squad/model-config.json`

Roll back the Squad agent definition:

```bash
git checkout HEAD^ .github/agents/squad.agent.md
```

Or reinstall the previous version:

```bash
npx github:bradygaster/squad@0.1.5
```

**Your team's knowledge is safe.** `.squad/` is untouched.

**Prevention:** Check the CHANGELOG before upgrading. If the upgrade is major, test in a branch first.

---

## 7. "An agent is stuck in a loop"

**What happened:** Tank keeps writing the same failing test over and over.

**Solution:** Stop the agent manually.

```
> Tank, stop. The test is failing because of a known issue in the
> test environment, not the code. Skip this test for now.
```

If the agent doesn't stop:

```
> Scribe, pause Tank's work. I need to fix the test environment first.
```

Or just close the Copilot session (Ctrl+C) and start a new one.

**Prevention:** If a test is flaky, tell agents to skip it until the environment is fixed.

---

## 8. "Skills are outdated or wrong"

**What happened:** A skill file in `.squad/skills/` contains outdated information. Agents are following bad advice.

**Solution:** Edit or delete the skill file.

```bash
# Edit the skill
code .squad/skills/auth-rate-limiting.md

# Or delete it
rm .squad/skills/auth-rate-limiting.md
git add .squad/skills/
git commit -m "Remove outdated auth rate limiting skill"
```

**Prevention:** Review skills periodically. If your patterns change, update the skills.

---

## 9. "Decisions.md is a mess"

**What happened:** `.squad/decisions.md` has 200 entries and it's hard to find anything.

**Solution:** Archive old decisions.

```
> Scribe, archive decisions older than 3 months. Move them to
> .squad/decisions-archive.md.
```

```
📋 Scribe — archiving old decisions

Moved 87 decisions older than 2025-04-01 to decisions-archive.md.
decisions.md now contains only recent decisions.
```

Agents still have access to archived decisions if they need them, but the main file is cleaner.

**Prevention:** Periodically archive old decisions. Keep `decisions.md` focused on recent, relevant choices.

---

## 10. "I can't tell which agent did what"

**What happened:** Multiple agents worked on the same feature, and the commit history is tangled.

**Solution:** Check agent histories.

```
> Show me Neo's history for the last session.
```

```
🏗️ Neo — session history 2025-07-15

Tasks:
  - Reviewed architecture for the payment feature
  - Rejected Morpheus's first implementation (missing validation)
  - Approved Morpheus's second implementation

Decisions made:
  - Use Stripe Checkout instead of raw Payment Intents
  - Store payment metadata in the orders table
```

Each agent logs what they did in their `history.md`.

**Prevention:** Agents automatically log their work. You don't have to do anything.

---

## Tips

- **`.squad/` is in Git.** If you delete it, restore from Git. If it's uncommitted, it's gone.
- **Code review catches bad agent code.** Use the Lead to review before merging.
- **Override bad decisions with directives.** If an agent made the wrong call, tell the team the correct one.
- **Archive confused histories.** If a session went badly, archive the learnings so agents forget.
- **Upgrades don't touch `.squad/`.** Your team's knowledge is safe across upgrades.
- **Edit skill files directly.** They're just markdown. If a skill is wrong, fix it or delete it.
- **Agent histories are the audit log.** Check them to see what each agent did.
