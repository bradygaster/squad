/**
 * RC-Tunnel Command Tests — Devtunnel lifecycle management
 *
 * Tests module exports and pure utility functions.
 * Does NOT create real devtunnels (requires devtunnel CLI).
 */

import { describe, it, expect } from 'vitest';
import os from 'node:os';

describe('CLI: rc-tunnel command', () => {
  it('module exports isDevtunnelAvailable function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.isDevtunnelAvailable).toBe('function');
  });

  it('module exports createTunnel function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.createTunnel).toBe('function');
  });

  it('module exports destroyTunnel function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.destroyTunnel).toBe('function');
  });

  it('module exports getMachineId function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.getMachineId).toBe('function');
  });

  it('module exports getGitInfo function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.getGitInfo).toBe('function');
  });

  it('isDevtunnelAvailable returns a boolean', async () => {
    const { isDevtunnelAvailable } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const result = isDevtunnelAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('getMachineId returns the system hostname', async () => {
    const { getMachineId } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const id = getMachineId();
    expect(id).toBe(os.hostname());
  });

  it('getGitInfo returns repo and branch from cwd', async () => {
    const { getGitInfo } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const info = getGitInfo(process.cwd());
    expect(info).toHaveProperty('repo');
    expect(info).toHaveProperty('branch');
    expect(typeof info.repo).toBe('string');
    expect(typeof info.branch).toBe('string');
  });

  it('getGitInfo returns "unknown" for non-git directories', async () => {
    const { getGitInfo } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const info = getGitInfo(os.tmpdir());
    expect(info.repo).toBe('unknown');
    expect(info.branch).toBe('unknown');
  });

  it('destroyTunnel does not throw when no tunnel active', async () => {
    const { destroyTunnel } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(() => destroyTunnel()).not.toThrow();
  });
});
