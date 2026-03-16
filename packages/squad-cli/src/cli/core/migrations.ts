/**
 * Version-based migration runner
 * Runs additive migrations between versions
 * @module cli/core/migrations
 */

import fs from 'node:fs';
import path from 'node:path';
import { success } from './output.js';
import { scrubEmails } from './email-scrub.js';

interface Migration {
  version: string;
  description: string;
  run: (squadDir: string) => Promise<void> | void;
}

/**
 * Migration registry — additive-only operations keyed by version
 */
const migrations: Migration[] = [
  {
    version: '0.2.0',
    description: 'Create skills/ directory',
    run(squadDir: string) {
      const skillsDir = path.join(squadDir, 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
    }
  },
  {
    version: '0.4.0',
    description: 'Create plugins/ directory',
    run(squadDir: string) {
      const pluginsDir = path.join(squadDir, 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });
    }
  },
  {
    version: '0.5.0',
    description: 'Scrub email addresses from Squad state files (privacy fix)',
    async run(squadDir: string) {
      if (fs.existsSync(squadDir)) {
        const scrubbedCount = await scrubEmails(squadDir);
        if (scrubbedCount > 0) {
          success(`Privacy migration: scrubbed email addresses from ${scrubbedCount} file(s)`);
        }
      }
    }
  },
  {
    version: '0.9.0',
    description: 'Copy legacy .squad skills into .copilot/skills',
    run(squadDir: string) {
      const projectRoot = path.dirname(squadDir);
      const legacySkillsDir = path.join(squadDir, 'skills');
      if (!fs.existsSync(legacySkillsDir)) {
        return;
      }

      const skillNames = fs.readdirSync(legacySkillsDir).filter(entry =>
        fs.existsSync(path.join(legacySkillsDir, entry, 'SKILL.md')),
      );
      if (skillNames.length === 0) {
        return;
      }

      const copilotSkillsDir = path.join(projectRoot, '.copilot', 'skills');
      fs.mkdirSync(copilotSkillsDir, { recursive: true });

      for (const skillName of skillNames) {
        fs.cpSync(
          path.join(legacySkillsDir, skillName),
          path.join(copilotSkillsDir, skillName),
          { recursive: true, force: false, errorOnExist: false },
        );
      }

      success(`Migrated skills to .copilot/skills: ${skillNames.join(', ')}`);
    }
  }
];

/**
 * Compare semver strings: -1 (a<b), 0 (a==b), 1 (a>b)
 */
function compareSemver(a: string, b: string): number {
  const stripPre = (v: string) => v.split('-')[0]!;
  const pa = stripPre(a).split('.').map(Number);
  const pb = stripPre(b).split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  
  return 0;
}

/**
 * Run migrations applicable for upgrading from oldVersion to newVersion
 * Returns array of migration descriptions that were applied
 */
export async function runMigrations(
  squadDir: string, 
  oldVersion: string, 
  newVersion: string
): Promise<string[]> {
  const applicable = migrations
    .filter(m => compareSemver(m.version, oldVersion) > 0 && compareSemver(m.version, newVersion) <= 0)
    .sort((a, b) => compareSemver(a.version, b.version));
  
  const applied: string[] = [];
  
  for (const m of applicable) {
    try {
      await m.run(squadDir);
      applied.push(`${m.version}: ${m.description}`);
    } catch (err) {
      console.error(`✗ Migration failed (${m.version}: ${m.description}): ${(err as Error).message}`);
    }
  }
  
  return applied;
}
