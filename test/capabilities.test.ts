import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractNeeds,
  canHandleIssue,
  filterByCapabilities,
  loadCapabilities,
  getDeploymentMode,
  getPodId,
  generatePodCapabilitiesPath,
  type MachineCapabilities,
} from '@bradygaster/squad-sdk/ralph/capabilities';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

describe('dual-mode deployment', () => {
  let savedPodId: string | undefined;
  let savedMode: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    savedPodId = process.env.SQUAD_POD_ID;
    savedMode = process.env.SQUAD_DEPLOYMENT_MODE;
    delete process.env.SQUAD_POD_ID;
    delete process.env.SQUAD_DEPLOYMENT_MODE;

    tmpDir = path.join(os.tmpdir(), `squad-cap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });
  });

  afterEach(() => {
    if (savedPodId !== undefined) process.env.SQUAD_POD_ID = savedPodId;
    else delete process.env.SQUAD_POD_ID;
    if (savedMode !== undefined) process.env.SQUAD_DEPLOYMENT_MODE = savedMode;
    else delete process.env.SQUAD_DEPLOYMENT_MODE;

    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('loadCapabilities reads pod-specific manifest when SQUAD_POD_ID is set', async () => {
    process.env.SQUAD_POD_ID = 'squad-worker-abc';
    process.env.SQUAD_DEPLOYMENT_MODE = 'squad-per-pod';

    const podManifest: MachineCapabilities = {
      machine: 'POD-ABC',
      capabilities: ['gpu', 'docker'],
      missing: [],
      lastUpdated: '2026-06-01T00:00:00Z',
    };
    writeFileSync(
      path.join(tmpDir, '.squad', 'machine-capabilities-squad-worker-abc.json'),
      JSON.stringify(podManifest),
    );
    // Also write shared manifest to ensure pod-specific wins
    const sharedManifest: MachineCapabilities = {
      machine: 'SHARED',
      capabilities: ['browser'],
      missing: ['gpu'],
      lastUpdated: '2026-06-01T00:00:00Z',
    };
    writeFileSync(
      path.join(tmpDir, '.squad', 'machine-capabilities.json'),
      JSON.stringify(sharedManifest),
    );

    const caps = await loadCapabilities(tmpDir);
    expect(caps).not.toBeNull();
    expect(caps!.machine).toBe('POD-ABC');
    expect(caps!.podId).toBe('squad-worker-abc');
  });

  it('loadCapabilities falls back to shared manifest when pod-specific not found', async () => {
    process.env.SQUAD_POD_ID = 'squad-worker-xyz';
    process.env.SQUAD_DEPLOYMENT_MODE = 'squad-per-pod';

    const sharedManifest: MachineCapabilities = {
      machine: 'SHARED-FALLBACK',
      capabilities: ['browser'],
      missing: ['gpu'],
      lastUpdated: '2026-06-01T00:00:00Z',
    };
    writeFileSync(
      path.join(tmpDir, '.squad', 'machine-capabilities.json'),
      JSON.stringify(sharedManifest),
    );

    const caps = await loadCapabilities(tmpDir);
    expect(caps).not.toBeNull();
    expect(caps!.machine).toBe('SHARED-FALLBACK');
    expect(caps!.podId).toBe('squad-worker-xyz');
  });

  it('loadCapabilities ignores SQUAD_POD_ID when SQUAD_DEPLOYMENT_MODE is agent-per-node', async () => {
    process.env.SQUAD_POD_ID = 'squad-worker-abc';
    process.env.SQUAD_DEPLOYMENT_MODE = 'agent-per-node';

    const podManifest: MachineCapabilities = {
      machine: 'POD-ABC',
      capabilities: ['gpu', 'docker'],
      missing: [],
      lastUpdated: '2026-06-01T00:00:00Z',
    };
    writeFileSync(
      path.join(tmpDir, '.squad', 'machine-capabilities-squad-worker-abc.json'),
      JSON.stringify(podManifest),
    );
    const sharedManifest: MachineCapabilities = {
      machine: 'SHARED',
      capabilities: ['browser'],
      missing: ['gpu'],
      lastUpdated: '2026-06-01T00:00:00Z',
    };
    writeFileSync(
      path.join(tmpDir, '.squad', 'machine-capabilities.json'),
      JSON.stringify(sharedManifest),
    );

    const caps = await loadCapabilities(tmpDir);
    expect(caps).not.toBeNull();
    // Should read shared, not pod-specific, because mode is agent-per-node
    expect(caps!.machine).toBe('SHARED');
    expect(caps!.podId).toBeUndefined();
  });

  it('getDeploymentMode defaults to agent-per-node', () => {
    delete process.env.SQUAD_DEPLOYMENT_MODE;
    expect(getDeploymentMode()).toBe('agent-per-node');
  });

  it('getDeploymentMode reads SQUAD_DEPLOYMENT_MODE env var', () => {
    process.env.SQUAD_DEPLOYMENT_MODE = 'squad-per-pod';
    expect(getDeploymentMode()).toBe('squad-per-pod');
  });

  it('getPodId reads SQUAD_POD_ID env var', () => {
    delete process.env.SQUAD_POD_ID;
    expect(getPodId()).toBeUndefined();

    process.env.SQUAD_POD_ID = 'my-pod-42';
    expect(getPodId()).toBe('my-pod-42');
  });
});