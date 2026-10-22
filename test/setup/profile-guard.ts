/**
 * Test profile guard (vitest setupFile).
 *
 * No test may touch the developer's real user-profile state. Before any test module
 * loads, every environment variable Squad uses to locate profile-level directories is
 * pointed at a throw-away directory for this worker:
 *
 *  - `SQUAD_HOME`                      → roaming squad home (`resolveSquadHome`)
 *  - `APPDATA`, `LOCALAPPDATA`         → Windows config dir (`resolveGlobalSquadPath`)
 *  - `XDG_CONFIG_HOME`                 → Linux and macOS config dir (`resolveGlobalSquadPath`
 *                                         honours it on macOS too, so the Library path is never used)
 *
 * `HOME` / `USERPROFILE` are deliberately left alone: git, gh and the host CLIs spawned
 * by tests read their own configuration from there, and `resolveSquad()` already refuses
 * to walk into the home directory. Tests that need a specific profile location still
 * `vi.stubEnv()` these variables themselves; this guard only sets the default.
 *
 * The incident this prevents: a test on the 1.x code path rewrote a real file under
 * `%APPDATA%\squad\` on a reviewer's machine.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const realTmp = fs.realpathSync(os.tmpdir());
const guardRoot = fs.mkdtempSync(path.join(realTmp, 'squad-test-profile-'));

const inside = (p: string | undefined): boolean => {
  if (!p) return false;
  const rel = path.relative(realTmp, path.resolve(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

for (const name of ['SQUAD_HOME', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME'] as const) {
  if (inside(process.env[name])) continue; // an outer harness already isolated it
  const dir = path.join(guardRoot, name.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  process.env[name] = dir;
}

process.env['SQUAD_TEST_PROFILE_GUARD'] = guardRoot;

process.once('exit', () => {
  try { fs.rmSync(guardRoot, { recursive: true, force: true }); } catch { /* best effort */ }
});
