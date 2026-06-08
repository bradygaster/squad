# Two-layer backend demo commands

These commands were run against a real throwaway Git repo. The full transcript is `outputs/12-two-layer-real-demo-transcript.txt`.

```powershell
git init -b main
git config user.name 'Advanced Squad Demo'
git config user.email 'demo@example.invalid'

# Create .squad/config.json with stateBackend two-layer and commit it.
node <session-files>/write_two_layer_state.mjs <repo> <two-layer-demo-repo>

git status --short
git ls-tree --name-only -r squad-state
git show squad-state:decisions.md
git notes --ref=squad show <root-commit>

# Current caveat: this demonstrates the nested ref collision.
git notes --ref=squad/flight add -f -m '{...promote_to_permanent:true...}' <feature-commit>

# Working non-conflicting per-agent ref for this demo.
git notes --ref=squad-flight add -f -m '{...promote_to_permanent:true...}' <feature-commit>
git notes --ref=squad-flight add -f -m '{...archive_on_close:true...}' <root-commit>

node <repo>/packages/squad-cli/dist/cli-entry.js notes promote --ref squad-flight --dry-run
node <repo>/packages/squad-cli/dist/cli-entry.js notes promote --ref squad-flight

git show squad-state:promoted/squad-flight/<feature-commit>.json
git show squad-state:archive/squad-flight/<root-commit>.json
git for-each-ref --format='%(refname:short) %(objectname:short)' refs/heads refs/notes
```
