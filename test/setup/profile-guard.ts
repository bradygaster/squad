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
import { createRequire } from 'node:module';

// 1. Fail-closed guard FIRST, from the ORIGINAL environment: any fs access under the real
//    profile roots throws (sync, callback and promise APIs). Children inherit it through
//    NODE_OPTIONS=--require and the SQUAD_TEST_FORBIDDEN_ROOTS list, so faking HOME/APPDATA
//    for a subprocess still protects the real profile.
const require = createRequire(import.meta.url);
const guardModule = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'profile-fs-guard.cjs');
require(guardModule);
{
  // NODE_OPTIONS strips backslashes inside quotes on Windows; forward slashes work everywhere.
  const quoted = `--require "${guardModule.replace(/\\/g, '/')}"`;
  const existing = process.env['NODE_OPTIONS'] ?? '';
  if (!existing.includes('profile-fs-guard.cjs')) process.env['NODE_OPTIONS'] = existing ? `${existing} ${quoted}` : quoted;
}

// 2. Redirect every profile-level directory to a throw-away temp dir.
const realTmp = fs.realpathSync(os.tmpdir());
const guardRoot = fs.mkdtempSync(path.join(realTmp, 'squad-test-profile-'));

const inside = (p: string | undefined): boolean => {
  if (!p) return false;
  const rel = path.relative(realTmp, path.resolve(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

// SQUAD_HOME keeps the real shape (<fake home>/.squad): code and tests reason about that segment.
const layout: Record<string, string> = {
  SQUAD_HOME: path.join(guardRoot, 'home', '.squad'),
  APPDATA: path.join(guardRoot, 'appdata'),
  LOCALAPPDATA: path.join(guardRoot, 'localappdata'),
  XDG_CONFIG_HOME: path.join(guardRoot, 'xdg-config'),
};
for (const [name, dir] of Object.entries(layout)) {
  if (inside(process.env[name])) continue; // an outer harness already isolated it
  fs.mkdirSync(dir, { recursive: true });
  process.env[name] = dir;
}

process.env['SQUAD_TEST_PROFILE_GUARD'] = guardRoot;

process.once('exit', () => {
  try { fs.rmSync(guardRoot, { recursive: true, force: true }); } catch { /* best effort */ }
});
