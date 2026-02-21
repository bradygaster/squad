# SPIKE #70: Concurrent Session Rate Limiting — SDK Source Analysis

## Executive Summary
**Confirmed:** The SDK has ZERO built-in rate limiting, retry logic, or backpressure mechanisms. All error handling is delegated to the caller. 429 errors are surfaced via `session.error` events with `statusCode` field.

---

## Finding 1: No Rate Limiting in Client

**File:** `C:\src\copilot-sdk\nodejs\src\client.ts`

**Analysis:**
- Searched entire client.ts for keywords: `retry`, `rate`, `limit`, `throttle`, `backoff`, `429`
- **ZERO rate limiting code exists**
- Only rate limiting reference is a comment on line 723: _"Results are cached after the first successful call to avoid rate limiting"_ for `listModels()` API (SDK-level caching, not rate limiting)

**Code Evidence:**
```typescript
// client.ts:520 - Session creation (no rate limiting)
async createSession(config: SessionConfig = {}): Promise<CopilotSession> {
    const response = await this.connection!.sendRequest("session.create", {
        model: config.model,
        // ... no retry, no backoff, no rate limit checks
    });
}

// client.ts:603 - Session resume (no rate limiting)
async resumeSession(sessionId: string, config: ResumeSessionConfig = {}): Promise<CopilotSession> {
    const response = await this.connection!.sendRequest("session.resume", {
        // ... no retry, no backoff, no rate limit checks
    });
}
```

---

## Finding 2: No Retry Logic in SessionConfig

**File:** `C:\src\copilot-sdk\nodejs\src\types.ts:613-733`

```typescript
export interface SessionConfig {
    sessionId?: string;
    clientName?: string;
    model?: string;
    tools?: Tool<any>[];
    systemMessage?: SystemMessageConfig;
    onPermissionRequest?: PermissionHandler;
    onUserInputRequest?: UserInputHandler;
    hooks?: SessionHooks;
    // ... NO retry config, NO backpressure config
}
```

**Analysis:**
- No `retryPolicy` field
- No `maxConcurrentRequests` field
- No `backpressure` configuration
- No `errorHandling` mode

---

## Finding 3: Error Handling is Event-Based Only

**File:** `C:\src\copilot-sdk\nodejs\src\generated\session-events.ts:49-58`

```typescript
{
    ephemeral?: boolean;
    type: "session.error";
    data: {
        errorType: string;
        message: string;
        stack?: string;
        statusCode?: number;  // ← 429 would appear here
        providerCallId?: string;
    };
}
```

**Analysis:**
- Errors are emitted as `session.error` events
- `statusCode` field exists (e.g., 429 for rate limits)
- **NO automatic retry** — caller must handle in event listener
- Errors do NOT throw exceptions; they are event-driven

---

## Finding 4: Hooks Do Not Support Retry Logic

**File:** `C:\src\copilot-sdk\nodejs\src\types.ts:422-447`

```typescript
export interface ErrorOccurredHookInput extends BaseHookInput {
    error: string;
    errorContext: "model_call" | "tool_execution" | "system" | "user_input";
    recoverable: boolean;
}

export interface ErrorOccurredHookOutput {
    suppressOutput?: boolean;
    errorHandling?: "retry" | "skip" | "abort";  // ← Looks like retry support?
    retryCount?: number;
    userNotification?: string;
}
```

**Analysis:**
- `onErrorOccurred` hook has `errorHandling: "retry"` option
- **BUT:** This is a hook output from SDK consumer, not SDK behavior
- SDK **does not implement** retry logic based on this field
- This appears to be metadata for the caller to use, NOT automatic retry

**Validation:** Searched `session.ts` for retry implementation:
```typescript
// session.ts:439-472 - Hooks handler
async _handleHooksInvoke(hookType: string, input: unknown): Promise<unknown> {
    // ... just calls the hook, returns result
    // NO retry logic implementation
}
```

---

## Finding 5: Session Shutdown Provides Telemetry Only

**File:** `C:\src\copilot-sdk\nodejs\src\generated\session-events.ts:196-225`

```typescript
{
    ephemeral: true;
    type: "session.shutdown";
    data: {
        shutdownType: "routine" | "error";
        errorReason?: string;
        totalPremiumRequests: number;
        totalApiDurationMs: number;
        modelMetrics: {
            [model: string]: {
                requests: { count: number; cost: number; };
                usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
            };
        };
    };
}
```

**Analysis:**
- Session shutdown provides aggregate telemetry
- **NO rate limit state** in shutdown event
- No "429 encountered" flag
- No "retry count" metrics

---

## Finding 6: Client Shutdown Has Retry (Session Destroy Only)

**File:** `C:\src\copilot-sdk\nodejs\src\client.ts:328-360`

```typescript
// Try up to 3 times with exponential backoff
for (let attempt = 1; attempt <= 3; attempt++) {
    try {
        await session.destroy();
        break;
    } catch (error) {
        lastError = error as Error;
        if (attempt < 3) {
            const delay = 100 * Math.pow(2, attempt - 1);  // 100ms, 200ms
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}
```

**Analysis:**
- **ONLY retry in entire SDK:** destroying sessions during client shutdown
- NOT used for API calls or session operations
- Narrow use case (cleanup, not operational resilience)

---

## API Rate Limit Behavior (Based on Source)

### What Happens on 429 Error:
1. **CLI makes API request** (via Copilot API)
2. **API returns 429** (rate limit exceeded)
3. **CLI emits `session.error` event:**
   ```typescript
   {
       type: "session.error",
       data: {
           errorType: "api_error",
           message: "Rate limit exceeded",
           statusCode: 429,
           providerCallId: "..."
       }
   }
   ```
4. **SDK forwards event to session listeners**
5. **NO automatic retry** — session stays idle
6. **Caller must:**
   - Listen for `session.error` event
   - Check `statusCode === 429`
   - Implement backoff and retry

---

## Concurrency Behavior with 5+ Sessions

### Scenario: Squad Spawns 5 Concurrent Agents

```typescript
const sessions = await Promise.all([
    client.createSession({ model: "opus", customAgents: [lead] }),
    client.createSession({ model: "sonnet", customAgents: [kobayashi] }),
    client.createSession({ model: "sonnet", customAgents: [fenster] }),
    client.createSession({ model: "haiku", customAgents: [scribe] }),
    client.createSession({ model: "sonnet", customAgents: [mcmanus] })
]);

// All send messages simultaneously
await Promise.all(sessions.map(s => s.send({ prompt: "..." })));
```

**What Happens:**
1. All 5 sessions send JSON-RPC requests to CLI simultaneously
2. CLI forwards all 5 to Copilot API simultaneously (no queuing)
3. If API rate limit is 3 req/sec, 2 requests get 429
4. Those 2 emit `session.error` events
5. **NO automatic retry** — those sessions stop processing
6. User must manually retry or implement retry layer

**Result:** Cascading failures under load with no built-in recovery.

---

## Recommendations for Squad Backpressure Layer

### Architecture: Session-Level Rate Limiter Wrapper

```typescript
class RateLimitedSession {
    private session: CopilotSession;
    private queue: Array<() => Promise<void>> = [];
    private inFlight = 0;
    private maxConcurrent = 3;  // Max concurrent API calls
    private retryAfter = 0;  // Timestamp to wait until after 429
    
    constructor(session: CopilotSession) {
        this.session = session;
        
        // Listen for 429 errors
        session.on("session.error", (event) => {
            if (event.data.statusCode === 429) {
                // Extract retry-after header (if available in event data)
                this.retryAfter = Date.now() + 60_000;  // 60s backoff
            }
        });
    }
    
    async send(options: MessageOptions): Promise<string> {
        return this.enqueue(async () => {
            await this.waitForCapacity();
            return this.sendWithRetry(options);
        });
    }
    
    private async waitForCapacity() {
        // Wait if max concurrent reached
        while (this.inFlight >= this.maxConcurrent) {
            await new Promise(r => setTimeout(r, 100));
        }
        
        // Wait if in backoff period from 429
        const now = Date.now();
        if (now < this.retryAfter) {
            await new Promise(r => setTimeout(r, this.retryAfter - now));
        }
    }
    
    private async sendWithRetry(
        options: MessageOptions,
        attempt = 1
    ): Promise<string> {
        this.inFlight++;
        try {
            const messageId = await this.session.send(options);
            
            // Wait for completion or error
            const result = await this.waitForIdle();
            
            if (result.statusCode === 429 && attempt < 3) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = 1000 * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
                return this.sendWithRetry(options, attempt + 1);
            }
            
            return messageId;
        } finally {
            this.inFlight--;
        }
    }
    
    private async waitForIdle(): Promise<{ statusCode?: number }> {
        return new Promise((resolve, reject) => {
            let statusCode: number | undefined;
            
            const unsubscribe = this.session.on((event) => {
                if (event.type === "session.error") {
                    statusCode = event.data.statusCode;
                    if (statusCode !== 429) {
                        reject(new Error(event.data.message));
                    }
                } else if (event.type === "session.idle") {
                    unsubscribe();
                    resolve({ statusCode });
                }
            });
        });
    }
    
    private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    resolve(await fn());
                } catch (err) {
                    reject(err);
                }
            });
            this.processQueue();
        });
    }
    
    private async processQueue() {
        while (this.queue.length > 0 && this.inFlight < this.maxConcurrent) {
            const task = this.queue.shift()!;
            task();  // Don't await - let it run concurrently
        }
    }
}
```

---

### Architecture: Global Rate Limiter (Cross-Session)

```typescript
class GlobalRateLimiter {
    private globalInFlight = 0;
    private globalMaxConcurrent = 5;  // Across all sessions
    private retryAfter = 0;
    private waiters: Array<() => void> = [];
    
    async acquire(): Promise<() => void> {
        await this.waitForCapacity();
        this.globalInFlight++;
        
        return () => {
            this.globalInFlight--;
            this.notifyWaiters();
        };
    }
    
    reportRateLimit(retryAfterSeconds: number = 60) {
        this.retryAfter = Date.now() + retryAfterSeconds * 1000;
    }
    
    private async waitForCapacity() {
        while (this.globalInFlight >= this.globalMaxConcurrent) {
            await new Promise(r => this.waiters.push(r));
        }
        
        const now = Date.now();
        if (now < this.retryAfter) {
            await new Promise(r => setTimeout(r, this.retryAfter - now));
        }
    }
    
    private notifyWaiters() {
        const waiter = this.waiters.shift();
        if (waiter) waiter();
    }
}

// Usage:
const rateLimiter = new GlobalRateLimiter();

async function sendWithGlobalLimit(session: CopilotSession, options: MessageOptions) {
    const release = await rateLimiter.acquire();
    try {
        return await session.send(options);
    } catch (err) {
        if (err.statusCode === 429) {
            rateLimiter.reportRateLimit(60);
        }
        throw err;
    } finally {
        release();
    }
}
```

---

## Metrics to Capture

### Per-Session Metrics:
- Total requests sent
- 429 errors encountered
- Retry attempts
- Backoff time spent
- Successful requests after retry

### Global Metrics:
- Concurrent sessions active
- Aggregate 429 rate
- Queue depth (waiting requests)
- Throughput (successful requests/sec)

---

## Testing Recommendations

1. **Load test with 5+ concurrent sessions** sending simultaneous requests
2. **Inject 429 errors** (mock API endpoint) and validate retry behavior
3. **Measure queue latency** when hitting rate limits
4. **Test backoff recovery** — validate system resumes after backoff period

---

## Related SDK Observations

- **No circuit breaker pattern:** SDK never stops making requests after repeated failures
- **No request deduplication:** Identical concurrent requests are not deduplicated
- **No adaptive rate limiting:** SDK doesn't learn from 429 patterns

---

## Questions for SDK Team (if escalation needed)

1. Is rate limiting/retry planned for future SDK releases?
2. Should `errorHandling: "retry"` in hooks actually trigger retries?
3. Are there recommended patterns for multi-session rate limiting?
4. Does the CLI expose rate limit state (remaining quota, reset time)?

---

**Next Steps:**
- [ ] Implement `RateLimitedSession` wrapper class
- [ ] Test with concurrent agent invocations
- [ ] Add telemetry for 429 tracking
- [ ] Document rate limit configuration for Squad users
