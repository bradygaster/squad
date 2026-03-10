# Issue Templates for Squad

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this after setting up templates:**
```
Ralph, show me untriaged issues
```

**Then watch Ralph auto-triage based on labels.**

When GitHub Issues are your work queue, creating tasks should be frictionless. Issue templates pre-fill labels, structure task descriptions, and work beautifully on mobile — making it possible to add tasks in 10 seconds from anywhere.

---

## Why Issue Templates Matter for Squad

GitHub provides Issue Templates — a platform feature that pre-fills labels, fields, and structure when creating new issues. This guide shows how to configure templates that work smoothly with Squad's label-based routing.

Squad operates best when work is captured as GitHub Issues. But creating an issue from scratch takes time: you need to remember the right labels, format the description consistently, and ensure the structure matches what agents expect.

Issue templates solve this:

- **Pre-filled labels** — `squad` label applied automatically
- **Structured format** — Task description, acceptance criteria, priority fields
- **Mobile-friendly** — Works in the GitHub mobile app
- **Fast task creation** — Add work while walking the dog, waiting for coffee, or during a meeting

With templates, creating a Squad task takes 10 seconds instead of 2 minutes.

---

## Basic Squad Task Template

Create `.github/ISSUE_TEMPLATE/squad-task.yml` in your repository:

```yaml
name: Squad Task
description: Create a task for the Squad team
title: "[Task]: "
labels: ["squad"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for creating a Squad task! Fill in the details below.
        
  - type: textarea
    id: description
    attributes:
      label: Task Description
      description: What needs to be done?
      placeholder: |
        Add dark mode support to the settings page.
        
        Current behavior: Settings page uses light theme only.
        Expected behavior: Theme switcher in settings, respects system preference.
    validations:
      required: true
      
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How will we know this is complete?
      placeholder: |
        - [ ] Theme switcher toggle added to settings
        - [ ] Dark mode CSS applied when enabled
        - [ ] Preference saved to localStorage
        - [ ] System theme preference detected on first load
    validations:
      required: false
      
  - type: dropdown
    id: priority
    attributes:
      label: Priority
      description: How urgent is this task?
      options:
        - Low
        - Medium
        - High
        - Critical
    validations:
      required: false
```

### What This Template Does

- **Applies `squad` label** — Ralph sees it in the untriaged queue
- **Structured sections** — Description, acceptance criteria, priority
- **Markdown support** — Use checklists, code blocks, links
- **Works on mobile** — GitHub app renders forms beautifully

---

## Custom Labels for Routing

Ralph uses `.squad/routing.md` to route work to agents. Add `squad:{member}` labels to your template for pre-triaging:

```yaml
name: Documentation Task
description: Create a docs task (auto-routed to PAO)
title: "[Docs]: "
labels: ["squad", "squad:pao"]
body:
  - type: textarea
    id: description
    attributes:
      label: What needs documenting?
      placeholder: |
        Add a guide for setting up Ralph in production.
```

When Ralph scans the board, this issue is already labeled `squad:pao` — no triage needed, work goes straight to PAO.

### Setting up labels for Squad routing

Create labels in your repository for each squad member:

```bash
# Using gh CLI
gh label create "squad:pao" --description "DevRel tasks" --color "1d76db"
gh label create "squad:flight" --description "Architecture and planning" --color "d73a4a"
gh label create "squad:fido" --description "Testing and quality" --color "0e8a16"
```

Or use the [label sync workflow](../features/labels.md) to automate label management across repositories.

---

## Template Variants

Different work types need different structures:

### Bug Report Template

`.github/ISSUE_TEMPLATE/bug-report.yml`:

```yaml
name: Bug Report
description: Report a bug for Squad to fix
title: "[Bug]: "
labels: ["squad", "bug"]
body:
  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: What went wrong?
    validations:
      required: true
      
  - type: textarea
    id: repro-steps
    attributes:
      label: Steps to Reproduce
      placeholder: |
        1. Run `squad init`
        2. Create a team with 3 agents
        3. Try to export the configuration
        4. See error: "Cannot read property 'name' of undefined"
    validations:
      required: true
      
  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What should have happened?
    validations:
      required: false
      
  - type: input
    id: version
    attributes:
      label: Squad Version
      placeholder: "0.8.24"
    validations:
      required: false
```

### Feature Request Template

`.github/ISSUE_TEMPLATE/feature-request.yml`:

```yaml
name: Feature Request
description: Suggest a new feature for Squad
title: "[Feature]: "
labels: ["squad", "enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem Statement
      description: What problem does this feature solve?
      placeholder: "As a solo developer, I want to track time spent on tasks so I can invoice clients accurately."
    validations:
      required: true
      
  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: How should this feature work?
    validations:
      required: false
      
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: What other approaches did you think about?
    validations:
      required: false
```

### Doc Update Template

`.github/ISSUE_TEMPLATE/doc-update.yml`:

```yaml
name: Documentation Update
description: Suggest a docs improvement
title: "[Docs]: "
labels: ["squad", "squad:pao", "documentation"]
body:
  - type: textarea
    id: what
    attributes:
      label: What needs updating?
      placeholder: "The Ralph deployment guide doesn't mention log rotation."
    validations:
      required: true
      
  - type: input
    id: page
    attributes:
      label: Page URL or Path
      placeholder: "docs/scenarios/ralph-operations.md"
    validations:
      required: false
```

---

## Mobile Workflow

GitHub Issues + templates work from anywhere:

**On your phone:**
1. Open GitHub app
2. Navigate to repository
3. Tap **Issues** → **New Issue**
4. Select template
5. Fill form (voice-to-text works!)
6. Tap **Submit new issue**

**10 seconds later:**
- Issue created with `squad` label
- Ralph sees it in the next scan
- Agent picks it up autonomously

This workflow enables "capture anywhere, process later" — add tasks while commuting, exercising, or in meetings without context-switching to a laptop.

---

## Template Configuration

GitHub supports multiple templates. Create a config file to customize the issue creation experience:

`.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Squad Community Discussions
    url: https://github.com/bradygaster/squad/discussions
    about: Ask questions or share ideas in Discussions
  - name: Squad Documentation
    url: https://squad.dev
    about: Read the full Squad documentation
```

This disables blank issues (forcing template use) and provides helpful links when users click "New Issue."

---

## Template Best Practices

- **Keep templates short** — Long forms reduce completion rates
- **Make most fields optional** — Only require what's absolutely necessary
- **Use placeholders** — Show examples of good descriptions
- **Pre-fill smart defaults** — Priority: Medium, Type: Task
- **Test on mobile** — Ensure forms render well in the GitHub app
- **Use dropdown for enums** — Priority, Type, Severity (reduces typos)
- **Add markdown help** — Link to GitHub markdown guide in template

---

## Integration with Ralph

Ralph's heartbeat workflow (`.github/workflows/squad-heartbeat.yml`) scans for untriaged issues:

1. Issue created with `squad` label (from template)
2. Heartbeat workflow runs (every 30 min or on issue create)
3. Ralph reads `.squad/routing.md` to determine agent
4. Ralph adds `squad:{member}` label
5. Next heartbeat run (or in-session Ralph) assigns agent

If your template pre-fills `squad:{member}`, Ralph skips triage and goes straight to assignment.

---

## Sample Prompts

```
Show me untriaged squad issues
```

Lists all issues with `squad` label but no `squad:{member}` assignment.

```
Ralph, triage and assign the backlog
```

Ralph reads routing rules, applies member labels, and prepares work for agents.

---

## Notes

- Templates don't prevent manual issue creation — users can still click "Open a blank issue"
- Templates are stored in `.github/ISSUE_TEMPLATE/` (note the underscore, not dash)
- Use `.yml` or `.yaml` extension (both work)
- Test templates by creating issues yourself before announcing to the team
- Mobile workflow requires GitHub app (iOS or Android) — works on tablets too

---

## See Also

- [GitHub Issues Mode](./github-issues.md) — Issue-driven development workflow
- [Ralph — Work Monitor](./ralph.md) — Ralph's work monitoring behavior
- [Labels](./labels.md) — Label management and sync workflow
- [Routing](./routing.md) — How Ralph triages work to agents
