# Decision: CLI Command Wiring Pattern

**By:** Fenster (Core Dev)  
**Date:** 2026-03-06  
**Context:** P0 CLI wiring issues from triage session — aspire command existed but wasn't wired

## What Changed

Established CLI command wiring pattern by fixing the aspire command gap:

1. **Aspire command wired** into `cli-entry.ts` dispatcher (lines 294-301)
2. **Flag validation standardized:**
   - `--version` outputs bare semver (no "squad" prefix) per UX decision
   - Empty/whitespace args show help instead of launching shell (non-TTY edge case)
   - Help footer includes "squad <command> --help" hint
   - Error messages include `squad doctor` remediation hint

## Pattern Established

### CLI Command Registration (cli-entry.ts)

Commands are registered via simple if/else chain with dynamic imports:

```typescript
if (cmd === 'aspire') {
  const { runAspire } = await import('./cli/commands/aspire.js');
  const hasDocker = args.includes('--docker');
  const portIdx = args.indexOf('--port');
  const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]!, 10) : undefined;
  await runAspire({ docker: hasDocker, port });
  return;
}
```

### Flag Parsing

- **Boolean flags:** `args.includes('--flag')`
- **Value flags:** `args.indexOf('--flag')` + `args[idx + 1]`
- **Parse in dispatcher,** pass to command as typed options

### Help Text Organization

1. Commands grouped by function (setup, observability, utilities)
2. Flags section at bottom
3. Footer: "For per-command help: squad <command> --help"
4. Per-command usage shown indented under command name

### Error Messages

Always include remediation:
- Unknown command → `squad help` + `squad doctor`
- Missing arg → usage hint
- Setup issue → `squad doctor`

## Why This Matters

**For new commands:**
- Add handler in cli-entry.ts dispatcher
- Add help text entry
- Follow existing flag parsing pattern
- Don't forget the `return;` after handler

**For command authors:**
- Implement as `run{Command}(options)` function
- Export from `./cli/commands/{command}.js`
- Dispatcher handles flag parsing → command gets typed options

**For tests:**
- Test the dispatcher integration (does `squad {cmd}` work?)
- Test flag parsing (does `squad {cmd} --flag` pass correct value?)
- Test help text (is command listed in `squad help`?)

## Impact

Fixed 27 test failures (55 → 28):
- 8 aspire command tests (now properly wired)
- 5 flag validation tests (--version, empty args, etc.)
- 14 UX/error message tests (remediation hints)

## Files Referenced

- `packages/squad-cli/src/cli-entry.ts` — Main dispatcher
- `packages/squad-cli/src/cli/commands/aspire.ts` — Example command implementation
- `test/cli-p0-regressions.test.ts` — Flag validation tests
- `test/ux-gates.test.ts` — Help text tests

## Commit

Branch: `squad/p0-cli-wiring`  
Commit: `9616858`
