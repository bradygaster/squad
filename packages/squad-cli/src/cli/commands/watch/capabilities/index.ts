/**
 * Capability barrel — registers all built-in capabilities.
 */

import { CapabilityRegistry } from '../registry.js';
import { SelfPullCapability } from './self-pull.js';
import { ExecuteCapability } from './execute.js';
import { FleetDispatchCapability } from './fleet-dispatch.js';
import { BoardCapability } from './board.js';
import { MonitorTeamsCapability } from './monitor-teams.js';
import { MonitorEmailCapability } from './monitor-email.js';
import { TwoPassCapability } from './two-pass.js';
import { WaveDispatchCapability } from './wave-dispatch.js';
import { RetroCapability } from './retro.js';
import { DecisionHygieneCapability } from './decision-hygiene.js';
import { CleanupCapability } from './cleanup.js';
import { ScheduleCapability } from './schedule.js';

/** Create a registry pre-loaded with all built-in capabilities. */
export function createDefaultRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(new SelfPullCapability());
  registry.register(new ExecuteCapability());
  registry.register(new FleetDispatchCapability());
  registry.register(new BoardCapability());
  registry.register(new MonitorTeamsCapability());
  registry.register(new MonitorEmailCapability());
  registry.register(new TwoPassCapability());
  registry.register(new WaveDispatchCapability());
  registry.register(new RetroCapability());
  registry.register(new DecisionHygieneCapability());
  registry.register(new CleanupCapability());
  registry.register(new ScheduleCapability());
  return registry;
}
