/**
 * Tests for CLI shared squad commands:
 *   - squad init --shared
 *   - squad shared status|add-url|list|doctor
 *   - squad migrate --to shared
 *
 * Uses real temp directories to exercise file I/O. Overrides APPDATA
 * (Windows) / XDG_CONFIG_HOME (Linux) to redirect global squad path
 * into test dir. Mocks git remote via explicit --key argument.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, rmSync, existsSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const TEST_ROOT = join(tmpdir(), `.test-cli-shared-${randomBytes(4).toString('hex')}`);
const FAKE_BASE = join(TEST_ROOT, 'appdata');
const FAKE_GLOBAL = join(FAKE_BASE, 'squad');

/** Save and override the env var that resolveGlobalSquadPath reads. */
let savedAppdata: string | undefined;
let savedXdg: string | undefined;

function overrideGlobalDir(): void {
  if (process.platform === 'win32') {
    savedAppdata = process.env['APPDATA'];
    process.env['APPDATA'] = FAKE_BASE;
  } else {
    savedXdg = process.env['XDG_CONFIG_HOME'];
    process.env['XDG_CONFIG_HOME'] = FAKE_BASE;
  }
}

function restoreGlobalDir(): void {
  if (process.platform === 'win32') {
    if (savedAppdata !== undefined) process.env['APPDATA'] = savedAppdata;
    else delete process.env['APPDATA'];
  } else {
    if (savedXdg !== undefined) process.env['XDG_CONFIG_HOME'] = savedXdg;
    else delete process.env['XDG_CONFIG_HOME'];
  }
}

describe('CLI: init-shared command', () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(TEST_ROOT, { recursive: true });
    overrideGlobalDir();
  });

  afterEach(() => {
    restoreGlobalDir();
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('exports runInitShared function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/init-shared');
    expect(typeof mod.runInitShared).toBe('function');
  });

  it('creates shared squad with explicit key', async () => {
    const { runInitShared } = await import('@bradygaster/squad-cli/commands/init-shared');
    const cwd = join(TEST_ROOT, 'project');
    mkdirSync(cwd, { recursive: true });

    // Mock console.log to capture output
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      runInitShared(cwd, 'test-org/test-repo');
    } finally {
      console.log = origLog;
    }

    // Verify success output
    expect(logs.some(l => l.includes('Created shared squad'))).toBe(true);
    expect(logs.some(l => l.includes('test-org/test-repo'))).toBe(true);
    expect(logs.some(l => l.includes('No files written to your repository'))).toBe(true);

    // Verify team dir was created with scaffolding
    const teamDir = join(FAKE_GLOBAL, 'repos', 'test-org', 'test-repo');
    expect(existsSync(teamDir)).toBe(true);
    expect(existsSync(join(teamDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(teamDir, 'team.md'))).toBe(true);
    expect(existsSync(join(teamDir, 'routing.md'))).toBe(true);
    expect(existsSync(join(teamDir, 'decisions.md'))).toBe(true);
    expect(existsSync(join(teamDir, 'agents'))).toBe(true);
    expect(existsSync(join(teamDir, 'casting'))).toBe(true);
    expect(existsSync(join(teamDir, 'decisions', 'inbox'))).toBe(true);
    expect(existsSync(join(teamDir, 'skills'))).toBe(true);

    // Verify registry was created
    const registry = JSON.parse(readFileSync(join(FAKE_GLOBAL, 'repos.json'), 'utf-8'));
    expect(registry.version).toBe(1);
    expect(registry.repos).toHaveLength(1);
    expect(registry.repos[0].key).toBe('test-org/test-repo');

    // Verify nothing was written to cwd
    const cwdContents = existsSync(join(cwd, '.squad'));
    expect(cwdContents).toBe(false);
  });

  it('attaches to existing squad instead of failing on duplicate key', async () => {
    const { runInitShared } = await import('@bradygaster/squad-cli/commands/init-shared');
    const cwd = join(TEST_ROOT, 'project2');
    mkdirSync(cwd, { recursive: true });

    // Create the squad first
    runInitShared(cwd, 'test-org/dup-repo');

    // Create it again — should not throw
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      runInitShared(cwd, 'test-org/dup-repo');
    } finally {
      console.log = origLog;
    }

    expect(logs.some(l => l.includes('Connected to shared squad') || l.includes('already exists'))).toBe(true);
  });

  it('fails without key and without git remote', async () => {
    const { runInitShared } = await import('@bradygaster/squad-cli/commands/init-shared');
    const cwd = join(TEST_ROOT, 'no-git');
    mkdirSync(cwd, { recursive: true });

    expect(() => runInitShared(cwd)).toThrow(/Cannot auto-detect repo key/);
  });
});

describe('CLI: shared subcommands', () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(TEST_ROOT, { recursive: true });
    overrideGlobalDir();
  });

  afterEach(() => {
    restoreGlobalDir();
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('exports runShared function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/shared');
    expect(typeof mod.runShared).toBe('function');
  });

  it('shared list shows empty registry', async () => {
    const { runShared } = await import('@bradygaster/squad-cli/commands/shared');
    const cwd = join(TEST_ROOT, 'proj');
    mkdirSync(cwd, { recursive: true });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      runShared(cwd, 'list', []);
    } finally {
      console.log = origLog;
    }

    expect(logs.some(l => l.includes('No shared squads registered'))).toBe(true);
  });

  it('shared list shows registered squads', async () => {
    const { runShared } = await import('@bradygaster/squad-cli/commands/shared');
    const { runInitShared } = await import('@bradygaster/squad-cli/commands/init-shared');

    const cwd = join(TEST_ROOT, 'proj-list');
    mkdirSync(cwd, { recursive: true });

    // Register a squad
    runInitShared(cwd, 'test-org/list-repo');

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      runShared(cwd, 'list', []);
    } finally {
      console.log = origLog;
    }

    expect(logs.some(l => l.includes('test-org/list-repo'))).toBe(true);
  });

  it('shared status shows not-in-shared hint when no shared squad', async () => {
    const { runShared } = await import('@bradygaster/squad-cli/commands/shared');

    const cwd = join(TEST_ROOT, 'proj-status');
    mkdirSync(cwd, { recursive: true });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      runShared(cwd, 'status', []);
    } finally {
      console.log = origLog;
    }

    expect(logs.some(l => l.includes('Not in a shared squad'))).toBe(true);
  });

  it('shared doctor checks health', async () => {
    const { runShared } = await import('@bradygaster/squad-cli/commands/shared');
    const { runInitShared } = await import('@bradygaster/squad-cli/commands/init-shared');

    const cwd = join(TEST_ROOT, 'proj-doctor');
    mkdirSync(cwd, { recursive: true });

    // Register a squad
    runInitShared(cwd, 'test-org/doctor-repo');

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      runShared(cwd, 'doctor', []);
    } finally {
      console.log = origLog;
    }

    expect(logs.some(l => l.includes('Checking shared squad health'))).toBe(true);
    expect(logs.some(l => l.includes('repos.json valid'))).toBe(true);
    expect(logs.some(l => l.includes('team dir exists, manifest valid'))).toBe(true);
  });

  it('shared add-url with --key flag works without discovery', async () => {
    const { runShared } = await import('@bradygaster/squad-cli/commands/shared');
    const { runInitShared } = await import('@bradygaster/squad-cli/commands/init-shared');

    const cwd = join(TEST_ROOT, 'proj-addurl');
    mkdirSync(cwd, { recursive: true });

    // Register a squad
    runInitShared(cwd, 'test-org/addurl-repo');

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      runShared(cwd, 'add-url', ['https://github.com/test-org/addurl-repo.git', '--key', 'test-org/addurl-repo']);
    } finally {
      console.log = origLog;
    }

    expect(logs.some(l => l.includes('Added URL pattern'))).toBe(true);

    // Verify the pattern was added to registry
    const registry = JSON.parse(readFileSync(join(FAKE_GLOBAL, 'repos.json'), 'utf-8'));
    const entry = registry.repos.find((r: { key: string }) => r.key === 'test-org/addurl-repo');
    expect(entry.urlPatterns.length).toBeGreaterThanOrEqual(1);
  });

  it('shared add-url fails without pattern', async () => {
    const { runShared } = await import('@bradygaster/squad-cli/commands/shared');
    const cwd = join(TEST_ROOT, 'proj-addurl-fail');
    mkdirSync(cwd, { recursive: true });

    expect(() => runShared(cwd, 'add-url', [])).toThrow(/Usage/);
  });

  it('rejects unknown subcommand', async () => {
    const { runShared } = await import('@bradygaster/squad-cli/commands/shared');
    const cwd = join(TEST_ROOT, 'proj-unknown');
    mkdirSync(cwd, { recursive: true });

    expect(() => runShared(cwd, 'bogus', [])).toThrow(/Unknown shared subcommand/);
  });
});

describe('CLI: migrate --to shared', () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(TEST_ROOT, { recursive: true });
    overrideGlobalDir();
  });

  afterEach(() => {
    restoreGlobalDir();
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('migrates local .squad/ to shared mode with explicit key', async () => {
    const { runMigrate } = await import('@bradygaster/squad-cli/commands/migrate');

    const cwd = join(TEST_ROOT, 'proj-migrate');
    const squadDir = join(cwd, '.squad');
    mkdirSync(join(squadDir, 'agents', 'test-agent'), { recursive: true });
    mkdirSync(join(squadDir, 'decisions', 'inbox'), { recursive: true });
    writeFileSync(join(squadDir, 'team.md'), '# Test Team\n');
    writeFileSync(join(squadDir, 'routing.md'), '# Routing\n');
    writeFileSync(join(squadDir, 'decisions.md'), '# Decisions\n');
    writeFileSync(join(squadDir, 'agents', 'test-agent', 'charter.md'), '# Charter\n');

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

    try {
      await runMigrate(cwd, { to: 'shared', key: 'test-org/migrate-repo' });
    } finally {
      console.log = origLog;
    }

    // Verify success output
    expect(logs.some(l => l.includes('Migrated to shared squad'))).toBe(true);

    // Verify files were copied to shared location
    const teamDir = join(FAKE_GLOBAL, 'repos', 'test-org', 'migrate-repo');
    expect(existsSync(teamDir)).toBe(true);
    expect(existsSync(join(teamDir, 'team.md'))).toBe(true);
    expect(existsSync(join(teamDir, 'routing.md'))).toBe(true);
    expect(existsSync(join(teamDir, 'decisions.md'))).toBe(true);
    expect(existsSync(join(teamDir, 'agents', 'test-agent', 'charter.md'))).toBe(true);

    // Verify content was preserved
    const content = readFileSync(join(teamDir, 'team.md'), 'utf-8');
    expect(content).toBe('# Test Team\n');

    // Verify registry
    const registry = JSON.parse(readFileSync(join(FAKE_GLOBAL, 'repos.json'), 'utf-8'));
    expect(registry.repos).toHaveLength(1);
    expect(registry.repos[0].key).toBe('test-org/migrate-repo');
  });

  it('rejects migrate --to shared without .squad/ dir', async () => {
    const { runMigrate } = await import('@bradygaster/squad-cli/commands/migrate');

    const cwd = join(TEST_ROOT, 'proj-no-squad');
    mkdirSync(cwd, { recursive: true });

    await expect(
      runMigrate(cwd, { to: 'shared', key: 'test-org/no-squad' }),
    ).rejects.toThrow(/No squad found/);
  });
});
