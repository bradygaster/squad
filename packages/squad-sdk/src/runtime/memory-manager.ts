/**
 * Memory management for shell sessions.
 * Enforces buffer limits and handles cleanup.
 */

export interface MemoryLimits {
  /** Max messages to keep in history (default: 200) */
  maxMessages: number;
  /** Max buffer size per stream in bytes (default: 1MB) */
  maxStreamBuffer: number;
  /** Max concurrent sessions (default: 10) */
  maxSessions: number;
  /** Session idle timeout in ms (default: 5 minutes) */
  sessionIdleTimeout: number;
}

export const DEFAULT_LIMITS: MemoryLimits = {
  maxMessages: 200,
  maxStreamBuffer: 1024 * 1024, // 1MB
  maxSessions: 10,
  sessionIdleTimeout: 5 * 60 * 1000, // 5 minutes
};

export class MemoryManager {
  private limits: MemoryLimits;
  private bufferSizes = new Map<string, number>();

  constructor(limits: Partial<MemoryLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /** Check if a new session can be created */
  canCreateSession(currentCount: number): boolean {
    return currentCount < this.limits.maxSessions;
  }

  /** Track buffer growth, return true if within limits */
  trackBuffer(sessionId: string, additionalBytes: number): boolean {
    const current = this.bufferSizes.get(sessionId) ?? 0;
    const newSize = current + additionalBytes;
    if (newSize > this.limits.maxStreamBuffer) {
      return false; // would exceed limit
    }
    this.bufferSizes.set(sessionId, newSize);
    return true;
  }

  /** Trim message history to limit */
  trimMessages<T>(messages: T[]): T[] {
    if (messages.length <= this.limits.maxMessages) return messages;
    return messages.slice(-this.limits.maxMessages);
  }

  /** Trim messages and return both kept and archived portions */
  trimWithArchival<T>(messages: T[]): { kept: T[]; archived: T[] } {
    if (messages.length <= this.limits.maxMessages) {
      return { kept: messages, archived: [] };
    }
    const cutoff = messages.length - this.limits.maxMessages;
    return {
      kept: messages.slice(cutoff),
      archived: messages.slice(0, cutoff),
    };
  }

  /** Clear buffer tracking for a session */
  clearBuffer(sessionId: string): void {
    this.bufferSizes.delete(sessionId);
  }

  /** Get current memory stats */
  getStats(): { sessions: number; totalBufferBytes: number } {
    let total = 0;
    for (const size of this.bufferSizes.values()) total += size;
    return { sessions: this.bufferSizes.size, totalBufferBytes: total };
  }

  /** Get configured limits */
  getLimits(): Readonly<MemoryLimits> {
    return { ...this.limits };
  }
}
