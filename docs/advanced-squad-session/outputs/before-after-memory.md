# Before/After Memory Effect

## Before the directive

Prompt:

```text
Create a demo snippet for showing Squad worktree isolation.
```

Typical answer:

```text
Use `git worktree add` to create a second checkout and show `git worktree list`.
```

## Durable directive

Prompt:

```text
Going forward, remember that in this repository, every advanced demo snippet should include the exact prompt, expected tool calls, expected output, and a fallback path.
```

Expected memory tool:

```text
store_memory(scope="repository", subject="demo snippets", ...)
```

## After the directive

Prompt:

```text
Create a demo snippet for showing Squad worktree isolation.
```

Expected answer shape:

```text
Exact prompt:
Create a worktree for issue #42.

Expected tool calls:
git worktree list
git worktree add ../repo-42 -b squad/42-demo origin/dev

Expected output:
../repo-42 [squad/42-demo]

Fallback:
Use the checked-in terminal capture if the live command is slow or the branch already exists.
```

