$file = 'packages/squad-cli/src/cli-entry.ts'
$content = Get-Content $file -Raw

# 1. Triage flag parsing
$content = [regex]::Replace($content,
    "(?s)const agentCmdIdx = args.indexOf\('--agent-cmd'\);.*?undefined;\s*const maxConcurrentIdx = args.indexOf\('--max-concurrent'\);",
    "const agentCmdIdx = args.indexOf('--agent-cmd');`n    const agentCmd = (agentCmdIdx !== -1 && args[agentCmdIdx + 1])`n      ? args[agentCmdIdx + 1]`n      : undefined;`n`n    const agentRunnerIdx = args.indexOf('--agent-runner');`n    const agentRunner = (agentRunnerIdx !== -1 && args[agentRunnerIdx + 1])`n      ? args[agentRunnerIdx + 1] as 'copilot' | 'antigravity'`n      : undefined;`n`n    const maxConcurrentIdx = args.indexOf('--max-concurrent');"
)

# 2. Loop flag parsing
$content = [regex]::Replace($content,
    "(?s)const agentCmdIdx = args.indexOf\('--agent-cmd'\);.*?undefined;\s*// Capability flags",
    "const agentCmdIdx = args.indexOf('--agent-cmd');`n    const agentCmd = (agentCmdIdx !== -1 && args[agentCmdIdx + 1])`n      ? args[agentCmdIdx + 1]`n      : undefined;`n`n    const agentRunnerIdx = args.indexOf('--agent-runner');`n    const agentRunner = (agentRunnerIdx !== -1 && args[agentRunnerIdx + 1])`n      ? args[agentRunnerIdx + 1] as 'copilot' | 'antigravity'`n      : undefined;`n`n    // Capability flags"
)

# 3. Pass to runLoop
$content = [regex]::Replace($content,
    "(?s)copilotFlags,.*?agentCmd,.*?capabilities,.*?}\);",
    "copilotFlags,`n      agentCmd,`n      agentRunner,`n      capabilities,`n    });"
)

Set-Content -Path $file -Value $content
Write-Host "Patched cli-entry.ts"
