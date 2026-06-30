---
"@bradygaster/squad-cli": patch
---

chore: adapt CLI to ink 7.0.6

Updates the ink dependency from ^6.8.0 to ^7.0.6 and adapts keyboard handling in InputPrompt.tsx to ink 7's revised API:

- key.meta no longer fires on bare Escape; guard updated to use key.escape
- useInput callbacks are now wrapped in reconciler.discreteUpdates(), which flushes React state synchronously at end of callback; rewrote Enter/paste handler to call setValue('') inside the flush rather than in a deferred timer

Closes #1322, #1335.
