/**
 * Capability barrel — registers all built-in capabilities.
 */

import { CapabilityRegistry } from '../registry.js';
import { SelfPullCapability } from './self-pull.js';
import { ExecuteCapability } from './execute.js';
import { BoardCapability } from './board.js';
import { MonitorTeamsCapability } from './monitor-teams.js';
import { MonitorEmailCapability } from './monitor-email.js';
import { TwoPassCapability } from './two-pass.js';
import { WaveDispatchCapability } from './wave-dispatch.js';
import { RetroCapability } from './retro.js';
import { DecisionHygieneCapability } from './decision-hygiene.js';

// ── Watch parity capabilities (ported from ralph-watch.ps1, #743) ──
import { HealthCheckCapability } from './health-check.js';
import { StaleReclaimCapability } from './stale-reclaim.js';
import { HeartbeatCapability } from './heartbeat.js';
import { WebhookAlertCapability } from './webhook-alerts.js';

/** Create a registry pre-loaded with all built-in capabilities. */
export function createDefaultRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(new SelfPullCapability());
  registry.register(new ExecuteCapability());
  registry.register(new BoardCapability());
  registry.register(new MonitorTeamsCapability());
  registry.register(new MonitorEmailCapability());
  registry.register(new TwoPassCapability());
  registry.register(new WaveDispatchCapability());
  registry.register(new RetroCapability());
  registry.register(new DecisionHygieneCapability());

  // Watch parity capabilities (#743)
  registry.register(new HealthCheckCapability());
  registry.register(new StaleReclaimCapability());
  registry.register(new HeartbeatCapability());
  registry.register(new WebhookAlertCapability());
  return registry;
}
