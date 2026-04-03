#!/usr/bin/env node
/**
 * Skill Description Optimizer
 * Iteratively improves a skill's description using LLM feedback to maximize
 * keyword-eval trigger accuracy on a train/validation split.
 *
 * Usage:
 *   node .squad/skills/evals/optimize-description.mjs --skill model-selection
 *
 * Options:
 *   --skill NAME           Required: which skill to optimize
 *   --max-iterations N     Max optimization iterations (default: 5)
 *   --dry-run              Show prompts without calling LLM
 *   --model MODEL          Model for improvement calls (default: claude-sonnet-4.6)
 *   --apply                Auto-apply the best description to SKILL.md
 *   --help                 Show this help text
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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

const MAX_DESCRIPTION_CHARS = 1024;
const TRAIN_RATIO = 0.6;

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    skill: null,
    maxIterations: 5,
    dryRun: false,
    model: 'claude-sonnet-4.6',
    apply: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':        opts.dryRun = true; break;
      case '--apply':          opts.apply = true; break;
      case '--help':           opts.help = true; break;
      case '--skill':          opts.skill = args[++i]; break;
      case '--model':          opts.model = args[++i]; break;
      case '--max-iterations': opts.maxIterations = Math.max(1, parseInt(args[++i], 10) || 5); break;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
Skill Description Optimizer
============================
Iteratively improves a skill description using LLM feedback to maximize
keyword-eval trigger accuracy. Uses a 60/40 train/validation split to
select the best description without overfitting.

Usage:
  node .squad/skills/evals/optimize-description.mjs --skill <name> [options]

Options:
  --skill NAME           Required: which skill to optimize
  --max-iterations N     Max optimization iterations (default: 5)
  --dry-run              Show improvement prompts without calling LLM
  --model MODEL          Model for improvement calls (default: claude-sonnet-4.6)
  --apply                Auto-apply the best description to SKILL.md
  --help                 Show this help text

Examples:
  node .squad/skills/evals/optimize-description.mjs --skill model-selection
  node .squad/skills/evals/optimize-description.mjs --skill model-selection --dry-run
  node .squad/skills/evals/optimize-description.mjs --skill model-selection --max-iterations 3 --apply
`.trim());
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (shared logic from run-evals.mjs)
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (endIdx === -1) return null;
  return parseSimpleYaml(lines.slice(1, endIdx));
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
// Skill loader (from run-evals.mjs)
// ---------------------------------------------------------------------------

function loadSkills() {
  const skills = new Map();
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
        const headingMatch = text.match(/^#\s+(.+)$/m);
        const paraMatch = text.match(/^(?!#)([A-Za-z].{20,})/m);
        name = headingMatch
          ? headingMatch[1].replace(/^Skill:\s*/i, '').trim().toLowerCase().replace(/\s+/g, '-')
          : entry.name;
        description = paraMatch ? paraMatch[1].trim() : '';
      }

      if (skills.has(name)) {
        if (prefix === '.copilot/skills') {
          skills.set(name, { name, description, dir, prefix, dirName: entry.name, skillFile });
        } else {
          warnings.push(`⚠ Duplicate skill "${name}" in ${prefix} — keeping existing`);
        }
      } else {
        skills.set(name, { name, description, dir, prefix, dirName: entry.name, skillFile });
      }
    }
  }

  return { skills, warnings };
}

// ---------------------------------------------------------------------------
// Eval fixture loader (from run-evals.mjs)
// ---------------------------------------------------------------------------

function parseEvalYaml(text) {
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
      currentCase = {
        prompt: line.replace('- prompt:', '').trim().replace(/^"|"$/g, ''),
        type: '',
        expect: '',
      };
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
      if (!currentCase.prompt.endsWith(' ')) currentCase.prompt += ' ';
      currentCase.prompt += line;
    }
    i++;
  }
  if (currentCase) result.cases.push(currentCase);
  return result;
}

function loadEvalFixture(skillName) {
  const evalFile = join(EVALS_DIR, `${skillName}.eval.yaml`);
  if (!existsSync(evalFile)) return null;
  const text = readFileSync(evalFile, 'utf8');
  return parseEvalYaml(text);
}

// ---------------------------------------------------------------------------
// Scoring engine (from run-evals.mjs)
// ---------------------------------------------------------------------------

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

function scorePromptAgainstSkill(prompt, skill) {
  const promptLower = prompt.toLowerCase();
  const promptTokens = new Set(tokenize(prompt));
  let score = 0;

  if (promptLower.includes(skill.name.toLowerCase())) score += 5;

  const nameTokens = tokenize(skill.name.replace(/-/g, ' '));
  for (const tok of nameTokens) {
    if (promptTokens.has(tok)) score += 3;
  }

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
    if (s > bestScore) { bestScore = s; best = skill; }
  }
  return { skill: best, score: bestScore };
}

// ---------------------------------------------------------------------------
// Train/validation split (deterministic 60/40)
// ---------------------------------------------------------------------------

function splitCases(cases) {
  const trainCount = Math.ceil(cases.length * TRAIN_RATIO);
  return {
    train: cases.slice(0, trainCount),
    validation: cases.slice(trainCount),
  };
}

// ---------------------------------------------------------------------------
// Eval runner for a single skill with a candidate description
// ---------------------------------------------------------------------------

/**
 * Run keyword eval for a specific skill against a set of cases,
 * using a candidate description injected into the skill record.
 * Returns { passed, total, failures }.
 */
function runKeywordEval(skillName, cases, skills, candidateDescription) {
  // Clone skills map with the candidate description for the target skill
  const augmented = new Map(skills);
  const original = skills.get(skillName);
  augmented.set(skillName, { ...original, description: candidateDescription });

  let passed = 0;
  const failures = [];

  for (const tc of cases) {
    const { prompt, expect } = tc;
    const { skill: predicted } = predictTopSkill(prompt, augmented);
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
      passed++;
    } else {
      failures.push({ tc, predictedName });
    }
  }

  return { passed, total: cases.length, failures };
}

// ---------------------------------------------------------------------------
// LLM integration
// ---------------------------------------------------------------------------

function checkCopilotCli() {
  try {
    execSync('copilot --version', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function escapeForShell(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, "'")
    .replace(/\r?\n/g, ' ');
}

function callLlm(prompt, model, dryRun) {
  if (dryRun) {
    console.log('\n--- DRY RUN PROMPT ---');
    console.log(prompt);
    console.log('--- END PROMPT ---\n');
    return null;
  }

  const escaped = escapeForShell(prompt);
  const cmd = `copilot -p "${escaped}" --model ${model}`;

  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const msg = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`LLM call failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Skill body extractor (first 200 lines, excluding frontmatter)
// ---------------------------------------------------------------------------

function extractSkillBody(skillFile) {
  const text = readFileSync(skillFile, 'utf8');
  const lines = text.split('\n');

  // Skip frontmatter block
  let start = 0;
  if (lines[0].trim() === '---') {
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    start = endIdx !== -1 ? endIdx + 1 : 0;
  }

  return lines.slice(start, start + 200).join('\n').trim();
}

// ---------------------------------------------------------------------------
// Improvement prompt builder
// ---------------------------------------------------------------------------

function buildImprovementPrompt(opts) {
  const {
    skillName,
    currentDescription,
    trainPassed,
    trainTotal,
    trainFailures,
    history,
    skillBody,
  } = opts;

  const shouldTrigger = trainFailures
    .filter(f => f.tc.expect === 'match')
    .map(f => `  - "${f.tc.prompt}"${f.tc.reason ? ` (reason: ${f.tc.reason})` : ''}`)
    .join('\n') || '  (none)';

  const shouldNotTrigger = trainFailures
    .filter(f => f.tc.expect === 'no-match' || f.tc.expect.startsWith('not:'))
    .map(f => `  - "${f.tc.prompt}"${f.tc.reason ? ` (reason: ${f.tc.reason})` : ''}`)
    .join('\n') || '  (none)';

  const historyText = history.length === 0
    ? '  (no previous attempts)'
    : history.map(h =>
        `  Iteration ${h.iteration}: train ${h.train_passed}/${h.train_total}, validation ${h.validation_passed}/${h.validation_total}\n  Description: "${h.description}"`
      ).join('\n\n');

  return `You are optimizing a skill description for better triggering in a keyword-based skill router.

Skill: ${skillName}
Current description: ${currentDescription}
Current score: ${trainPassed}/${trainTotal} train cases pass

Failed to trigger (should have matched but didn't):
${shouldTrigger}

False triggers (matched when they should NOT have):
${shouldNotTrigger}

Previous attempts (avoid repeating these):
${historyText}

Skill content summary (first 200 lines):
${skillBody}

Write an improved description that:
- Uses imperative phrasing ('Use this skill when...' or 'Use when...')
- Focuses on user intent, not implementation details
- Lists specific contexts and triggers where the skill applies
- Incorporates vocabulary that covers the failed-to-trigger cases
- Avoids vocabulary that caused false triggers
- Is under ${MAX_DESCRIPTION_CHARS} characters
- Generalizes from the failures (don't just copy specific keywords from the failed queries verbatim)
- Builds on what worked in previous iterations

Reply with ONLY the new description text, nothing else. No quotes, no preamble.`.trim();
}

// ---------------------------------------------------------------------------
// Apply best description to SKILL.md
// ---------------------------------------------------------------------------

function applyDescription(skillFile, newDescription) {
  const text = readFileSync(skillFile, 'utf8');
  const lines = text.split('\n');

  // Find frontmatter bounds
  if (lines[0].trim() !== '---') {
    throw new Error('SKILL.md does not have YAML frontmatter — cannot auto-apply');
  }
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (endIdx === -1) {
    throw new Error('SKILL.md frontmatter not closed — cannot auto-apply');
  }

  // Replace the description: line within frontmatter
  let replaced = false;
  for (let i = 1; i < endIdx; i++) {
    if (lines[i].match(/^description:/)) {
      lines[i] = `description: "${newDescription.replace(/"/g, '\\"')}"`;
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    // Insert after name: line
    for (let i = 1; i < endIdx; i++) {
      if (lines[i].match(/^name:/)) {
        lines.splice(i + 1, 0, `description: "${newDescription.replace(/"/g, '\\"')}"`);
        break;
      }
    }
  }

  writeFileSync(skillFile, lines.join('\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.skill) {
    console.error('Error: --skill NAME is required.');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  if (!opts.dryRun && !checkCopilotCli()) {
    console.error('Error: Copilot CLI not found. Install from https://docs.github.com/copilot/copilot-cli');
    console.error('Use --dry-run to preview prompts without calling the LLM.');
    process.exit(1);
  }

  const skillName = opts.skill;

  // Load all skills
  const { skills, warnings } = loadSkills();
  for (const w of warnings) console.log(w);

  if (!skills.has(skillName)) {
    console.error(`Error: Skill "${skillName}" not found. Known skills: ${[...skills.keys()].sort().join(', ')}`);
    process.exit(1);
  }

  // Load eval fixture
  const fixture = loadEvalFixture(skillName);
  if (!fixture) {
    console.error(`Error: No eval fixture found for "${skillName}". Expected: ${join(EVALS_DIR, `${skillName}.eval.yaml`)}`);
    process.exit(1);
  }

  if (fixture.cases.length < 2) {
    console.error(`Error: Eval fixture for "${skillName}" has too few cases (${fixture.cases.length}). Need at least 2.`);
    process.exit(1);
  }

  const { train, validation } = splitCases(fixture.cases);

  const skillRecord = skills.get(skillName);
  const skillFile = skillRecord.skillFile;
  const originalDescription = skillRecord.description;
  const skillBody = extractSkillBody(skillFile);

  console.log('━'.repeat(72));
  console.log(`  Skill Description Optimizer — ${skillName}`);
  console.log('━'.repeat(72));
  console.log(`Train cases:      ${train.length}`);
  console.log(`Validation cases: ${validation.length}`);
  console.log(`Max iterations:   ${opts.maxIterations}`);
  console.log(`Model:            ${opts.model}`);
  if (opts.dryRun) console.log('  ⚠ DRY RUN — no LLM calls will be made');
  console.log();

  // Evaluate initial description
  const initTrain = runKeywordEval(skillName, train, skills, originalDescription);
  const initVal   = runKeywordEval(skillName, validation, skills, originalDescription);

  console.log(`Current description:\n  "${originalDescription}"`);
  console.log(`Train: ${initTrain.passed}/${initTrain.total} | Validation: ${initVal.passed}/${initVal.total}`);
  console.log();

  // History tracks all attempts (iteration 0 = original)
  const history = [
    {
      iteration: 0,
      description: originalDescription,
      train_passed: initTrain.passed,
      train_total: initTrain.total,
      validation_passed: initVal.passed,
      validation_total: initVal.total,
    },
  ];

  let currentDescription = originalDescription;
  let bestEntry = history[0];

  // Check if already perfect
  if (initTrain.passed === initTrain.total) {
    console.log('✅ All train cases already pass! No optimization needed.');
  } else {
    for (let iter = 1; iter <= opts.maxIterations; iter++) {
      console.log(`Iteration ${iter}:`);

      // Get current train failures for feedback
      const trainResult = runKeywordEval(skillName, train, skills, currentDescription);

      const prompt = buildImprovementPrompt({
        skillName,
        currentDescription,
        trainPassed: trainResult.passed,
        trainTotal: trainResult.total,
        trainFailures: trainResult.failures,
        history: history.slice(0, -0 || undefined), // all history so far
        skillBody,
      });

      let newDescription = null;

      try {
        newDescription = callLlm(prompt, opts.model, opts.dryRun);
      } catch (err) {
        console.error(`  ✗ LLM call failed: ${err.message}`);
        break;
      }

      if (opts.dryRun || newDescription === null) {
        console.log('  (dry-run — skipping eval for this iteration)');
        break;
      }

      // Strip any wrapping quotes the LLM may have added
      newDescription = newDescription.replace(/^["']|["']$/g, '').trim();

      // Enforce character limit — call LLM to shorten if needed
      if (newDescription.length > MAX_DESCRIPTION_CHARS) {
        console.log(`  ⚠ Description too long (${newDescription.length} chars) — requesting shorter version`);
        const shortenPrompt = `The following skill description is ${newDescription.length} characters, which exceeds the ${MAX_DESCRIPTION_CHARS} character limit. Rewrite it to be under ${MAX_DESCRIPTION_CHARS} characters while preserving all key trigger information. Reply with ONLY the new description text, no quotes, no preamble.\n\n${newDescription}`;
        try {
          newDescription = callLlm(shortenPrompt, opts.model, false);
          newDescription = newDescription.replace(/^["']|["']$/g, '').trim();
        } catch (err) {
          console.error(`  ✗ Shorten call failed: ${err.message}`);
          break;
        }
      }

      // Eval new description
      const newTrain = runKeywordEval(skillName, train, skills, newDescription);
      const newVal   = runKeywordEval(skillName, validation, skills, newDescription);

      const entry = {
        iteration: iter,
        description: newDescription,
        train_passed: newTrain.passed,
        train_total: newTrain.total,
        validation_passed: newVal.passed,
        validation_total: newVal.total,
      };
      history.push(entry);

      console.log(`  New description: "${newDescription}"`);
      console.log(`  Train: ${newTrain.passed}/${newTrain.total} | Validation: ${newVal.passed}/${newVal.total}`);

      currentDescription = newDescription;

      // Update best by validation score, break ties with train score
      const bestVal = bestEntry.validation_passed / (bestEntry.validation_total || 1);
      const bestTrn = bestEntry.train_passed / (bestEntry.train_total || 1);
      const newV    = newVal.passed / (newVal.total || 1);
      const newT    = newTrain.passed / (newTrain.total || 1);

      if (newV > bestVal || (newV === bestVal && newT > bestTrn)) {
        bestEntry = entry;
      }

      if (newTrain.passed === newTrain.total) {
        console.log('  ✅ All train cases pass!');
        break;
      }

      console.log();
    }
  }

  // Final output
  console.log();
  console.log('━'.repeat(72));
  console.log('  Best Description (by validation score)');
  console.log('━'.repeat(72));
  console.log(`  "${bestEntry.description}"`);
  console.log(`  (iteration ${bestEntry.iteration}, validation: ${bestEntry.validation_passed}/${bestEntry.validation_total})`);
  console.log();

  if (bestEntry.iteration === 0) {
    console.log('ℹ The original description was already the best or no improvement was found.');
  }

  if (!opts.dryRun) {
    console.log(`To apply: update the 'description' field in ${skillFile}`);
  }

  // Save JSON results
  const resultsFile = join(EVALS_DIR, `optimization-${skillName}.json`);
  const output = {
    skill: skillName,
    original_description: originalDescription,
    best_description: bestEntry.description,
    best_iteration: bestEntry.iteration,
    best_validation_score: `${bestEntry.validation_passed}/${bestEntry.validation_total}`,
    best_train_score: `${bestEntry.train_passed}/${bestEntry.train_total}`,
    model: opts.model,
    history,
  };

  if (!opts.dryRun) {
    writeFileSync(resultsFile, JSON.stringify(output, null, 2), 'utf8');
    console.log(`\nResults saved to: ${resultsFile}`);
  }

  // Auto-apply if requested
  if (opts.apply && !opts.dryRun && bestEntry.iteration > 0) {
    try {
      applyDescription(skillFile, bestEntry.description);
      console.log(`\n✅ Applied best description to: ${skillFile}`);
    } catch (err) {
      console.error(`\n✗ Failed to apply description: ${err.message}`);
    }
  } else if (opts.apply && opts.dryRun) {
    console.log('\n⚠ --apply is ignored in dry-run mode.');
  } else if (opts.apply && bestEntry.iteration === 0) {
    console.log('\nℹ --apply skipped — original description was already the best.');
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
