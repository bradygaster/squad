import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_DIR = '.squad-templates';
const AGENT_TEMPLATE = 'squad.agent.md';

const targetExtras = {
  templates: ['ghost-protocol.md', 'loop.md', 'personal-charter.md'],
  'packages/squad-cli/templates': ['loop.md'],
  'packages/squad-sdk/templates': ['schedule.json'],
} as const;

function filesUnder(directory: string, base = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relativePath = base ? join(base, entry.name) : entry.name;
    return entry.isDirectory()
      ? filesUnder(join(directory, entry.name), relativePath)
      : [relativePath];
  });
}

describe('template destination extras', () => {
  const canonicalFiles = new Set(
    filesUnder(SOURCE_DIR).map(file =>
      file === AGENT_TEMPLATE ? `${AGENT_TEMPLATE}.template` : file
    ),
  );

  for (const [target, allowedExtras] of Object.entries(targetExtras)) {
    it(`${target} contains only classified product-specific extras`, () => {
      const extras = filesUnder(target)
        .filter(file => !canonicalFiles.has(file))
        .sort();
      expect(extras).toEqual([...allowedExtras].sort());
    });
  }
});
