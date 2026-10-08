/**
 * Animation hooks for tasteful CLI transitions.
 *
 * All hooks respect NO_COLOR — when isNoColor() is true, animations are
 * skipped and static content is returned immediately.
 *
 * Frame rate capped at ~15fps (67ms intervals) to stay GPU-friendly in Ink.
 *
 * Maintained by the TUI engineering owner.
 */

import { useState, useEffect, useRef } from 'react';
import { isNoColor } from './terminal.js';

/** ~15fps frame interval */
const FRAME_MS = 67;

/**
 * Typewriter: reveals text character by character over durationMs.
 * NO_COLOR: returns full text immediately.
 */
export function useTypewriter(text: string, durationMs: number = 500): string {
  const noColor = isNoColor();
  const [count, setCount] = useState(noColor ? text.length : 0);

  useEffect(() => {
    if (noColor || !text) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const charsPerFrame = Math.max(1, Math.ceil(text.length / (durationMs / FRAME_MS)));
    const timer = setInterval(() => {
      setCount(c => {
        const next = Math.min(c + charsPerFrame, text.length);
        if (next >= text.length) clearInterval(timer);
        return next;
      });
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [text, durationMs, noColor]);

  return text.slice(0, count);
}

/**
 * Fade-in: starts dim, becomes normal after durationMs.
 * Returns true while still fading (content should be dim).
 * Triggers when `active` becomes true.
 * NO_COLOR: always returns false (no fade).
 */
export function useFadeIn(active: boolean, durationMs: number = 300): boolean {
  const noColor = isNoColor();
  const [dim, setDim] = useState(false);

  useEffect(() => {
    if (noColor || !active) return;
    setDim(true);
    const timer = setTimeout(() => setDim(false), durationMs);
    return () => clearTimeout(timer);
  }, [active, durationMs, noColor]);

  return dim;
}

/**
 * Completion flash: detects when agents transition working/streaming → idle.
 * Returns Set of agent names currently showing "✓ Done" flash.
 * Flash lasts flashMs (default 1500ms).
 * NO_COLOR: returns empty set.
 *
 * Uses React's setState-during-render pattern for synchronous detection,
 * so the flash is visible on the same render that triggers the transition.
 */
export function useCompletionFlash(
  agents: Array<{ name: string; status: string }>,
  flashMs: number = 1500,
): Set<string> {
  const noColor = isNoColor();
  const prevRef = useRef(new Map<string, string>());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Detect transitions during render (synchronous)
  const prev = prevRef.current;

  if (!noColor) {
    let changed = false;
    const next = new Set(flashing);

    for (const agent of agents) {
      const prevStatus = prev.get(agent.name);
      const wasActive = prevStatus === 'working' || prevStatus === 'streaming';
      const isNowIdle = agent.status === 'idle';

      if (wasActive && isNowIdle && !flashing.has(agent.name)) {
        next.add(agent.name);
        changed = true;
      }
    }

    if (changed) {
      setFlashing(next);
    }
  }

  // Update prev status map after detection
  const newMap = new Map<string, string>();
  for (const a of agents) newMap.set(a.name, a.status);
  prevRef.current = newMap;

  // Timer cleanup: remove flash after flashMs
  useEffect(() => {
    for (const name of flashing) {
      if (!timersRef.current.has(name)) {
        const timer = setTimeout(() => {
          setFlashing(s => { const n = new Set(s); n.delete(name); return n; });
          timersRef.current.delete(name);
        }, flashMs);
        timersRef.current.set(name, timer);
      }
    }
  }, [flashing, flashMs]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach(t => clearTimeout(t)); };
  }, []);

  return flashing;
}

/**
 * Message fade: tracks new messages and returns count of "fading" messages
 * from the end of the visible list.
 * NO_COLOR: always returns 0.
 */
export function useMessageFade(totalCount: number, fadeMs: number = 200): number {
  const noColor = isNoColor();
  const prevRef = useRef(totalCount);
  const [fadingCount, setFadingCount] = useState(0);

  useEffect(() => {
    if (noColor) {
      prevRef.current = totalCount;
      return;
    }

    const diff = totalCount - prevRef.current;
    if (diff > 0) {
      setFadingCount(diff);
      const timer = setTimeout(() => setFadingCount(0), fadeMs);
      prevRef.current = totalCount;
      return () => clearTimeout(timer);
    }
    prevRef.current = totalCount;
  }, [totalCount, fadeMs, noColor]);

  return fadingCount;
}
