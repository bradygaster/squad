/**
 * Shared POSIX-shell resolution for the gh-aw behavioral suites.
 *
 * Several gh-aw suites execute the workflow's own `bash`/`jq` one-liners to prove
 * the shipped snippets behave as documented. Those suites used to gate themselves
 * on `existsSync('/bin/sh')`, which is absent on a stock Windows dev box — so they
 * skipped, and the suite still reported green. A check that never runs is
 * indistinguishable from a check that always passes.
 *
 * Git for Windows ships a POSIX shell, so resolve that instead of skipping. When
 * no shell can be resolved at all, callers must fail loudly rather than skip:
 * see `requirePosixShell()`.
 *
 * This lives in one place on purpose. It previously existed only inside
 * `gh-aw-command-parse.test.ts`; a second copy pasted into another suite is how
 * this class of bug spreads.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolvePosixShell(): string | null {
  if (existsSync('/bin/sh')) return '/bin/sh';
  if (process.platform !== 'win32') return null;
  const roots = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramW6432'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    join(process.env['LOCALAPPDATA'] ?? 'C:\\', 'Programs'),
  ];
  return roots.map(r => join(r, 'Git', 'bin', 'bash.exe')).find(existsSync) ?? null;
}

export const POSIX_SHELL = resolvePosixShell();

/**
 * Names the missing dependency explicitly. Per #1832's finding, a status-only
 * assertion passes clean against a generic-diagnostic mutation, so the diagnostic
 * text is part of the contract and is asserted on.
 */
export const NO_POSIX_SHELL_MESSAGE =
  'No POSIX shell found. These cases are behavioral — skipping them would report a ' +
  'green suite for assertions that never ran. Install Git for Windows (provides ' +
  'bash.exe) or run on a POSIX host.';

/** Resolve a POSIX shell or throw naming the missing dependency. Never skips. */
export function requirePosixShell(): string {
  if (!POSIX_SHELL) throw new Error(NO_POSIX_SHELL_MESSAGE);
  return POSIX_SHELL;
}
