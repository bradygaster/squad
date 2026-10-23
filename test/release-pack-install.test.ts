/**
 * Release gate: self-upgrade shaped install of the EXACT packed tarballs into an isolated global
 * prefix (`npm install -g --prefix <tmp>`), never the real global prefix.
 *
 * `selfUpgradeCli` runs `npm install -g @bradygaster/squad-cli@<tag>`; the only difference here is
 * that the package specs are the tarballs produced by scripts/release/pack-evidence.mjs, so the
 * test proves the pair (CLI tarball + SDK tarball it depends on) installs, exposes the `squad` bin
 * and reports the release version, without touching the registry for the Squad packages.
 *
 * Opt-in: SQUAD_RELEASE_PACK_INSTALL=1 and SQUAD_RELEASE_EVIDENCE_DIR=<dir with the two .tgz>.
 * The release-verify workflow sets both; locally it is skipped (env-gated).
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENABLED = process.env['SQUAD_RELEASE_PACK_INSTALL'] === '1';
const EVIDENCE_DIR = process.env['SQUAD_RELEASE_EVIDENCE_DIR'] ?? '';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

describe('release gate: isolated-prefix install of the packed CLI + SDK pair', () => {
  it.skipIf(!ENABLED)('npm install -g --prefix <isolated> <sdk.tgz> <cli.tgz> yields the release version and the squad bin', () => {
    expect(existsSync(EVIDENCE_DIR), `SQUAD_RELEASE_EVIDENCE_DIR=${EVIDENCE_DIR} must exist`).toBe(true);
    const tarballs = readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith('.tgz'));
    const sdk = tarballs.find((f) => f.startsWith('bradygaster-squad-sdk-'));
    const cli = tarballs.find((f) => f.startsWith('bradygaster-squad-cli-'));
    expect(sdk, 'SDK tarball present').toBeDefined();
    expect(cli, 'CLI tarball present').toBeDefined();
    const expectedVersion = JSON.parse(readFileSync(join(process.cwd(), 'packages', 'squad-cli', 'package.json'), 'utf8')).version as string;

    const root = mkdtempSync(join(tmpdir(), 'squad-release-prefix-'));
    const prefix = join(root, 'prefix');
    const home = join(root, 'home');
    const userconfig = join(root, 'empty.npmrc');
    writeFileSync(userconfig, '');
    const env = { ...process.env, HOME: home, USERPROFILE: home, NPM_CONFIG_USERCONFIG: userconfig, NPM_CONFIG_CACHE: join(root, 'cache'), NO_COLOR: '1' };
    try {
      execFileSync(npm, ['install', '-g', '--prefix', prefix, '--no-audit', '--no-fund', '--ignore-scripts', join(EVIDENCE_DIR, sdk!), join(EVIDENCE_DIR, cli!)], { env, stdio: 'inherit', shell: process.platform === 'win32' });

      const modules = process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules');
      const cliPkg = JSON.parse(readFileSync(join(modules, '@bradygaster', 'squad-cli', 'package.json'), 'utf8'));
      expect(cliPkg.version).toBe(expectedVersion);
      // The SDK must be the packed one (hoisted or nested), at the same release version.
      const sdkCandidates = [join(modules, '@bradygaster', 'squad-sdk', 'package.json'), join(modules, '@bradygaster', 'squad-cli', 'node_modules', '@bradygaster', 'squad-sdk', 'package.json')].filter(existsSync);
      expect(sdkCandidates.length, 'packed SDK installed').toBeGreaterThan(0);
      expect(JSON.parse(readFileSync(sdkCandidates[0]!, 'utf8')).version).toBe(expectedVersion);

      const bin = process.platform === 'win32' ? join(prefix, 'squad.cmd') : join(prefix, 'bin', 'squad');
      expect(existsSync(bin), `global bin shim ${bin}`).toBe(true);
      const out = execFileSync(process.execPath, [join(modules, '@bradygaster', 'squad-cli', 'dist', 'cli-entry.js'), '--version'], { env, encoding: 'utf8' });
      expect(out).toContain(expectedVersion);
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  }, 300_000);
});
