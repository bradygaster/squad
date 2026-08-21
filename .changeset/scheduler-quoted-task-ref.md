---
'@bradygaster/squad-sdk': patch
---

Fix scheduler script tasks failing on the default Windows Node install path

`LocalPollingProvider` split `task.ref` on whitespace with no quote handling,
so a command path containing a space was truncated at the first space. On
Windows that breaks the *default* install location — `C:\Program Files\nodejs\node.exe`
became `C:\Program`, and the task failed with `ENOENT`. This affected any user
who did not install Node somewhere unusual, not an exotic edge case.

Script task refs are now parsed with quote awareness, and an unquoted command
path is resolved by widening across spaces (longest match first) the same way
Windows `CreateProcess` does. A ref whose first token already resolves is used
unchanged, so existing configurations — including bare PATH commands like
`node` — keep their exact previous behaviour. Quote characters appearing
mid-token, as in `node -e console.log('hi')`, are still passed through to the
child verbatim rather than being stripped.

`TaskConfig.argv?: string[]` is added as the unambiguous form: when present,
`ref` is used verbatim as the executable and is never parsed. Prefer it for any
command path containing spaces.

Spawn failures are also no longer silent. `execFile` reports them with a
*string* code (`ENOENT`, `EACCES`) and no stdout or stderr, which previously
fell through every branch and produced `code: undefined, stderr: ''`. `TaskResult`
gains `spawnError?: string` for that code, and the error message now names the
ref that could not be spawned.

`shell: false` is retained, so the injection-safety property of the existing
implementation is unchanged.
