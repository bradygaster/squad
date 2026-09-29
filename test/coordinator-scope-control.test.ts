import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

const COORDINATOR_PATHS = [
  '.squad-templates/squad.agent.md',
  '.github/agents/squad.agent.md',
  'templates/squad.agent.md.template',
  'packages/squad-cli/templates/squad.agent.md.template',
  'packages/squad-sdk/templates/squad.agent.md.template',
];

const REFLECT_PATHS = [
  '.squad-templates/skills/reflect/SKILL.md',
  '.github/skills/reflect/SKILL.md',
  'templates/skills/reflect/SKILL.md',
  'packages/squad-cli/templates/skills/reflect/SKILL.md',
  'packages/squad-sdk/templates/skills/reflect/SKILL.md',
];

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('coordinator scope and persistence rules', () => {
  it.each(COORDINATOR_PATHS)('%s preserves user scope and forbids local proposal fallback', (path) => {
    const content = read(path);

    expect(content).toContain('The Coordinator owns preserving the scope the user requested.');
    expect(content).toContain('Expanding scope requires explicit user approval.');
    expect(content).toContain('Never create a local or gitignored Markdown proposal');
    expect(content).toContain('make the minimum tracked source change');
  });

  it.each(REFLECT_PATHS)('%s routes behavior changes to tracked source and PRs', (path) => {
    const content = read(path);

    expect(content).toContain('Report adjacent improvements separately');
    expect(content).toContain('Do not create local or gitignored Markdown proposals');
    expect(content).toContain('update the minimum tracked governing source');
    expect(content).toContain('open a focused PR');
  });
});
