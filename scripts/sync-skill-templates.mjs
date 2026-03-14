#!/usr/bin/env node

import { readdirSync, cpSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const skillsSourceDir = join(rootDir, '.squad', 'skills');
const targets = [
  join(rootDir, 'packages', 'squad-cli', 'templates', 'skills'),
  join(rootDir, 'packages', 'squad-sdk', 'templates', 'skills')
];

console.log('🔄 Syncing skill templates from canonical source...\n');

if (!existsSync(skillsSourceDir)) {
  console.error(`❌ Source directory not found: ${skillsSourceDir}`);
  process.exit(1);
}

const skillDirs = readdirSync(skillsSourceDir).filter(name => {
  const fullPath = join(skillsSourceDir, name);
  return statSync(fullPath).isDirectory();
});

if (skillDirs.length === 0) {
  console.log('⚠️  No skills found in source directory');
  process.exit(0);
}

console.log(`📁 Found ${skillDirs.length} skill(s): ${skillDirs.join(', ')}\n`);

for (const target of targets) {
  console.log(`📦 Syncing to: ${target}`);
  
  for (const skillName of skillDirs) {
    const sourcePath = join(skillsSourceDir, skillName);
    const destPath = join(target, skillName);
    
    try {
      cpSync(sourcePath, destPath, { recursive: true, force: true });
      console.log(`  ✅ ${skillName}`);
    } catch (err) {
      console.error(`  ❌ ${skillName}: ${err.message}`);
      process.exit(1);
    }
  }
  
  console.log('');
}

console.log('✅ Skill template sync complete');
