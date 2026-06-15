import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

const cliEntry = resolve(
  process.cwd(),
  'packages/squad-cli/dist/cli-entry.js',
);

const cliBuilt = existsSync(cliEntry);

const runSquad = async (args: string[], cwd: string) => {
  return execFileAsync('node', [cliEntry, ...args], {
    cwd,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
};

describe.skipIf(!cliBuilt)('squad add end-to-end', () => {
  it('registers an existing directory and makes it visible in squad list', async () => {
    const existingDir = resolve(process.cwd());
    const name = `add-e2e-${Date.now()}`;

    const { stdout: addStdout, stderr: addStderr } = await runSquad(
      ['add', existingDir, '--name', name],
      process.cwd(),
    );
    const addOut = addStdout + addStderr;
    expect(addOut).toMatch(new RegExp(`(Added|Updated) "${name}"`));
    expect(addOut).toContain(existingDir);

    const { stdout: listStdout, stderr: listStderr } = await runSquad(['list'], process.cwd());
    const listOut = listStdout + listStderr;
    expect(listOut).toContain(name);
    expect(listOut).toContain(existingDir);
  });

  it('prints a clear error for a nonexistent path and exits cleanly', async () => {
    const missingPath = resolve(process.cwd(), `missing-add-path-${Date.now()}`);
    const { stdout, stderr } = await runSquad(['add', missingPath], process.cwd());
    const out = stdout + stderr;

    expect(out).toContain(`Path does not exist: ${missingPath}`);
    expect(out).not.toMatch(/Error:|runAdd \(/);
  });

  it('reconstructs a spaced path from split argv tokens and registers the full path', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'squad-add-spaced-'));
    const spacedDir = join(tempRoot, 'my project dir');
    mkdirSync(spacedDir, { recursive: true });

    const splitPathTokens = spacedDir.split(' ');
    const { stdout: addStdout, stderr: addStderr } = await runSquad(
      ['add', ...splitPathTokens],
      process.cwd(),
    );
    const addOut = addStdout + addStderr;
    expect(addOut).toMatch(/(Added|Updated) "/);
    expect(addOut).toContain(spacedDir);

    const { stdout: listStdout, stderr: listStderr } = await runSquad(['list'], process.cwd());
    const listOut = listStdout + listStderr;
    expect(listOut).toContain(spacedDir);
    expect(listOut).toContain('my project dir');
  });

  it('prints quoting hint for nonexistent multi-token path without crashing', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'squad-add-missing-'));
    const firstToken = join(tempRoot, 'nope');
    const expectedMissingPath = resolve(`${firstToken} x y`);

    const { stdout, stderr } = await runSquad(['add', firstToken, 'x', 'y'], process.cwd());
    const out = stdout + stderr;

    expect(out).toContain(`Path does not exist: ${expectedMissingPath}`);
    expect(out).toContain('If the path contains spaces, wrap it in quotes: squad add "<path>"');
    expect(out).not.toMatch(/Error:|runAdd \(/);
  });
});
