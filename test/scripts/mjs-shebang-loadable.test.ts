import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression coverage for #1788.
//
// A `.mjs` that starts with a shebang must be checked out LF. Vite's shebang
// stripping does not survive a `\r`, so a CRLF shebang leaves a bare `#` as the
// module's first token: any suite importing that file dies with
// `SyntaxError: Invalid or unexpected token` and loads ZERO tests — which reads
// like environment noise rather than a failure. Linux CI checks out LF, so this
// stays invisible on `dev` while being permanently broken on Windows.
//
// These assertions go through the real vitest/Vite import pipeline. Node strips
// CRLF shebangs correctly on its own, so anything that bypasses the bundler
// (`node script.mjs`, `import()` of a file:// URL) cannot detect this and must
// not be used here.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const fixtureDirName = `.mjs-shebang-fixtures-${process.pid}-${randomBytes(4).toString('hex')}`;
const fixtureDir = join(__dirname, fixtureDirName);

/** Every tracked `*.mjs` that carries a shebang, with its raw first-line bytes. */
function shebangModules(): Array<{ file: string; header: Buffer }> {
  const tracked = execFileSync('git', ['ls-files', '*.mjs'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  })
    .split(/\r?\n/)
    .filter(Boolean);

  const found: Array<{ file: string; header: Buffer }> = [];
  for (const file of tracked) {
    const bytes = readFileSync(join(repoRoot, file));
    if (bytes[0] !== 0x23 || bytes[1] !== 0x21) continue; // not '#!'
    const newline = bytes.indexOf(0x0a);
    // Keep the terminator bytes verbatim — CRLF vs LF is the entire defect.
    found.push({ file, header: newline === -1 ? bytes : bytes.subarray(0, newline + 1) });
  }
  return found;
}

const modules = shebangModules();

beforeAll(() => {
  mkdirSync(fixtureDir, { recursive: true });
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('shebanged .mjs files stay loadable by the test runner (#1788)', () => {
  it('finds shebanged .mjs files to check', () => {
    // Guards against the sweep silently matching nothing and passing vacuously.
    expect(modules.length).toBeGreaterThan(0);
  });

  it('loads the real check-changeset-drift.mjs through the bundler pipeline', async () => {
    // The full, unmodified file — this is the module whose CRLF shebang took the
    // changeset-drift suite down to zero tests.
    const module = await import('../../scripts/check-changeset-drift.mjs');

    expect(typeof module.evaluateDrift).toBe('function');
    expect(typeof module.listFragments).toBe('function');
  });

  for (const { file, header } of modules) {
    it(`parses the shebang line of ${file}`, async () => {
      // Reproduce the exact failure condition without executing the script:
      // the real header bytes (shebang + its real terminator) plus an inert body.
      const fixture = `${file.replace(/[^a-zA-Z0-9]/g, '-')}.mjs`;
      writeFileSync(
        join(fixtureDir, fixture),
        Buffer.concat([header, Buffer.from('export const loaded = true;\n', 'utf-8')]),
      );

      // Deliberately non-analyzable so vite:dynamic-import-vars leaves it as a
      // runtime import through Vite's module runner. Keeping the extension in
      // the static part would make the plugin pre-glob candidates, which cannot
      // see fixtures written during the run. A file:// URL is also wrong here:
      // Node strips CRLF shebangs itself and would mask the defect.
      const specifier = `./${fixtureDirName}/${fixture}`;
      const module = (await import(specifier)) as { loaded?: boolean };

      expect(module.loaded).toBe(true);
    });
  }
});
