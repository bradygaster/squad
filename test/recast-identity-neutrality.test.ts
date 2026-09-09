import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const retiredNames = [
  'Flight',
  'EECOM',
  'FIDO',
  'PAO',
  'CAPCOM',
  'CONTROL',
  'Booster',
  'Surgeon',
  'Belanna',
  'GNC',
  'RETRO',
  'INCO',
  'GUIDO',
  'VOX',
  'DSKY',
  'Sims',
  'Handbook',
];

const identityNeutralFiles = [
  '.github/instructions/squad-routing-guard.instructions.md',
  '.github/PR_REQUIREMENTS.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/dependabot.yml',
];

const templateRoots = [
  '.squad/skills',
  '.squad-templates',
  'templates',
  'packages/squad-cli/templates',
  'packages/squad-sdk/templates',
];

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe('re-cast identity neutrality', () => {
  it.each(identityNeutralFiles)('%s does not bind policy to a cast name', file => {
    const content = readFileSync(file, 'utf8');
    for (const name of retiredNames) {
      expect(content).not.toMatch(new RegExp(`\\b${name}\\b`, 'i'));
    }
  });

  it('shipped templates do not contain cast-specific agent names', () => {
    const templateFiles = templateRoots.flatMap(filesUnder);

    for (const file of templateFiles) {
      const content = readFileSync(file, 'utf8');
      for (const name of retiredNames) {
        expect(content, `${file} contains ${name}`).not.toMatch(
          new RegExp(`\\b${name}\\b`)
        );
      }
    }
  });

  it('triage derives ownership from routing.md instead of role-name heuristics', () => {
    const workflow = readFileSync('.github/workflows/squad-triage.yml', 'utf8');

    expect(workflow).toContain('function routingRules(markdown)');
    expect(workflow).toContain('Matched routing rule');
    expect(workflow).not.toContain("role.includes('frontend')");
    expect(workflow).not.toContain("role.includes('backend')");
    expect(workflow).not.toContain("role.includes('devops')");
  });
});
