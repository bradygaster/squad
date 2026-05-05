/**
 * Runtime Registry
 *
 * Manages registration and selection of runtime drivers.
 * Provides factory methods for creating drivers and accessing the active runtime.
 *
 * @module runtime/registry
 */

import type {
  AgentRuntimeDriver,
  DriverOptions,
  DriverSessionConfig,
  AgentSession,
  DriverSessionMetadata,
  DriverMessageOptions,
  DriverAuthStatus,
  DriverStatus,
  DriverModelInfo,
  DriverConnectionState,
} from './driver.js';
import {
  DriverError,
  UnknownRuntimeError,
} from './driver.js';

/**
 * Default driver implementations by runtime name.
 */
const DEFAULT_DRIVERS: Record<string, () => Promise<AgentRuntimeDriver>> = {};

/**
 * Runtime configuration for squad.config.ts
 */
export interface RuntimeConfig {
  /**
   * Runtime name (e.g., "copilot", "opencode")
   */
  name: string;

  /**
   * Driver-specific configuration options.
   */
  config?: Record<string, unknown>;

  /**
   * CLI path override (optional).
   */
  cliPath?: string;

  /**
   * CLI URL for external server connection (optional).
   */
  cliUrl?: string;
}

/**
 * Runtime Registry
 *
 * Singleton registry for managing runtime drivers.
 * Register drivers at startup, then use getDriver() to access them.
 *
 * @example
 * ```typescript
 * import { runtimeRegistry } from './runtime/registry.js';
 * import { registerCopilotDriver } from './drivers/copilot/driver.js';
 *
 * // Register drivers at startup
 * runtimeRegistry.registerDriver('copilot', registerCopilotDriver);
 *
 * // Later, get the active driver
 * const driver = runtimeRegistry.getDriver('copilot');
 * await driver.connect();
 * ```
 */
export class RuntimeRegistry {
  private drivers = new Map<string, AgentRuntimeDriver>();
  private driverFactories = new Map<string, () => Promise<AgentRuntimeDriver>>();
  private activeRuntime: string = 'copilot';
  private driverOptions = new Map<string, DriverOptions>();
  private static instance: RuntimeRegistry;

  private constructor() {}

  /**
   * Get the singleton RuntimeRegistry instance.
   */
  static getInstance(): RuntimeRegistry {
    if (!RuntimeRegistry.instance) {
      RuntimeRegistry.instance = new RuntimeRegistry();
    }
    return RuntimeRegistry.instance;
  }

  /**
   * Register a driver factory for a runtime name.
   * factories are called lazily when a driver is first requested.
   *
   * @param name - Runtime name (e.g., "copilot", "opencode")
   * @param factory - Async function that creates the driver instance
   */
  registerDriverFactory(name: string, factory: () => Promise<AgentRuntimeDriver>): void {
    if (this.drivers.has(name)) {
      console.warn(`Driver for runtime "${name}" already registered. Skipping factory registration.`);
      return;
    }
    this.driverFactories.set(name, factory);
  }

  /**
   * Register a pre-created driver instance.
   *
   * @param name - Runtime name
   * @param driver - Driver instance
   * @param options - Driver options
   */
  registerDriver(name: string, driver: AgentRuntimeDriver, options?: DriverOptions): void {
    this.drivers.set(name, driver);
    if (options) {
      this.driverOptions.set(name, options);
    }
  }

  /**
   * Set the active runtime by name.
   *
   * @param name - Runtime name to activate
   * @throws {UnknownRuntimeError} if the runtime is not registered
   */
  setActiveRuntime(name: string): void {
    if (!this.drivers.has(name) && !this.driverFactories.has(name)) {
      throw new UnknownRuntimeError(name);
    }
    this.activeRuntime = name;
  }

  /**
   * Get the name of the active runtime.
   */
  getActiveRuntimeName(): string {
    return this.activeRuntime;
  }

  /**
   * Get a registered driver by name, creating it lazily if needed.
   *
   * @param name - Runtime name
   * @returns The driver instance
   * @throws {UnknownRuntimeError} if the runtime is not registered
   */
  async getDriver(name: string): Promise<AgentRuntimeDriver> {
    // Return existing driver
    if (this.drivers.has(name)) {
      return this.drivers.get(name)!;
    }

    // Create from factory if available
    const factory = this.driverFactories.get(name);
    if (factory) {
      const driver = await factory();
      this.drivers.set(name, driver);
      this.driverFactories.delete(name);
      return driver;
    }

    throw new UnknownRuntimeError(name);
  }

  /**
   * Get the active runtime driver.
   */
  async getActiveDriver(): Promise<AgentRuntimeDriver> {
    return this.getDriver(this.activeRuntime);
  }

  /**
   * Check if a runtime is registered (either as instance or factory).
   */
  isRegistered(name: string): boolean {
    return this.drivers.has(name) || this.driverFactories.has(name);
  }

  /**
   * List all registered runtime names.
   */
  listRuntimes(): string[] {
    const names = new Set<string>();
    for (const name of this.drivers.keys()) {
      names.add(name);
    }
    for (const name of this.driverFactories.keys()) {
      names.add(name);
    }
    return Array.from(names);
  }

  /**
   * Get driver options for a registered runtime.
   */
  getDriverOptions(name: string): DriverOptions | undefined {
    return this.driverOptions.get(name);
  }

  /**
   * Create a driver with the given options and register it.
   *
   * @param name - Runtime name
   * @param options - Driver options
   * @returns The created driver
   */
  async createDriver(name: string, options: DriverOptions): Promise<AgentRuntimeDriver> {
    const factory = this.driverFactories.get(name);
    if (!factory) {
      throw new UnknownRuntimeError(name);
    }

    const driver = await factory();
    this.drivers.set(name, driver);
    this.driverOptions.set(name, options);
    this.driverFactories.delete(name);
    return driver;
  }

  /**
   * Unregister a runtime driver.
   */
  async unregisterDriver(name: string): Promise<void> {
    const driver = this.drivers.get(name);
    if (driver) {
      try {
        await driver.disconnect();
      } catch {
        // Ignore disconnect errors during unregistration
      }
      this.drivers.delete(name);
      this.driverOptions.delete(name);
    }
    this.driverFactories.delete(name);
  }

  /**
   * Reset the registry (mainly for testing).
   */
  reset(): void {
    this.drivers.clear();
    this.driverFactories.clear();
    this.activeRuntime = 'copilot';
    this.driverOptions.clear();
  }
}

/**
 * Global runtime registry instance.
 */
export const runtimeRegistry = RuntimeRegistry.getInstance();

/**
 * Create a runtime-aware session wrapper that provides a consistent interface
 * regardless of which runtime is active.
 */
export async function createRuntimeSession(
  runtimeName: string,
  config?: DriverSessionConfig
): Promise<AgentSession> {
  const driver = await runtimeRegistry.getDriver(runtimeName);
  if (!driver.isConnected()) {
    await driver.connect();
  }
  return driver.createSession(config);
}

/**
 * Create a session with the active runtime.
 */
export async function createActiveSession(
  config?: DriverSessionConfig
): Promise<AgentSession> {
  return createRuntimeSession(runtimeRegistry.getActiveRuntimeName(), config);
}
