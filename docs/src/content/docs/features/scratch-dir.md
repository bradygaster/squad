# Scratch Directory

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to see what's in scratch:**
```bash
ls .squad/.scratch/
```

**Try this to create a scratch file:**
```typescript
import { scratchFile } from '@bradygaster/squad-sdk';

const promptPath = scratchFile(squadRoot, 'coordinator-prompt', '.txt', promptContent);
```

Squad provides `.squad/.scratch/` as the canonical location for ephemeral temp files — prompt files, commit drafts, processing artifacts — keeping the repo root clean.

---

## Why Scratch Dir?

Before scratch dir, agents wrote temp files to the repo root:
- `prompt-123.txt`
- `commit-draft-456.txt`
- `processing-temp-789.json`

This polluted the working directory and risked accidental commits. Scratch dir solves this by providing a **dedicated ephemeral space** that:

1. **Lives in `.squad/.scratch/`** — clearly separated from project files
2. **Gitignored by default** — automatically excluded during `squad init`
3. **Auto-created on demand** — no setup required
4. **Cleaned regularly** — purged during `squad watch` cleanup cycles

---

## API

### `scratchDir(squadRoot: string): string`

Resolves and creates the scratch directory.

```typescript
import { scratchDir } from '@bradygaster/squad-sdk';

const scratchPath = scratchDir('/path/to/repo');
// Returns: /path/to/repo/.squad/.scratch
// Side effect: Creates directory if it doesn't exist
```

**Behavior:**
- Returns absolute path to `.squad/.scratch/`
- Creates directory if missing (including parent `.squad/` if needed)
- Idempotent — safe to call multiple times

---

### `scratchFile(squadRoot: string, prefix: string, ext: string, content: string): string`

Creates a named temp file in scratch dir.

```typescript
import { scratchFile } from '@bradygaster/squad-sdk';

const promptPath = scratchFile(
  '/path/to/repo',
  'coordinator-prompt',
  '.txt',
  'Your task is to...'
);
// Returns: /path/to/repo/.squad/.scratch/coordinator-prompt-abc123.txt
// Side effect: Writes file with given content
```

**Parameters:**
- `squadRoot` — path to repository root
- `prefix` — file name prefix (e.g., `'coordinator-prompt'`)
- `ext` — file extension with leading dot (e.g., `'.txt'`, `'.json'`)
- `content` — file content to write

**Behavior:**
- Auto-generates unique suffix (timestamp + random hex)
- Returns absolute path to created file
- Creates scratch dir if missing
- Overwrites file if it already exists (rare due to unique suffix)

**Example filenames:**
- `coordinator-prompt-20250125-a3f2.txt`
- `commit-draft-20250125-b8d1.txt`
- `processing-temp-20250125-c4e9.json`

---

## Common Use Cases

### Coordinator Prompts

```typescript
const promptPath = scratchFile(
  squadRoot,
  'coordinator-prompt',
  '.txt',
  buildCoordinatorPrompt(issue)
);

await spawnCopilot(promptPath);
```

### Commit Message Drafts

```typescript
const draftPath = scratchFile(
  squadRoot,
  'commit-draft',
  '.txt',
  buildCommitMessage(changes)
);

await git(['commit', '-F', draftPath]);
```

### Processing Artifacts

```typescript
const dataPath = scratchFile(
  squadRoot,
  'processing-temp',
  '.json',
  JSON.stringify(intermediateData, null, 2)
);

// Process data...
// File will be cleaned up during next cleanup cycle
```

---

## Lifecycle

**Created:**
- During `squad init` — `.squad/.scratch/` created and added to `.gitignore`
- On-demand by `scratchDir()` or `scratchFile()` — auto-created if missing

**Populated:**
- By agents during work sessions (prompts, drafts, artifacts)
- By SDK/CLI when spawning Copilot sessions
- By coordinator when orchestrating multi-agent work

**Cleaned:**
- During `squad watch` cleanup cycles (default: every 10 rounds)
- Manual cleanup: `rm -rf .squad/.scratch/*`

---

## Migration

Old code that wrote to repo root:

```typescript
// ❌ Before: pollutes repo root
const promptPath = path.join(repoRoot, `prompt-${Date.now()}.txt`);
fs.writeFileSync(promptPath, content);
```

New code using scratch dir:

```typescript
// ✅ After: uses scratch dir
const promptPath = scratchFile(repoRoot, 'prompt', '.txt', content);
```

---

## Notes

- Scratch dir is **ephemeral by design** — nothing in `.squad/.scratch/` should be committed or preserved long-term
- Cleanup is safe — scratch files are temporary and safe to delete anytime
- Scratch dir is **team-wide** — not per-agent, not per-session
- `.gitignore` entry is added during `squad init` and preserved during `squad upgrade`

---

## Sample Prompts

```
Show me what's in the scratch directory
```

Lists all files currently in `.squad/.scratch/`.

```
Clear the scratch directory
```

Deletes all files in `.squad/.scratch/` (manual cleanup).

```
Create a scratch file for debugging
```

Uses `scratchFile()` to create a temp file for debugging output.
