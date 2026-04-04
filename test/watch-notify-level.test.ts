import { describe, it, expect } from 'vitest';
import { reportBoard } from '../packages/squad-cli/src/cli/commands/watch/index.js';
import type { BoardState } from '../packages/squad-cli/src/cli/commands/watch/index.js';

function emptyState(): BoardState {
  return { untriaged: 0, assigned: 0, drafts: 0, needsReview: 0, changesRequested: 0, ciFailures: 0, readyToMerge: 0, executed: 0 };
}

describe('reportBoard notifyLevel', () => {
  it('suppresses empty rounds in important mode (default)', () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      reportBoard(emptyState(), 42, { notifyLevel: 'important' });
      expect(logs).toHaveLength(0);
    } finally {
      console.log = origLog;
    }
  });

  it('prints empty rounds in all mode', () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      reportBoard(emptyState(), 42, { notifyLevel: 'all' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(l => l.includes('Board is clear'))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });

  it('suppresses everything in none mode', () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const busy = { ...emptyState(), untriaged: 3, ciFailures: 1 };
      reportBoard(busy, 10, { notifyLevel: 'none' });
      expect(logs).toHaveLength(0);
    } finally {
      console.log = origLog;
    }
  });

  it('prints busy rounds in important mode', () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const busy = { ...emptyState(), untriaged: 2, readyToMerge: 1 };
      reportBoard(busy, 5, { notifyLevel: 'important' });
      expect(logs.some(l => l.includes('Round 5'))).toBe(true);
      expect(logs.some(l => l.includes('Untriaged'))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });

  it('includes machine and repo in output when provided', () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const busy = { ...emptyState(), assigned: 1 };
      reportBoard(busy, 3, {
        notifyLevel: 'all',
        machineName: 'CPC-tamir-WCBED',
        repoName: 'my-project',
      });
      const roundLine = logs.find(l => l.includes('Round 3'));
      expect(roundLine).toBeDefined();
      expect(roundLine).toContain('CPC-tamir-WCBED');
      expect(roundLine).toContain('my-project');
    } finally {
      console.log = origLog;
    }
  });
});
