/**
 * Cross-Session Event Bus (M0-5, Issue #77)
 *
 * Pub/sub event bus for session lifecycle events with cross-session aggregation.
 * Enables the coordinator to observe all agent sessions from a single subscription point.
 * Decouples event producers (sessions) from consumers (coordinator, Ralph, UI).
 * 
 * @module runtime/event-bus
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * Core lifecycle events emitted by Squad sessions.
 * All lifecycle events are persistent and logged for debugging.
 */
export type SquadLifecycleEvent =
  | 'session:created'
  | 'session:idle'
  | 'session:error'
  | 'session:destroyed';

/**
 * Additional operational events for coordination and monitoring.
 */
export type SquadOperationalEvent =
  | 'session:message'
  | 'session:tool_call'
  | 'agent:milestone'
  | 'coordinator:routing'
  | 'pool:health'
  | 'context:utilization';

/**
 * All event types supported by the event bus.
 */
export type SquadEventType = SquadLifecycleEvent | SquadOperationalEvent;

/**
 * Base event structure with required metadata.
 * All events include a timestamp for chronological ordering and debugging.
 */
export interface SquadEvent {
  /** Event type identifier */
  type: SquadEventType;
  /** Session ID that originated this event (optional for pool-level events) */
  sessionId?: string;
  /** Agent name associated with this event (optional) */
  agentName?: string;
  /** Event-specific payload data */
  payload: unknown;
  /** Timestamp when event was created */
  timestamp: Date;
}

/**
 * Handler function for processing events.
 * Handlers may be synchronous or asynchronous.
 * Errors in handlers are isolated and do not affect other handlers.
 */
export type EventHandler = (event: SquadEvent) => void | Promise<void>;

/**
 * Unsubscribe function returned from subscription methods.
 * Call this function to remove the handler from the event bus.
 */
export type UnsubscribeFn = () => void;

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * Cross-session event aggregation bus.
 * 
 * Key features:
 * - Subscribe to specific event types or all events
 * - Async/sync handler support with error isolation
 * - No race conditions — handlers run in subscription order
 * - Lifecycle events: session:created, session:idle, session:error, session:destroyed
 * - Cross-session aggregation — single subscription point for all sessions
 * 
 * Usage:
 * ```typescript
 * const bus = new EventBus();
 * 
 * // Subscribe to specific event
 * const unsubscribe = bus.subscribe('session:created', (event) => {
 *   console.log('New session:', event.sessionId);
 * });
 * 
 * // Subscribe to all events
 * const unsubscribeAll = bus.subscribeAll((event) => {
 *   console.log('Event:', event.type);
 * });
 * 
 * // Emit event
 * await bus.emit({
 *   type: 'session:created',
 *   sessionId: 'abc-123',
 *   agentName: 'Ralph',
 *   payload: { model: 'claude-sonnet-4.5' },
 *   timestamp: new Date()
 * });
 * 
 * // Clean up
 * unsubscribe();
 * unsubscribeAll();
 * ```
 */
export class EventBus {
  private handlers: Map<SquadEventType, Set<EventHandler>> = new Map();
  private allHandlers: Set<EventHandler> = new Set();
  private errorHandlers: Set<(error: Error, event: SquadEvent) => void> = new Set();

  /**
   * Subscribe to a specific event type.
   * 
   * @param type - Event type to listen for
   * @param handler - Handler function to call when event occurs
   * @returns Unsubscribe function to remove this handler
   * 
   * @example
   * ```typescript
   * const bus = new EventBus();
   * const unsubscribe = bus.subscribe('session:created', (event) => {
   *   console.log('Session created:', event.sessionId);
   * });
   * 
   * // Later, remove subscription
   * unsubscribe();
   * ```
   */
  subscribe(type: SquadEventType, handler: EventHandler): UnsubscribeFn {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => this.unsubscribe(type, handler);
  }

  /**
   * Subscribe to all events regardless of type.
   * Useful for logging, monitoring, or debugging.
   * 
   * @param handler - Handler function to call for every event
   * @returns Unsubscribe function to remove this handler
   * 
   * @example
   * ```typescript
   * const bus = new EventBus();
   * const unsubscribe = bus.subscribeAll((event) => {
   *   console.log(`[${event.type}] ${event.sessionId || 'global'}`);
   * });
   * ```
   */
  subscribeAll(handler: EventHandler): UnsubscribeFn {
    this.allHandlers.add(handler);
    return () => this.allHandlers.delete(handler);
  }

  /**
   * Unsubscribe a handler from a specific event type.
   * 
   * @param type - Event type to unsubscribe from
   * @param handler - Handler function to remove
   */
  unsubscribe(type: SquadEventType, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
    
    // Clean up empty handler sets
    if (this.handlers.get(type)?.size === 0) {
      this.handlers.delete(type);
    }
  }

  /**
   * Register an error handler for handler execution failures.
   * Error handlers are called when a subscribed handler throws an error.
   * 
   * @param handler - Error handler function
   * @returns Unsubscribe function to remove this error handler
   */
  onError(handler: (error: Error, event: SquadEvent) => void): UnsubscribeFn {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Emit an event to all matching subscribers.
   * Handlers are called in subscription order with error isolation.
   * One handler failure does not prevent other handlers from executing.
   * 
   * @param event - Event to emit
   * @returns Promise that resolves when all handlers complete
   * 
   * @example
   * ```typescript
   * await bus.emit({
   *   type: 'session:created',
   *   sessionId: 'abc-123',
   *   agentName: 'Ralph',
   *   payload: { model: 'claude-sonnet-4.5' },
   *   timestamp: new Date()
   * });
   * ```
   */
  async emit(event: SquadEvent): Promise<void> {
    const typeHandlers = this.handlers.get(event.type) ?? new Set();
    const allPromises: Promise<void>[] = [];

    // Execute type-specific handlers
    for (const handler of typeHandlers) {
      allPromises.push(this.executeHandler(handler, event));
    }

    // Execute wildcard handlers
    for (const handler of this.allHandlers) {
      allPromises.push(this.executeHandler(handler, event));
    }

    // Wait for all handlers to complete
    // Errors are isolated and won't throw from here
    await Promise.all(allPromises);
  }

  /**
   * Execute a single handler with error isolation.
   * Catches and reports handler errors without propagating them.
   * 
   * @param handler - Handler function to execute
   * @param event - Event to pass to handler
   */
  private async executeHandler(handler: EventHandler, event: SquadEvent): Promise<void> {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      // Isolate handler errors — one failure shouldn't crash others
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      
      // Notify error handlers
      for (const errorHandler of this.errorHandlers) {
        try {
          errorHandler(wrappedError, event);
        } catch (errorHandlerError) {
          // Error handler itself failed — log to console as last resort
          console.error('EventBus error handler failed:', errorHandlerError);
        }
      }
      
      // If no error handlers registered, log to console
      if (this.errorHandlers.size === 0) {
        console.error(`EventBus handler error for ${event.type}:`, wrappedError);
      }
    }
  }

  /**
   * Remove all handlers and reset the event bus.
   * Useful for cleanup in tests or when shutting down.
   */
  clear(): void {
    this.handlers.clear();
    this.allHandlers.clear();
    this.errorHandlers.clear();
  }

  /**
   * Get count of handlers for a specific event type.
   * Useful for debugging and testing.
   * 
   * @param type - Event type to count handlers for
   * @returns Number of handlers subscribed to this event type
   */
  getHandlerCount(type: SquadEventType): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  /**
   * Get count of wildcard handlers.
   * 
   * @returns Number of handlers subscribed to all events
   */
  getAllHandlerCount(): number {
    return this.allHandlers.size;
  }
}
