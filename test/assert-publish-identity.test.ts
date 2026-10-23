import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'release', 'assert-publish-identity.mjs');
const CACHE = path.join(ROOT, 'node_modules', '.cache');
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};

describe('assert-publish-identity tag resolution', () => {
  let tempRoot: string;
  let repo: string;
  let firstCommit: string;
  let sourceSha: string;

  const git = (...args: string[]): string => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: GIT_ENV,
  }).trim();

  const runGuard = (tag: string) => execFileSync(process.execPath, [
    SCRIPT,
    '--repo', repo,
    '--source-sha', sourceSha,
    '--dispatch-sha', sourceSha,
    '--workflow-sha', sourceSha,
    '--tag', tag,
  ], {
    encoding: 'utf8',
    env: GIT_ENV,
  });

  beforeAll(() => {
    mkdirSync(CACHE, { recursive: true });
    tempRoot = mkdtempSync(path.join(CACHE, 'assert-publish-identity-'));
    repo = path.join(tempRoot, 'work');
    const remote = path.join(tempRoot, 'remote.git');
    mkdirSync(repo);
    execFileSync('git', ['init', '--bare', remote], { env: GIT_ENV, stdio: 'ignore' });
    execFileSync('git', ['-C', repo, 'init', '-b', 'main'], { env: GIT_ENV, stdio: 'ignore' });
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release-test@example.invalid');
    git('remote', 'add', 'origin', remote);

    writeFileSync(path.join(repo, 'fixture.txt'), 'first\n');
    git('add', 'fixture.txt');
    git('commit', '-m', 'first');
    firstCommit = git('rev-parse', 'HEAD');

    writeFileSync(path.join(repo, 'fixture.txt'), 'second\n');
    git('commit', '-am', 'second');
    sourceSha = git('rev-parse', 'HEAD');
    git('push', '-u', 'origin', 'main');

    git('tag', '-a', 'v9.9.1', '-m', 'annotated release', sourceSha);
    git('tag', 'v9.9.2', sourceSha);
    git('tag', '-a', 'v9.9.3', '-m', 'wrong release', firstCommit);
    git('push', 'origin', 'refs/tags/v9.9.1', 'refs/tags/v9.9.2', 'refs/tags/v9.9.3');
  }, 60_000);

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('prefers the peeled commit for an annotated remote tag', () => {
    const objectSha = git('rev-parse', 'refs/tags/v9.9.1');
    const commitSha = git('rev-parse', 'refs/tags/v9.9.1^{commit}');
    expect(objectSha).not.toBe(commitSha);
    expect(commitSha).toBe(sourceSha);
    expect(runGuard('v9.9.1')).toContain(`Release identity verified at ${sourceSha}`);
  });

  it('uses the direct ref for a lightweight remote tag', () => {
    expect(git('rev-parse', 'refs/tags/v9.9.2')).toBe(sourceSha);
    expect(runGuard('v9.9.2')).toContain(`Release identity verified at ${sourceSha}`);
  });

  it('fails closed when the peeled commit differs from sourceSha', () => {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--repo', repo,
      '--source-sha', sourceSha,
      '--dispatch-sha', sourceSha,
      '--workflow-sha', sourceSha,
      '--tag', 'v9.9.3',
    ], {
      encoding: 'utf8',
      env: GIT_ENV,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`remote tag v9.9.3 is ${firstCommit}, expected ${sourceSha}`);
  });

  it('fails closed when the remote tag is missing', () => {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--repo', repo,
      '--source-sha', sourceSha,
      '--dispatch-sha', sourceSha,
      '--workflow-sha', sourceSha,
      '--tag', 'v9.9.4',
    ], {
      encoding: 'utf8',
      env: GIT_ENV,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ls-remote');
    expect(result.stdout).not.toContain('Release identity verified');
  });
});
