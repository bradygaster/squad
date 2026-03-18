---
name: message-serialization
description: Temp-file indirection for passing large prompts to CLI tools without shell argument mangling
domain: reliability, cli-wiring, agent-spawning
confidence: high
source: earned (7KB prompt-as-command-name bug — 2026-03, tamirdresher/tamresearch1)
---

## Context

When spawning an agent via `Start-Process` or shell exec, the prompt is passed as an argument. For large
multiline prompts (>1–2 KB), the OS may interpret the entire string as the command name, truncate it, or
corrupt newlines and special characters.

This is a **serialization/marshalling problem**: passing structured data (a multiline prompt) through a
transport layer that doesn't preserve structure (command-line argument parsing). The same issue occurs when
passing JSON through a shell pipeline or serializing protobuf through a REST boundary that expects plain text.

**Trigger symptoms:**
- Agent fails with "command not found: Ralph, Go! MAXIMIZE PARALLELISM…"
- Long prompts silently truncated when passed via `--prompt`
- Special characters (`"`, `\n`, `{`, `}`) corrupted in transit

## Patterns

### Temp-File Indirection

Write the prompt to a temporary file and pass the file path as the argument:

```powershell
# Build prompt string (can be any size, any characters)
$prompt = @"
Ralph, Go! MAXIMIZE PARALLELISM.

For every round, identify ALL actionable issues and spawn agents in parallel.
Context: $($context | ConvertTo-Json -Compress)
"@

# Write to temp file — avoids shell argument size/encoding limits
$promptFile = [System.IO.Path]::GetTempFileName() + ".txt"
$prompt | Out-File -FilePath $promptFile -Encoding utf8 -NoNewline

try {
    # Pass reference, not data
    $proc = Start-Process -FilePath "agency" `
        -ArgumentList @("copilot", "--yolo", "--prompt-file", $promptFile) `
        -NoNewWindow -PassThru -Wait
} finally {
    Remove-Item $promptFile -Force -ErrorAction SilentlyContinue
}
```

### Shell/Bash Equivalent

```bash
PROMPT_FILE=$(mktemp /tmp/squad-prompt-XXXXXX.txt)
cat > "$PROMPT_FILE" << 'EOF'
Ralph, Go! MAXIMIZE PARALLELISM.
...
EOF

agency copilot --yolo --prompt-file "$PROMPT_FILE"
rm -f "$PROMPT_FILE"
```

### When to Apply

Apply this pattern whenever:
- The prompt exceeds ~500 characters
- The prompt contains newlines, quotes, or special shell characters
- You're using `Start-Process`, `Invoke-Expression`, or shell exec to spawn the agent
- You're on Windows (where argument length limits are lower than Unix)

You do NOT need temp-file indirection when using the Squad SDK directly (Node.js API), as the prompt
is passed as a function argument, not a shell argument.

### Cleanup

Always clean up the temp file after the process exits, even on error:

```powershell
$promptFile = $null
try {
    $promptFile = [System.IO.Path]::GetTempFileName() + ".txt"
    $prompt | Out-File -FilePath $promptFile -Encoding utf8
    Start-Process "agency" -ArgumentList @("--prompt-file", $promptFile) -Wait
} finally {
    if ($promptFile -and (Test-Path $promptFile)) {
        Remove-Item $promptFile -Force
    }
}
```

## Anti-Patterns

**NEVER pass large prompts directly as arguments:**
```powershell
# ❌ Windows may interpret the entire prompt as the command name
Start-Process "agency" -ArgumentList @("--prompt", $largPrompt)

# ❌ Shell may truncate or corrupt special characters
Invoke-Expression "agency copilot --prompt `"$prompt`""
```

## Distributed Systems Pattern

This is the **indirection pattern** — the same solution gRPC uses with protocol buffers and Kafka uses with a
schema registry. When your transport layer can't handle your message format, pass a reference to the data
instead of the data itself. Classic level-of-indirection from computer science fundamentals.
