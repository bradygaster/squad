/**
 * `squad upstream add|sync` git source hardening (Q release blocker, Worf pre-existing gap).
 *
 * Sources reach a `git` subprocess, so: leading-dash sources are refused before anything is
 * written or spawned, every positional is preceded by `--`, only https://, ssh:// and
 * git@host:path transports are accepted (no ext::/fd:: remote helpers, no file://, no http://),
 * and the subprocess environment disables remote helpers and the file protocol regardless of
 * the user's global git config.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileSync = vi.fn();
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: (...args: unknown[]) => execFileSync(...args) };
});

import { upstreamCommand, unsafeGitSourceReason, gitSyncEnv } from '../../packages/squad-cli/src/cli/commands/upstream.js';
import { SquadError } from '../../packages/squad-cli/src/cli/core/errors.js';

let tmp: string;
let prevCwd: string;
const upstreamJson = () => path.join(tmp, '.squad', 'upstream.json');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upstream-hardening-'));
  fs.mkdirSync(path.join(tmp, '.squad'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.squad', 'team.md'), '# t\n');
  prevCwd = process.cwd();
  process.chdir(tmp);
  execFileSync.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(prevCwd);
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('unsafeGitSourceReason: transport allow-list', () => {
  it.each([
    ['https://github.com/acme/platform.git', null],
    ['https://dev.azure.com/org/project/_git/repo', null],
    ['ssh://git@github.com/acme/platform.git', null],
    ['git@github.com:acme/platform.git', null],
    ['ssh://git@ssh.dev.azure.com:22/v3/org/project/repo', null],
    ['https://user:token@ghe.example.com/acme/platform.git', null],
  ])('accepts %s', (src, expected) => {
    expect(unsafeGitSourceReason(src)).toBe(expected);
  });

  it.each([
    ['--upload-pack=touch /tmp/pwned', /starts with "-"/],
    ['-oProxyCommand=calc.exe', /starts with "-"/],
    ['ext::sh -c "id>/tmp/x"', /remote helper/],
    ['fd::17', /remote helper/],
    ['file:///etc', /unsupported transport \(file:\/\/\)/],
    ['http://example.com/repo.git', /unsupported transport \(http:\/\/\)/],
    ['git@github.com:acme/platform.git extra', /whitespace/],
    ['acme/platform', /not an https:\/\/, ssh:\/\/ or git@host:path URL/],
    // LB-3: option-looking components that git's own URL parser would otherwise hand to ssh/curl
    ['ssh://-oProxyCommand=calc.exe/repo.git', /option-injection guard/],
    ['ssh://git@-oProxyCommand=calc.exe/repo.git', /option-injection guard/],
    ['git@-x:acme/platform.git', /option-injection guard/],
    ['-x@github.com:acme/platform.git', /starts with "-"/],
    ['git@github.com:-oProxyCommand=calc.exe', /option-injection guard/],
    ['https://github.com/-oProxyCommand=calc.exe', /option-injection guard/],
    ['https://-oProxyCommand=calc.exe/x', /option-injection guard/],
    ['ssh://git@github.com:notaport/x', /option-injection guard/],
  ])('refuses %s', (src, pattern) => {
    expect(unsafeGitSourceReason(src)).toMatch(pattern);
  });
});

describe('gitSyncEnv: remote helpers and file protocol disabled for the subprocess', () => {
  it('sets protocol.allow=never with https/ssh re-enabled, ext/file never, and disables terminal prompts', () => {
    const env = gitSyncEnv({ PATH: 'x', GIT_CONFIG_PARAMETERS: "'user.name=existing'" });
    const params = env['GIT_CONFIG_PARAMETERS']!;
    for (const p of ["'protocol.allow=never'", "'protocol.https.allow=always'", "'protocol.ssh.allow=always'", "'protocol.ext.allow=never'", "'protocol.file.allow=never'"]) {
      expect(params, p).toContain(p);
    }
    expect(params, 'existing parameters are preserved').toContain("'user.name=existing'");
    expect(env['GIT_TERMINAL_PROMPT']).toBe('0');
    expect(env['PATH']).toBe('x');
  });
});

describe('squad upstream add: dangerous sources fail safely', () => {
  it.each([
    '--upload-pack=touch /tmp/pwned',
    '-oProxyCommand=calc.exe',
    'ext::sh -c id',
    'file:///etc/passwd',
  ])('refuses %s before writing upstream.json or spawning git', async (source) => {
    await expect(upstreamCommand(['add', source, '--name', 'evil'])).rejects.toThrow(SquadError);
    expect(fs.existsSync(upstreamJson()), 'nothing is recorded for a refused source').toBe(false);
    expect(execFileSync, 'git is never spawned for a refused source').not.toHaveBeenCalled();
  });

  it('clones an allowed https source with "--" before the positionals and the hardened environment', async () => {
    execFileSync.mockImplementation(() => Buffer.from(''));
    await upstreamCommand(['add', 'https://github.com/acme/platform.git', '--name', 'platform', '--ref', 'main']);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = execFileSync.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }];
    expect(cmd).toBe('git');
    const dashdash = args.indexOf('--');
    expect(dashdash, `"--" must precede the source: ${args.join(' ')}`).toBeGreaterThan(-1);
    expect(args.slice(dashdash + 1)).toEqual(['https://github.com/acme/platform.git', path.join(tmp, '.squad', '_upstream_repos', 'platform')]);
    expect(args.slice(0, dashdash).every((a) => !a.startsWith('https://')), 'source only appears after --').toBe(true);
    expect(opts.env?.['GIT_CONFIG_PARAMETERS']).toContain("'protocol.ext.allow=never'");
    expect(opts.env?.['GIT_CONFIG_PARAMETERS']).toContain("'protocol.file.allow=never'");
    const recorded = JSON.parse(fs.readFileSync(upstreamJson(), 'utf8'));
    expect(recorded.upstreams[0].source).toBe('https://github.com/acme/platform.git');
  });
});

describe('squad upstream sync: hand-edited dangerous entries are skipped, never spawned', () => {
  it('refuses an ext:: source and a leading-dash source present in upstream.json', async () => {
    fs.writeFileSync(upstreamJson(), JSON.stringify({ upstreams: [
      { name: 'helper', type: 'git', source: 'ext::sh -c id', ref: 'main', added_at: 'x', last_synced: null },
      { name: 'dash', type: 'git', source: '--upload-pack=id', ref: 'main', added_at: 'x', last_synced: null },
      { name: 'ok', type: 'git', source: 'https://github.com/acme/ok.git', ref: 'main', added_at: 'x', last_synced: null },
    ] }));
    execFileSync.mockImplementation(() => Buffer.from(''));
    await upstreamCommand(['sync']);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [, args, opts] = execFileSync.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }];
    expect(args).toContain('--');
    expect(args[args.indexOf('--') + 1]).toBe('https://github.com/acme/ok.git');
    expect(opts.env?.['GIT_CONFIG_PARAMETERS']).toContain("'protocol.allow=never'");
    const warned = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0])).join('\n');
    expect(warned).toMatch(/helper: refusing to sync git source "ext::sh -c id": .*remote helper/);
    expect(warned).toMatch(/dash: refusing to sync git source "--upload-pack=id": .*starts with "-"/);
    const after = JSON.parse(fs.readFileSync(upstreamJson(), 'utf8'));
    expect(after.upstreams.find((u: { name: string }) => u.name === 'helper').last_synced, 'refused entries are not marked synced').toBeNull();
  });

  it('pulls an existing clone with "--" before the remote and ref', async () => {
    fs.writeFileSync(upstreamJson(), JSON.stringify({ upstreams: [
      { name: 'ok', type: 'git', source: 'https://github.com/acme/ok.git', ref: 'release/2', added_at: 'x', last_synced: null },
    ] }));
    fs.mkdirSync(path.join(tmp, '.squad', '_upstream_repos', 'ok', '.git'), { recursive: true });
    execFileSync.mockImplementation(() => Buffer.from(''));
    await upstreamCommand(['sync']);
    const [, args] = execFileSync.mock.calls[0] as [string, string[]];
    expect(args.slice(0, 4)).toEqual(['-C', path.join(tmp, '.squad', '_upstream_repos', 'ok'), 'pull', '--ff-only']);
    expect(args.slice(4)).toEqual(['--', 'origin', 'release/2']);
  });
});
