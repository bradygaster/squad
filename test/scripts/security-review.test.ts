import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const scriptPath = join(repoRoot, 'scripts', 'security-review.mjs');
const testRoot = join(repoRoot, `.test-security-review-${process.pid}-${randomBytes(4).toString('hex')}`);

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function runSecurityReview(filePath: string, content: string) {
  const workdir = join(testRoot, randomBytes(4).toString('hex'));
  mkdirSync(workdir, { recursive: true });

  git(workdir, ['init']);
  git(workdir, ['config', 'user.email', 'booster@example.test']);
  git(workdir, ['config', 'user.name', 'Booster Test']);
  writeFileSync(join(workdir, 'README.md'), '# base\n');
  git(workdir, ['add', 'README.md']);
  git(workdir, ['commit', '-m', 'base']);

  const absolutePath = join(workdir, ...filePath.split('/'));
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  git(workdir, ['add', filePath]);
  git(workdir, ['commit', '-m', 'change']);

  const output = execFileSync(process.execPath, [scriptPath, 'HEAD~1', 'HEAD'], {
    cwd: workdir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const [jsonText] = output.split(/\r?\n\r?\n/);
  return JSON.parse(jsonText ?? output) as {
    findings: Array<{ category: string; file: string }>;
  };
}

beforeEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('security review unsafe git exclusions', () => {
  const unsafeGitPhrase = 'Agent history records mention git push --force-with-lease as a past event.\n';

  it('does not report unsafe git prose in rotated agent history archives', () => {
    const result = runSecurityReview(
      '.squad/agents/eecom/history-archive-2026-08-19T13-11-34.130-07-00.md',
      unsafeGitPhrase,
    );

    expect(result.findings.some((finding) => finding.category === 'unsafe-git')).toBe(false);
  });

  it('still reports unsafe git prose in agent charters', () => {
    const result = runSecurityReview('.squad/agents/eecom/charter.md', unsafeGitPhrase);

    expect(
      result.findings.some(
        (finding) => finding.category === 'unsafe-git' && finding.file === '.squad/agents/eecom/charter.md',
      ),
    ).toBe(true);
  });
});
