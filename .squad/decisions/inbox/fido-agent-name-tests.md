# Decision: Extract agent name parsing into testable helper

**Author:** FIDO  
**Date:** 2025-07-25  
**Issue:** #577  

## Context
The agent name extraction logic was inline in `shell/index.ts` (lines 680-694), making it impossible to unit test. The regex was fragile and breaking when description formats changed.

## Decision
Extracted the matching logic into `packages/squad-cli/src/cli/shell/agent-name-parser.ts` as a pure function `parseAgentFromDescription(description, knownAgentNames)`. The shell index now imports and delegates to this function.

## Implications
- VOX's regex robustness fix should be applied to `agent-name-parser.ts` rather than inline in `index.ts`
- New package export added: `@bradygaster/squad-cli/shell/agent-name-parser`
- 30 tests in `test/agent-name-extraction.test.ts` serve as regression guard for any future changes to the matching logic
