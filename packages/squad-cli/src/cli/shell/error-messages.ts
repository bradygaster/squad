/**
 * User-friendly error message templates with recovery guidance.
 * Re-exports from SDK — the canonical implementation lives there now.
 *
 * @module cli/shell/error-messages
 */

export {
  type ErrorGuidance,
  sdkDisconnectGuidance,
  teamConfigGuidance,
  agentSessionGuidance,
  extractRetryAfter,
  rateLimitGuidance,
  genericGuidance,
  timeoutGuidance,
  unknownCommandGuidance,
  formatGuidance,
} from '@bradygaster/squad-sdk/runtime/error-messages';

