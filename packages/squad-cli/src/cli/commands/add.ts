/**
 * `squad add` command.
 *
 * Registers an existing directory into the global projects registry so it
 * appears in `squad projects`/`squad list` and can be opened with
 * `squad open`/`squad pick`. Unlike `squad init`, this command does NOT
 * scaffold a `.squad/` directory; it only records the project path. Use
 * `squad init` when you want to initialize Squad in a new project.
 */

import path from 'node:path';
import fs from 'node:fs';
import { readProjectsRegistry, registerProject } from '@bradygaster/squad-sdk';

const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

function samePath(a: string, b: string): boolean {
  return CASE_INSENSITIVE ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export async function runAdd(args: string[]): Promise<void> {
  // Parse --name <value>
  const nameIdx = args.indexOf('--name');
  let name: string | undefined;
  let remaining = args;
  if (nameIdx !== -1) {
    name = args[nameIdx + 1];
    remaining = args.filter((_, i) => i !== nameIdx && i !== nameIdx + 1);
  }

  const rawPath = remaining.length > 0 ? remaining.join(' ') : '.';
  const absPath = path.resolve(rawPath);

  // Validate the path exists and is a directory.
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(absPath);
  } catch {
    console.log(`Path does not exist: ${absPath}`);
    if (remaining.length > 1) {
      console.log(`If the path contains spaces, wrap it in quotes: squad add "<path>"`);
    }
    return;
  }

  if (!stat.isDirectory()) {
    console.log(`Not a directory: ${absPath}`);
    return;
  }

  const displayName = name ?? path.basename(absPath);

  // Detect whether already registered (case-insensitive on win32/darwin).
  const entries = readProjectsRegistry();
  const alreadyRegistered = entries.some(e => samePath(path.resolve(e.path), absPath));

  registerProject(displayName, absPath);

  if (alreadyRegistered) {
    console.log(`Updated "${displayName}" in your Squad projects (${absPath}).`);
  } else {
    console.log(`Added "${displayName}" to your Squad projects (${absPath}).`);
  }
}
