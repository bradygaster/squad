#!/usr/bin/env node
/**
 * Skill Eval Runner
 * Loads skill definitions and eval fixtures, scores trigger matching, reports results.
 * Exit 0 if overall pass rate >= 80%, exit 1 otherwise.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const SKILL_DIRS = [
  { path: join(REPO_ROOT, '.squad', 'skills'), label: '.squad/skills' },
  { path: join(REPO_ROOT, '.copilot', 'skills'), label: '.copilot/skills' },
  { path: join(REPO_ROOT, 'templates', 'skills'), label: 'templates/skills' },
];
const EVALS_DIR = __dirname;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'it', 'to', 'for', 'and', 'or', 'of', 'in', 'on',
  'with', 'this', 'that', 'when', 'how', 'do', 'does', 'what', 'which',
  'should', 'can', 'my', 'i', 'we', 'you',
]);

// ---------------------------------------------------------------------------
// YAML frontmatter parser
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (endIdx === -1) return null;
  const fmLines = lines.slice(1, endIdx);
  return parseSimpleYaml(fmLines);
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
      // Possible block scalar or nested map — collect indented lines
      const nested = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t'))) {
        nested.push(lines[i].replace(/^(\s{2}|\t)/, ''));
        i++;
      }
      if (nested.length > 0) {
        // Try to parse as nested map first; if keys found, flatten into parent
        const nestedObj = parseSimpleYaml(nested);
        const hasKeys = Object.keys(nestedObj).length > 0;
        if (hasKeys) {
          // Flatten: nested keys bubble up (metadata: block)
          Object.assign(result, nestedObj);
          result[key] = nestedObj;
        } else {
          result[key] = nested.join('\n').trim();
        }
      }
      continue;
    }

    if (val.startsWith('"') && val.endsWith('"')) {
      result[key] = val.slice(1, -1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      result[key] = val.slice(1, -1);
    } else {
      result[key] = val;
    }
    i++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Skill loader
// ---------------------------------------------------------------------------

function loadSkills() {
  const skills = new Map(); // name -> {name, description, source}
  const warnings = [];

  for (const { path: dir, label: prefix } of SKILL_DIRS) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(dir, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;

      const text = readFileSync(skillFile, 'utf8');
      const fm = parseYamlFrontmatter(text);

      let name, description;

      if (fm && fm.name) {
        name = fm.name.replace(/^"|"$/g, '').trim();
        description = (fm.description || '').replace(/^"|"$/g, '').trim();
      } else {
        // Fallback: use first heading and first paragraph
        const headingMatch = text.match(/^#\s+(.+)$/m);
        const paraMatch = text.match(/^(?!#)([A-Za-z].{20,})/m);
        name = headingMatch ? headingMatch[1].replace(/^Skill:\s*/i, '').trim().toLowerCase().replace(/\s+/g, '-') : entry.name;
        description = paraMatch ? paraMatch[1].trim() : '';
      }

      if (skills.has(name)) {
        const existing = skills.get(name);
        if (prefix === '.copilot/skills') {
          warnings.push(`⚠ Duplicate skill name "${name}" — preferring .copilot/ version over ${existing.prefix}`);
          skills.set(name, { name, description, dir: dir, prefix, dirName: entry.name });
        } else {
          warnings.push(`⚠ Duplicate skill name "${name}" in ${prefix} — keeping existing`);
        }
      } else {
        skills.set(name, { name, description, dir, prefix, dirName: entry.name });
      }
    }
  }

  return { skills, warnings };
}

// ---------------------------------------------------------------------------
// Eval fixture loader
// ---------------------------------------------------------------------------

function parseEvalYaml(text) {
  // Minimal structured YAML parser for eval fixtures
  const lines = text.split('\n');
  const result = { skill: '', cases: [] };
  let currentCase = null;
  let currentField = null;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (line.startsWith('skill:')) {
      result.skill = line.replace('skill:', '').trim().replace(/^"|"$/g, '');
    } else if (line === 'cases:') {
      // nothing
    } else if (line.startsWith('- prompt:')) {
      if (currentCase) result.cases.push(currentCase);
      currentCase = { prompt: line.replace('- prompt:', '').trim().replace(/^"|"$/g, ''), type: '', expect: '' };
      currentField = 'prompt';
    } else if (currentCase && line.startsWith('type:')) {
      currentCase.type = line.replace('type:', '').trim();
      currentField = 'type';
    } else if (currentCase && line.startsWith('expect:')) {
      currentCase.expect = line.replace('expect:', '').trim();
      currentField = 'expect';
    } else if (currentCase && line.startsWith('reason:')) {
      currentCase.reason = line.replace('reason:', '').trim().replace(/^"|"$/g, '');
      currentField = 'reason';
    } else if (currentField === 'prompt' && (raw.startsWith('  ') || raw.startsWith('\t')) && line !== '') {
      // Multi-line prompt continuation (block scalar lines)
      if (!currentCase.prompt.endsWith(' ')) currentCase.prompt += ' ';
      currentCase.prompt += line;
    }
    i++;
  }
  if (currentCase) result.cases.push(currentCase);
  return result;
}

function loadEvals() {
  const fixtures = new Map(); // skill name -> [{prompt, type, expect, reason}]
  const evalFiles = readdirSync(EVALS_DIR).filter(f => f.endsWith('.eval.yaml'));
  for (const file of evalFiles) {
    const text = readFileSync(join(EVALS_DIR, file), 'utf8');
    const parsed = parseEvalYaml(text);
    if (!parsed.skill) continue;
    fixtures.set(parsed.skill, parsed.cases);
  }
  return fixtures;
}

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
}

function scorePromptAgainstSkill(prompt, skill) {
  const promptLower = prompt.toLowerCase();
  const promptTokens = new Set(tokenize(prompt));

  let score = 0;

  // Exact skill name substring match: weight 5
  if (promptLower.includes(skill.name.toLowerCase())) {
    score += 5;
  }

  // Name word matches: weight 3 each
  const nameTokens = tokenize(skill.name.replace(/-/g, ' '));
  for (const tok of nameTokens) {
    if (promptTokens.has(tok)) score += 3;
  }

  // Description word matches: weight 1 each
  const descTokens = tokenize(skill.description);
  for (const tok of descTokens) {
    if (promptTokens.has(tok)) score += 1;
  }

  return score;
}

function predictTopSkill(prompt, skills) {
  let best = null;
  let bestScore = -1;

  for (const skill of skills.values()) {
    const s = scorePromptAgainstSkill(prompt, skill);
    if (s > bestScore) {
      bestScore = s;
      best = skill;
    }
  }

  return { skill: best, score: bestScore };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

function main() {
  console.log('━'.repeat(72));
  console.log('  Squad Skill Eval Runner');
  console.log('━'.repeat(72));

  const { skills, warnings } = loadSkills();
  for (const w of warnings) console.log(w);
  console.log(`\n✓ Loaded ${skills.size} skills\n`);

  const fixtures = loadEvals();
  console.log(`✓ Loaded ${fixtures.size} eval fixtures\n`);

  // Per-skill results tracking
  const results = new Map(); // skill name -> {pos: 0, neg: 0, edge: 0, total: 0, pass: 0}
  for (const name of skills.keys()) {
    results.set(name, { pos: 0, neg: 0, edge: 0, total: 0, pass: 0 });
  }

  const failures = [];
  let totalCases = 0;
  let totalPass = 0;

  for (const [skillName, cases] of fixtures.entries()) {
    if (!skills.has(skillName)) {
      console.log(`⚠ Fixture for unknown skill "${skillName}" — skipping`);
      continue;
    }

    const rec = results.get(skillName);

    for (const tc of cases) {
      const { type, prompt, expect, reason } = tc;
      totalCases++;
      rec.total++;
      if (type === 'positive') rec.pos++;
      else if (type === 'negative') rec.neg++;
      else if (type === 'edge') rec.edge++;

      const { skill: predicted, score } = predictTopSkill(prompt, skills);
      const predictedName = predicted ? predicted.name : '(none)';

      let pass = false;
      if (expect === 'match') {
        pass = predictedName === skillName;
      } else if (expect === 'no-match') {
        pass = predictedName !== skillName;
      } else if (expect.startsWith('not:')) {
        const excluded = expect.slice(4).trim();
        pass = predictedName !== excluded;
      }

      if (pass) {
        rec.pass++;
        totalPass++;
      } else {
        failures.push({ skillName, type, prompt, expect, predicted: predictedName, score, reason });
      }
    }
  }

  // Report table
  console.log('━'.repeat(72));
  console.log('  Results by Skill');
  console.log('━'.repeat(72));

  const header = `${'Skill'.padEnd(32)} ${'Pos'.padStart(4)} ${'Neg'.padStart(4)} ${'Edge'.padStart(5)} ${'Total'.padStart(6)} ${'Pass%'.padStart(7)}`;
  console.log(header);
  console.log('─'.repeat(72));

  for (const [name, r] of [...results.entries()].sort()) {
    if (r.total === 0) continue;
    const pct = ((r.pass / r.total) * 100).toFixed(0).padStart(6) + '%';
    const status = r.pass === r.total ? '✓' : r.pass / r.total >= 0.8 ? '~' : '✗';
    console.log(`${status} ${name.padEnd(30)} ${String(r.pos).padStart(4)} ${String(r.neg).padStart(4)} ${String(r.edge).padStart(5)} ${String(r.total).padStart(6)} ${pct}`);
  }

  // Skills without fixtures
  for (const name of skills.keys()) {
    if (!fixtures.has(name)) {
      console.log(`  ${name.padEnd(30)} ${'—'.padStart(4)} ${'—'.padStart(4)} ${'—'.padStart(5)} ${'—'.padStart(6)} ${'N/A'.padStart(7)}  (no fixture)`);
    }
  }

  // Failures
  if (failures.length > 0) {
    console.log('\n━'.repeat(72).replace('━', '\n━'));
    console.log('  Failures');
    console.log('━'.repeat(72));
    for (const f of failures) {
      console.log(`\n[${f.type.toUpperCase()}] ${f.skillName}`);
      console.log(`  Prompt:    "${f.prompt}"`);
      console.log(`  Expected:  ${f.expect} → got "${f.predicted}" (score: ${f.score})`);
      if (f.reason) console.log(`  Reason:    ${f.reason}`);
    }
  }

  // Summary
  const overallPct = totalCases > 0 ? (totalPass / totalCases) * 100 : 0;
  const passed = overallPct >= 80;
  console.log('\n' + '━'.repeat(72));
  console.log(`  Overall: ${totalPass}/${totalCases} passed (${overallPct.toFixed(1)}%) — ${passed ? '✓ PASS' : '✗ FAIL'}`);
  console.log('━'.repeat(72));

  process.exit(passed ? 0 : 1);
}

main();
