# Cost-Aware Router — SDK Sample PRD

## Overview
Route work to the right model tier based on task complexity and budget. Expensive tasks go to Full (Claude Opus 5). Simple tasks go to Lightweight (GPT-5.6 Luna). Track every decision, aggregate cost, and report savings. This is the cost-first principle in action — prove that routing optimizes dollars.

## Target Audience
Team leads managing AI spend. Engineering managers who need cost visibility. Anyone building Squad deployments with budget constraints.

## SDK APIs Demonstrated

| API | Module | What It Shows |
|-----|--------|--------------|
| `selectResponseTier()` | `coordinator/response-tiers` | Choose tier based on task content and available budget |
| `getTier()` | `coordinator/response-tiers` | Look up tier definition by name (Direct, Lightweight, Standard, Full) |
| `MODELS` | `runtime/constants` | Available models per tier with per-token pricing |
| `CostTracker` | `runtime/cost-tracker` | Accumulate cost/token data across squad run |
| `TierContext`, `ResponseTier` | `coordinator/response-tiers` | Typed config for tier selection logic |

## Code Highlights

**Initialize cost tracker and tier system:**
```typescript
import { selectResponseTier, getTier, MODELS, CostTracker } from '@bradygaster/squad-sdk';

const costTracker = new CostTracker();
const budget = 100.00; // USD

const tiers = {
  direct: getTier('direct'),      // Fastest, no thinking (GPT-5.6 Luna)
  lightweight: getTier('lightweight'), // Fast, cheap (GPT-5.6 Luna, Claude Haiku)
  standard: getTier('standard'),   // Balanced (Claude Sonnet 5)
  full: getTier('full'),           // Expensive thinking (Claude Opus 5)
};

console.log('📊 Available Tiers:');
Object.entries(tiers).forEach(([name, tier]) => {
  console.log(`  ${name}: ${tier.models.map(m => m.name).join(', ')}`);
});
```

**Select tier based on task complexity:**
```typescript
const task = 'Implement OAuth2 flow with PKCE for mobile app';

const tierSelection = selectResponseTier({
  taskContent: task,
  availableBudget: budget,
  tierPreferences: ['lightweight', 'standard', 'full'],
});

// Returns: { tier: 'standard', reason: 'Complex architecture task requires reasoning' }
// Or: { tier: 'lightweight', reason: 'Budget remaining: $2.50, using cheapest tier' }

console.log(`✨ Selected: ${tierSelection.tier} (${tierSelection.reason})`);
```

**Route work, record cost, and track budget:**
```typescript
// Simulate multiple tasks
const tasks = [
  { content: 'Fix typo in README', priority: 'low' },
  { content: 'Design API authentication flow', priority: 'high' },
  { content: 'Write unit tests for auth module', priority: 'normal' },
  { content: 'Implement multi-tenancy architecture', priority: 'critical' },
];

let spent = 0;

for (const task of tasks) {
  const selection = selectResponseTier({
    taskContent: task.content,
    availableBudget: budget - spent,
  });

  const tier = tiers[selection.tier];
  const model = tier.models[0];

  console.log(`📝 Task: ${task.content}`);
  console.log(`   Tier: ${selection.tier} (${model.name})`);

  // Simulate execution
  const inputTokens = 500;
  const outputTokens = 1200;
  const costPerInputToken = model.inputCost / 1_000_000;
  const costPerOutputToken = model.outputCost / 1_000_000;
  const estimatedCost =
    (inputTokens * costPerInputToken) +
    (outputTokens * costPerOutputToken);

  costTracker.recordUsage({
    sessionId: `task-${Date.now()}`,
    agentName: 'Router',
    model: model.name,
    inputTokens,
    outputTokens,
    estimatedCost,
  });

  spent += estimatedCost;
  console.log(`   Cost: $${estimatedCost.toFixed(4)} (Budget remaining: $${(budget - spent).toFixed(2)})\n`);

  if (spent > budget) {
    console.log('⚠️  Budget exhausted. Stopping work.');
    break;
  }
}
```

**Generate cost report:**
```typescript
const summary = costTracker.getSummary();

console.log('\n💰 Final Cost Report');
console.log('═'.repeat(50));
console.log(`Total Input Tokens:  ${summary.totalInputTokens.toLocaleString()}`);
console.log(`Total Output Tokens: ${summary.totalOutputTokens.toLocaleString()}`);
console.log(`Total Cost:          $${summary.totalEstimatedCost.toFixed(2)}`);
console.log(`Budget Used:         ${((summary.totalEstimatedCost / budget) * 100).toFixed(1)}%`);

console.log('\n📊 By Agent:');
summary.agents.forEach((agent) => {
  console.log(`  ${agent.agentName}`);
  console.log(`    Model: ${agent.model}`);
  console.log(`    Turns: ${agent.turnCount}`);
  console.log(`    Tokens: ${agent.inputTokens + agent.outputTokens}`);
  console.log(`    Cost: $${agent.estimatedCost.toFixed(4)}`);
});

console.log('\n💡 Savings Opportunity:');
console.log(`  If all tasks used Full tier: ~$${(summary.totalEstimatedCost * 2.5).toFixed(2)}`);
console.log(`  Actual cost with routing: $${summary.totalEstimatedCost.toFixed(2)}`);
console.log(`  Savings: ${(((summary.totalEstimatedCost * 2.5) - summary.totalEstimatedCost) / (summary.totalEstimatedCost * 2.5) * 100).toFixed(1)}%`);
```

## User Experience

1. User defines task queue with priority/complexity
2. Cost-aware router evaluates each task
3. Selection logic picks tier: "This needs Standard ($0.01/K), that needs Lightweight ($0.0003/K)"
4. Work executes on selected tier
5. Cost tracker accumulates real-time spend
6. Terminal shows:
   ```
   📝 Task: Fix typo in README
      Tier: lightweight (GPT-5.6 Luna)
      Cost: $0.0008 (Budget remaining: $99.99)

   📝 Task: Design API authentication flow
      Tier: standard (Claude 3.5 Sonnet)
      Cost: $0.0045 (Budget remaining: $99.99)

   📝 Task: Implement multi-tenancy architecture
      Tier: full (o1)
      Cost: $0.0320 (Budget remaining: $99.95)
   ```
7. Final report shows tier breakdown and savings:
   ```
   💰 Final Cost Report
   ═══════════════════════════════════════
   Total Cost: $0.0373
   Budget Used: 0.04%

   💡 If all tasks used Full: ~$0.23 (6x more)
      With routing: $0.0373
      Savings: 83.8%
   ```

## Acceptance Criteria

1. ✅ `selectResponseTier()` returns correct tier for task complexity
2. ✅ Tier selection respects available budget
3. ✅ `CostTracker.recordUsage()` accumulates cost correctly
4. ✅ Cost summary breaks down by agent and tier
5. ✅ Final report shows total spend and budget percentage
6. ✅ Savings calculation compares routed cost vs. single-tier cost
7. ✅ Sample is ~250 lines (excluding dependencies)

## Test Script

```bash
# Navigate to samples/cost-aware-router
npm install

# Run routing demo
npm start

# Expected output:
# 📝 Task: Fix typo in README
#    Tier: lightweight (GPT-5.6 Luna)
#    Cost: $0.0008
#
# 📝 Task: Design API authentication flow
#    Tier: standard (Claude 3.5 Sonnet)
#    Cost: $0.0045
#
# ...
#
# 💰 Final Cost Report
# Total Cost: $0.0373
# Savings: 83.8%

# Run test suite
npm test

# Expected tests:
# PASS: selectResponseTier picks lightweight for simple tasks
# PASS: selectResponseTier picks full for complex tasks
# PASS: selectResponseTier respects budget constraints
# PASS: CostTracker aggregates usage correctly
# PASS: Cost report shows savings vs. single-tier baseline
```
