/**
 * Global test setup: redirect the squad global directory to an isolated temp dir.
 *
 * Why this is necessary:
 *   PR1 made `squad init` call registerProject(), which writes to the global
 *   projects.json at resolveGlobalSquadPath(). On Windows that is
 *   %APPDATA%\squad\projects.json. Without this redirect, running `npm test`
 *   (or any vitest run) pollutes the developer's real global registry with
 *   junk entries for every temp directory created by the test suite.
 *
 * How the redirect works:
 *   resolveGlobalSquadPath() (packages/squad-sdk/src/resolution.ts ~L408) reads
 *   process.env live on every call -- no import-time cache. Setting the relevant
 *   env vars here, before any test file loads, causes ALL calls (including those
 *   inside CLI child processes that inherit process.env) to resolve to our temp
 *   dir instead of the real user data directory.
 *
 * The isolated directory is created once per vitest worker process and is never
 * cleaned up explicitly -- the OS temp cleaner handles it. Tests that need a
 * clean global state should use beforeEach/afterEach as normal.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isolated = mkdtempSync(join(tmpdir(), 'squad-test-global-'));

// Windows: resolveGlobalSquadPath reads APPDATA, then LOCALAPPDATA as fallback.
process.env['APPDATA'] = isolated;
process.env['LOCALAPPDATA'] = isolated;

// Linux: resolveGlobalSquadPath reads XDG_CONFIG_HOME, then ~/.config as fallback.
process.env['XDG_CONFIG_HOME'] = isolated;

// macOS: resolveGlobalSquadPath uses os.homedir() + 'Library/Application Support'.
// On POSIX, Node.js os.homedir() honors the HOME env var, so redirect HOME there.
// We skip this on Windows because USERPROFILE/HOMEDRIVE govern homedir there, and
// Windows tests rely on APPDATA (already set above), not homedir.
if (process.platform !== 'win32') {
  process.env['HOME'] = isolated;
}
