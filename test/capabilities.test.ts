import { describe, it, expect } from 'vitest';
import {
  extractNeeds,
  canHandleIssue,
  filterByCapabilities,
  type MachineCapabilities,
} from '@bradygaster/squad-sdk/ralph/capabilities';

const gpuMachine: MachineCapabilities = {
  machine: 'GPU-SERVER',
  capabilities: ['gpu', 'docker', 'browser'],
  missing: ['onedrive', 'teams-mcp'],
  lastUpdated: '2026-03-22T00:00:00Z',
};

const laptopMachine: MachineCapabilities = {
  machine: 'MY-LAPTOP',
  capabilities: ['browser', 'personal-gh', 'onedrive'],
  missing: ['gpu', 'docker'],
  lastUpdated: '2026-03-22T00:00:00Z',
};

describe('extractNeeds', () => {
  it('extracts needs:* labels', () => {
    expect(extractNeeds(['bug', 'needs:gpu', 'squad:picard'])).toEqual(['gpu']);
  });

  it('handles multiple needs', () => {
    expect(extractNeeds(['needs:gpu', 'needs:browser', 'needs:docker']))
      .toEqual(['gpu', 'browser', 'docker']);
  });

  it('returns empty for no needs labels', () => {
    expect(extractNeeds(['bug', 'enhancement', 'squad:data'])).toEqual([]);
  });

  it('returns empty for empty array', () => {
    expect(extractNeeds([])).toEqual([]);
  });
});

describe('canHandleIssue', () => {
  it('passes issues with no needs labels', () => {
    expect(canHandleIssue(['bug', 'squad:picard'], gpuMachine)).toEqual({ canHandle: true });
  });

  it('passes when all needs are met', () => {
    expect(canHandleIssue(['needs:gpu', 'needs:docker'], gpuMachine))
      .toEqual({ canHandle: true });
  });

  it('fails when needs are missing', () => {
    const result = canHandleIssue(['needs:gpu', 'needs:docker'], laptopMachine);
    expect(result.canHandle).toBe(false);
    if (!result.canHandle) {
      expect(result.missing).toEqual(['gpu', 'docker']);
    }
  });

  it('passes all issues when capabilities is null (opt-in)', () => {
    expect(canHandleIssue(['needs:gpu'], null)).toEqual({ canHandle: true });
  });

  it('reports only missing capabilities', () => {
    const result = canHandleIssue(['needs:browser', 'needs:gpu'], laptopMachine);
    expect(result.canHandle).toBe(false);
    if (!result.canHandle) {
      expect(result.missing).toEqual(['gpu']);
    }
  });
});

describe('filterByCapabilities', () => {
  const issues = [
    { number: 1, title: 'Bug fix', labels: [{ name: 'bug' }] },
    { number: 2, title: 'GPU task', labels: [{ name: 'needs:gpu' }] },
    { number: 3, title: 'Browser task', labels: [{ name: 'needs:browser' }] },
    { number: 4, title: 'Both', labels: [{ name: 'needs:gpu' }, { name: 'needs:browser' }] },
  ];

  it('passes all issues when capabilities is null', () => {
    const { handled, skipped } = filterByCapabilities(issues, null);
    expect(handled).toHaveLength(4);
    expect(skipped).toHaveLength(0);
  });

  it('filters correctly for GPU machine', () => {
    const { handled, skipped } = filterByCapabilities(issues, gpuMachine);
    expect(handled.map(i => i.number)).toEqual([1, 2, 3, 4]);
    expect(skipped).toHaveLength(0);
  });

  it('filters correctly for laptop', () => {
    const { handled, skipped } = filterByCapabilities(issues, laptopMachine);
    expect(handled.map(i => i.number)).toEqual([1, 3]);
    expect(skipped).toHaveLength(2);
    expect(skipped[0].issue.number).toBe(2);
    expect(skipped[0].missing).toEqual(['gpu']);
    expect(skipped[1].issue.number).toBe(4);
  });

  it('handles empty issue list', () => {
    const { handled, skipped } = filterByCapabilities([], gpuMachine);
    expect(handled).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });
});