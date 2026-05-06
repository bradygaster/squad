import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPluginInstallPlan,
  derivePluginRoles,
  parsePluginManifestContent,
  validatePluginManifest,
} from '../packages/squad-sdk/src/marketplace/index.js';
import { runPlugin } from '../packages/squad-cli/src/cli/commands/plugin.js';

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

async function capturePluginCommand(cwd: string, args: string[]): Promise<string> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    await runPlugin(cwd, args);
    return [...log.mock.calls, ...info.mock.calls].map((call) => call.join(' ')).join('\n');
  } finally {
    log.mockRestore();
    info.mockRestore();
  }
}

describe('plugin manifest parser and validator', () => {
  it('accepts declarative plugin.manifest.json manifests and derives roles from declared components', () => {
    const manifest = parsePluginManifestContent(JSON.stringify({
      id: 'demo-plugin',
      name: 'Demo Plugin',
      version: '1.0.0',
      description: 'A declarative test plugin.',
      authors: ['Squad'],
      license: 'MIT',
      squad: '>=0.9.1',
      components: {
        skills: ['demo-plugin'],
        memory: { provider: 'demo-memory' },
      },
      files: [
        { source: 'SKILL.md', target: 'skills/demo-plugin/SKILL.md', type: 'skill' },
      ],
    }), 'plugin.manifest.json');

    const validation = validatePluginManifest(manifest);
    expect(validation.valid, validation.errors.join(', ')).toBe(true);
    expect(derivePluginRoles(manifest)).toEqual(['skills', 'memory']);

    const plan = createPluginInstallPlan(manifest, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    expect(plan.files[0]?.targetRoot).toBe('skills');
  });

  it('rejects executable declarations, script files, and path traversal', () => {
    expect(() => parsePluginManifestContent(JSON.stringify({
      id: 'bad-plugin',
      name: 'Bad Plugin',
      version: '1.0.0',
      components: {
        hooks: [{ command: 'node bad.js' }],
      },
      files: [],
    }))).toThrow(/executable key/);

    const manifest = parsePluginManifestContent(JSON.stringify({
      id: 'bad-plugin',
      name: 'Bad Plugin',
      version: '1.0.0',
      files: [
        { source: 'bad.js', target: '../bad.js', type: 'skill' },
      ],
    }));
    const validation = validatePluginManifest(manifest);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toMatch(/executable or script|relative path/);
  });
});

describe('squad plugin lifecycle CLI', () => {
  let tmpDir: string;
  let pluginDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'squad-plugin-lifecycle-'));
    mkdirSync(join(tmpDir, '.squad'), { recursive: true });
    pluginDir = join(tmpDir, 'demo-plugin');
    writeFile(join(pluginDir, 'plugin.manifest.json'), JSON.stringify({
      id: 'demo-plugin',
      name: 'Demo Plugin',
      version: '1.0.0',
      description: 'A declarative test plugin.',
      components: {
        skills: ['demo-plugin'],
        memory: { provider: 'demo-memory' },
      },
      files: [
        { source: 'SKILL.md', target: 'skills/demo-plugin/SKILL.md', type: 'skill' },
      ],
    }, null, 2));
    writeFile(join(pluginDir, 'SKILL.md'), '# Demo Plugin\n\nStatic skill content.\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates and dry-runs without writing plugin state', async () => {
    const output = await capturePluginCommand(tmpDir, ['dry-run', pluginDir]);

    expect(output).toContain('Dry run deployment plan');
    expect(readFileSync(join(pluginDir, 'SKILL.md'), 'utf8')).toContain('Static skill content');
    expect(() => readFileSync(join(tmpDir, '.squad', 'plugins', 'installed.json'), 'utf8')).toThrow();
  });

  it('installs disabled, verifies, enables, switches, disables, and uninstalls', async () => {
    await capturePluginCommand(tmpDir, ['install', pluginDir]);
    expect(readFileSync(join(tmpDir, '.squad', 'skills', 'demo-plugin', 'SKILL.md'), 'utf8'))
      .toBe('# Demo Plugin\n\nStatic skill content.\n');

    const installed = JSON.parse(readFileSync(join(tmpDir, '.squad', 'plugins', 'installed.json'), 'utf8')) as {
      plugins: Array<{ id: string; enabled: boolean; roles: string[] }>;
    };
    expect(installed.plugins[0]).toMatchObject({
      id: 'demo-plugin',
      enabled: false,
      roles: ['skills', 'memory'],
    });

    await capturePluginCommand(tmpDir, ['verify']);
    await capturePluginCommand(tmpDir, ['enable', 'demo-plugin']);
    let runtime = JSON.parse(readFileSync(join(tmpDir, '.squad', 'plugins', 'runtime.json'), 'utf8')) as {
      plugins: Record<string, { enabled: boolean }>;
      active: Record<string, string>;
    };
    expect(runtime.plugins['demo-plugin']?.enabled).toBe(true);
    expect(runtime.active.memory).toBe('demo-plugin');

    await capturePluginCommand(tmpDir, ['switch', 'memory', 'demo-plugin']);
    await capturePluginCommand(tmpDir, ['disable', 'demo-plugin']);
    runtime = JSON.parse(readFileSync(join(tmpDir, '.squad', 'plugins', 'runtime.json'), 'utf8')) as {
      active: Record<string, string>;
    };
    expect(runtime.active.memory).toBeUndefined();

    await capturePluginCommand(tmpDir, ['uninstall', 'demo-plugin']);
    const afterUninstall = JSON.parse(readFileSync(join(tmpDir, '.squad', 'plugins', 'installed.json'), 'utf8')) as {
      plugins: unknown[];
    };
    expect(afterUninstall.plugins).toHaveLength(0);
    expect(() => readFileSync(join(tmpDir, '.squad', 'skills', 'demo-plugin', 'SKILL.md'), 'utf8')).toThrow();

    const audit = readFileSync(join(tmpDir, '.squad', 'plugins', 'audit.jsonl'), 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { type: string });
    expect(audit.map((event) => event.type)).toEqual([
      'install',
      'verify',
      'enable',
      'switch',
      'disable',
      'uninstall',
    ]);
  });

  it('rejects symlinked plugin source files before install writes state', async () => {
    rmSync(join(pluginDir, 'SKILL.md'), { force: true });
    symlinkSync(join(tmpDir, 'outside.md'), join(pluginDir, 'SKILL.md'));

    await expect(runPlugin(tmpDir, ['install', pluginDir])).rejects.toThrow(/symlink/);
    expect(() => readFileSync(join(tmpDir, '.squad', 'plugins', 'installed.json'), 'utf8')).toThrow();
  });
});
