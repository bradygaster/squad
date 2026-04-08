# Schedule Providers

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to run scheduled tasks locally:**
```
Configure local polling for recurring agent work
```

**Try this to generate GitHub Actions workflows:**
```
Use ScheduleProvider to auto-generate .github/workflows/ files
```

Schedule providers execute recurring tasks — cron jobs, polling intervals, or event-triggered actions. Define your schedule once in `.squad/schedule.json`, and Squad can run it locally, in GitHub Actions, or in any scheduler you provide.

---

## What is ScheduleProvider?

`ScheduleProvider` is Squad's interface for executing scheduled tasks. It abstracts the execution engine so the same schedule manifest can run in development (local polling), in GitHub Actions (workflow generation), or in your custom infrastructure.

```typescript
export interface ScheduleProvider {
  readonly name: string;
  execute(entry: ScheduleEntry): Promise<TaskResult>;
  /** Optional: generate platform-native config (e.g. GitHub Actions workflow) */
  generate?(manifest: ScheduleManifest, outDir: string): Promise<string[]>;
}

export interface ScheduleEntry {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerConfig;
  task: TaskConfig;
  providers: string[];
  retry?: RetryConfig;
}

export type TriggerConfig =
  | { type: 'cron'; cron: string }
  | { type: 'interval'; intervalSeconds: number }
  | { type: 'event'; event: string }
  | { type: 'startup' };

export interface TaskConfig {
  type: 'workflow' | 'script' | 'copilot' | 'webhook';
  ref: string;
  args?: Record<string, string>;
}

export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

---

## Schedule Manifest

Define schedules in `.squad/schedule.json`:

```json
{
  "version": 1,
  "schedules": [
    {
      "id": "daily-retro",
      "name": "Daily retrospective",
      "enabled": true,
      "trigger": {
        "type": "cron",
        "cron": "0 17 * * *"
      },
      "task": {
        "type": "copilot",
        "ref": "copilot://ceremonies/retrospective",
        "args": {
          "team": "engineering"
        }
      },
      "providers": ["local-polling", "github-actions"],
      "retry": {
        "maxRetries": 2,
        "backoffSeconds": 60
      }
    },
    {
      "id": "check-prs",
      "name": "Check for stale PRs",
      "enabled": true,
      "trigger": {
        "type": "interval",
        "intervalSeconds": 3600
      },
      "task": {
        "type": "webhook",
        "ref": "https://my-service.com/check-prs"
      },
      "providers": ["local-polling"]
    }
  ]
}
```

---

## Built-in Providers

### LocalPollingProvider

**What it is:** In-process scheduler that polls based on cron or interval triggers.

**When to use it:**
- Local development (`squad run` with watch mode)
- Small teams that don't need GitHub Actions
- Testing schedule behavior locally

**How it works:** Maintains a timer thread that checks trigger conditions. When a trigger fires, executes the task synchronously or async.

**Configuration:**

```json
{
  "schedule": {
    "provider": "local-polling",
    "config": {
      "pollIntervalSeconds": 30
    }
  }
}
```

**Pros:**
- Zero setup
- Works offline
- Perfect for local testing

**Cons:**
- Dies when the process stops (not for production)
- Single machine only

---

### GitHubActionsProvider

**What it is:** Generates `.github/workflows/` files from the schedule manifest.

**When to use it:**
- Production deployments on GitHub
- Team members already use GitHub Actions
- Want recurring tasks to run in the cloud

**How it works:** Calls `generate()` to create workflow YAML files. Each schedule becomes a workflow with a cron or event trigger.

**Generated workflow example:**
```yaml
name: Squad Schedule - Daily Retro

on:
  schedule:
    - cron: '0 17 * * *'  # 5 PM UTC

jobs:
  retro:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx squad run ceremonies/retrospective --team engineering
```

**Configuration:**

```json
{
  "schedule": {
    "provider": "github-actions",
    "config": {
      "workflowDir": ".github/workflows",
      "runsOn": "ubuntu-latest"
    }
  }
}
```

**Pros:**
- Fully managed cloud scheduling
- Integrates with GitHub Actions CI/CD
- No additional services needed

**Cons:**
- GitHub-only
- Workflow files are generated (not hand-edited)

| Feature | LocalPollingProvider | GitHubActionsProvider |
|---------|---|---|
| Execution | In-process | GitHub Actions runner |
| Setup | None | Workflow file generation |
| Scalability | Single machine | Unlimited (GitHub's infrastructure) |
| Cost | Free (existing hardware) | Free (GitHub Actions free tier) |
| Offline support | Yes | No |
| Production ready | No (not reliable) | Yes |

---

## Create a Custom Provider

Implement `ScheduleProvider` to support any scheduler. Here's a skeleton:

```typescript
import type { ScheduleProvider, ScheduleEntry, ScheduleManifest, TaskResult } from '@bradygaster/squad-sdk';

export class MyCustomScheduleProvider implements ScheduleProvider {
  readonly name = 'my-scheduler';

  constructor(private apiUrl: string, private apiKey: string) {}

  async execute(entry: ScheduleEntry): Promise<TaskResult> {
    try {
      // Execute the task (webhook, script, workflow, etc.)
      const result = await this.executeTask(entry.task);
      return {
        success: true,
        output: result,
      };
    } catch (err) {
      return {
        success: false,
        error: String(err),
      };
    }
  }

  async generate?(manifest: ScheduleManifest, outDir: string): Promise<string[]> {
    // Optional: generate platform-native config files
    // Return list of generated file paths
    const files: string[] = [];
    for (const entry of manifest.schedules) {
      if (entry.enabled) {
        const configFile = `${outDir}/schedule-${entry.id}.json`;
        await this.writeConfigFile(configFile, entry);
        files.push(configFile);
      }
    }
    return files;
  }

  private async executeTask(task: { type: string; ref: string; args?: Record<string, string> }): Promise<string> {
    // Implementation: call your scheduler service
    const response = await fetch(`${this.apiUrl}/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(task),
    });

    if (!response.ok) {
      throw new Error(`Task execution failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.output || '';
  }

  private async writeConfigFile(path: string, entry: unknown): Promise<void> {
    // Implementation: write config to disk
    throw new Error('Implement this');
  }
}
```

Register it in `.squad/config.json`:

```json
{
  "schedule": {
    "provider": "my-scheduler",
    "config": {
      "apiUrl": "https://my-scheduler.com",
      "apiKey": "your-api-key"
    }
  }
}
```

---

## Configuration

Specify the schedule provider in `.squad/config.json`:

```json
{
  "schedule": {
    "provider": "local-polling"
  }
}
```

Options: `"local-polling"`, `"github-actions"`, or your custom provider name.

For GitHub Actions, optionally configure the workflow directory:

```json
{
  "schedule": {
    "provider": "github-actions",
    "config": {
      "workflowDir": ".github/workflows",
      "runsOn": "ubuntu-latest",
      "nodeVersion": "20"
    }
  }
}
```

---

## Trigger Types

| Trigger | Example | Use Case |
|---------|---------|----------|
| **cron** | `"0 17 * * *"` (5 PM daily) | Clock-based schedules |
| **interval** | `3600` (seconds) | Recurring polls |
| **event** | `"pr-opened"`, `"issue-created"` | Reactive to events |
| **startup** | (no config) | When agent starts |

---

## Related

- [Pluggable Interfaces](pluggable-interfaces.md) — Overview of all pluggable interfaces
- [PlatformAdapter](platform-adapters.md) — Work with GitHub, ADO, or Planner
- [CommunicationAdapter](communication-adapters.md) — Post updates and read replies
- [API Reference](api-reference.md) — All public SDK exports
