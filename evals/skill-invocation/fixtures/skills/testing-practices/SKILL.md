---
name: Testing Best Practices
domain: quality
triggers: [test, vitest, coverage, spec, assertion, mock, tdd, integration]
roles: [tester, developer]
confidence: high
---
## Testing Best Practices

Write tests before fixing bugs (regression prevention).
Use `describe` blocks to group related tests by behavior.
Prefer real objects over mocks when feasible.
Target 80% coverage minimum, 100% on critical paths.
Name tests as "should {expected behavior} when {condition}".
Use factory functions for test data setup.
