# Accessibility Guidelines

Squad CLI is designed to be usable by everyone, including users of screen readers, high-contrast terminals, and monochrome displays.

## Keyboard Shortcuts

All actions in the Squad shell are keyboard-reachable. No mouse is required.

| Shortcut | Action |
|---|---|
| `Enter` | Submit message |
| `↑` / `↓` | Navigate input history |
| `Backspace` | Delete last character |
| `Tab` | Autocomplete @agent name or /command |
| `@AgentName` | Direct message to a specific agent |
| `/help` | Show available commands |
| `/status` | Show team status and active agents |
| `/clear` | Clear the screen |
| `Ctrl+C` | Exit the shell |
| `exit` | Exit the shell (typed command) |

## NO_COLOR Behavior

Squad respects the [NO_COLOR standard](https://no-color.org/). When `NO_COLOR` is set (any non-empty value) or `TERM=dumb`, the shell degrades gracefully:

| Feature | Color Mode | NO_COLOR Mode |
|---|---|---|
| Pulsing active dot | Animated green `●◉○◉` | Static `●` |
| Active agent label | Green `▶ Active` | Bold `[Active]` |
| Error agent label | Red `✖` | Bold `[Error] ✖` |
| Thinking spinner | Animated braille `⠋⠙⠹⠸…` with time-based color shift | Static `...` with text label |
| Prompt cursor | Cyan `▌` | Bold `▌` |
| Disabled prompt | Cyan animated spinner | `[working...]` text |
| Status line colors | Yellow for active agents | No color, same text |
| Welcome banner | Cyan border | Default border |
| User messages | Cyan text | Default text, bold prefix |
| Agent messages | Green text | Default text, bold prefix |

### How it works

The `isNoColor()` function in `terminal.ts` checks:
- `process.env.NO_COLOR` — any non-empty value triggers monochrome mode
- `process.env.TERM === 'dumb'` — common in CI and piped output

All components import `isNoColor()` and conditionally omit `color` props from Ink `<Text>` elements. Animations (spinners, pulsing dots) are replaced with static alternatives.

### Testing NO_COLOR

```bash
# Run with no color
NO_COLOR=1 npx squad

# Simulate dumb terminal
TERM=dumb npx squad
```

## Color Contrast Guidelines for Contributors

When adding new colored UI elements, follow these rules:

1. **Never use color as the only indicator.** Every status must have a text label, emoji, or structural cue alongside any color.
   - ✅ `<Text color="green">✅ Active</Text>` — has emoji + text + color
   - ❌ `<Text color="green">●</Text>` alone — color-only meaning

2. **Always gate colors on `isNoColor()`.** Use this pattern:
   ```tsx
   import { isNoColor } from '../terminal.js';

   const noColor = isNoColor();
   <Text color={noColor ? undefined : 'green'}>status text</Text>
   ```

3. **Prefer high-contrast Ink colors.** Use `cyan`, `green`, `yellow`, `red`, `magenta`. Avoid `blue` (low contrast on dark backgrounds) and `gray` (use `dimColor` prop instead).

4. **Use `dimColor` for secondary information.** The `dimColor` prop works in both color and NO_COLOR modes (it maps to terminal dim/faint attribute).

5. **Use `bold` for focus indicators.** Bold text remains visible in monochrome terminals and serves as a reliable focus cue.

## Error Message Requirements

All error messages shown to the user must include:

1. **What went wrong** — a clear, concise description of the error.
2. **A remediation hint** — what the user should do next.
3. **An emoji prefix** — so the error is recognizable without color.

Example:
```
SDK not connected. Check your setup.
Hmm, /foo? Type /help for commands.
```

### Error patterns

| Error | Message format |
|---|---|
| Unknown command | `Hmm, /{cmd}? Type /help for commands.` |
| SDK not connected | `SDK not connected. Check your setup.` |
| Missing team.md | Include path and `squad init` remediation hint |
| Charter not found | Include expected path and `squad init` remediation hint |

## Focus Indicators

- The active input prompt always shows a visible cursor (`▌`), rendered in bold in NO_COLOR mode.
- The welcome banner uses a box border (`borderStyle="round"`) which remains visible as ASCII `+--+` even without color.
- Active agents are marked with `bold` text so they stand out even without color differentiation.

## Screen Reader Considerations

- All status changes include text labels (not just visual indicators).
- Emoji are used alongside text descriptions (e.g., `✅ Active` not just `✅`).
- The message stream uses a consistent prefix pattern (`❯`, `▸ system:`, `🔧 AgentName:`) that screen readers can announce predictably.
