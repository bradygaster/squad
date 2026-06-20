import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadWatchConfig } from '../../packages/squad-cli/src/cli/commands/watch/config.js';
import type { ExecutionConfigError } from '../../packages/squad-cli/src/cli/core/execution-config.js';

describe('watch config execution settings', () => {
  let root: string;
  const oldSandbox = process.env['SQUAD_SANDBOX'];
  const oldProfile = process.env['SQUAD_PERMISSION_PROFILE'];
  const oldSandboxFlags = process.env['SQUAD_SANDBOX_FLAGS'];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'squad-watch-config-'));
    mkdirSync(path.join(root, '.squad'), { recursive: true });
  });

  afterEach(() => {
    if (oldSandbox === undefined) delete process.env['SQUAD_SANDBOX'];
    else process.env['SQUAD_SANDBOX'] = oldSandbox;
    if (oldProfile === undefined) delete process.env['SQUAD_PERMISSION_PROFILE'];
    else process.env['SQUAD_PERMISSION_PROFILE'] = oldProfile;
    if (oldSandboxFlags === undefined) delete process.env['SQUAD_SANDBOX_FLAGS'];
    else process.env['SQUAD_SANDBOX_FLAGS'] = oldSandboxFlags;
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves execution settings from env when no CLI/config values are provided', () => {
    process.env['SQUAD_SANDBOX'] = 'copilot';
    process.env['SQUAD_PERMISSION_PROFILE'] = 'autopilot';
    process.env['SQUAD_SANDBOX_FLAGS'] = '--trace --isolation strict';

    const cfg = loadWatchConfig(root, {});
    expect(cfg.sandbox).toBe('copilot');
    expect(cfg.permissionProfile).toBe('autopilot');
    expect(cfg.sandboxFlags).toBe('--trace --isolation strict');
    expect(cfg.executionSource).toBe('env');
  });

  it('lets CLI override config and env values', () => {
    writeFileSync(path.join(root, '.squad', 'config.json'), JSON.stringify({
      watch: {
        sandbox: 'copilot',
        permissionProfile: 'interactive',
      },
    }, null, 2));
    process.env['SQUAD_SANDBOX'] = 'copilot';
    process.env['SQUAD_PERMISSION_PROFILE'] = 'interactive';

    const cfg = loadWatchConfig(root, {
      sandbox: 'copilot',
      sandboxFlags: '--from-cli',
      permissionProfile: 'yolo',
    });

    expect(cfg.sandbox).toBe('copilot');
    expect(cfg.sandboxFlags).toBe('--from-cli');
    expect(cfg.permissionProfile).toBe('yolo');
    expect(cfg.executionSource).toBe('cli');
  });

  it('throws stable conflict code for explicit sandbox + agentCmd', () => {
    try {
      loadWatchConfig(root, {
        sandbox: 'copilot',
        agentCmd: 'custom-agent --run',
      });
      throw new Error('expected loadWatchConfig to throw');
    } catch (err) {
      const e = err as ExecutionConfigError;
      expect(e.code).toBe('SQUAD_SANDBOX_OVERRIDE_CONFLICT');
    }
  });
});
