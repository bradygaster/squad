/**
 * `squad open` command.
 *
 * Opens a registered Squad project in Copilot. Accepts an optional project
 * name or query; when omitted and stdout is a TTY, presents an interactive
 * numbered picker. Pass `--print-path` (or `-p`) to print the resolved path
 * and return without launching Copilot (useful for shell integrations such as
 * `cd (squad open foo --print-path)`).
 */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { readProjectsRegistry, resolveProject } from '@bradygaster/squad-sdk';
import type { ProjectRegistryEntry } from '@bradygaster/squad-sdk';

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

function sortedNewestFirst(entries: ProjectRegistryEntry[]): ProjectRegistryEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

async function pickInteractive(sorted: ProjectRegistryEntry[]): Promise<ProjectRegistryEntry | null> {
  const nameWidth = Math.max(...sorted.map(e => e.name.length), 4);
  const pathWidth = Math.max(...sorted.map(e => e.path.length), 4);

  console.log();
  console.log(`Squad projects on this machine (${sorted.length}):`);
  console.log();
  console.log(`  ${'#'.padEnd(3)}${'NAME'.padEnd(nameWidth)}  ${'PATH'.padEnd(pathWidth)}  CREATED`);
  sorted.forEach((e, i) => {
    console.log(
      `  ${String(i + 1).padEnd(3)}${e.name.padEnd(nameWidth)}  ${e.path.padEnd(pathWidth)}  ${relativeAge(e.created_at)}`,
    );
  });
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(`Select a project (1-${sorted.length}), or blank to cancel: `, resolve);
  });
  rl.close();

  const trimmed = answer.trim();
  if (!trimmed) return null;

  const index = parseInt(trimmed, 10);
  if (Number.isNaN(index) || index < 1 || index > sorted.length) return null;
  return sorted[index - 1] ?? null;
}

async function launchCopilot(entry: ProjectRegistryEntry): Promise<void> {
  console.log(`Opening ${entry.name} in Copilot (${entry.path})...`);

  await new Promise<void>((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('copilot', [], { cwd: entry.path, stdio: 'inherit', shell: true })
        : spawn('copilot', [], { cwd: entry.path, stdio: 'inherit' });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        console.log(
          `Could not launch \`copilot\`. Open it manually in: ${entry.path}`,
        );
        resolve();
      } else {
        reject(err);
      }
    });

    child.on('close', () => resolve());
  });
}

export async function runOpen(args: string[]): Promise<void> {
  const printPath = args.includes('--print-path') || args.includes('-p');
  const query = args
    .filter(a => a !== '--print-path' && a !== '-p')
    .join(' ')
    .trim();

  const entries = readProjectsRegistry();
  if (entries.length === 0) {
    console.log('No Squad projects registered yet.');
    console.log('Run `squad init` in a project to add it to the list.');
    return;
  }

  let entry: ProjectRegistryEntry;

  if (query) {
    const result = resolveProject(query);
    if ('notFound' in result) {
      console.log(`No project matching "${query}".`);
      console.log('Run `squad projects` to see the list.');
      return;
    }
    if ('ambiguous' in result) {
      console.log(`Multiple projects match "${query}":`);
      for (const candidate of result.ambiguous) {
        console.log(`  ${candidate.name}`);
      }
      console.log('Be more specific.');
      return;
    }
    entry = result.match;
  } else {
    const isTTY = process.stdout.isTTY === true;
    if (!isTTY) {
      const sorted = sortedNewestFirst(entries);
      const nameWidth = Math.max(...sorted.map(e => e.name.length), 4);
      const pathWidth = Math.max(...sorted.map(e => e.path.length), 4);
      console.log();
      console.log(`Squad projects on this machine (${sorted.length}):`);
      console.log();
      console.log(`  ${'NAME'.padEnd(nameWidth)}  ${'PATH'.padEnd(pathWidth)}  CREATED`);
      for (const e of sorted) {
        console.log(
          `  ${e.name.padEnd(nameWidth)}  ${e.path.padEnd(pathWidth)}  ${relativeAge(e.created_at)}`,
        );
      }
      console.log();
      console.log('Pass a project name: squad open <name>');
      return;
    }

    const sorted = sortedNewestFirst(entries);
    const picked = await pickInteractive(sorted);
    if (!picked) {
      console.log('Cancelled.');
      return;
    }
    entry = picked;
  }

  if (!fs.existsSync(entry.path)) {
    console.log(`Project path no longer exists: ${entry.path}`);
    return;
  }

  if (printPath) {
    console.log(entry.path);
    return;
  }

  await launchCopilot(entry);
}
