/**
 * `squad pick` command.
 *
 * Shows an interactive numbered picker of registered Squad projects and opens
 * the chosen one in Copilot. Accepts flags forwarded to `squad open`
 * (currently `--print-path` / `-p`); any positional arguments are stripped so
 * the picker is always entered interactively.
 *
 * This command completes the projects/pick/open trio:
 *   squad projects   -- read-only list
 *   squad pick       -- always-interactive opener  (this file)
 *   squad open       -- direct-by-name or interactive opener
 *
 * Implementation: delegates entirely to `runOpen` with positional args removed.
 * All picker rendering, TTY detection, empty-registry messaging, path printing,
 * and Copilot launch logic live in open.ts and are reused without duplication.
 */

import { runOpen } from './open.js';

export async function runPick(args: string[]): Promise<void> {
  return runOpen(args.filter(a => a.startsWith('-')));
}
