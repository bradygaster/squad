/**
 * Cross-Session Event Bus (PRD 1)
 *
 * Pub/sub event bus for session lifecycle events. Enables the coordinator
 * to observe all agent sessions from a single subscription point.
 * Decouples event producers (sessions) from consumers (coordinator, Ralph, UI).
 */

// --- Event Types ---

export type SquadEventType =
  | 'session.created'
  | 'session.destroyed'
  | 'session.status_changed'
  | 'session.message'
  | 'session.tool_call'
  | 'session.error'
  | 'session.spawn_fallback'
  | 'agent.milestone'
  | 'coordinator.routing'
  | 'pool.health';

export interface SquadEvent {
  type: SquadEventType;
  sessionId?: string;
  agentName?: string;
  payload: unknown;
  timestamp: Date;
}

export type EventHandler = (event: SquadEvent) => void | Promise<void>;

// --- Event Bus ---

export class EventBus {
  private handlers: Map<SquadEventType, Set<EventHandler>> = new Map();
  private allHandlers: Set<EventHandler> = new Set();

  /** Subscribe to a specific event type */
  on(type: SquadEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Subscribe to all events */
  onAny(handler: EventHandler): () => void {
    this.allHandlers.add(handler);
    return () => {
      this.allHandlers.delete(handler);
    };
  }

  /** Emit an event to all matching subscribers */
  async emit(event: SquadEvent): Promise<void> {
    const typeHandlers = this.handlers.get(event.type) ?? new Set();
    const allPromises: Promise<void>[] = [];

    for (const handler of typeHandlers) {
      const result = handler(event);
      if (result instanceof Promise) allPromises.push(result);
    }

    for (const handler of this.allHandlers) {
      const result = handler(event);
      if (result instanceof Promise) allPromises.push(result);
    }

    await Promise.all(allPromises);
  }

  /** Remove all handlers */
  clear(): void {
    this.handlers.clear();
    this.allHandlers.clear();
  }
}
