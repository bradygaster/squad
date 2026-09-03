# Ralph Instructions
<!-- User-owned: customize this file to override Ralph's autonomous-execution behavior.
     squad init creates this file on first install; squad upgrade never overwrites it. -->

<!--
  PURPOSE
  -------
  When `.squad/ralph-instructions.md` exists, `squad watch --execute` instructs the
  spawned Copilot session to read this file and follow ALL sections here instead of
  the built-in fallback prompt.  If the file is absent, the built-in prompt is used.

  CONTRACT (stable — safe to build on)
  --------------------------------------
  YOU CAN  customize via this file:
    • Extra instructions given to Ralph at session start (Teams/Slack notifications,
      calendar checks, post-task hooks, MCP-powered side effects, escalation paths)
    • Additional eligibility rules or priority ordering for issue selection
    • Agent persona, tone, or verbosity for session output

  YOU CANNOT override via this file:
    • Dispatch caps — Ralph works the highest-priority actionable issues within the
      team's caps (see `.squad/routing.md`); it never spawns an agent per issue
    • Core eligibility filter (squad/squad:* label required, not blocked, not assigned)
    • The underlying `gh` / Copilot CLI command used to spawn each session

  TRUST IMPLICATIONS
  ------------------
  This file is read by the spawned Copilot session with full agent permissions.
  Treat it like code — never paste untrusted content here.  Anyone with write access
  to this file can influence what the agent does on your behalf.

  If this file is missing or empty, `squad watch --execute` falls back to the
  built-in prompt with no behavioral change.

  PLACEHOLDERS
  ------------
  The following values are injected by execute.ts before the session reads this file:
    (none currently — Ralph builds the issue list dynamically at runtime)

  FORMAT
  ------
  Plain markdown.  Structure with ## sections.  The spawned session reads the whole
  file, so keep it concise — one screen of instructions is ideal.
-->

## Ralph, Go!

Read this file for your full instructions.  Follow ALL sections.
MINIMUM SUFFICIENT DISPATCH — work the highest-priority actionable issues first,
within the dispatch caps.  Never spawn an agent for every actionable issue.

### Dispatch Caps

- At most **2** active domain agents per request.
- At most **3** tasks in flight at once, and at most **1** in-flight task per agent.
- Ralph itself is exempt from these caps; every domain agent Ralph spawns is not.
- **No speculative work** — do not pre-spawn testers, docs writers, or scaffolders for
  issues nobody is working yet.  Queue the rest and say what is queued.
- `.squad/routing.md` and `.squad/team.md` may tighten these numbers.  When they do,
  the repo's values win.

### Issue Selection

Work the open, unblocked, unassigned issues labeled `squad` or `squad:{member}` in
priority order — highest priority first, up to the caps above.  Skip issues that are
assigned to a human, blocked, or marked `status:on-hold`.  Everything else queues.

### Post-Task Actions

<!-- Uncomment and customize to add post-task hooks, e.g. Teams notifications:

After completing work on each issue:
- Post a brief summary to the team channel via your Teams MCP tool.
- Update the issue with a progress comment if no PR has been opened yet.
-->

### Escalation

If you are blocked on an issue, comment on it explaining why, add a `status:blocked`
label, and move to the next actionable item.  Do not halt the loop.
