# Repo Health workflow verification

`Repo Health` is intentionally base-controlled. Its `pull_request_target` trigger supplies the
workflow definition from the target branch, and every checkout keeps the trusted base revision.
The PR head is fetched only as Git data. Never check out or execute PR-head code in that workflow.

## Evidence levels

- **Shadow / non-authoritative:** `Repo Health Shadow (Non-Authoritative)` runs proposed scanners,
  reporter script bodies, and the reporter helper from the PR head under `pull_request`, a
  read-only token, no persisted checkout credentials, and fake Octokit. It can prove that proposed
  code compiles, preserves hostile text, and propagates API failures, but it cannot prove the
  elevated production workflow has picked up the merged implementation.
- **Post-merge / authoritative:** only a disposable PR opened after the change reaches `dev` and
  observed through `Repo Health` proves the base-controlled writer now creates and cleans up its
  marker comment.

Do not weaken a scanner, add an exclusion, or change a finding merely to make the base-controlled
check on the implementation PR green.

## Authoritative post-merge canary

Run this only after the workflow/helper change is on `dev`. It creates a disposable branch and PR
whose filename contains paired backticks, a bare `${`, an apostrophe, and a double quote. The
filename is data; do not execute it. Multiline transport coverage belongs in scanner diagnostic
messages, because the leakage scanner consumes Git's line-delimited `--name-only` output.

```bash
git fetch origin dev
git switch --create canary/repo-health-$(date +%s) origin/dev

node --input-type=module <<'NODE'
import { mkdirSync, writeFileSync } from 'node:fs';
const path = '.squad/canary-`paired`-${-apostrophe-\'-"double quote".md';
mkdirSync('.squad', { recursive: true });
writeFileSync(path, 'repo-health post-merge canary\n');
NODE

CANARY_PATH=$(node --input-type=module -e \
  'process.stdout.write(".squad/canary-`paired`-${-apostrophe-'\''-\"double quote\".md")')
git add -- "$CANARY_PATH"
git commit -m 'test: repo-health post-merge canary'
git push -u origin HEAD
PR_URL=$(gh pr create --base dev --title 'test: repo-health post-merge canary' \
  --body 'Disposable authoritative canary; do not merge.')
PR_NUMBER=${PR_URL##*/}
```

Wait for `Repo Health / Squad File Leakage`, then verify exactly one authoritative marker and the
exact hostile filename:

```bash
EXPECTED=$(node --input-type=module -e \
  'process.stdout.write(".squad/canary-`paired`-${-apostrophe-'\''-\"double quote\".md")')

gh api --paginate --slurp "repos/bradygaster/squad/issues/$PR_NUMBER/comments" \
  > canary-comments.json
node --input-type=module - "$EXPECTED" <<'NODE'
import { readFileSync } from 'node:fs';
const expected = process.argv[2];
const comments = JSON.parse(readFileSync('canary-comments.json', 'utf8')).flat();
const marked = comments.filter(({ body = '' }) =>
  body.includes('<!-- squad-repo-health-leakage -->'));
if (marked.length !== 1) throw new Error(`expected one marker comment, found ${marked.length}`);
const listed = marked[0].body.split('\n').filter((line) => line.startsWith('- `'));
if (listed.length !== 1 || listed[0] !== `- \`${expected}\``) {
  throw new Error(`expected exact raw semantic path, got ${JSON.stringify(listed)}`);
}
if (!marked[0].body.includes('Authoritative evidence')) {
  throw new Error('comment was not labeled authoritative');
}
NODE
rm canary-comments.json
```

Delete the file in the same PR, push, wait for the rerun, and prove stale cleanup:

```bash
git rm -- "$CANARY_PATH"
git commit -m 'test: clean up repo-health post-merge canary'
git push

# After Repo Health / Squad File Leakage completes:
gh api --paginate --slurp "repos/bradygaster/squad/issues/$PR_NUMBER/comments" \
  > canary-comments.json
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const comments = JSON.parse(readFileSync('canary-comments.json', 'utf8')).flat();
const marked = comments.filter(({ body = '' }) =>
  body.includes('<!-- squad-repo-health-leakage -->'));
if (marked.length !== 0) throw new Error(`stale marker remains: ${marked.length}`);
NODE
rm canary-comments.json
gh pr close "$PR_NUMBER" --delete-branch
git switch dev
```

Record the PR URL and both successful `Repo Health` run URLs in the implementing PR or issue.
This post-merge canary is the only authoritative evidence for a repo-health workflow/reporter
change; the pre-merge shadow remains intentionally non-authoritative.
