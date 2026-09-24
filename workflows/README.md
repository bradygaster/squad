# Squad Agentic Workflows

This nested `gh-aw` package installs the complete Squad workflow bundle from one
immutable commit:

```bash
gh aw add bradygaster/squad/workflows@<40-character-commit-sha>
```

The package contains exactly seven workflows, fifteen runtime resources, and
the `gh-aw-enlistment` skill. After installation, follow the enlistment skill to
materialize runtime resources, strictly compile every workflow, and verify the
package-owned topology before opening the bootstrap pull request.
