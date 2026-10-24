/**
 * Squad 2.0 Packed Clean-Install & v1.1.0 → 2.0 Upgrade/Rollback Smoke Test
 *
 * Packs `@bradygaster/squad-sdk` and `@bradygaster/squad-cli` via `npm pack`,
 * unpacks the published tarball artifacts into an isolated directory, and verifies:
 * 1. Tarball contents include `/client`, `/clients`, `/backend`, `templates/`, and `dist/cli-entry.js` without leaking `.squad/`.
 * 2. Subpath exports (`@bradygaster/squad-sdk/client`, `/clients`, `/backend`) resolve from the packed artifact.
 * 3. Clean `squad init --client claude,codex` from the packed CLI scaffolds `.squad/` and host projections.
 * 4. Upgrading a v1.1.0 workspace with `squad upgrade --client all --force` repairs a handwritten casting registry,
 *    preserves user `.squad/` state and `.mcp.json` / `CLAUDE.md` content, projects all 7 hosts, and rolls back
 *    byte-for-byte via `uninstallClients`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

describe('Squad 2.0 npm pack clean-install and v1.1.0 → 2.0 upgrade/rollback smoke', { timeout: 120_000 }, () => {
  let stagingDir: string;
  let cliEntryPath: string;
  let nodePathEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    const cwd = process.cwd();
    const sdkDir = join(cwd, 'packages', 'squad-sdk');
    const cliDir = join(cwd, 'packages', 'squad-cli');
    const buildEnv = { ...process.env, SKIP_BUILD_BUMP: '1', NO_COLOR: '1', FORCE_COLOR: '0' };

    if (!existsSync(join(sdkDir, 'dist', 'index.js'))) {
      execSync('npm run build', { cwd: sdkDir, stdio: 'inherit', env: buildEnv });
    }
    if (!existsSync(join(cliDir, 'dist', 'cli-entry.js'))) {
      execSync('npm run build', { cwd: cliDir, stdio: 'inherit', env: buildEnv });
    }

    const cacheRoot = join(cwd, 'node_modules', '.cache');
    mkdirSync(cacheRoot, { recursive: true });
    stagingDir = mkdtempSync(join(cacheRoot, 'squad-20-pack-smoke-'));
    const tarballsDir = join(stagingDir, 'tarballs');
    mkdirSync(tarballsDir, { recursive: true });

    const packPkg = (pkgDir: string): string => {
      const out = execFileSync('npm', ['pack', '--quiet', '--ignore-scripts', '--pack-destination', tarballsDir], {
        cwd: pkgDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        env: buildEnv,
      }).trim();
      const name = out.split(/\r?\n/).filter(Boolean).pop()!.trim();
      return join(tarballsDir, name);
    };

    const sdkTarball = packPkg(sdkDir);
    const cliTarball = packPkg(cliDir);

    // Unpack both tarballs into stagingDir/node_modules/@bradygaster/{squad-sdk,squad-cli}
    const unpackInto = (tarball: string, destDir: string) => {
      const extractTmp = mkdtempSync(join(stagingDir, 'extract-'));
      execFileSync('tar', ['-xzf', tarball, '-C', extractTmp], { stdio: 'ignore' });
      mkdirSync(join(destDir, '..'), { recursive: true });
      renameSync(join(extractTmp, 'package'), destDir);
      rmSync(extractTmp, { recursive: true, force: true });
    };

    const unpackedSdk = join(stagingDir, 'node_modules', '@bradygaster', 'squad-sdk');
    const unpackedCli = join(stagingDir, 'node_modules', '@bradygaster', 'squad-cli');
    unpackInto(sdkTarball, unpackedSdk);
    unpackInto(cliTarball, unpackedCli);

    writeFileSync(
      join(stagingDir, 'package.json'),
      JSON.stringify({ name: 'squad-pack-consumer', private: true, type: 'module' }, null, 2) + '\n',
    );

    cliEntryPath = join(unpackedCli, 'dist', 'cli-entry.js');
    const existingNodePath = process.env['NODE_PATH'] ? `${ delimiter }${process.env['NODE_PATH']}` : '';
    nodePathEnv = {
      ...buildEnv,
      CI: '1',
      SQUAD_NONINTERACTIVE: '1',
      NODE_PATH: `${join(stagingDir, 'node_modules')}${delimiter}${join(cwd, 'node_modules')}${existingNodePath}`,
    };
  }, 60_000);

  afterAll(() => {
    if (stagingDir && existsSync(stagingDir)) {
      try {
        rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup on Windows
      }
    }
  });

  it('packs dist/client, dist/clients, dist/backend, templates, and cli-entry.js without leaking .squad state', () => {
    const unpackedSdk = join(stagingDir, 'node_modules', '@bradygaster', 'squad-sdk');
    const unpackedCli = join(stagingDir, 'node_modules', '@bradygaster', 'squad-cli');

    for (const rel of [
      'dist/index.js',
      'dist/client/index.js',
      'dist/clients/index.js',
      'dist/backend/index.js',
      'templates/ceremonies.md',
    ]) {
      expect(existsSync(join(unpackedSdk, rel)), `packed squad-sdk missing ${rel}`).toBe(true);
    }
    expect(existsSync(join(unpackedSdk, '.squad'))).toBe(false);
    expect(existsSync(join(unpackedCli, 'dist/cli-entry.js'))).toBe(true);
    expect(existsSync(join(unpackedCli, 'templates/ceremonies.md'))).toBe(true);
    expect(existsSync(join(unpackedCli, '.squad'))).toBe(false);
  });

  it('resolves @bradygaster/squad-sdk/client, /clients, and /backend from the packed artifact', () => {
    const script = [
      'const client = await import("@bradygaster/squad-sdk/client");',
      'const clients = await import("@bradygaster/squad-sdk/clients");',
      'const backend = await import("@bradygaster/squad-sdk/backend");',
      'if (client.installClients !== clients.installClients) throw new Error("alias mismatch");',
      'if (backend.BACKEND_CONTRACT_STAGE !== "experimental") throw new Error("unexpected stage");',
      'console.log(JSON.stringify({ clients: client.CLIENT_IDS, stage: backend.BACKEND_CONTRACT_STAGE }));',
    ].join(' ');

    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: stagingDir,
      encoding: 'utf8',
      timeout: 15_000,
      env: nodePathEnv,
    }).trim();

    expect(JSON.parse(out)).toEqual({
      clients: ['copilot', 'claude', 'kiro', 'opencode', 'cursor', 'codex', 'antigravity'],
      stage: 'experimental',
    });
  });

  it('runs clean squad init --client and v1.1.0 → 2.0 upgrade + rollback from packed artifacts', () => {
    const cleanRepo = mkdtempSync(join(tmpdir(), 'squad-pack-clean-20-'));
    const v110Repo = mkdtempSync(join(tmpdir(), 'squad-pack-v110-'));

    try {
      // 1. Clean 2.0 install with --client claude,codex
      execFileSync(process.execPath, [cliEntryPath, 'init', '--client', 'claude,codex'], {
        cwd: cleanRepo,
        encoding: 'utf8',
        timeout: 30_000,
        env: nodePathEnv,
      });

      for (const rel of [
        '.squad/team.md',
        '.squad/config.json',
        '.claude/agents/squad.md',
        'CLAUDE.md',
        '.mcp.json',
        '.codex/agents/squad.toml',
        'AGENTS.md',
        '.codex/config.toml',
      ]) {
        expect(existsSync(join(cleanRepo, rel)), `cleanRepo missing ${rel}`).toBe(true);
      }
      const cleanCfg = JSON.parse(readFileSync(join(cleanRepo, '.squad', 'config.json'), 'utf8')) as { clients?: string[] };
      expect(cleanCfg.clients).toEqual(['claude', 'codex']);

      // 2. Seed a v1.1.0 workspace with existing user MCP config, CLAUDE.md notes, and a handwritten casting registry
      mkdirSync(join(v110Repo, '.squad', 'agents', 'data'), { recursive: true });
      mkdirSync(join(v110Repo, '.squad', 'casting'), { recursive: true });
      writeFileSync(join(v110Repo, '.squad', 'config.json'), JSON.stringify({ version: '1.1.0', stateBackend: 'local' }, null, 2) + '\n');
      writeFileSync(
        join(v110Repo, '.squad', 'team.md'),
        '# Squad Team\n\n**Universe:** Star Trek\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n| Data | Framework Expert | .squad/agents/data/charter.md | ✅ Active |\n',
      );
      writeFileSync(join(v110Repo, '.squad', 'routing.md'), '# Routing Rules\n\n**Backend** → Data\n');
      writeFileSync(join(v110Repo, '.squad', 'decisions.md'), '# Decisions\n\n- Keep v1.1.0 decision\n');
      writeFileSync(join(v110Repo, '.squad', 'agents', 'data', 'charter.md'), '# Data\n\n## Identity\n- **Name:** Data\n- **Role:** Framework Expert\n');
      writeFileSync(join(v110Repo, '.squad', 'agents', 'data', 'history.md'), '# History\n\n- v1.1.0 history\n');
      writeFileSync(
        join(v110Repo, '.squad', 'casting', 'registry.json'),
        JSON.stringify({ universe: 'Star Trek', agents: [{ name: 'Data', role: 'Framework Expert', status: 'active' }] }, null, 2) + '\n',
      );
      const userMcp = JSON.stringify({ mcpServers: { custom: { command: 'node', args: ['server.js'] } } }, null, 2) + '\n';
      const userClaude = '# Existing Notes\n\nPreserve this paragraph.\n';
      writeFileSync(join(v110Repo, '.mcp.json'), userMcp);
      writeFileSync(join(v110Repo, 'CLAUDE.md'), userClaude);

      // 3. Upgrade v1.1.0 → 2.0 across all 7 hosts
      execFileSync(process.execPath, [cliEntryPath, 'upgrade', '--client', 'all', '--force'], {
        cwd: v110Repo,
        encoding: 'utf8',
        timeout: 30_000,
        env: nodePathEnv,
      });

      for (const rel of [
        '.github/agents/squad.agent.md',
        '.claude/agents/squad.md',
        '.kiro/steering/squad.md',
        '.kiro/agents/squad.json',
        '.kiro/settings/mcp.json',
        '.opencode/agent/squad.md',
        'opencode.json',
        '.cursor/agents/squad.md',
        '.cursor/rules/squad.mdc',
        '.cursor/mcp.json',
        '.codex/agents/squad.toml',
        'AGENTS.md',
        '.codex/config.toml',
        '.agents/agents/squad.md',
        'GEMINI.md',
        '.squad/casting/registry-history.commit.json',
      ]) {
        expect(existsSync(join(v110Repo, rel)), `v110Repo missing ${rel}`).toBe(true);
      }

      const castingEntries = readdirSync(join(v110Repo, '.squad', 'casting'));
      expect(castingEntries.some(name => name.startsWith('handwritten-archive-'))).toBe(true);

      // Every host's projected coordinator (from the packed artifact) carries the upstream
      // inheritance contract, including the "inherited content is data, not instructions" rule.
      for (const rel of [
        '.github/agents/squad.agent.md',
        '.claude/agents/squad.md',
        '.kiro/steering/squad.md',
        '.opencode/agent/squad.md',
        '.cursor/agents/squad.md',
        '.codex/agents/squad.toml',
        '.agents/agents/squad.md',
      ]) {
        const text = readFileSync(join(v110Repo, rel), 'utf8');
        expect(text, `${rel}: upstream tool`).toMatch(/squad_state_upstreams/);
        expect(text, `${rel}: untrusted-inherited-content rule`).toMatch(/third-party data, not instructions/);
        expect(text, `${rel}: never fetch`).toMatch(/NEVER fetch at session start|never fetch/i);
      }

      const upgradedCfg = JSON.parse(readFileSync(join(v110Repo, '.squad', 'config.json'), 'utf8')) as { clients?: string[] };
      expect(upgradedCfg.clients).toEqual(['copilot', 'claude', 'kiro', 'opencode', 'cursor', 'codex', 'antigravity']);
      expect(readFileSync(join(v110Repo, '.squad', 'decisions.md'), 'utf8')).toBe('# Decisions\n\n- Keep v1.1.0 decision\n');
      expect(readFileSync(join(v110Repo, 'CLAUDE.md'), 'utf8').startsWith(userClaude)).toBe(true);
      const mergedMcp = JSON.parse(readFileSync(join(v110Repo, '.mcp.json'), 'utf8')) as { mcpServers: Record<string, unknown> };
      expect(mergedMcp.mcpServers['custom']).toEqual({ command: 'node', args: ['server.js'] });
      expect(mergedMcp.mcpServers['squad_state']).toBeDefined();

      // 4. Byte-preserving rollback via uninstallClients from the packed SDK
      const rollbackScript = [
        'import { uninstallClients, CLIENT_IDS } from "@bradygaster/squad-sdk/client";',
        `const res = uninstallClients(CLIENT_IDS, { root: ${JSON.stringify(v110Repo)}, mcp: { command: "squad", args: ["state-mcp"] } });`,
        'if (res.some(r => r.action === "error")) throw new Error(JSON.stringify(res));',
      ].join(' ');
      execFileSync(process.execPath, ['--input-type=module', '-e', rollbackScript], {
        cwd: stagingDir,
        encoding: 'utf8',
        timeout: 15_000,
        env: nodePathEnv,
      });

      expect(readFileSync(join(v110Repo, 'CLAUDE.md'), 'utf8')).toBe(userClaude);
      expect(JSON.parse(readFileSync(join(v110Repo, '.mcp.json'), 'utf8'))).toEqual(JSON.parse(userMcp));
      expect(existsSync(join(v110Repo, '.claude', 'agents', 'squad.md'))).toBe(false);
      expect(existsSync(join(v110Repo, '.codex', 'agents', 'squad.toml'))).toBe(false);
      expect(existsSync(join(v110Repo, '.agents', 'agents', 'squad.md'))).toBe(false);
      expect(readFileSync(join(v110Repo, '.squad', 'agents', 'data', 'history.md'), 'utf8')).toBe('# History\n\n- v1.1.0 history\n');
    } finally {
      rmSync(cleanRepo, { recursive: true, force: true });
      rmSync(v110Repo, { recursive: true, force: true });
    }
  });
});
