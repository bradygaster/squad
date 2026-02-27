# SPIKE #71: Usage Telemetry Event Capture — SDK Source Analysis

## Executive Summary
**Confirmed:** `assistant.usage` events are `ephemeral: true` (NOT persisted in session history). Must be captured in real-time via event listeners. Rich usage data available in real-time; aggregate metrics available at `session.shutdown`.

---

## Finding 1: assistant.usage Event is Ephemeral

**File:** `C:\src\copilot-sdk\nodejs\src\generated\session-events.ts:430-459`

```typescript
{
    id: string;
    timestamp: string;
    parentId: string | null;
    ephemeral: true;  // ← NOT persisted in session history
    type: "assistant.usage";
    data: {
        model: string;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        cost?: number;
        duration?: number;
        initiator?: string;
        apiCallId?: string;
        providerCallId?: string;
        parentToolCallId?: string;
        quotaSnapshots?: {
            [quotaType: string]: {
                isUnlimitedEntitlement: boolean;
                entitlementRequests: number;
                usedRequests: number;
                usageAllowedWithExhaustedQuota: boolean;
                overage: number;
                overageAllowedWithExhaustedQuota: boolean;
                remainingPercentage: number;
                resetDate?: string;
            };
        };
    };
}
```

**Analysis:**
- **`ephemeral: true`** means event is NOT included in `session.getMessages()`
- Event is emitted in real-time but NOT stored in session history
- **MUST capture in event listener** — cannot retrieve retroactively
- Event is emitted ONCE per API call (not repeated)

---

## Finding 2: Comprehensive Usage Data Available

### Token Breakdown:
```typescript
inputTokens?: number;          // Prompt tokens sent to model
outputTokens?: number;         // Completion tokens generated
cacheReadTokens?: number;      // Tokens served from cache (cheaper)
cacheWriteTokens?: number;     // Tokens written to cache
```

**Analysis:**
- Full token breakdown per API call
- Cache metrics available (important for cost optimization)
- All fields are optional (model-dependent)

---

### Cost and Duration:
```typescript
cost?: number;          // Monetary cost of this API call
duration?: number;      // Time in milliseconds
```

**Analysis:**
- `cost` is pre-calculated by CLI (no need to compute from tokens)
- `duration` is wall-clock time of API call (latency tracking)

---

### Traceability:
```typescript
initiator?: string;           // What triggered this call (e.g., "user_message", "tool_execution")
apiCallId?: string;           // SDK-assigned call ID
providerCallId?: string;      // Provider-side request ID (for support tickets)
parentToolCallId?: string;    // Tool call that triggered this (if tool-initiated)
```

**Analysis:**
- Full traceability of API call chain
- Can correlate usage with user actions or tool executions
- `providerCallId` useful for debugging with GitHub support

---

### Quota Snapshots (Enterprise/Copilot Business):
```typescript
quotaSnapshots?: {
    [quotaType: string]: {
        isUnlimitedEntitlement: boolean;
        entitlementRequests: number;
        usedRequests: number;
        usageAllowedWithExhaustedQuota: boolean;
        overage: number;
        overageAllowedWithExhaustedQuota: boolean;
        remainingPercentage: number;
        resetDate?: string;
    };
}
```

**Analysis:**
- Real-time quota state per API call
- Multiple quota types supported (model-specific quotas)
- `remainingPercentage` useful for proactive throttling
- `resetDate` allows scheduling around quota resets

---

## Finding 3: Session Shutdown Aggregate Metrics

**File:** `C:\src\copilot-sdk\nodejs\src\generated\session-events.ts:196-225`

```typescript
{
    ephemeral: true;  // ← Also ephemeral (capture on event)
    type: "session.shutdown";
    data: {
        shutdownType: "routine" | "error";
        errorReason?: string;
        totalPremiumRequests: number;
        totalApiDurationMs: number;
        sessionStartTime: number;
        codeChanges: {
            linesAdded: number;
            linesRemoved: number;
            filesModified: string[];
        };
        modelMetrics: {
            [modelId: string]: {
                requests: {
                    count: number;
                    cost: number;
                };
                usage: {
                    inputTokens: number;
                    outputTokens: number;
                    cacheReadTokens: number;
                    cacheWriteTokens: number;
                };
            };
        };
        currentModel?: string;
    };
}
```

**Analysis:**
- **Aggregate metrics** across entire session lifetime
- **Per-model breakdown** (useful for multi-model sessions)
- **Code changes tracked** (lines added/removed, files modified)
- **Total API duration** (performance analysis)
- **ALSO ephemeral** (must capture on event)

---

## Finding 4: No Retroactive Telemetry Retrieval

**Ephemeral events are NOT stored:**
```typescript
async getMessages(): Promise<SessionEvent[]> {
    // Returns ONLY non-ephemeral events
    // assistant.usage events are EXCLUDED
}
```

**Analysis:**
- `session.getMessages()` does NOT include `assistant.usage` events
- `session.shutdown` event is also ephemeral (not in history)
- **NO API to retrieve past usage data** after session ends
- **MUST capture events in real-time**

---

## Data Model for Squad Telemetry Persistence

### Schema: Usage Event Table

```sql
CREATE TABLE usage_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    cost REAL,
    duration_ms INTEGER,
    initiator TEXT,
    api_call_id TEXT,
    provider_call_id TEXT,
    parent_tool_call_id TEXT,
    quota_snapshot_json TEXT  -- JSON blob of quotaSnapshots
);

CREATE INDEX idx_usage_session ON usage_events(session_id);
CREATE INDEX idx_usage_timestamp ON usage_events(timestamp);
CREATE INDEX idx_usage_model ON usage_events(model);
```

---

### Schema: Session Summary Table

```sql
CREATE TABLE session_summaries (
    session_id TEXT PRIMARY KEY,
    shutdown_type TEXT,  -- "routine" | "error"
    error_reason TEXT,
    total_premium_requests INTEGER,
    total_api_duration_ms INTEGER,
    session_start_time INTEGER,
    lines_added INTEGER,
    lines_removed INTEGER,
    files_modified_json TEXT,  -- JSON array of file paths
    model_metrics_json TEXT,   -- JSON blob of per-model metrics
    current_model TEXT
);
```

---

### Implementation: Telemetry Capture Layer

```typescript
class SquadTelemetry {
    private db: Database;  // SQLite or similar
    
    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.initTables();
    }
    
    attachToSession(session: CopilotSession) {
        // Capture usage events in real-time
        session.on("assistant.usage", (event) => {
            this.recordUsage(session.sessionId, event);
        });
        
        // Capture shutdown summary
        session.on("session.shutdown", (event) => {
            this.recordShutdown(session.sessionId, event);
        });
    }
    
    private recordUsage(sessionId: string, event: any) {
        this.db.run(`
            INSERT INTO usage_events (
                id, session_id, timestamp, model,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                cost, duration_ms, initiator, api_call_id, provider_call_id,
                parent_tool_call_id, quota_snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            event.id,
            sessionId,
            event.timestamp,
            event.data.model,
            event.data.inputTokens ?? null,
            event.data.outputTokens ?? null,
            event.data.cacheReadTokens ?? null,
            event.data.cacheWriteTokens ?? null,
            event.data.cost ?? null,
            event.data.duration ?? null,
            event.data.initiator ?? null,
            event.data.apiCallId ?? null,
            event.data.providerCallId ?? null,
            event.data.parentToolCallId ?? null,
            JSON.stringify(event.data.quotaSnapshots ?? null)
        ]);
    }
    
    private recordShutdown(sessionId: string, event: any) {
        this.db.run(`
            INSERT INTO session_summaries (
                session_id, shutdown_type, error_reason,
                total_premium_requests, total_api_duration_ms, session_start_time,
                lines_added, lines_removed, files_modified_json,
                model_metrics_json, current_model
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            sessionId,
            event.data.shutdownType,
            event.data.errorReason ?? null,
            event.data.totalPremiumRequests,
            event.data.totalApiDurationMs,
            event.data.sessionStartTime,
            event.data.codeChanges.linesAdded,
            event.data.codeChanges.linesRemoved,
            JSON.stringify(event.data.codeChanges.filesModified),
            JSON.stringify(event.data.modelMetrics),
            event.data.currentModel ?? null
        ]);
    }
    
    // Query methods
    
    getSessionCost(sessionId: string): number {
        const result = this.db.query(
            `SELECT SUM(cost) as total FROM usage_events WHERE session_id = ?`,
            [sessionId]
        );
        return result.rows[0].total ?? 0;
    }
    
    getSessionTokens(sessionId: string): {
        input: number, output: number, cacheRead: number, cacheWrite: number
    } {
        const result = this.db.query(`
            SELECT
                SUM(input_tokens) as input,
                SUM(output_tokens) as output,
                SUM(cache_read_tokens) as cache_read,
                SUM(cache_write_tokens) as cache_write
            FROM usage_events WHERE session_id = ?
        `, [sessionId]);
        
        return result.rows[0];
    }
    
    getModelBreakdown(sessionId: string): Record<string, {
        requests: number,
        cost: number,
        tokens: { input: number, output: number }
    }> {
        const rows = this.db.query(`
            SELECT
                model,
                COUNT(*) as requests,
                SUM(cost) as cost,
                SUM(input_tokens) as input,
                SUM(output_tokens) as output
            FROM usage_events
            WHERE session_id = ?
            GROUP BY model
        `, [sessionId]);
        
        const breakdown: Record<string, any> = {};
        for (const row of rows) {
            breakdown[row.model] = {
                requests: row.requests,
                cost: row.cost,
                tokens: { input: row.input, output: row.output }
            };
        }
        return breakdown;
    }
    
    getCacheEfficiency(sessionId: string): number {
        const result = this.db.query(`
            SELECT
                SUM(cache_read_tokens) as cache_read,
                SUM(input_tokens) as input
            FROM usage_events WHERE session_id = ?
        `, [sessionId]);
        
        const { cache_read, input } = result.rows[0];
        if (!input) return 0;
        return (cache_read / input) * 100;  // Percentage
    }
}
```

---

## Real-Time Telemetry Patterns

### Pattern 1: Cost Budgeting
```typescript
const MAX_SESSION_COST = 5.00;  // $5 budget per session
let sessionCost = 0;

session.on("assistant.usage", (event) => {
    sessionCost += event.data.cost ?? 0;
    
    if (sessionCost > MAX_SESSION_COST) {
        console.warn(`Budget exceeded: $${sessionCost.toFixed(2)}`);
        session.abort();  // Stop processing
    }
});
```

---

### Pattern 2: Quota Monitoring
```typescript
session.on("assistant.usage", (event) => {
    const quotas = event.data.quotaSnapshots;
    if (!quotas) return;
    
    for (const [type, quota] of Object.entries(quotas)) {
        if (quota.remainingPercentage < 10) {
            console.warn(`Quota ${type} at ${quota.remainingPercentage.toFixed(1)}%`);
            console.warn(`Resets at ${quota.resetDate}`);
            // Implement throttling or switching to different model
        }
    }
});
```

---

### Pattern 3: Performance Tracking
```typescript
const apiLatencies: number[] = [];

session.on("assistant.usage", (event) => {
    const duration = event.data.duration;
    if (duration) {
        apiLatencies.push(duration);
        
        const avg = apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length;
        console.log(`Avg API latency: ${avg.toFixed(0)}ms`);
        
        if (duration > 30000) {  // 30s threshold
            console.warn(`Slow API call: ${duration}ms (call: ${event.data.apiCallId})`);
        }
    }
});
```

---

### Pattern 4: Cache Optimization Tracking
```typescript
session.on("assistant.usage", (event) => {
    const { inputTokens, cacheReadTokens, cacheWriteTokens } = event.data;
    
    if (cacheReadTokens && inputTokens) {
        const cacheHitRate = (cacheReadTokens / inputTokens) * 100;
        console.log(`Cache hit rate: ${cacheHitRate.toFixed(1)}%`);
    }
    
    if (cacheWriteTokens) {
        console.log(`Wrote ${cacheWriteTokens} tokens to cache`);
    }
});
```

---

## Shutdown Event Analysis

### Per-Model Metrics Example:
```typescript
session.on("session.shutdown", (event) => {
    console.log(`Session ended: ${event.data.shutdownType}`);
    
    for (const [model, metrics] of Object.entries(event.data.modelMetrics)) {
        console.log(`\nModel: ${model}`);
        console.log(`  Requests: ${metrics.requests.count}`);
        console.log(`  Cost: $${metrics.requests.cost.toFixed(2)}`);
        console.log(`  Input tokens: ${metrics.usage.inputTokens.toLocaleString()}`);
        console.log(`  Output tokens: ${metrics.usage.outputTokens.toLocaleString()}`);
        console.log(`  Cache reads: ${metrics.usage.cacheReadTokens.toLocaleString()}`);
    }
    
    console.log(`\nTotal API time: ${event.data.totalApiDurationMs / 1000}s`);
    console.log(`Premium requests: ${event.data.totalPremiumRequests}`);
});
```

---

### Code Changes Tracking:
```typescript
session.on("session.shutdown", (event) => {
    const { linesAdded, linesRemoved, filesModified } = event.data.codeChanges;
    
    console.log(`\nCode Changes:`);
    console.log(`  +${linesAdded} lines`);
    console.log(`  -${linesRemoved} lines`);
    console.log(`  ${filesModified.length} files modified`);
    console.log(`  Net change: ${linesAdded - linesRemoved} lines`);
    
    if (filesModified.length > 0) {
        console.log(`\nFiles:`);
        filesModified.forEach(file => console.log(`    ${file}`));
    }
});
```

---

## Recommendations for Squad

### 1. Implement Telemetry Layer at Startup
```typescript
const telemetry = new SquadTelemetry(".ai-team/telemetry.db");

// Attach to all sessions
function createTrackedSession(config: SessionConfig) {
    const session = await client.createSession(config);
    telemetry.attachToSession(session);
    return session;
}
```

---

### 2. Real-Time Cost Dashboard
```typescript
// Display live cost metrics during agent execution
setInterval(() => {
    const activeSessions = squad.getActiveSessions();
    for (const session of activeSessions) {
        const cost = telemetry.getSessionCost(session.sessionId);
        const tokens = telemetry.getSessionTokens(session.sessionId);
        console.log(`${session.agentName}: $${cost.toFixed(2)} | ${tokens.input}↓ ${tokens.output}↑`);
    }
}, 5000);  // Update every 5s
```

---

### 3. Post-Session Reports
```typescript
async function generateSessionReport(sessionId: string) {
    const summary = telemetry.getSessionSummary(sessionId);
    const modelBreakdown = telemetry.getModelBreakdown(sessionId);
    const cacheEfficiency = telemetry.getCacheEfficiency(sessionId);
    
    console.log(`\n=== Session Report: ${sessionId} ===`);
    console.log(`Duration: ${summary.totalApiDurationMs / 1000}s`);
    console.log(`Total Cost: $${summary.totalCost.toFixed(2)}`);
    console.log(`Cache Efficiency: ${cacheEfficiency.toFixed(1)}%`);
    console.log(`Code Changes: +${summary.linesAdded} -${summary.linesRemoved}`);
    
    console.log(`\nModel Usage:`);
    for (const [model, metrics] of Object.entries(modelBreakdown)) {
        console.log(`  ${model}: ${metrics.requests} requests, $${metrics.cost.toFixed(2)}`);
    }
}
```

---

### 4. Budget Enforcement
```typescript
const BUDGET_PER_SESSION = 10.00;  // $10 limit

session.on("assistant.usage", (event) => {
    const currentCost = telemetry.getSessionCost(session.sessionId);
    
    if (currentCost > BUDGET_PER_SESSION) {
        console.error(`Session ${session.sessionId} exceeded budget: $${currentCost.toFixed(2)}`);
        session.abort();
        session.destroy();
    }
});
```

---

## Testing Recommendations

1. **Verify ephemeral capture:** Confirm `assistant.usage` is NOT in `getMessages()`
2. **Test telemetry persistence:** Create session, capture events, query database
3. **Stress test event rate:** High-frequency API calls to validate no dropped events
4. **Shutdown event timing:** Validate shutdown event is emitted before session destruction

---

## Related SDK Observations

- **No batch event retrieval:** Cannot fetch multiple ephemeral events retroactively
- **No event replay:** No way to re-emit historical events
- **No telemetry aggregation API:** SDK does not provide built-in analytics

---

## Questions for SDK Team (if escalation needed)

1. Is persistent telemetry storage planned for future SDK releases?
2. Can `assistant.usage` events be made non-ephemeral via config?
3. Are there recommended patterns for telemetry aggregation?
4. Does the CLI expose a telemetry export API?

---

**Next Steps:**
- [ ] Implement `SquadTelemetry` class with SQLite backend
- [ ] Attach telemetry to all Squad sessions
- [ ] Build cost dashboard for real-time monitoring
- [ ] Generate post-session reports for billing/analytics
