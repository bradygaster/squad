/**
 * Tests for VS Code default chat session mode injection (feat(init): #vscode-default).
 *
 * Verifies that `runInit()` writes `"chat.newSession.defaultMode": "Squad"` to
 * `.vscode/settings.json` with JSONC-safe, idempotent, and opt-out semantics.
 *
 * Cases:
 *  1. Missing .vscode/settings.json (and dir) → created with the key.
 *  2. Existing file without the key → key added, existing settings preserved.
 *  3. Existing key with a different value → left untouched.
 *  4. File has comments and trailing commas → both preserved after edit.
 *  5. --no-vscode-default passed → file not created or modified.
 *  6. Idempotent rerun → second run produces no further diff.
 *  7. Malformed file → init does not crash; warning shown; file unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

import { runInit } from '../packages/squad-cli/src/cli/core/init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(prefix = 'squad-vscode-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Squad Test'], { cwd: dir, stdio: 'pipe' });
  // Seed a commit so HEAD exists
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, stdio: 'pipe' });
  return dir;
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

function settingsPath(repoDir: string): string {
  return path.join(repoDir, '.vscode', 'settings.json');
}

const INIT_OPTS = { includeWorkflows: false };
const KEY = 'chat.newSession.defaultMode';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runInit — VS Code default chat session mode', () => {
  let tmpDir: string;
  let homeTmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempRepo();
    homeTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-vscode-home-'));
    process.env.SQUAD_HOME_DIR_OVERRIDE = homeTmpDir;
  });

  afterEach(() => {
    delete process.env.SQUAD_HOME_DIR_OVERRIDE;
    cleanDir(tmpDir);
    cleanDir(homeTmpDir);
  });

  // ── Case 1: missing .vscode/settings.json ─────────────────────────────
  it('creates .vscode/settings.json when the file does not exist', async () => {
    await runInit(tmpDir, INIT_OPTS);

    const sp = settingsPath(tmpDir);
    expect(fs.existsSync(sp), '.vscode/settings.json should be created').toBe(true);

    const content = fs.readFileSync(sp, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed[KEY]).toBe('Squad');
  });

  // ── Case 2: existing file without the key ─────────────────────────────
  it('adds the key to an existing settings.json that lacks it', async () => {
    const vsDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    fs.writeFileSync(path.join(vsDir, 'settings.json'), JSON.stringify({
      'editor.tabSize': 2,
      'files.autoSave': 'off',
    }, null, 2) + '\n', 'utf-8');

    await runInit(tmpDir, INIT_OPTS);

    const sp = settingsPath(tmpDir);
    const content = fs.readFileSync(sp, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed[KEY]).toBe('Squad');
    expect(parsed['editor.tabSize']).toBe(2);
    expect(parsed['files.autoSave']).toBe('off');
  });

  // ── Case 3: key already set to a different value ───────────────────────
  it('does not overwrite an existing chat.newSession.defaultMode value', async () => {
    const vsDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    fs.writeFileSync(path.join(vsDir, 'settings.json'), JSON.stringify({
      [KEY]: 'Custom',
    }, null, 2) + '\n', 'utf-8');

    await runInit(tmpDir, INIT_OPTS);

    const sp = settingsPath(tmpDir);
    const content = fs.readFileSync(sp, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed[KEY]).toBe('Custom');
  });

  // ── Case 4: file has JSONC comments and trailing commas ────────────────
  it('preserves comments and trailing commas in settings.json', async () => {
    const vsDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    const jsoncContent = `{
  // My VS Code settings
  "editor.tabSize": 2, // two spaces
  "editor.formatOnSave": true,
}\n`;
    fs.writeFileSync(path.join(vsDir, 'settings.json'), jsoncContent, 'utf-8');

    await runInit(tmpDir, INIT_OPTS);

    const sp = settingsPath(tmpDir);
    const updatedContent = fs.readFileSync(sp, 'utf-8');

    // Comments must be preserved
    expect(updatedContent).toContain('// My VS Code settings');
    expect(updatedContent).toContain('// two spaces');

    // The new key must be present
    expect(updatedContent).toContain(`"${KEY}"`);
    expect(updatedContent).toContain('"Squad"');

    // Original keys must still be present
    expect(updatedContent).toContain('"editor.tabSize"');
    expect(updatedContent).toContain('"editor.formatOnSave"');
  });

  // ── Case 5: --no-vscode-default passed ────────────────────────────────
  it('does not create .vscode/settings.json when includeVscodeDefault is false', async () => {
    await runInit(tmpDir, { ...INIT_OPTS, includeVscodeDefault: false });

    const sp = settingsPath(tmpDir);
    expect(fs.existsSync(sp), '.vscode/settings.json must NOT be created').toBe(false);
  });

  it('does not modify an existing settings.json when includeVscodeDefault is false', async () => {
    const vsDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    const original = JSON.stringify({ 'editor.tabSize': 4 }, null, 2) + '\n';
    fs.writeFileSync(path.join(vsDir, 'settings.json'), original, 'utf-8');

    await runInit(tmpDir, { ...INIT_OPTS, includeVscodeDefault: false });

    const sp = settingsPath(tmpDir);
    expect(fs.readFileSync(sp, 'utf-8')).toBe(original);
  });

  // ── Case 6: idempotent rerun ───────────────────────────────────────────
  it('produces no further diff when run a second time', async () => {
    await runInit(tmpDir, INIT_OPTS);

    const sp = settingsPath(tmpDir);
    const afterFirst = fs.readFileSync(sp, 'utf-8');

    await runInit(tmpDir, INIT_OPTS);

    const afterSecond = fs.readFileSync(sp, 'utf-8');
    expect(afterSecond).toBe(afterFirst);
  });

  // ── Case 7: malformed / unparseable settings.json ─────────────────────
  it('does not crash or corrupt a malformed settings.json', async () => {
    const vsDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    const malformed = '{ this is not valid json at all !!! ';
    fs.writeFileSync(path.join(vsDir, 'settings.json'), malformed, 'utf-8');

    // Should not throw
    await expect(runInit(tmpDir, INIT_OPTS)).resolves.not.toThrow();

    // File content must be untouched
    const sp = settingsPath(tmpDir);
    expect(fs.readFileSync(sp, 'utf-8')).toBe(malformed);
  });
});
