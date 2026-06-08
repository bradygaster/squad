/**
 * `squad projects` command.
 *
 * Lists every Squad project registered on this machine (populated by
 * `squad init`), newest first. Read-only: it only reports what the registry
 * already contains.
 */

import { readProjectsRegistry } from '@bradygaster/squad-sdk';

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

export async function runProjects(_args: string[]): Promise<void> {
  const entries = readProjectsRegistry();

  if (entries.length === 0) {
    console.log('No Squad projects registered yet.');
    console.log('Run `squad init` in a project to add it to the list.');
    return;
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

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
}
