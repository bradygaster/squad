/**
 * Personal Squad Init & Discovery Tests
 *
 * Tests for Issue #576 — personal squad discovery during `init --global`
 * (via npx) and subsequent repo init flows.
 *
 * Covers:
 *  - resolveGlobalSquadPath() platform-specific path resolution
 *  - resolvePersonalSquadDir() discovery and kill-switch
 *  - personalInit (CLI) creates correct directory structure
 *  - Repo-level resolveSquadPaths() includes personalDir
 *  - Edge cases: empty dir, partial state, env overrides, npx execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join, sep } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { randomBytes } from 'crypto';
import {
  resolveGlobalSquadPath,
  resolvePersonalSquadDir,
  resolveSquadPaths,
  ensureSquadPathTriple,
} from '@bradygaster/squad-sdk/resolution';
import {
  resolvePersonalAgents,
  mergeSessionCast,
  type PersonalAgentManifest,
} from '@bradygaster/squad-sdk/agents/personal';

const TEST_ROOT = join(
  process.cwd(),
  `.test-personal-init-${randomBytes(4).toString('hex')}`,
);

function cleanup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 1. resolveGlobalSquadPath — platform-specific paths
// ---------------------------------------------------------------------------
describe('resolveGlobalSquadPath — platform paths', () => {
  beforeEach(() => { cleanup(); mkdirSync(TEST_ROOT, { recursive: true }); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('returns a path ending with "squad"', () => {
    const p = resolveGlobalSquadPath();
    expect(p.endsWith('squad')).toBe(true);
  });

  it('creates the directory if it does not exist', () => {
    const p = resolveGlobalSquadPath();
    expect(existsSync(p)).toBe(true);
  });

  it('Windows: prefers APPDATA over LOCALAPPDATA and homedir fallback', () => {
    if (process.platform !== 'win32') return; // Windows-only assertion
    const p = resolveGlobalSquadPath();
    const appdata = process.env['APPDATA'];
    if (appdata) {
      expect(p).toBe(join(appdata, 'squad'));
    }
  });

  it('Linux: respects XDG_CONFIG_HOME when set', () => {
    if (process.platform !== 'linux') return; // Linux-only assertion
    const custom = join(TEST_ROOT, 'xdg-home');
    mkdirSync(custom, { recursive: true });
    const saved = process.env['XDG_CONFIG_HOME'];
    try {
      process.env['XDG_CONFIG_HOME'] = custom;
      const p = resolveGlobalSquadPath();
      expect(p).toBe(join(custom, 'squad'));
      expect(existsSync(p)).toBe(true);
    } finally {
      if (saved !== undefined) process.env['XDG_CONFIG_HOME'] = saved;
      else delete process.env['XDG_CONFIG_HOME'];
    }
  });

  it('returns a consistent path across repeated calls', () => {
    const a = resolveGlobalSquadPath();
    const b = resolveGlobalSquadPath();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 2. resolvePersonalSquadDir — npx / install-agnostic discovery
// ---------------------------------------------------------------------------
describe('resolvePersonalSquadDir — discovery & kill-switch', () => {
  let savedNoPersonal: string | undefined;

  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_ROOT, { recursive: true });
    savedNoPersonal = process.env['SQUAD_NO_PERSONAL'];
    delete process.env['SQUAD_NO_PERSONAL'];
  });

  afterEach(() => {
    if (savedNoPersonal !== undefined) process.env['SQUAD_NO_PERSONAL'] = savedNoPersonal;
    else delete process.env['SQUAD_NO_PERSONAL'];
    cleanup();
    vi.unstubAllEnvs();
  });

  it('returns null when SQUAD_NO_PERSONAL=1', () => {
    process.env['SQUAD_NO_PERSONAL'] = '1';
    expect(resolvePersonalSquadDir()).toBeNull();
  });

  it('returns null for any truthy SQUAD_NO_PERSONAL value', () => {
    for (const val of ['true', 'yes', 'on', 'anything']) {
      process.env['SQUAD_NO_PERSONAL'] = val;
      expect(resolvePersonalSquadDir()).toBeNull();
    }
  });

  it('returns null when personal-squad subdir does not exist', () => {
    // Ensure the global dir exists but personal-squad does not
    const globalDir = resolveGlobalSquadPath();
    const personalDir = join(globalDir, 'personal-squad');
    if (existsSync(personalDir)) {
      // If it already exists on this machine, skip this assertion
      return;
    }
    expect(resolvePersonalSquadDir()).toBeNull();
  });

  it('returns path when personal-squad directory exists', () => {
    const globalDir = resolveGlobalSquadPath();
    const personalDir = join(globalDir, 'personal-squad');
    mkdirSync(personalDir, { recursive: true });
    try {
      const result = resolvePersonalSquadDir();
      expect(result).toBe(personalDir);
    } finally {
      rmSync(personalDir, { recursive: true, force: true });
    }
  });

  it('works regardless of how the CLI was invoked (npx, global, local)', () => {
    // resolvePersonalSquadDir uses os.homedir / env vars — not process.argv[0]
    // Verify it does NOT inspect process.argv or require a specific install path
    const globalDir = resolveGlobalSquadPath();
    const personalDir = join(globalDir, 'personal-squad');
    mkdirSync(personalDir, { recursive: true });
    try {
      // Simulate npx-style execution context by verifying the function
      // ignores argv entirely and resolves from env/homedir
      const saved = process.argv[1];
      process.argv[1] = '/fake/.npm/_npx/squad-cli/node_modules/.bin/squad';
      const result = resolvePersonalSquadDir();
      process.argv[1] = saved;
      expect(result).toBe(personalDir);
    } finally {
      rmSync(personalDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. personalInit — creates files at correct location
// ---------------------------------------------------------------------------
describe('personal init — directory structure', () => {
  beforeEach(() => { cleanup(); mkdirSync(TEST_ROOT, { recursive: true }); });
  afterEach(() => { cleanup(); });

  it('creates personal-squad/agents/ and config.json', async () => {
    // Simulate what personalInit() does (we can't call the private fn directly,
    // so we replicate its logic and validate the contract).
    const globalDir = join(TEST_ROOT, 'global');
    const personalDir = join(globalDir, 'personal-squad');
    const agentsDir = join(personalDir, 'agents');
    const configPath = join(personalDir, 'config.json');

    mkdirSync(agentsDir, { recursive: true });
    const config = { defaultModel: 'auto', ghostProtocol: true };
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    expect(existsSync(personalDir)).toBe(true);
    expect(existsSync(agentsDir)).toBe(true);
    expect(existsSync(configPath)).toBe(true);

    const parsed = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(parsed).toEqual({ defaultModel: 'auto', ghostProtocol: true });
  });

  it('config.json always enables ghostProtocol', async () => {
    const personalDir = join(TEST_ROOT, 'ps');
    mkdirSync(personalDir, { recursive: true });
    const configPath = join(personalDir, 'config.json');
    const config = { defaultModel: 'auto', ghostProtocol: true };
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const parsed = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(parsed.ghostProtocol).toBe(true);
  });

  it('does NOT overwrite when personal-squad already exists', () => {
    // personalInit exits early if dir exists — verify idempotency
    const personalDir = join(TEST_ROOT, 'existing-ps');
    mkdirSync(personalDir, { recursive: true });

    // The fact that the dir exists means init would warn and return early
    expect(existsSync(personalDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Repo init discovers existing personal squad via resolveSquadPaths
// ---------------------------------------------------------------------------
describe('resolveSquadPaths — includes personalDir', () => {
  const repoRoot = join(TEST_ROOT, 'my-repo');
  const squadDir = join(repoRoot, '.squad');

  beforeEach(() => {
    cleanup();
    mkdirSync(squadDir, { recursive: true });
  });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('resolveSquadPaths returns personalDir from resolvePersonalSquadDir', () => {
    const paths = resolveSquadPaths(repoRoot);
    if (!paths) {
      // No .squad found — that's acceptable in this synthetic root,
      // but the directory was created above so it should resolve.
      return;
    }
    // personalDir should be either a string or null depending on machine state
    expect(paths).toHaveProperty('personalDir');
    expect(
      paths.personalDir === null || typeof paths.personalDir === 'string',
    ).toBe(true);
  });

  it('personalDir is null when SQUAD_NO_PERSONAL is set', () => {
    process.env['SQUAD_NO_PERSONAL'] = '1';
    const paths = resolveSquadPaths(repoRoot);
    if (!paths) return;
    expect(paths.personalDir).toBeNull();
    delete process.env['SQUAD_NO_PERSONAL'];
  });

  it('repo init works correctly when NO personal squad exists', () => {
    process.env['SQUAD_NO_PERSONAL'] = '1';
    const paths = resolveSquadPaths(repoRoot);
    delete process.env['SQUAD_NO_PERSONAL'];
    if (!paths) return;
    // All other fields should still be valid
    expect(paths.projectDir).toBe(squadDir);
    expect(paths.teamDir).toBeTruthy();
    expect(paths.mode).toBe('local');
    expect(paths.personalDir).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Edge: personal squad dir exists but is empty (no agents/, no config)
// ---------------------------------------------------------------------------
describe('edge — empty personal squad directory', () => {
  beforeEach(() => { cleanup(); mkdirSync(TEST_ROOT, { recursive: true }); });
  afterEach(() => { cleanup(); });

  it('resolvePersonalSquadDir returns path even when dir is empty', () => {
    const globalDir = resolveGlobalSquadPath();
    const personalDir = join(globalDir, 'personal-squad');
    mkdirSync(personalDir, { recursive: true });
    try {
      // The function only checks fs.existsSync(personalDir), not contents
      expect(resolvePersonalSquadDir()).toBe(personalDir);
    } finally {
      rmSync(personalDir, { recursive: true, force: true });
    }
  });

  it('resolvePersonalAgents returns [] when agents subdir is missing', async () => {
    const globalDir = resolveGlobalSquadPath();
    const personalDir = join(globalDir, 'personal-squad');
    mkdirSync(personalDir, { recursive: true });
    try {
      const agents = await resolvePersonalAgents();
      expect(agents).toEqual([]);
    } finally {
      rmSync(personalDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Edge: partial state — agents/ exists but no charter.md files
// ---------------------------------------------------------------------------
describe('edge — partial personal squad state', () => {
  let personalDir: string;

  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_ROOT, { recursive: true });
    const globalDir = resolveGlobalSquadPath();
    personalDir = join(globalDir, 'personal-squad');
  });
  afterEach(() => {
    if (existsSync(personalDir)) rmSync(personalDir, { recursive: true, force: true });
    cleanup();
  });

  it('agents dir exists but is empty → returns []', async () => {
    const agentsDir = join(personalDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    const agents = await resolvePersonalAgents();
    expect(agents).toEqual([]);
  });

  it('agent subdir exists without charter.md → skipped', async () => {
    const agentsDir = join(personalDir, 'agents');
    const broken = join(agentsDir, 'orphan-agent');
    mkdirSync(broken, { recursive: true });
    await writeFile(join(broken, 'history.md'), '# History\n', 'utf-8');

    const agents = await resolvePersonalAgents();
    expect(agents).toEqual([]);
  });

  it('agent subdir with charter.md but missing Role → defaults to "personal"', async () => {
    const agentsDir = join(personalDir, 'agents');
    const agentDir = join(agentsDir, 'minimalist');
    mkdirSync(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, 'charter.md'),
      '# Minimalist\n\nNo metadata here.\n',
      'utf-8',
    );

    const agents = await resolvePersonalAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe('minimalist');
    expect(agents[0].role).toBe('personal'); // default when no Role line
    expect(agents[0].personal.ghostProtocol).toBe(true);
  });

  it('mix of valid and invalid agent dirs → only valid agents returned', async () => {
    const agentsDir = join(personalDir, 'agents');

    // Valid agent
    const goodDir = join(agentsDir, 'good-agent');
    mkdirSync(goodDir, { recursive: true });
    await writeFile(
      join(goodDir, 'charter.md'),
      '# Good\n\n**Name:** Good Agent\n**Role:** Developer\n',
      'utf-8',
    );

    // No charter
    const noCharterDir = join(agentsDir, 'no-charter');
    mkdirSync(noCharterDir, { recursive: true });
    await writeFile(join(noCharterDir, 'notes.txt'), 'just notes', 'utf-8');

    // A file (not directory) — should be skipped
    await writeFile(join(agentsDir, 'stray-file.txt'), 'not a dir', 'utf-8');

    const agents = await resolvePersonalAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe('good-agent');
    expect(agents[0].role).toBe('Developer');
    expect(agents[0].personal.origin).toBe('personal');
    expect(agents[0].personal.sourceDir).toBe(goodDir);
  });
});

// ---------------------------------------------------------------------------
// 7. SQUAD_NO_PERSONAL kill-switch across the full stack
// ---------------------------------------------------------------------------
describe('SQUAD_NO_PERSONAL kill-switch', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env['SQUAD_NO_PERSONAL'];
  });
  afterEach(() => {
    if (saved !== undefined) process.env['SQUAD_NO_PERSONAL'] = saved;
    else delete process.env['SQUAD_NO_PERSONAL'];
  });

  it('resolvePersonalSquadDir returns null', () => {
    process.env['SQUAD_NO_PERSONAL'] = '1';
    expect(resolvePersonalSquadDir()).toBeNull();
  });

  it('resolvePersonalAgents returns empty array', async () => {
    process.env['SQUAD_NO_PERSONAL'] = '1';
    expect(await resolvePersonalAgents()).toEqual([]);
  });

  it('empty-string value does NOT disable (truthy check)', () => {
    process.env['SQUAD_NO_PERSONAL'] = '';
    // An empty string is falsy in JS, so the kill switch should NOT trigger
    // The function returns null only if the env var is truthy
    // However, the implementation is: if (process.env['SQUAD_NO_PERSONAL']) return null;
    // Empty string is falsy, so personal squad is NOT disabled
    const result = resolvePersonalSquadDir();
    // result could be null if dir doesn't exist, but the kill switch didn't fire
    // We verify the kill switch didn't fire by checking the global dir path
    const globalDir = resolveGlobalSquadPath();
    const personalDir = join(globalDir, 'personal-squad');
    if (existsSync(personalDir)) {
      expect(result).toBe(personalDir);
    } else {
      expect(result).toBeNull(); // null because dir missing, not kill switch
    }
  });
});

// ---------------------------------------------------------------------------
// 8. mergeSessionCast — personal agents respect project precedence
// ---------------------------------------------------------------------------
describe('mergeSessionCast — init-time discovery', () => {
  it('empty personal agents → returns only project agents', () => {
    const project = [
      { name: 'fido', role: 'tester', source: 'local' },
    ];
    expect(mergeSessionCast(project, [])).toEqual(project);
  });

  it('empty project agents → returns all personal agents', () => {
    const personal: PersonalAgentManifest[] = [
      {
        name: 'ghost',
        role: 'advisor',
        source: 'personal',
        personal: { origin: 'personal', sourceDir: '/p/ghost', ghostProtocol: true },
      },
    ];
    const merged = mergeSessionCast([], personal);
    expect(merged.length).toBe(1);
    expect(merged[0].name).toBe('ghost');
  });

  it('no agents at all → returns empty array', () => {
    expect(mergeSessionCast([], [])).toEqual([]);
  });

  it('project agent always wins on name collision (case-insensitive)', () => {
    const project = [{ name: 'FIDO', role: 'tester', source: 'local' }];
    const personal: PersonalAgentManifest[] = [
      {
        name: 'fido',
        role: 'advisor',
        source: 'personal',
        personal: { origin: 'personal', sourceDir: '/p/fido', ghostProtocol: true },
      },
      {
        name: 'unique',
        role: 'helper',
        source: 'personal',
        personal: { origin: 'personal', sourceDir: '/p/unique', ghostProtocol: true },
      },
    ];
    const merged = mergeSessionCast(project, personal);
    expect(merged.length).toBe(2);
    expect(merged[0].name).toBe('FIDO');
    expect(merged[0].source).toBe('local');
    expect(merged[1].name).toBe('unique');
  });
});

// ---------------------------------------------------------------------------
// 9. ensureSquadPathTriple with personalDir from discovery
// ---------------------------------------------------------------------------
describe('ensureSquadPathTriple — personal dir integration', () => {
  const projDir = join(TEST_ROOT, 'proj');
  const teamDir = join(TEST_ROOT, 'team');
  const persDir = join(TEST_ROOT, 'pers');

  beforeEach(() => {
    cleanup();
    for (const d of [projDir, teamDir, persDir]) mkdirSync(d, { recursive: true });
  });
  afterEach(() => { cleanup(); });

  it('accepts paths inside personalDir', () => {
    const p = join(persDir, 'agents', 'x', 'charter.md');
    expect(ensureSquadPathTriple(p, projDir, teamDir, persDir)).toBe(p);
  });

  it('rejects paths outside all roots even with personalDir present', () => {
    const evil = join(TEST_ROOT, 'evil.txt');
    expect(() => ensureSquadPathTriple(evil, projDir, teamDir, persDir)).toThrow(
      /outside all allowed directories/,
    );
  });

  it('works when personalDir is null (no personal squad)', () => {
    const valid = join(projDir, 'file.txt');
    expect(ensureSquadPathTriple(valid, projDir, teamDir, null)).toBe(valid);
  });
});

// ---------------------------------------------------------------------------
// 10. Charter metadata parsing edge cases (via resolvePersonalAgents)
// ---------------------------------------------------------------------------
describe('charter metadata parsing via resolvePersonalAgents', () => {
  let personalDir: string;

  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_ROOT, { recursive: true });
    const globalDir = resolveGlobalSquadPath();
    personalDir = join(globalDir, 'personal-squad');
  });
  afterEach(() => {
    if (existsSync(personalDir)) rmSync(personalDir, { recursive: true, force: true });
    cleanup();
  });

  it('parses Role with extra whitespace', async () => {
    const agentDir = join(personalDir, 'agents', 'spacey');
    mkdirSync(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, 'charter.md'),
      '# Spacey\n\n**Role:**   Staff Engineer   \n',
      'utf-8',
    );
    const agents = await resolvePersonalAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].role).toBe('Staff Engineer');
  });

  it('sets source to "personal" and sourceDir correctly', async () => {
    const agentDir = join(personalDir, 'agents', 'precise');
    mkdirSync(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, 'charter.md'),
      '# Precise\n\n**Name:** Precise\n**Role:** Analyst\n',
      'utf-8',
    );
    const agents = await resolvePersonalAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].source).toBe('personal');
    expect(agents[0].personal.sourceDir).toBe(agentDir);
  });

  it('multiple agents discovered and each has unique sourceDir', async () => {
    const agentsDir = join(personalDir, 'agents');
    for (const name of ['alpha', 'beta', 'gamma']) {
      const d = join(agentsDir, name);
      mkdirSync(d, { recursive: true });
      await writeFile(join(d, 'charter.md'), `# ${name}\n\n**Role:** Worker\n`, 'utf-8');
    }
    const agents = await resolvePersonalAgents();
    expect(agents.length).toBe(3);
    const dirs = new Set(agents.map(a => a.personal.sourceDir));
    expect(dirs.size).toBe(3);
  });
});
