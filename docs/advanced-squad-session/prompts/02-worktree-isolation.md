# Demo Prompt: Worktree Isolation

## Prompt

```text
Create a worktree for creating the slides for advanced squad session.
```

## Expected tool calls

- `git worktree list`
- `git fetch origin --prune`
- `git worktree add <path> -b squad/advanced-squad-session-slides origin/dev`
- Optional dependency linking with a Windows junction for `node_modules`.

## Expected output

```text
<repos>/squad-squad                         3c34d45e [main]
<repos>/squad-advanced-squad-session-slides ede35fcd [squad/advanced-squad-session-slides]
```

## Fallback

Show `../outputs/git-worktree-list.txt` and `../outputs/worktree-status.txt`.

