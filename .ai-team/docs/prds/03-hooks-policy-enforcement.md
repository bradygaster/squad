# PRD 3: Hooks & Policy Enforcement

**Owner:** Baer (Security Specialist)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1
**Dependencies:** PRD 1 (SDK Runtime), PRD 2 (Custom Tools)

## Problem Statement

Squad's governance model is 100% prompt-based: a ~32KB coordinator prompt (`squad.agent.md`) encodes every security policy, file-write restriction, reviewer lockout rule, and PII protection as natural-language instructions repeated on every turn. These policies cost ~17K+ tokens per session, can be silently ignored by the model, and cannot be tested, audited, or composed programmatically. Moving enforcement from prompt suggestions to programmatic hook handlers transforms "governance by hope" into "governance as code" — deterministic, testable, and token-free.

## Goals

1. **Inventory every prompt-level policy** in `squad.agent.md` and classify each as hook-enforceable or prompt-required.
2. **Implement file-write guards** that prevent agents from writing outside their authorized scope per the Source of Truth hierarchy.
3. **Implement shell command restrictions** blocking destructive commands (`rm -rf`, `git push --force`, `git rebase`, etc.).
4. **Implement PII scrubbing** on tool outputs — strip emails, API keys, tokens, and secrets before they reach the model context.
5. **Implement reviewer lockout enforcement** as a programmatic pre-tool-use check (rejected author ≠ revision author).
6. **Implement ask_user guards** to cap the number of user-facing questions per session/agent.
7. **Implement Source of Truth write enforcement** — agents cannot write to files they don't own per the hierarchy table.
8. **Reduce the coordinator prompt by 30–50%** (~5–8KB / ~1,500–2,500 tokens) by removing policies now enforced by hooks.
9. **Achieve 100% unit test coverage** on all hook-enforced policies.
10. **Provide clear user notification** when a hook blocks an action, with actionable context.

## Non-Goals

- **Model behavior guidance** (e.g., "keep responses human", "bias toward upgrading response mode") — these shape _how_ the model reasons, not _what tools it calls_. They must remain in prompts.
- **Casting system logic** — universe selection, name allocation, and overflow handling are creative decisions, not security policies.
- **Ceremony orchestration** — scheduling and facilitation logic is workflow, not enforcement.
- **Ralph work-check loop** — continuous polling is operational behavior, not a policy gate.
- **Per-agent model selection** — model routing is a cost/quality decision, not a security boundary.
- **MCP server lifecycle management** — covered by PRD 1 (SDK Runtime).
- **Custom tool definitions** (squad_route, squad_decide, etc.) — covered by PRD 2 (Custom Tools).

## Background

### Current State: Prompt-Based Governance

The coordinator prompt (`squad.agent.md`, ~32KB, ~17K tokens always-loaded) contains dozens of policy statements expressed as natural-language rules. Examples:

- _"You may NOT generate domain artifacts (code, designs, analyses) — spawn an agent"_
- _"You may NOT bypass reviewer approval on rejected work"_
- _"Never read or store `git config user.email`"_
- _"Each agent may read ONLY: its own files + `.squad/decisions.md` + the specific input artifacts explicitly listed by Squad"_
- _"Agents may only write to files listed in their 'Who May Write' column"_

These have three fundamental weaknesses:

1. **Token cost:** Every policy burns tokens on every turn, whether relevant or not. The always-loaded governance section consumes ~4–6KB of the 32KB prompt.
2. **Non-deterministic enforcement:** The model _may_ follow a prompt rule or _may not_. There is no guarantee. A sufficiently complex multi-step task can cause the model to lose track of constraints.
3. **Untestable:** There is no way to unit test that "you may NOT bypass reviewer approval" actually prevents a bypass. We discover violations post-hoc in logs.

### SDK Hooks Architecture

The Copilot SDK (v0.1.8+) provides six hook points in `SessionHooks`:

| Hook | When Fired | Input | Output Controls |
|------|-----------|-------|-----------------|
| `onPreToolUse` | Before any tool executes | `toolName`, `toolArgs`, `timestamp`, `cwd` | `permissionDecision` (allow/deny/ask), `modifiedArgs`, `additionalContext` |
| `onPostToolUse` | After any tool executes | `toolName`, `toolArgs`, `toolResult`, `timestamp`, `cwd` | `modifiedResult`, `additionalContext`, `suppressOutput` |
| `onUserPromptSubmitted` | When user sends a message | `prompt`, `timestamp`, `cwd` | `modifiedPrompt`, `additionalContext` |
| `onSessionStart` | When session begins | `source` (startup/resume/new), `initialPrompt` | `additionalContext`, `modifiedConfig` |
| `onSessionEnd` | When session ends | `reason`, `finalMessage`, `error` | `cleanupActions`, `sessionSummary` |
| `onErrorOccurred` | On any error | `error`, `errorContext`, `recoverable` | `errorHandling` (retry/skip/abort), `userNotification` |

Additionally, the SDK provides two handler-based intercepts:

| Handler | Purpose | Input | Output |
|---------|---------|-------|--------|
| `onPermissionRequest` | Gate shell/write/mcp/read/url operations | `PermissionRequest` with `kind` field | `approved`, `denied-by-rules`, or `denied-*` |
| `onUserInputRequest` | Control ask_user behavior | `question`, `choices`, `allowFreeform` | `answer`, `wasFreeform` |

**Key SDK capability:** `onPreToolUse` can return `permissionDecision: "deny"` with a `permissionDecisionReason` string. This is a **hard block** — the tool does not execute. The model receives the denial reason as context and must choose a different path. This is the enforcement primitive we build on.

## Policy Inventory

Complete inventory of every prompt-level policy in `squad.agent.md`, mapped to hook enforcement or documented as prompt-required.

### Policies That Move to Hooks (Enforceable by Code)

| # | Policy (from squad.agent.md) | Current Prompt Text | Target Hook | Enforcement Mechanism | Priority |
|---|------------------------------|---------------------|-------------|----------------------|----------|
| P1 | **No domain artifact generation by coordinator** | "You may NOT generate domain artifacts (code, designs, analyses) — spawn an agent" | `onPreToolUse` | If sessionRole=coordinator AND toolName ∈ {edit, create, write_file}: deny. Exception: `.squad/` paths. | P0 |
| P2 | **Reviewer lockout enforcement** | "The original author is locked out. They may NOT produce the next version" | `onPreToolUse` | Before file edit/create: check lockout registry. If agent is locked out for this artifact path: deny with reason. | P0 |
| P3 | **PII protection — no email collection** | "Never read or store `git config user.email` — email addresses are PII" | `onPreToolUse` | If toolName=powershell/shell AND args contain `git config user.email`: deny. | P0 |
| P4 | **PII scrubbing — tool output sanitization** | (Not currently enforced — gap identified in security audit v1) | `onPostToolUse` | Regex scan `toolResult` for email patterns, API keys (`sk-*`, `ghp_*`, `AKIA*`), JWT tokens. Replace with `[REDACTED]`. | P0 |
| P5 | **Source of Truth write enforcement** | "Agents may only write to files listed in their 'Who May Write' column" | `onPreToolUse` | Maintain per-session allowed-write-paths. If toolName ∈ {edit, create} AND path not in allowlist: deny. | P0 |
| P6 | **File-scope read restriction** | "Each agent may read ONLY: its own files + decisions.md + explicitly listed artifacts" | `onPreToolUse` | If toolName=view AND path is another agent's charter/history (not own, not decisions.md, not in spawn-listed artifacts): deny. | P1 |
| P7 | **Shell command restrictions** | (Implicit — no explicit blocklist in prompt today) | `onPermissionRequest` | When `kind: "shell"`: check command against blocklist (see Implementation Notes). Deny destructive commands. | P0 |
| P8 | **Append-only file protection** | "Append-only files must never be retroactively edited to change meaning" | `onPreToolUse` | If toolName=edit AND path matches append-only patterns (`decisions.md`, `history.md`, `orchestration-log/*`, `log/*`): verify edit is append-only (new content at end, no deletions of existing lines). | P1 |
| P9 | **ask_user rate limiting** | "If ask_user returns < 10 characters, treat as ambiguous" | `onUserInputRequest` | Track ask_user count per session. If count > N (configurable, default 5): auto-respond with "Proceed with best judgment." Also enforce min-length guard. | P1 |
| P10 | **No self-modification of charters** | "agent may not self-modify [charter.md]" | `onPreToolUse` | If toolName ∈ {edit, create} AND path matches `agents/{self}/charter.md`: deny. | P1 |
| P11 | **Decision inbox write-only (no direct decisions.md writes)** | "Agents do NOT write directly to decisions.md" | `onPreToolUse` | If toolName ∈ {edit, create} AND path ends with `decisions.md` AND sessionRole ≠ coordinator: deny with "Write to decisions/inbox/ instead." | P1 |
| P12 | **No secret hardcoding in MCP configs** | "MCP configs must use ${VAR} syntax for secrets — never hardcode API keys" | `onPreToolUse` | If toolName ∈ {edit, create} AND path matches `mcp*.json` or `.vscode/mcp.json`: scan content for hardcoded key patterns. Deny if found. | P1 |
| P13 | **Git push --force prevention** | (Implicit — dangerous git operation) | `onPermissionRequest` | When `kind: "shell"` AND command matches `git push.*--force`: deny. | P0 |
| P14 | **Coordinator must use task tool** | "Every agent interaction MUST use the task tool" | `onPreToolUse` | If sessionRole=coordinator AND toolName ∈ {edit, create} AND path not in `.squad/`: deny with "Route to an agent via task tool." (Overlaps P1; P1 is the specific case, this is the general guard.) | P1 |
| P15 | **No orchestration log editing** | "Never edited after write" (orchestration-log, session log) | `onPreToolUse` | If toolName=edit AND path matches `orchestration-log/*` or `log/*`: deny. Only create is allowed. | P1 |
| P16 | **Registry name preservation** | "Do NOT delete the entry — the name remains reserved" (casting registry) | `onPreToolUse` | If toolName=edit AND path=`casting/registry.json`: parse JSON, verify no entries removed (only status changes or additions). | P2 |
| P17 | **Init Mode file creation gate** | "DO NOT create any files until the user confirms" | `onPreToolUse` | If sessionPhase=init-phase-1 AND toolName=create: deny with "Awaiting user confirmation." | P1 |
| P18 | **Email scrubbing on file writes** | "emails are PII and must not be written to committed files" | `onPreToolUse` | If toolName ∈ {edit, create} AND path is inside `.squad/`: scan new content for email patterns. Deny if found. | P0 |

### Policies That Remain in Prompts (Model Behavior Guidance)

| # | Policy | Why It Stays | Category |
|---|--------|-------------|----------|
| B1 | "What can I launch RIGHT NOW?" — maximize parallel work | Reasoning strategy — no tool call to intercept | Behavioral |
| B2 | "Keep responses human" / "never expose tool internals or SQL" | Output formatting — post-generation styling | Behavioral |
| B3 | Response Mode Selection (Direct/Lightweight/Standard/Full) | Routing judgment — no single tool call to gate | Behavioral |
| B4 | "1-2 agents per question, not all of them" | Efficiency guidance — spawn count is a judgment call | Behavioral |
| B5 | "When in doubt, pick someone and go" | Decisiveness heuristic | Behavioral |
| B6 | Per-agent model selection logic (Layer 1-4) | Model routing tables — complex multi-factor decision | Behavioral |
| B7 | Acknowledge immediately ("Feels Heard") | UX pattern — timing of text output | Behavioral |
| B8 | Directive capture ("Always…", "Never…", "From now on…") | Intent recognition — language understanding | Behavioral |
| B9 | Context caching ("Do NOT re-read team.md on subsequent messages") | Efficiency guidance — no tool call to gate | Behavioral |
| B10 | Casting personality rules ("No role-play. No catchphrases.") | Creative guidance | Behavioral |
| B11 | "Never fall back UP in tier" (model fallback) | Cost logic — no single enforcement point | Behavioral |
| B12 | Ralph continuous loop behavior | Operational flow — not a security boundary | Behavioral |
| B13 | Skill confidence lifecycle (only goes up, never down) | Domain logic — value comparison, not a tool gate | Behavioral |
| B14 | Emoji mapping for task descriptions | Formatting guidance | Behavioral |
| B15 | "Never downgrade mid-task" (response mode) | Consistency guidance | Behavioral |
| B16 | Worktree awareness / team root resolution | Discovery logic — must run before hooks can enforce | Behavioral |
| B17 | Fallback chain / silent retry logic | Error recovery strategy | Behavioral |

### Hybrid Policies (Prompt + Hook Reinforcement)

| # | Policy | Prompt Role | Hook Reinforcement |
|---|--------|-------------|-------------------|
| H1 | "Never simulate or role-play an agent" | Model must understand _why_ to use task tool | `onPreToolUse`: if coordinator attempts to write code files, deny (P1/P14 cover this) |
| H2 | "Each agent may read ONLY its own files" | Agent needs to understand the boundary | `onPreToolUse`: hard-block reads of other agents' private files (P6) |
| H3 | "Agents do NOT write directly to decisions.md" | Agent needs to know the inbox pattern | `onPreToolUse`: hard-block direct writes (P11) |
| H4 | Reviewer lockout semantics | Reviewer needs to understand the protocol | `onPreToolUse`: hard-block locked-out author from file ops on rejected artifact (P2) |
| H5 | MCP secret protection | Agent needs to know ${VAR} pattern | `onPreToolUse`: scan and block hardcoded secrets (P12) |

## Proposed Solution

### Architecture: Policy Middleware Pipeline

Each hook point supports a **pipeline of policy handlers** that execute in sequence. A policy handler is a pure function: `(input, context) → decision`. The pipeline short-circuits on the first `deny`.

```
Tool Call Request
    ↓
┌─────────────────────────┐
│   onPreToolUse Pipeline  │
│                          │
│  ┌──────────────────┐   │
│  │ FileWriteGuard   │───→ deny? → return {permissionDecision: "deny", reason}
│  └────────┬─────────┘   │
│  ┌────────↓─────────┐   │
│  │ ShellBlocklist   │───→ deny? → return {permissionDecision: "deny", reason}
│  └────────┬─────────┘   │
│  ┌────────↓─────────┐   │
│  │ LockoutEnforcer  │───→ deny? → return {permissionDecision: "deny", reason}
│  └────────┬─────────┘   │
│  ┌────────↓─────────┐   │
│  │ PIIWriteGuard    │───→ deny? → return {permissionDecision: "deny", reason}
│  └────────┬─────────┘   │
│  ┌────────↓─────────┐   │
│  │ InitPhaseGuard   │───→ deny? → return {permissionDecision: "deny", reason}
│  └────────┬─────────┘   │
│           ↓              │
│    {permissionDecision:  │
│     "allow"}             │
└─────────────────────────┘
    ↓
Tool Executes
    ↓
┌─────────────────────────┐
│  onPostToolUse Pipeline  │
│                          │
│  ┌──────────────────┐   │
│  │ PIIScrubber      │───→ redact emails, keys, tokens from toolResult
│  └────────┬─────────┘   │
│  ┌────────↓─────────┐   │
│  │ AuditLogger      │───→ log tool call + result to audit trail
│  └────────┬─────────┘   │
│           ↓              │
│    return modified result│
└─────────────────────────┘
```

### Policy Composition Pattern

The SDK's `SessionHooks` interface allows exactly one handler per hook event. We compose multiple policies using a **middleware chain pattern**:

```typescript
import type {
  PreToolUseHandler,
  PreToolUseHookInput,
  PreToolUseHookOutput,
  PostToolUseHandler,
  PostToolUseHookInput,
  PostToolUseHookOutput,
  SessionHooks,
} from "@github/copilot-sdk";

// A single policy: takes input + context, returns output or void (pass-through)
type PreToolUsePolicy = (
  input: PreToolUseHookInput,
  context: PolicyContext
) => PreToolUseHookOutput | void;

interface PolicyContext {
  sessionId: string;
  agentName: string;
  agentRole: "coordinator" | "agent";
  allowedWritePaths: string[];
  allowedReadPaths: string[];
  lockoutRegistry: Map<string, Set<string>>; // artifact → locked-out agents
  sessionPhase: "init-phase-1" | "init-phase-2" | "team-mode";
  askUserCount: number;
  maxAskUser: number;
}

// Compose N policies into one PreToolUseHandler
function composePreToolUsePolicies(
  policies: PreToolUsePolicy[],
  context: PolicyContext
): PreToolUseHandler {
  return async (input, invocation) => {
    for (const policy of policies) {
      const result = policy(input, context);
      if (result?.permissionDecision === "deny") {
        return result; // short-circuit: first deny wins
      }
    }
    return { permissionDecision: "allow" };
  };
}
```

### Session Configuration

Each agent session is created with hook handlers tailored to its role:

```typescript
const session = await client.createSession({
  systemMessage: { mode: "append", content: agentCharter },
  hooks: buildHooksForAgent(agentName, agentRole, spawnContext),
  onPermissionRequest: buildPermissionHandler(agentName, shellPolicy),
  onUserInputRequest: buildAskUserHandler(agentName, sessionLimits),
  availableTools: getToolsForRole(agentRole),
  excludedTools: getExcludedToolsForRole(agentRole),
  // ...
});
```

### Hook Handlers — Detailed Specifications

#### 1. FileWriteGuard (onPreToolUse — P1, P5, P10, P14, P15)

```typescript
function fileWriteGuard(
  input: PreToolUseHookInput,
  ctx: PolicyContext
): PreToolUseHookOutput | void {
  if (!isWriteTool(input.toolName)) return; // pass-through for non-write tools

  const targetPath = extractPath(input.toolArgs);
  if (!targetPath) return;

  const resolved = path.resolve(ctx.teamRoot, targetPath);

  // P1/P14: Coordinator cannot write outside .squad/
  if (ctx.agentRole === "coordinator" && !isSquadPath(resolved)) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        "Coordinator cannot write domain artifacts. Route to an agent via task tool.",
    };
  }

  // P5: Agent can only write to allowed paths
  if (ctx.agentRole === "agent" && !isAllowedWrite(resolved, ctx.allowedWritePaths)) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        `${ctx.agentName} is not authorized to write to ${targetPath}. ` +
        `Allowed paths: ${ctx.allowedWritePaths.join(", ")}`,
    };
  }

  // P10: No self-modification of charters
  if (isCharterPath(resolved, ctx.agentName)) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        "Agents cannot modify their own charter. Request changes via the coordinator.",
    };
  }

  // P15: No editing of append-only logs (only create allowed)
  if (input.toolName === "edit" && isAppendOnlyLogPath(resolved)) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        "Orchestration logs and session logs are append-only. Use create, not edit.",
    };
  }
}
```

#### 2. ShellBlocklist (onPermissionRequest — P7, P13)

```typescript
const BLOCKED_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\s/,
    reason: "Recursive force delete is blocked" },
  { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*r)\s/,
    reason: "Recursive force delete is blocked" },
  { pattern: /git\s+push\s+.*--force/,
    reason: "Force push is blocked — use --force-with-lease if needed" },
  { pattern: /git\s+rebase\s+/,
    reason: "Interactive rebase is blocked — creates merge conflicts across worktrees" },
  { pattern: /git\s+reset\s+--hard/,
    reason: "Hard reset is blocked — destructive to working tree" },
  { pattern: /git\s+clean\s+-[a-zA-Z]*f/,
    reason: "git clean -f is blocked — removes untracked files" },
  { pattern: /:(){ :|:& };:|fork\s*bomb/i,
    reason: "Fork bomb detected" },
  { pattern: />\s*\/dev\/sd[a-z]/,
    reason: "Direct disk write is blocked" },
  { pattern: /mkfs\./,
    reason: "Filesystem format is blocked" },
  { pattern: /dd\s+if=.*of=\/dev/,
    reason: "Direct disk write via dd is blocked" },
  { pattern: /git\s+config\s+(--global\s+)?user\.email/,
    reason: "Reading git user.email is blocked — email is PII" },
  { pattern: /curl\s+.*\|\s*(ba)?sh/,
    reason: "Piping curl to shell is blocked — supply chain risk" },
  { pattern: /npm\s+publish/,
    reason: "npm publish is blocked — release through CI only" },
];

function shellPermissionHandler(
  request: PermissionRequest
): PermissionRequestResult {
  if (request.kind !== "shell") return { kind: "approved" };

  const command = String(request.command ?? "");
  for (const { pattern, reason } of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return {
        kind: "denied-by-rules",
        rules: [{ description: reason }],
      };
    }
  }
  return { kind: "approved" };
}
```

#### 3. PIIScrubber (onPostToolUse — P4)

```typescript
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL REDACTED]",
    label: "email" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g,
    replacement: "[GITHUB_TOKEN REDACTED]",
    label: "github_pat" },
  { pattern: /github_pat_[a-zA-Z0-9_]{82}/g,
    replacement: "[GITHUB_TOKEN REDACTED]",
    label: "github_fine_pat" },
  { pattern: /sk-[a-zA-Z0-9]{48}/g,
    replacement: "[API_KEY REDACTED]",
    label: "openai_key" },
  { pattern: /AKIA[A-Z0-9]{16}/g,
    replacement: "[AWS_KEY REDACTED]",
    label: "aws_access_key" },
  { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    replacement: "[JWT REDACTED]",
    label: "jwt_token" },
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END/g,
    replacement: "[PRIVATE_KEY REDACTED]",
    label: "private_key" },
  { pattern: /xox[bpas]-[a-zA-Z0-9-]{10,}/g,
    replacement: "[SLACK_TOKEN REDACTED]",
    label: "slack_token" },
];

function piiScrubber(
  input: PostToolUseHookInput
): PostToolUseHookOutput | void {
  const text = input.toolResult?.textResultForLlm;
  if (!text || typeof text !== "string") return;

  let scrubbed = text;
  let redactionCount = 0;

  for (const { pattern, replacement } of PII_PATTERNS) {
    const matches = scrubbed.match(pattern);
    if (matches) {
      redactionCount += matches.length;
      scrubbed = scrubbed.replace(pattern, replacement);
    }
  }

  if (redactionCount > 0) {
    return {
      modifiedResult: {
        ...input.toolResult,
        textResultForLlm: scrubbed,
      },
      additionalContext: `⚠️ ${redactionCount} sensitive value(s) redacted from tool output.`,
    };
  }
}
```

#### 4. LockoutEnforcer (onPreToolUse — P2)

```typescript
function lockoutEnforcer(
  input: PreToolUseHookInput,
  ctx: PolicyContext
): PreToolUseHookOutput | void {
  if (!isWriteTool(input.toolName)) return;

  const targetPath = extractPath(input.toolArgs);
  if (!targetPath) return;

  // Check if this agent is locked out for this artifact
  const lockedAgents = ctx.lockoutRegistry.get(normalizePath(targetPath));
  if (lockedAgents?.has(ctx.agentName)) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        `${ctx.agentName} is locked out from revising ${targetPath} due to a reviewer rejection. ` +
        `A different agent must produce the revision.`,
    };
  }
}
```

#### 5. AskUserGuard (onUserInputRequest — P9)

```typescript
function buildAskUserHandler(
  agentName: string,
  limits: { maxQuestions: number }
): UserInputHandler {
  let questionCount = 0;

  return async (request, invocation) => {
    questionCount++;

    if (questionCount > limits.maxQuestions) {
      return {
        answer: "Proceed with your best judgment — question limit reached.",
        wasFreeform: true,
      };
    }

    // Minimum response length guard (existing team decision)
    const realAnswer = await promptUser(request); // delegate to UI layer
    if (realAnswer.answer.length < 10) {
      return {
        answer: realAnswer.answer + " (brief response — proceed with best judgment if ambiguous)",
        wasFreeform: realAnswer.wasFreeform,
      };
    }

    return realAnswer;
  };
}
```

#### 6. InitPhaseGuard (onPreToolUse — P17)

```typescript
function initPhaseGuard(
  input: PreToolUseHookInput,
  ctx: PolicyContext
): PreToolUseHookOutput | void {
  if (ctx.sessionPhase !== "init-phase-1") return;

  if (input.toolName === "create" || input.toolName === "edit") {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        "Init Phase 1: File creation blocked until user confirms the team roster.",
    };
  }
}
```

#### 7. PIIWriteGuard (onPreToolUse — P18)

```typescript
function piiWriteGuard(
  input: PreToolUseHookInput,
  ctx: PolicyContext
): PreToolUseHookOutput | void {
  if (!isWriteTool(input.toolName)) return;

  const targetPath = extractPath(input.toolArgs);
  if (!targetPath || !isSquadPath(targetPath)) return;

  const content = extractContent(input.toolArgs);
  if (!content) return;

  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Exclude known safe patterns
  const safePatterns = [
    /github-actions\[bot\]@users\.noreply\.github\.com/g,
    /@example\.com/g,
    /noreply@github\.com/g,
  ];

  let cleaned = content;
  for (const safe of safePatterns) {
    cleaned = cleaned.replace(safe, "");
  }

  if (emailPattern.test(cleaned)) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        "Email address detected in content being written to .squad/. " +
        "PII must not be committed to repository files. Remove the email and retry.",
    };
  }
}
```

#### 8. AppendOnlyGuard (onPreToolUse — P8)

```typescript
function appendOnlyGuard(
  input: PreToolUseHookInput,
  ctx: PolicyContext
): PreToolUseHookOutput | void {
  if (input.toolName !== "edit") return;

  const targetPath = extractPath(input.toolArgs);
  if (!targetPath) return;

  const appendOnlyPaths = [
    /\/decisions\.md$/,
    /\/history\.md$/,
    /\/orchestration-log\//,
    /\/log\//,
  ];

  const isAppendOnly = appendOnlyPaths.some((p) => p.test(targetPath));
  if (!isAppendOnly) return;

  // For edit tool: check that old_str appears at the end of the file
  // or that the edit is purely additive (new_str contains old_str as prefix)
  const oldStr = extractOldStr(input.toolArgs);
  const newStr = extractNewStr(input.toolArgs);

  if (oldStr && newStr && !newStr.startsWith(oldStr)) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        `${targetPath} is append-only. Edits must only add content, not modify or remove existing entries.`,
    };
  }
}
```

### Error Handling: When a Hook Blocks an Action

When a hook denies a tool call, the following happens:

1. **The tool does not execute.** The SDK intercepts the call; the underlying tool never fires.
2. **The model receives the denial reason** via `permissionDecisionReason`. This is injected into the conversation as context the model can reason about.
3. **The model chooses an alternative path.** Well-written denial reasons guide the model toward the correct behavior (e.g., "Write to decisions/inbox/ instead" or "Route to an agent via task tool").
4. **Audit logging.** Every denial is logged to the audit trail (via `onPostToolUse` audit logger or a dedicated denial logger) with timestamp, session ID, agent name, tool name, and reason.
5. **User notification policy:**
   - **Silent deny (default):** Most denials are operational — the model self-corrects. No user notification.
   - **User-visible deny:** When the model cannot self-correct after 2 attempts on the same policy, surface to the user: `"⚠️ {AgentName} attempted {action} but was blocked: {reason}. Routing to an alternative."`
   - **Critical deny (P0 policies):** PII violations and destructive shell commands always log to a security audit file at `.squad/security-audit.log`.

### Policy Configuration Format

Policies are configured per-team, allowing customization without code changes:

```typescript
// .squad/config/policies.json (generated at squad init, user-editable)
interface PolicyConfig {
  shellBlocklist: {
    enabled: boolean;
    customPatterns: Array<{ pattern: string; reason: string }>;
    allowForceWithLease: boolean;
  };
  piiScrubbing: {
    enabled: boolean;
    customPatterns: Array<{ pattern: string; replacement: string }>;
    excludePatterns: string[];  // domains/patterns to ignore (e.g., "@example.com")
  };
  askUserLimits: {
    maxQuestionsPerSession: number;  // default: 5
    minResponseLength: number;       // default: 10
  };
  fileWriteGuards: {
    enabled: boolean;
    additionalAllowedPaths: Record<string, string[]>;  // agentName → extra paths
  };
  reviewerLockout: {
    enabled: boolean;
    escalateToUserAfterLockoutCount: number;  // default: 3
  };
}
```

## Key Decisions

### Decided

| # | Decision | Rationale | By |
|---|----------|-----------|-----|
| D1 | `onPreToolUse` with `permissionDecision: "deny"` is the primary enforcement mechanism | Hard block — tool never executes. Model receives denial reason. This is the strongest guarantee the SDK offers. | Baer |
| D2 | Policies compose via middleware pipeline, not a single monolithic handler | Separation of concerns. Each policy is independently testable. New policies can be added without modifying existing ones. | Baer |
| D3 | Hybrid approach: hooks enforce + prompts guide | Some policies need both: the model must _understand_ the rule (prompt) and the system must _enforce_ it (hook). Removing prompt guidance entirely would confuse the model when hooks deny actions. | Baer, Verbal |
| D4 | PII scrubbing runs in `onPostToolUse`, not `onPreToolUse` | Pre-tool-use can't scrub output — the tool hasn't run yet. Post-tool-use intercepts the result before the model sees it. | Baer |
| D5 | Shell blocklist uses `onPermissionRequest`, not `onPreToolUse` | The SDK fires `onPermissionRequest` with `kind: "shell"` specifically for shell commands, giving us the raw command string. This is more reliable than parsing shell tool args. | Baer, Fenster |
| D6 | Policy config is JSON file in `.squad/config/`, not hardcoded | Teams have different risk tolerances. An enterprise team may want stricter PII patterns; an open-source project may relax shell restrictions. | Baer |
| D7 | Denial reasons are actionable guidance, not error messages | "Write to decisions/inbox/ instead" is better than "Permission denied." The model uses the reason to self-correct. | Verbal |

### Needs Decision

| # | Question | Options | Recommendation | Owner |
|---|----------|---------|---------------|-------|
| N1 | Should hook denials be visible in the user's chat? | (a) Never — model self-corrects silently; (b) After 2 failed attempts; (c) Always | (b) — silent unless stuck. P0 violations always log to audit file. | Brady |
| N2 | Should `onPostToolUse` PII scrubbing apply to all tools or only shell/read tools? | (a) All tools; (b) Shell + view only; (c) Configurable per tool | (a) All tools — defense in depth. Performance cost is negligible (regex on strings). | Baer |
| N3 | Where does the lockout registry live across sessions? | (a) In-memory only (session-scoped); (b) `.squad/lockout.json` (persistent); (c) Derived from decisions.md | (b) — persistent file. Lockouts must survive session restarts. Scribe manages the file. | Fenster |
| N4 | Should `allowForceWithLease` default to true or false? | (a) True — it's the safe version of force push; (b) False — block all force operations | (a) True — `--force-with-lease` has safety guarantees that `--force` lacks. | Kobayashi |

## Implementation Notes

### TypeScript Module Structure

```
src/
  hooks/
    index.ts              # Exports composeHooks(), buildHooksForAgent()
    types.ts              # PolicyContext, PolicyConfig, PreToolUsePolicy types
    pipeline.ts           # composePreToolUsePolicies(), composePostToolUsePolicies()
    policies/
      file-write-guard.ts     # P1, P5, P10, P14, P15
      shell-blocklist.ts       # P7, P13
      pii-scrubber.ts          # P4
      pii-write-guard.ts       # P18
      lockout-enforcer.ts      # P2
      ask-user-guard.ts        # P9
      init-phase-guard.ts      # P17
      append-only-guard.ts     # P8
      decision-inbox-guard.ts  # P11
      secret-guard.ts          # P12
      registry-guard.ts        # P16
    audit/
      audit-logger.ts          # Post-tool-use audit trail
      security-audit.ts        # P0 violation logger
    config/
      policy-config.ts         # Load/validate PolicyConfig from .squad/config/policies.json
      defaults.ts              # Default policy configuration
  __tests__/
    hooks/
      file-write-guard.test.ts
      shell-blocklist.test.ts
      pii-scrubber.test.ts
      lockout-enforcer.test.ts
      pipeline.test.ts
      ... (one test file per policy)
```

### Path Resolution Helpers

All path checks must account for:
- Relative vs. absolute paths
- Windows vs. POSIX separators
- Symlink resolution
- `.squad/` vs `.ai-team/` fallback
- Worktree-local vs. main-checkout team root

```typescript
function isSquadPath(filePath: string, teamRoot: string): boolean {
  const resolved = path.resolve(teamRoot, filePath);
  const squadDir = path.resolve(teamRoot, ".squad");
  const aiTeamDir = path.resolve(teamRoot, ".ai-team");
  return resolved.startsWith(squadDir) || resolved.startsWith(aiTeamDir);
}
```

### Per-Agent Hook Configuration at Spawn Time

When the coordinator creates an agent session, it builds the hook configuration from:

1. **Agent role** from `team.md` → determines base allowed-write-paths
2. **Source of Truth table** → populates `allowedWritePaths` and `allowedReadPaths`
3. **Spawn prompt artifacts** → adds explicitly listed input files to `allowedReadPaths`
4. **Lockout registry** → loaded from `.squad/lockout.json` (if exists)
5. **Policy config** → loaded from `.squad/config/policies.json` (if exists, else defaults)

```typescript
function buildHooksForAgent(
  agentName: string,
  agentRole: "coordinator" | "agent",
  spawnContext: SpawnContext
): SessionHooks {
  const ctx: PolicyContext = {
    sessionId: spawnContext.sessionId,
    agentName,
    agentRole,
    teamRoot: spawnContext.teamRoot,
    allowedWritePaths: computeAllowedWritePaths(agentName, agentRole, spawnContext),
    allowedReadPaths: computeAllowedReadPaths(agentName, spawnContext),
    lockoutRegistry: loadLockoutRegistry(spawnContext.teamRoot),
    sessionPhase: spawnContext.phase,
    askUserCount: 0,
    maxAskUser: spawnContext.policyConfig.askUserLimits.maxQuestionsPerSession,
  };

  const preToolUsePolicies: PreToolUsePolicy[] = [
    initPhaseGuard,
    fileWriteGuard,
    lockoutEnforcer,
    piiWriteGuard,
    appendOnlyGuard,
    decisionInboxGuard,
    secretGuard,
    registryGuard,
    fileReadGuard,
  ];

  const postToolUsePolicies: PostToolUsePolicy[] = [
    piiScrubber,
    auditLogger,
  ];

  return {
    onPreToolUse: composePreToolUsePolicies(preToolUsePolicies, ctx),
    onPostToolUse: composePostToolUsePolicies(postToolUsePolicies, ctx),
    onSessionStart: sessionStartHandler(ctx),
    onSessionEnd: sessionEndHandler(ctx),
    onErrorOccurred: errorHandler(ctx),
  };
}
```

### Prompt Size Reduction Estimate

| Section Removed/Trimmed | Current Size (est.) | Savings | Notes |
|------------------------|--------------------:|--------:|-------|
| Refusal rules block (lines 18-21) | ~200 bytes | ~200 bytes | Replaced by P1, P14 hooks |
| PII/email prohibition (line 33, repeated) | ~300 bytes | ~250 bytes | Replaced by P3, P4, P18 hooks. Keep 1-line reminder. |
| Source of Truth "Rules" subsection | ~400 bytes | ~350 bytes | Replaced by P5, P8, P11, P15 hooks. Keep the table for reference. |
| Reviewer lockout semantics (lines 887-897) | ~900 bytes | ~700 bytes | Replaced by P2 hook. Keep 2-line summary explaining the concept. |
| "What NOT to Do" anti-patterns (lines 676-682) | ~600 bytes | ~400 bytes | P1, P14 enforce the critical ones. Keep as behavioral guidance (trimmed). |
| Constraints section overlap (lines 863-872) | ~500 bytes | ~350 bytes | Deduplicate with hooks. Keep behavioral constraints only. |
| Init Mode file creation gate (line 57) | ~200 bytes | ~150 bytes | Replaced by P17. Keep phase flow description. |
| Append-only enforcement text | ~300 bytes | ~250 bytes | Replaced by P8, P15. Keep 1-line mention. |
| **Total estimated savings** | | **~2,650 bytes** | **~800 tokens at ~3.3 chars/token** |

With additional prompt trimming of now-redundant elaboration around hook-enforced policies, realistic savings reach **~4–6KB** (~1,200–1,800 tokens). This is the low end of the 30-50% target because the always-loaded governance section is ~4-6KB of the ~17K always-loaded tokens. The percentage reduction applies to the _governance portion_ of the prompt, not the entire prompt.

**Net context budget recovery:** ~1,200–1,800 tokens per turn × every turn in session = significant cumulative savings, especially for long sessions with Ralph active (dozens of turns).

## Risks & Mitigations

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | **Hook bypass via SDK bug or version change** — SDK Technical Preview may change hook behavior | HIGH | MEDIUM | Pin SDK version. Integration tests verify every hook fires. If hooks stop firing, fail-open with warning to user + prompt fallback. |
| R2 | **False positive denials** — overly aggressive path matching or PII patterns block legitimate work | HIGH | MEDIUM | Allowlist patterns for known-safe values (bot emails, example.com). Policy config allows per-team tuning. Comprehensive test suite with edge cases. |
| R3 | **Model confusion from denial reasons** — model enters retry loop or hallucinates workarounds | MEDIUM | MEDIUM | Denial reasons include explicit alternative instructions. Rate-limit retries (max 3 per policy per turn). After limit, surface to user. |
| R4 | **Performance impact of hook interception** — regex scanning on every tool call adds latency | LOW | LOW | PII patterns are pre-compiled regexes. Benchmark target: <5ms per hook invocation. String scanning is O(n) on output length; tool outputs are typically <50KB. |
| R5 | **Lockout registry corruption** — concurrent sessions write conflicting lockout state | MEDIUM | LOW | Lockout file uses atomic write (write temp → rename). File format is append-only JSON lines. Scribe is the sole writer (single-writer pattern). |
| R6 | **PII pattern evasion** — model encodes PII in base64 or obfuscated form | LOW | LOW | Defense in depth: hook scrubbing + prompt prohibition + email audit on `.squad/` files. Accept that determined evasion is out of scope for v1. |
| R7 | **`onPreToolUse` doesn't fire for SDK-internal operations** — some tool calls may bypass hooks | MEDIUM | UNKNOWN | Verify during Phase 1 POC which tools trigger hooks. Document any gaps. Add `onPermissionRequest` as backup for shell/write/read operations. |
| R8 | **Policy config tampering** — agent modifies `.squad/config/policies.json` to relax rules | MEDIUM | LOW | `policies.json` path is added to coordinator-only write list. Agents cannot write to it. Additionally, critical P0 policies (PII, shell) have hardcoded minimums that config cannot disable. |

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| **Prompt size reduction** | ≥2.5KB removed from always-loaded section | Diff `squad.agent.md` before/after migration; count bytes removed |
| **Policy test coverage** | 100% of hook-enforced policies have unit tests | Test file count matches policy count; coverage tool reports ≥95% line coverage |
| **Zero PII in tool outputs** | 0 unredacted emails/tokens reach model context in test suite | Dedicated PII injection test: run 50+ tool calls with seeded PII, verify all scrubbed |
| **Hook latency** | <5ms P99 per hook invocation | Benchmark suite: 1000 hook invocations, measure P50/P95/P99 |
| **False positive rate** | <1% of legitimate tool calls denied | Run full test suite (existing `npm test`); count hook denials on valid operations |
| **Lockout enforcement** | 100% of reviewer lockout violations caught | Integration test: simulate rejection → re-spawn original author → verify denial |
| **Shell blocklist coverage** | All destructive commands in blocklist denied | Unit test per blocklist entry + fuzzing with command variations |
| **Denial self-correction rate** | ≥90% of denials lead to model self-correcting without user escalation | Log analysis: count denials vs. user-escalated denials over 100 sessions |

## Open Questions

1. **Does `onPreToolUse` fire for _all_ tool calls including built-in CLI tools (view, edit, grep, glob, powershell)?** The SDK documentation doesn't explicitly enumerate which tools trigger hooks. This must be verified in Phase 1 POC. If some tools bypass hooks, we need `onPermissionRequest` as a fallback layer.

2. **Can `modifiedArgs` in PreToolUseHookOutput be used to sanitize inputs (e.g., strip `--force` from a git push command) rather than denying outright?** This would be more graceful than denial for some policies. Needs SDK behavior testing.

3. **How does `onPostToolUse` interact with streaming?** If the session has `streaming: true`, does the post-tool-use hook fire on the complete result or on each chunk? PII scrubbing needs the complete output to avoid partial matches.

4. **What is the hook invocation order when both `onPreToolUse` and `onPermissionRequest` are registered?** If both can deny a tool call, we need to know which fires first to avoid redundant checks.

5. **Should we implement a `--no-hooks` escape hatch for development/debugging?** This would bypass all policy enforcement. Dangerous but useful for debugging false positives. Recommendation: CLI flag only, never exposed in production configs. Log a security warning when used.

6. **How do we handle hook state for resumed sessions?** The `lockoutRegistry`, `askUserCount`, and `sessionPhase` are in-memory. When `client.resumeSession()` is called, hooks must be re-initialized with the correct state. Should state be persisted to the session workspace?

7. **What happens if the `onPostToolUse` PII scrubber modifies a tool result that the model then tries to reference?** For example, if a file read returns an email and the scrubber redacts it, the model may try to use that email in a subsequent write. The write will be blocked by PIIWriteGuard, but the model may be confused. Should we add `additionalContext` explaining the redaction?

8. **Performance budget for the full pipeline:** With 9 pre-tool-use policies and 2 post-tool-use policies running on every tool call, and an average of 15-30 tool calls per agent session, what's the cumulative overhead? Needs benchmarking, but projected at <150ms total per session (11 policies × <5ms × 25 calls = ~1.3s worst case, but most policies short-circuit immediately).
