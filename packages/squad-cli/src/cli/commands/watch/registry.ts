/**
 * Capability registry — stores and retrieves watch capabilities by name
 * and phase.
 */

import type { WatchCapability, WatchPhase } from './types.js';

export class CapabilityRegistry {
  private capabilities = new Map<string, WatchCapability>();

  /** Register a capability. Overwrites if name already exists. */
  register(cap: WatchCapability): void {
    this.capabilities.set(cap.name, cap);
  }

  /** Get a capability by name. */
  get(name: string): WatchCapability | undefined {
    return this.capabilities.get(name);
  }

  /** Get all capabilities that run in a given phase, insertion-order. */
  getByPhase(phase: WatchPhase): WatchCapability[] {
    return [...this.capabilities.values()].filter(c => c.phase === phase);
  }

  /** All registered capabilities. */
  all(): WatchCapability[] {
    return [...this.capabilities.values()];
  }

  /** All registered capability names. */
  names(): string[] {
    return [...this.capabilities.keys()];
  }
}
