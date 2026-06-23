/**
 * Squad Observer — File watcher for .squad/ directory changes (Issue #268)
 *
 * Monitors the .squad/ directory for file changes and emits OTel spans
 * and EventBus events for real-time observability of squad state changes.
 * Ported from paulyuk/squad#1.
 *
 * @module runtime/squad-observer
 */

// fs.watch and fs.FSWatcher retained — not in StorageProvider scope
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

const storage = new FSStorageProvider();
import { SpanStatusCode } from './otel-api.js';
import { getTracer } from './otel.js';
import { EventBus, type SquadEvent } from './event-bus.js';

// ============================================================================
// Types
// ============================================================================

/** Categories of .squad/ file changes. */
export type SquadFileCategory =
  | 'agent'
  | 'casting'
  | 'config'
  | 'decision'
  | 'skill'
  | 'unknown';

/** A detected file change in the .squad/ directory. */
export interface SquadFileChange {
  /** Relative path from .squad/ root */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** Type of change */
  changeType: 'created' | 'modified' | 'deleted';
  /** Category of the changed file */
  category: SquadFileCategory;
  /** Timestamp of detection */
  timestamp: Date;
}

/** Configuration for the observer. */
export interface SquadObserverConfig {
  /** Path to the .squad/ directory to watch */
  squadDir: string;
  /** Optional EventBus to emit events to */
  eventBus?: EventBus;
  /** Debounce interval in ms (default: 200) */
  debounceMs?: number;
}

// ============================================================================
// Category classification
// ============================================================================

/**
 * Classify a file path within .squad/ into a category.
 */
export function classifyFile(relativePath: string): SquadFileCategory {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('agents/')) return 'agent';
  if (normalized.startsWith('casting/')) return 'casting';
  if (normalized.startsWith('skills/')) return 'skill';
  if (normalized.startsWith('decisions/') || normalized === 'decisions.md') return 'decision';
  if (normalized === 'config.json' || normalized === 'team.md' || normalized.startsWith('config/')) return 'config';
  return 'unknown';
}

// ============================================================================
// Observer implementation
// ============================================================================

/**
 * File watcher that monitors .squad/ directory and emits OTel events.
 *
 * Usage:
 * ```typescript
 * const observer = new SquadObserver({
 *   squadDir: '/path/to/.squad',
 *   eventBus: myEventBus,
 * });
 * observer.start();
 * // ... later
 * observer.stop();
 * ```
 */
export class SquadObserver {
  private config: Required<Pick<SquadObserverConfig, 'squadDir' | 'debounceMs'>> & Pick<SquadObserverConfig, 'eventBus'>;
  private watcher: FSWatcher | undefined;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private running = false;

  constructor(config: SquadObserverConfig) {
    this.config = {
      squadDir: config.squadDir,
      eventBus: config.eventBus,
      debounceMs: config.debounceMs ?? 200,
    };
  }

  /**
   * Start watching the .squad/ directory for changes.
   * Emits OTel spans and EventBus events for each detected change.
   */
  start(): void {
    if (this.running) return;
    if (!storage.existsSync(this.config.squadDir)) {
      throw new Error(`Squad directory not found: ${this.config.squadDir}`);
    }

    const tracer = getTracer('squad-observer');
    const span = tracer.startSpan('squad.observer.start', {
      attributes: {
        'squad.dir': this.config.squadDir,
        'debounce_ms': this.config.debounceMs,
      },
    });

    try {
      this.watcher = watch(this.config.squadDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Skip high-churn directories that don't affect squad state
        const normalized = filename.replace(/\\/g, '/');
        if (normalized.startsWith('orchestration-log/') || normalized.startsWith('.git/')) return;
        this.handleChange(eventType, filename);
      });

      this.watcher.on('error', (err: Error) => {
        const errSpan = tracer.startSpan('squad.observer.error', {
          attributes: { 'error.message': err.message },
        });
        errSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        errSpan.recordException(err);
        errSpan.end();
      });

      this.running = true;
      span.end();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      span.end();
      throw err;
    }
  }

  /**
   * Stop watching and clean up.
   */
  stop(): void {
    if (!this.running) return;

    const tracer = getTracer('squad-observer');
    const span = tracer.startSpan('squad.observer.stop');

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.watcher?.close();
    this.watcher = undefined;
    this.running = false;
    span.end();
  }

  /** Whether the observer is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private handleChange(eventType: string, filename: string): void {
    // Debounce rapid changes to the same file
    const existing = this.debounceTimers.get(filename);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(filename, setTimeout(() => {
      this.debounceTimers.delete(filename);
      this.processChange(filename);
    }, this.config.debounceMs));
  }

  private processChange(filename: string): void {
    const absolutePath = path.join(this.config.squadDir, filename);
    const category = classifyFile(filename);
    const exists = storage.existsSync(absolutePath);

    // Determine change type — basic heuristic since fs.watch doesn't tell us
    const changeType: SquadFileChange['changeType'] = exists ? 'modified' : 'deleted';

    const change: SquadFileChange = {
      relativePath: filename,
      absolutePath,
      changeType,
      category,
      timestamp: new Date(),
    };

    // Emit OTel span
    this.emitSpan(change);

    // Emit EventBus event
    if (this.config.eventBus) {
      this.emitEvent(change);
    }
  }

  private emitSpan(change: SquadFileChange): void {
    const tracer = getTracer('squad-observer');
    const span = tracer.startSpan('squad.observer.file_change', {
      attributes: {
        'file.path': change.relativePath,
        'file.category': change.category,
        'change.type': change.changeType,
      },
    });
    span.end();
  }

  private emitEvent(change: SquadFileChange): void {
    if (!this.config.eventBus) return;

    // Map file categories to appropriate event types
    const event: SquadEvent = {
      type: 'agent:milestone',
      agentName: change.category === 'agent' ? path.basename(path.dirname(change.relativePath)) : undefined,
      payload: {
        action: 'file_change',
        file: change.relativePath,
        category: change.category,
        changeType: change.changeType,
      },
      timestamp: change.timestamp,
    };

    // Fire and forget — errors handled by EventBus
    void this.config.eventBus.emit(event);
  }
}
