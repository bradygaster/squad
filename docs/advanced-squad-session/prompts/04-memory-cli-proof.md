# Demo Prompt: Memory CLI Proof

## Exact commands

```powershell
cd C:\Users\tamirdresher\source\repos\squad-advanced-squad-session-slides
$env:SKIP_BUILD_BUMP='1'
npm run build -w packages/squad-sdk
npm run build -w packages/squad-cli

cd .\docs\advanced-squad-session\demo-root
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory provider --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory classify "Always include exact prompts, expected tool calls, expected output, and fallback paths in advanced demo snippets." --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory write --content "Advanced Squad demo snippets include the exact prompt, expected tool calls, expected output, and a fallback path." --class DECISION --title "Advanced demo snippet structure" --author pao --load-guidance ALWAYS --approved --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory search --query "advanced demo snippet" --log-level info
node ..\..\..\packages\squad-cli\dist\cli-entry.js memory audit --log-level info
```

## Expected tool calls

This is a CLI demo rather than a Copilot tool-call demo. The observable proof is command diagnostics plus changed state files.

## Expected output

- Provider status reports `defaultProvider=local`.
- Classification reports `class=POLICY` and `allowed=true`.
- Write reports `stored=true`, `class=DECISION`, and a `.squad\decisions\inbox\...md` path.
- Search returns one result.
- Audit records the write and search.

## Fallback

Show the checked-in files under `../outputs/` and `../demo-root/.squad/`.

