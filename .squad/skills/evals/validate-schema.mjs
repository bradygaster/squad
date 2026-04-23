#!/usr/bin/env node
/**
 * Skill Schema Validator
 * Validates YAML frontmatter for all skills in .squad/skills/, .copilot/skills/, and templates/skills/.
 * Exit 0 if all validations pass, exit 1 otherwise.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const EVALS_DIR = __dirname;

const SKILL_DIRS = [
  { path: join(REPO_ROOT, '.squad', 'skills'), label: '.squad/skills' },
  { path: join(REPO_ROOT, '.copilot', 'skills'), label: '.copilot/skills' },
  { path: join(REPO_ROOT, 'templates', 'skills'), label: 'templates/skills' },
];

// Fields that must NOT appear at top level (should be nested in metadata:)
const DISALLOWED_TOP_LEVEL = ['domain', 'confidence', 'source', 'tools', 'triggers', 'roles', 'compatibility'];
// Fields that ARE allowed as top-level (everything else belongs inside metadata:)
const ALLOWED_TOP_LEVEL = new Set(['name', 'description', 'metadata', 'license', 'allowed-tools']);

// ---------------------------------------------------------------------------
// YAML frontmatter parser (same as run-evals.mjs)
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (endIdx === -1) return null;
  const fmLines = lines.slice(1, endIdx);
  return { raw: parseSimpleYaml(fmLines), fmLines };
}

function parseSimpleYaml(lines) {
  const result = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (!match) { i++; continue; }
    const key = match[1];
    const val = match[2].trim();

    if (val === '' || val === '|' || val === '>') {
      const nested = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t'))) {
        nested.push(lines[i].replace(/^(\s{2}|\t)/, ''));
        i++;
      }
      if (nested.length > 0) {
        const nestedObj = parseSimpleYaml(nested);
        const hasKeys = Object.keys(nestedObj).length > 0;
        if (hasKeys) {
          result[key] = nestedObj;
        } else {
          result[key] = nested.join('\n').trim();
        }
      }
      continue;
    }

    result[key] = val.replace(/^["']|["']$/g, '');
    i++;
  }
  return result;
}

function isValidDirName(name) {
  return /^[a-z][a-z0-9-]*$/.test(name);
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

function validateSkill(dirName, skillFile, label) {
  const errors = [];
  const warnings = [];

  const text = readFileSync(skillFile, 'utf8');
  const parsed = parseYamlFrontmatter(text);

  if (!parsed) {
    // No frontmatter — attempt markdown fallback
    const headingMatch = text.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      warnings.push('No YAML frontmatter — using heading as name (consider adding frontmatter)');
      return { errors, warnings };
    }
    errors.push('No YAML frontmatter and no heading found');
    return { errors, warnings };
  }

  const { raw: fm } = parsed;

  // 1. name exists and matches directory
  if (!fm.name) {
    errors.push('Missing required field: name');
  } else {
    const cleanName = fm.name.toLowerCase().trim();
    if (!isValidDirName(cleanName)) {
      errors.push(`name "${fm.name}" must be lowercase with hyphens only (no spaces, underscores, or uppercase)`);
    }
    if (cleanName !== dirName.toLowerCase()) {
      warnings.push(`name "${fm.name}" does not match directory name "${dirName}"`);
    }
  }

  // 2. description exists and ≤ 1024 chars
  if (!fm.description) {
    errors.push('Missing required field: description');
  } else if (fm.description.length > 1024) {
    errors.push(`description is ${fm.description.length} chars (max 1024)`);
  }

  // 3. Check for disallowed top-level fields — these belong inside metadata:
  for (const field of DISALLOWED_TOP_LEVEL) {
    if (fm[field] !== undefined) {
      warnings.push(`field "${field}" should be inside metadata: (found at top-level)`);
    }
  }

  // 4. triggers inside metadata: is valid; only warn if at top-level (already covered above)
  const metadataTriggers = fm.metadata && fm.metadata.triggers;
  if (metadataTriggers !== undefined && !Array.isArray(metadataTriggers) && typeof metadataTriggers !== 'string') {
    warnings.push('metadata.triggers should be a list or string');
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Eval coverage check
// ---------------------------------------------------------------------------

function getEvalFiles() {
  if (!existsSync(EVALS_DIR)) return new Set();
  return new Set(
    readdirSync(EVALS_DIR)
      .filter(f => f.endsWith('.eval.yaml'))
      .map(f => f.replace('.eval.yaml', ''))
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('━'.repeat(72));
  console.log('  Squad Skill Schema Validator');
  console.log('━'.repeat(72));

  const evalFiles = getEvalFiles();
  let totalSkills = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  const missingEvals = [];

  for (const { path: dirPath, label } of SKILL_DIRS) {
    if (!existsSync(dirPath)) {
      console.log(`\n[${label}] — directory not found, skipping`);
      continue;
    }

    console.log(`\n[${label}]`);
    console.log('─'.repeat(72));

    const entries = readdirSync(dirPath, { withFileTypes: true });
    let sectionErrors = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirName = entry.name;
      const skillFile = join(dirPath, dirName, 'SKILL.md');
      if (!existsSync(skillFile)) continue;

      totalSkills++;
      const { errors, warnings } = validateSkill(dirName, skillFile, label);

      const hasIssues = errors.length > 0 || warnings.length > 0;
      const icon = errors.length > 0 ? '✗' : warnings.length > 0 ? '~' : '✓';
      console.log(`  ${icon} ${dirName}`);

      for (const e of errors) {
        console.log(`      ✗ ERROR: ${e}`);
        totalErrors++;
        sectionErrors++;
      }
      for (const w of warnings) {
        console.log(`      ⚠ WARN:  ${w}`);
        totalWarnings++;
      }

      // Eval coverage
      if (!evalFiles.has(dirName)) {
        missingEvals.push(`${label}/${dirName}`);
      }
    }

    if (sectionErrors === 0) {
      console.log(`  → All checks passed for ${label}`);
    }
  }

  // Eval coverage report
  if (missingEvals.length > 0) {
    console.log('\n━'.repeat(72).replace('━', '\n━'));
    console.log('  Missing Eval Fixtures');
    console.log('━'.repeat(72));
    for (const m of missingEvals) {
      console.log(`  ✗ ${m} — no .eval.yaml found`);
      totalWarnings++;
    }
  }

  // Summary
  console.log('\n' + '━'.repeat(72));
  console.log(`  Skills validated: ${totalSkills}`);
  console.log(`  Errors: ${totalErrors} | Warnings: ${totalWarnings}`);
  console.log(`  ${totalErrors === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('━'.repeat(72));

  process.exit(totalErrors === 0 ? 0 : 1);
}

main();
