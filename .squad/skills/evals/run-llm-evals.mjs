#!/usr/bin/env node
/**
 * Phase 2 — LLM Skill Eval Runner (v2)
 * Comprehensive evaluation system supporting two eval types:
 *
 *   Trigger evals  — Does the right skill trigger on the right prompt?
 *   Execution evals — Does the skill produce correct outputs when invoked?
 *
 * Usage:
 *   node run-llm-evals.mjs [options]
 *
 * Options:
 *   --type trigger|exec|all   Eval type (default: trigger)
 *   --dry-run                 Print prompts without calling the LLM
 *   --model <name>            LLM model to use (default: claude-haiku-4.5)
 *   --runs <N>                Times to run each trigger case (default: 1)
 *   --batch <N>               Process at most N cases (default: all)
 *   --split                   Split trigger cases 60/40 train/validation
 *   --skill <name>            Only run evals for this skill
 *   --timeout <ms>            LLM call timeout in ms (default: 60000)
 *   --verbose                 Show individual case results
 *   --help                    Show this help text
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const RESULTS_FILE = join(__dirname, 'llm-eval-results.json');
const EXEC_RESULTS_FILE = join(__dirname, 'exec-eval-results.json');

const SKILL_DIRS = [
  { path: join(REPO_ROOT, '.squad', 'skills'), label: '.squad/skills' },
  { path: join(REPO_ROOT, '.copilot', 'skills'), label: '.copilot/skills' },
  { path: join(REPO_ROOT, 'templates', 'skills'), label: 'templates/skills' },
];
const EVALS_DIR = __dirname;

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    type: 'trigger',
    dryRun: false,
    model: 'claude-haiku-4.5',
    runs: 1,
    batch: Infinity,
    split: false,
    skillFilter: null,
    timeout: 60_000,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':   opts.dryRun = true; break;
      case '--split':     opts.split = true; break;
      case '--verbose':   opts.verbose = true; break;
      case '--help':      opts.help = true; break;
      case '--type':      opts.type = args[++i]; break;
      case '--model':     opts.model = args[++i]; break;
      case '--runs':      opts.runs = Math.max(1, parseInt(args[++i], 10) || 1); break;
      case '--batch':     opts.batch = Math.max(1, parseInt(args[++i], 10) || Infinity); break;
      case '--skill':     opts.skillFilter = args[++i]; break;
      case '--timeout':   opts.timeout = Math.max(5000, parseInt(args[++i], 10) || 60_000); break;
    }
  }

  if (!['trigger', 'exec', 'all'].includes(opts.type)) {
    console.error(`❌  Unknown --type "${opts.type}". Must be: trigger, exec, or all`);
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
Phase 2 — LLM Skill Eval Runner (v2)
=====================================
Supports trigger evals (does the skill activate?) and execution evals (does it produce correct output?).

Usage:
  node run-llm-evals.mjs [options]

Options:
  --type trigger|exec|all   Eval type to run (default: trigger)
  --dry-run                 Print prompts without calling the LLM
  --model <name>            LLM model to use (default: claude-haiku-4.5)
  --runs <N>                Times to run each trigger case (default: 1; use 3+ for nondeterminism)
  --batch <N>               Process at most N cases (default: all)
  --split                   Split trigger cases 60/40 train/validation and report both sets
  --skill <name>            Only run evals for the named skill
  --timeout <ms>            Timeout per LLM call in ms (default: 60000)
  --verbose                 Show individual case results
  --help                    Show this help text

Examples:
  node run-llm-evals.mjs --dry-run
  node run-llm-evals.mjs --type trigger --runs 3 --model claude-haiku-4.5
  node run-llm-evals.mjs --type exec --skill model-selection --verbose
  node run-llm-evals.mjs --type all --skill git-workflow
  node run-llm-evals.mjs --type trigger --split --runs 3
`.trim());
}

// ---------------------------------------------------------------------------
// YAML parser — inline, no external deps
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
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
        if (Object.keys(nestedObj).length > 0) {
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

/**
 * Parse a trigger eval YAML file.
 * Fields per case: prompt, type, expect, reason
 */
function parseEvalYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
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
      // section header, skip
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
    } else if (
      currentField === 'prompt' &&
      (raw.startsWith('  ') || raw.startsWith('\t')) &&
      line !== ''
    ) {
      if (!currentCase.prompt.endsWith(' ')) currentCase.prompt += ' ';
      currentCase.prompt += line;
    }
    i++;
  }
  if (currentCase) result.cases.push(currentCase);
  return result;
}

/**
 * Parse an execution eval YAML file (.exec-eval.yaml).
 * Fields per case: id, prompt, skill_context, expected_output, assertions[], category, notes
 */
function parseExecEvalYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const result = { skill: '', description: '', cases: [] };
  let currentCase = null;
  let currentField = null;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (line.startsWith('skill:') && !raw.startsWith(' ') && !raw.startsWith('\t')) {
      result.skill = line.replace('skill:', '').trim().replace(/^"|"$/g, '');
    } else if (line.startsWith('description:') && !raw.startsWith(' ') && !raw.startsWith('\t')) {
      result.description = line.replace('description:', '').trim().replace(/^"|"$/g, '');
    } else if (line === 'cases:') {
      currentCase = null;
      currentField = null;
    } else if (line.startsWith('- id:')) {
      if (currentCase) result.cases.push(currentCase);
      currentCase = {
        id: line.replace('- id:', '').trim().replace(/^"|"$/g, ''),
        prompt: '',
        skill_context: 'full',
        expected_output: '',
        assertions: [],
        category: 'execution',
        notes: '',
      };
      currentField = 'id';
    } else if (currentCase && line.startsWith('prompt:')) {
      currentCase.prompt = line.replace('prompt:', '').trim().replace(/^"|"$/g, '');
      currentField = 'prompt';
    } else if (currentCase && line.startsWith('skill_context:')) {
      currentCase.skill_context = line.replace('skill_context:', '').trim().replace(/^"|"$/g, '');
      currentField = 'skill_context';
    } else if (currentCase && line.startsWith('expected_output:')) {
      currentCase.expected_output = line.replace('expected_output:', '').trim().replace(/^"|"$/g, '');
      currentField = 'expected_output';
    } else if (currentCase && line.startsWith('category:')) {
      currentCase.category = line.replace('category:', '').trim().replace(/^"|"$/g, '');
      currentField = 'category';
    } else if (currentCase && line.startsWith('notes:')) {
      currentCase.notes = line.replace('notes:', '').trim().replace(/^"|"$/g, '');
      currentField = 'notes';
    } else if (currentCase && line === 'assertions:') {
      currentField = 'assertions';
    } else if (currentCase && currentField === 'assertions' && line.startsWith('- ')) {
      currentCase.assertions.push(line.slice(2).trim().replace(/^"|"$/g, ''));
    } else if (
      currentCase &&
      (currentField === 'prompt' || currentField === 'expected_output' || currentField === 'notes') &&
      (raw.startsWith('  ') || raw.startsWith('\t')) &&
      line !== ''
    ) {
      if (currentCase[currentField]) currentCase[currentField] += ' ';
      currentCase[currentField] += line;
    }
    i++;
  }
  if (currentCase) result.cases.push(currentCase);
  return result;
}

// ---------------------------------------------------------------------------
// Skill loader
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
          warnings.push(`⚠ Duplicate skill "${name}" — preferring .copilot/ version`);
          skills.set(name, { name, description, dir: join(dir, entry.name), prefix, fullText: text });
        } else {
          warnings.push(`⚠ Duplicate skill "${name}" in ${prefix} — keeping existing`);
        }
      } else {
        skills.set(name, { name, description, dir: join(dir, entry.name), prefix, fullText: text });
      }
    }
  }

  return { skills, warnings };
}

// ---------------------------------------------------------------------------
// Eval fixture loaders
// ---------------------------------------------------------------------------

function loadEvals(skillFilter) {
  const fixtures = new Map();
  const evalFiles = readdirSync(EVALS_DIR).filter(f => f.endsWith('.eval.yaml'));
  for (const file of evalFiles) {
    const text = readFileSync(join(EVALS_DIR, file), 'utf8');
    const parsed = parseEvalYaml(text);
    if (!parsed.skill) continue;
    if (skillFilter && parsed.skill !== skillFilter) continue;
    fixtures.set(parsed.skill, parsed.cases);
  }
  return fixtures;
}

function loadExecEvals(skillFilter) {
  const fixtures = new Map();
  const evalFiles = readdirSync(EVALS_DIR).filter(f => f.endsWith('.exec-eval.yaml'));
  for (const file of evalFiles) {
    const text = readFileSync(join(EVALS_DIR, file), 'utf8');
    const parsed = parseExecEvalYaml(text);
    if (!parsed.skill) continue;
    if (skillFilter && parsed.skill !== skillFilter) continue;
    fixtures.set(parsed.skill, parsed);
  }
  return fixtures;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildTriggerSystemPrompt(skills) {
  const skillList = [...skills.values()]
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n');

  return `You are a skill matching engine. Given a list of available skills (each with a name and description), determine which skill best matches the user's request.

Available skills:
${skillList}

Rules:
- Reply with ONLY the skill name that best matches, or "none" if no skill is relevant.
- Choose the single most specific match.
- Do not explain your reasoning.`;
}

function buildTriggerCombinedPrompt(systemPrompt, userPrompt) {
  return `${systemPrompt}

User request: ${userPrompt}`;
}

function buildExecSystemPrompt(skillText) {
  return `You are a skilled assistant with access to the following skill definition. Apply this skill's knowledge and rules when responding to the user.

## Skill Definition
${skillText}

Follow the skill's guidance precisely. Produce concrete, actionable output as the skill instructs.`;
}

function buildGradingPrompt(output, assertions) {
  const numbered = assertions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  return `You are an eval grader. Given the actual output from a skill-assisted agent and a list of assertions about what the output should contain, evaluate each assertion.

## Actual Output
${output}

## Assertions to Check
${numbered}

## Instructions
For each assertion, respond with exactly this JSON format:
[
  {"assertion": "text", "passed": true, "evidence": "specific quote or observation from the output"},
  {"assertion": "text", "passed": false, "evidence": "what was missing or wrong"}
]

Be strict: require concrete evidence for a PASS. If the output is vague where the assertion requires specificity, that is a FAIL. Output ONLY the JSON array, nothing else.`;
}

// ---------------------------------------------------------------------------
// LLM invocation
// ---------------------------------------------------------------------------

let copilotAvailable = null;

function checkCopilotCli() {
  if (copilotAvailable !== null) return copilotAvailable;
  try {
    execSync('copilot --version', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    copilotAvailable = true;
  } catch {
    copilotAvailable = false;
  }
  return copilotAvailable;
}

/**
 * Escape a string for safe use inside a double-quoted shell argument on Windows.
 */
function escapeForShell(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, "'")
    .replace(/\r?\n/g, ' ');
}

function callLlm(prompt, model, opts) {
  if (opts.dryRun) {
    return '(dry-run)';
  }

  if (!checkCopilotCli()) {
    throw new Error(
      'Phase 2 requires the Copilot CLI. Install from https://docs.github.com/copilot/copilot-cli'
    );
  }

  const escaped = escapeForShell(prompt);
  const cmd = `copilot -p "${escaped}" --model ${model}`;

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim();
  } catch (err) {
    const msg = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`LLM call failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseSkillFromResponse(response, knownSkillNames) {
  if (!response || response === '(dry-run)') return response;

  const normalized = response.toLowerCase().trim();

  for (const name of knownSkillNames) {
    if (normalized === name.toLowerCase()) return name;
  }

  for (const name of knownSkillNames) {
    if (normalized.includes(name.toLowerCase())) return name;
  }

  if (normalized === 'none' || normalized === '' || normalized === 'n/a') return 'none';

  return response.trim().toLowerCase();
}

/**
 * Parse the LLM-as-judge grading response into structured assertion results.
 * Expects a JSON array but falls back to heuristic parsing if malformed.
 */
function parseGradingResponse(response, assertions) {
  if (!response || response === '(dry-run)') {
    return assertions.map(a => ({ assertion: a, passed: null, evidence: '(dry-run)' }));
  }

  // Extract JSON array from response (may have surrounding text)
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => ({
          assertion: item.assertion || assertions[idx] || '',
          passed: typeof item.passed === 'boolean' ? item.passed : null,
          evidence: item.evidence || '',
        }));
      }
    } catch {
      // fall through to heuristic
    }
  }

  // Heuristic: look for PASS/FAIL per assertion
  return assertions.map((assertion, idx) => {
    const pattern = new RegExp(`${idx + 1}[.)\\s].*?(PASS|FAIL)`, 'i');
    const match = response.match(pattern);
    if (match) {
      return {
        assertion,
        passed: match[1].toUpperCase() === 'PASS',
        evidence: match[0].trim(),
      };
    }
    return { assertion, passed: null, evidence: '(could not parse grader response)' };
  });
}

// ---------------------------------------------------------------------------
// Pass/fail evaluation
// ---------------------------------------------------------------------------

function evaluateTriggerCase(tc, parsedResponse, skillName) {
  const { expect } = tc;

  if (parsedResponse === '(dry-run)') return null;

  if (expect === 'match') {
    return parsedResponse === skillName;
  } else if (expect === 'no-match') {
    return parsedResponse !== skillName;
  } else if (expect.startsWith('not:')) {
    const excluded = expect.slice(4).trim();
    return parsedResponse !== excluded;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Train/validation split (deterministic)
// ---------------------------------------------------------------------------

function deterministicSplit(cases, trainFrac = 0.6) {
  const sorted = [...cases].sort((a, b) => a.prompt.localeCompare(b.prompt));
  const cutoff = Math.ceil(sorted.length * trainFrac);
  return { train: sorted.slice(0, cutoff), validation: sorted.slice(cutoff) };
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

function pad(str, len, right = false) {
  const s = String(str);
  return right ? s.padStart(len) : s.padEnd(len);
}

function renderTriggerTable(perSkillStats, label) {
  const SEP = '─'.repeat(80);
  console.log(`\n${label}`);
  console.log('═'.repeat(80));

  const header =
    `${pad('Skill', 32)} ${pad('TrigRate', 9, true)} ${pad('Pos', 6, true)} ${pad('Neg', 6, true)} ${pad('Edge', 6, true)} ${pad('Total', 6, true)} ${pad('Pass%', 7, true)}`;
  console.log(header);
  console.log(SEP);

  let totalPass = 0, totalCases = 0;

  for (const [name, r] of [...perSkillStats.entries()].sort()) {
    if (r.total === 0) continue;
    const passRate = r.pass / r.total;
    const trigRate = r.triggerRateSum / r.total;
    const pct = (passRate * 100).toFixed(0) + '%';
    const trigger = trigRate.toFixed(2);
    const status = passRate === 1 ? '✓' : passRate >= 0.8 ? '~' : '✗';
    console.log(
      `${status} ${pad(name, 30)} ${pad(trigger, 9, true)} ${pad(r.pos, 6, true)} ${pad(r.neg, 6, true)} ${pad(r.edge, 6, true)} ${pad(r.total, 6, true)} ${pad(pct, 7, true)}`
    );
    totalPass += r.pass;
    totalCases += r.total;
  }

  const overallPct = totalCases > 0 ? ((totalPass / totalCases) * 100).toFixed(1) : '0.0';
  console.log(SEP);
  console.log(`  Overall: ${totalPass}/${totalCases} passed (${overallPct}%)`);
  return { totalPass, totalCases };
}

function renderExecTable(execResults) {
  const SEP = '─'.repeat(80);
  console.log('\nExecution Eval Results');
  console.log('═'.repeat(80));

  const header =
    `${pad('Skill', 32)} ${pad('Assertions', 12, true)} ${pad('PassRate', 10, true)} ${pad('Cases', 7, true)}`;
  console.log(header);
  console.log(SEP);

  let grandTotal = 0, grandPassed = 0;
  const bySkill = new Map();

  for (const c of execResults) {
    if (!bySkill.has(c.skill)) bySkill.set(c.skill, { total: 0, passed: 0, cases: 0 });
    const rec = bySkill.get(c.skill);
    rec.cases++;
    for (const a of c.assertions) {
      rec.total++;
      grandTotal++;
      if (a.passed === true) { rec.passed++; grandPassed++; }
    }
  }

  for (const [name, r] of [...bySkill.entries()].sort()) {
    const pct = r.total > 0 ? ((r.passed / r.total) * 100).toFixed(0) + '%' : 'n/a';
    const assertStr = `${r.passed}/${r.total}`;
    const status = r.total > 0 && r.passed === r.total ? '✓' : r.total > 0 && r.passed / r.total >= 0.8 ? '~' : '✗';
    console.log(
      `${status} ${pad(name, 30)} ${pad(assertStr, 12, true)} ${pad(pct, 10, true)} ${pad(r.cases, 7, true)}`
    );
  }

  const overallPct = grandTotal > 0 ? ((grandPassed / grandTotal) * 100).toFixed(1) : '0.0';
  console.log(SEP);
  console.log(`  Overall: ${grandPassed}/${grandTotal} assertions passed (${overallPct}%)`);
  return { totalPass: grandPassed, totalCases: grandTotal };
}

// ---------------------------------------------------------------------------
// Trigger eval runner
// ---------------------------------------------------------------------------

function runTriggerEvals(opts, skills) {
  const fixtures = loadEvals(opts.skillFilter);
  console.log(`✓ Loaded ${fixtures.size} trigger eval fixtures`);

  const systemPrompt = buildTriggerSystemPrompt(skills);
  const knownSkillNames = [...skills.keys()];

  let allCases = [];
  for (const [skillName, cases] of fixtures.entries()) {
    if (!skills.has(skillName)) {
      console.log(`⚠ Fixture for unknown skill "${skillName}" — skipping`);
      continue;
    }
    for (const tc of cases) {
      allCases.push({ skillName, ...tc });
    }
  }

  if (opts.batch < allCases.length) {
    console.log(`ℹ Batch limit: processing first ${opts.batch} of ${allCases.length} cases`);
    allCases = allCases.slice(0, opts.batch);
  }

  let trainCases = null, validationCases = null;
  if (opts.split) {
    const trainArr = [], valArr = [];
    const bySkill = new Map();
    for (const tc of allCases) {
      if (!bySkill.has(tc.skillName)) bySkill.set(tc.skillName, []);
      bySkill.get(tc.skillName).push(tc);
    }
    for (const cases of bySkill.values()) {
      const { train, validation } = deterministicSplit(cases);
      trainArr.push(...train);
      valArr.push(...validation);
    }
    trainCases = trainArr;
    validationCases = valArr;
  }

  const totalEvals = allCases.length * opts.runs;
  console.log(`⚡ Running ${allCases.length} trigger cases × ${opts.runs} run(s) = ${totalEvals} LLM calls\n`);

  const initSkillStat = () => ({ pos: 0, neg: 0, edge: 0, total: 0, pass: 0, triggerRateSum: 0 });
  const allStats = new Map();
  const trainStats = new Map();
  const valStats = new Map();
  for (const name of skills.keys()) {
    allStats.set(name, initSkillStat());
    trainStats.set(name, initSkillStat());
    valStats.set(name, initSkillStat());
  }

  const jsonResults = [];
  const failures = [];
  let processed = 0;

  for (const tc of allCases) {
    const { skillName, prompt, type, expect, reason } = tc;
    const combinedPrompt = buildTriggerCombinedPrompt(systemPrompt, prompt);

    if (opts.dryRun) {
      console.log(`[DRY-RUN] skill=${skillName} type=${type}`);
      console.log(`  Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"`);
      console.log(`  Full LLM input (${combinedPrompt.length} chars)`);
    }

    const llmResponses = [];
    let passCount = 0;

    for (let run = 0; run < opts.runs; run++) {
      let rawResponse;
      try {
        rawResponse = callLlm(combinedPrompt, opts.model, opts);
      } catch (err) {
        console.error(`\n❌  LLM call failed for case [${skillName}]: ${err.message}`);
        rawResponse = 'error';
      }
      const parsed = parseSkillFromResponse(rawResponse, knownSkillNames);
      llmResponses.push(parsed);
      const result = evaluateTriggerCase(tc, parsed, skillName);
      if (result === true) passCount++;
    }

    processed++;
    const triggerRate = opts.dryRun ? null : passCount / opts.runs;
    const casePassed = opts.dryRun ? null : passCount === opts.runs;

    const rec = allStats.get(skillName);
    if (rec) {
      rec.total++;
      if (type === 'positive') rec.pos++;
      else if (type === 'negative') rec.neg++;
      else if (type === 'edge') rec.edge++;
      if (!opts.dryRun) {
        if (casePassed) rec.pass++;
        rec.triggerRateSum += triggerRate;
        if (!casePassed) {
          failures.push({ skillName, type, prompt, expect, responses: llmResponses, triggerRate, reason });
        }
        if (opts.verbose) {
          const icon = casePassed ? '  ✓' : '  ✗';
          console.log(`${icon} [${type}] ${skillName}: got "${llmResponses.join(',')}" (rate: ${triggerRate.toFixed(2)})`);
        }
      }
    }

    if (opts.split && !opts.dryRun) {
      const isInTrain = trainCases.some(c => c.skillName === skillName && c.prompt === prompt);
      const targetMap = isInTrain ? trainStats : valStats;
      const splitRec = targetMap.get(skillName) || initSkillStat();
      splitRec.total++;
      if (type === 'positive') splitRec.pos++;
      else if (type === 'negative') splitRec.neg++;
      else if (type === 'edge') splitRec.edge++;
      if (casePassed) splitRec.pass++;
      splitRec.triggerRateSum += triggerRate;
      targetMap.set(skillName, splitRec);
    }

    jsonResults.push({
      id: `${skillName}-${type}-${String(processed).padStart(3, '0')}`,
      prompt,
      expected_skill: skillName,
      should_activate: expect === 'match',
      llm_responses: llmResponses,
      trigger_rate: triggerRate,
      passed: casePassed,
    });

    if (processed % 10 === 0 || processed === allCases.length) {
      process.stdout.write(`\r  Progress: ${processed}/${allCases.length}   `);
    }
  }

  console.log('\n');

  if (opts.dryRun) {
    return { jsonResults, allStats, trainStats, valStats, failures, trainCases, validationCases };
  }

  const { totalPass, totalCases } = renderTriggerTable(
    allStats,
    `Trigger Results (model: ${opts.model}, runs: ${opts.runs})`
  );

  if (opts.split) {
    renderTriggerTable(trainStats, 'Train Set (60%)');
    renderTriggerTable(valStats, 'Validation Set (40%)');
  }

  if (failures.length > 0) {
    console.log('\n' + '━'.repeat(80));
    console.log('  Trigger Failures');
    console.log('─'.repeat(80));
    for (const f of failures) {
      console.log(`\n[${f.type.toUpperCase()}] ${f.skillName}`);
      console.log(`  Prompt:       "${f.prompt.slice(0, 100)}"`);
      console.log(`  Expected:     ${f.expect}`);
      console.log(`  LLM returned: ${f.responses.join(', ')} (rate: ${f.triggerRate.toFixed(2)})`);
      if (f.reason) console.log(`  Reason:       ${f.reason}`);
    }
  }

  const overallPct = totalCases > 0 ? (totalPass / totalCases) * 100 : 0;
  return {
    jsonResults,
    allStats,
    trainStats,
    valStats,
    failures,
    trainCases,
    validationCases,
    summary: { totalPass, totalCases, overallPct },
  };
}

// ---------------------------------------------------------------------------
// Execution eval runner
// ---------------------------------------------------------------------------

function runExecEvals(opts, skills) {
  const fixtures = loadExecEvals(opts.skillFilter);
  console.log(`✓ Loaded ${fixtures.size} execution eval fixtures`);

  let allCases = [];
  for (const [skillName, fixture] of fixtures.entries()) {
    const skill = skills.get(skillName);
    if (!skill) {
      console.log(`⚠ Exec fixture for unknown skill "${skillName}" — skipping`);
      continue;
    }
    for (const tc of fixture.cases) {
      allCases.push({ skillName, skillFullText: skill.fullText, ...tc });
    }
  }

  if (opts.batch < allCases.length) {
    console.log(`ℹ Batch limit: processing first ${opts.batch} of ${allCases.length} cases`);
    allCases = allCases.slice(0, opts.batch);
  }

  console.log(`⚡ Running ${allCases.length} exec cases (2 LLM calls each = ${allCases.length * 2} total)\n`);

  const execCaseResults = [];
  let processed = 0;

  for (const tc of allCases) {
    const { id, skillName, skillFullText, prompt, assertions, skill_context } = tc;

    if (opts.dryRun) {
      console.log(`[DRY-RUN exec] ${id}`);
      console.log(`  Skill: ${skillName}`);
      console.log(`  Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"`);
      console.log(`  Assertions: ${assertions.length}`);
      execCaseResults.push({
        id,
        skill: skillName,
        prompt,
        output: '(dry-run)',
        assertions: assertions.map(a => ({ assertion: a, passed: null, evidence: '(dry-run)' })),
        pass_rate: null,
      });
      processed++;
      continue;
    }

    // Step 1: Run the skill with the prompt
    const useFullContext = !skill_context || skill_context === 'full';
    const skillContext = useFullContext ? skillFullText : `# ${skillName}\n(context omitted)`;
    const execSystemPrompt = buildExecSystemPrompt(skillContext);
    const execCombined = `${execSystemPrompt}\n\nUser: ${prompt}`;

    let output = '';
    try {
      console.log(`  ▶ [${id}] Running skill invocation...`);
      output = callLlm(execCombined, opts.model, opts);
    } catch (err) {
      console.error(`  ❌ Skill invocation failed for [${id}]: ${err.message}`);
      output = `(error: ${err.message})`;
    }

    if (opts.verbose) {
      console.log(`  Output (${output.length} chars): "${output.slice(0, 120)}${output.length > 120 ? '…' : ''}"`);
    }

    // Step 2: Grade the output with LLM-as-judge
    const gradingPrompt = buildGradingPrompt(output, assertions);
    let gradingResponse = '';
    let assertionResults = [];

    try {
      console.log(`  ▶ [${id}] Grading ${assertions.length} assertions...`);
      gradingResponse = callLlm(gradingPrompt, opts.model, opts);
      assertionResults = parseGradingResponse(gradingResponse, assertions);
    } catch (err) {
      console.error(`  ❌ Grading failed for [${id}]: ${err.message}`);
      assertionResults = assertions.map(a => ({ assertion: a, passed: null, evidence: `(grading error: ${err.message})` }));
    }

    const passedCount = assertionResults.filter(a => a.passed === true).length;
    const passRate = assertions.length > 0 ? passedCount / assertions.length : 0;

    if (opts.verbose) {
      for (const ar of assertionResults) {
        const icon = ar.passed === true ? '    ✓' : ar.passed === false ? '    ✗' : '    ?';
        console.log(`${icon} ${ar.assertion.slice(0, 70)}`);
        if (ar.evidence) console.log(`       Evidence: ${ar.evidence.slice(0, 100)}`);
      }
    }

    console.log(`  ${passedCount}/${assertions.length} assertions passed (${(passRate * 100).toFixed(0)}%) — ${id}`);

    execCaseResults.push({
      id,
      skill: skillName,
      prompt,
      output,
      assertions: assertionResults,
      pass_rate: passRate,
    });

    processed++;
    process.stdout.write(`\r  Progress: ${processed}/${allCases.length}   `);
  }

  console.log('\n');

  if (opts.dryRun) {
    return { cases: execCaseResults, summary: null };
  }

  const { totalPass, totalCases } = renderExecTable(execCaseResults);

  const totalAssertions = execCaseResults.reduce((s, c) => s + c.assertions.length, 0);
  const passedAssertions = execCaseResults.reduce(
    (s, c) => s + c.assertions.filter(a => a.passed === true).length,
    0
  );
  const overallPct = totalAssertions > 0 ? (passedAssertions / totalAssertions) * 100 : 0;

  return {
    cases: execCaseResults,
    summary: {
      total_assertions: totalAssertions,
      passed: passedAssertions,
      pass_rate: totalAssertions > 0 ? passedAssertions / totalAssertions : 0,
      overallPct,
    },
  };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const runTrigger = opts.type === 'trigger' || opts.type === 'all';
  const runExec = opts.type === 'exec' || opts.type === 'all';

  console.log('━'.repeat(80));
  console.log('  Phase 2 — LLM Skill Eval Runner (v2)');
  console.log('━'.repeat(80));
  console.log(`  Type:     ${opts.type}`);
  console.log(`  Model:    ${opts.model}`);
  if (runTrigger) console.log(`  Runs:     ${opts.runs}`);
  console.log(`  Timeout:  ${opts.timeout}ms`);
  console.log(`  Dry-run:  ${opts.dryRun}`);
  if (opts.skillFilter) console.log(`  Filter:   ${opts.skillFilter}`);
  if (opts.split && runTrigger) console.log(`  Split:    60% train / 40% validation`);
  console.log();

  const { skills, warnings } = loadSkills();
  for (const w of warnings) console.log(w);
  console.log(`✓ Loaded ${skills.size} skills\n`);

  if (!opts.dryRun) {
    if (!checkCopilotCli()) {
      console.error('❌  Phase 2 requires the Copilot CLI.');
      console.error('    Install from: https://docs.github.com/copilot/copilot-cli');
      console.error('');
      console.error('    To test without LLM calls, use: --dry-run');
      process.exit(2);
    }
    console.log('✓ Copilot CLI detected\n');
  }

  let triggerSummary = null;
  let execSummary = null;
  let triggerJsonResults = [];
  let execJsonResults = [];

  // ── Trigger evals ──
  if (runTrigger) {
    console.log('── Trigger Evals ─────────────────────────────────────────────────────────────');
    const result = runTriggerEvals(opts, skills);
    triggerSummary = result.summary || null;
    triggerJsonResults = result.jsonResults || [];
  }

  // ── Execution evals ──
  if (runExec) {
    console.log('── Execution Evals ───────────────────────────────────────────────────────────');
    const result = runExecEvals(opts, skills);
    execSummary = result.summary || null;
    execJsonResults = result.cases || [];
  }

  // ── Combined summary ──
  console.log('\n' + '━'.repeat(80));
  console.log('  Phase 2 — LLM Skill Eval Results');
  console.log('━'.repeat(80));
  console.log(`  Mode: ${opts.type} | Model: ${opts.model}${runTrigger ? ` | Runs: ${opts.runs}` : ''}`);
  console.log();

  let overallPass = true;

  if (opts.dryRun) {
    console.log('  Dry-run complete — no LLM calls made.');
  } else {
    if (triggerSummary) {
      const pct = triggerSummary.overallPct.toFixed(1);
      const icon = triggerSummary.overallPct >= 80 ? '✓' : '✗';
      console.log(`  ${icon} Trigger:   ${triggerSummary.totalPass}/${triggerSummary.totalCases} passed (${pct}%)`);
      if (triggerSummary.overallPct < 80) overallPass = false;
    }
    if (execSummary) {
      const pct = execSummary.overallPct.toFixed(1);
      const icon = execSummary.overallPct >= 80 ? '✓' : '✗';
      console.log(`  ${icon} Execution: ${execSummary.passed}/${execSummary.total_assertions} assertions passed (${pct}%)`);
      if (execSummary.overallPct < 80) overallPass = false;
    }
    console.log();
    console.log(`  Overall: ${overallPass ? '✓ PASS' : '✗ FAIL'}`);
  }

  console.log('━'.repeat(80));

  // ── Save results ──
  if (!opts.dryRun) {
    const timestamp = new Date().toISOString();

    if (triggerJsonResults.length > 0) {
      const passedCount = triggerJsonResults.filter(r => r.passed === true).length;
      const jsonOutput = {
        type: 'trigger',
        model: opts.model,
        runs_per_case: opts.runs,
        timestamp,
        trigger_results: {
          cases: triggerJsonResults,
          summary: {
            total: triggerJsonResults.length,
            passed: passedCount,
            pass_rate: triggerJsonResults.length > 0 ? passedCount / triggerJsonResults.length : 0,
          },
        },
        exec_results: null,
      };
      try {
        writeFileSync(RESULTS_FILE, JSON.stringify(jsonOutput, null, 2), 'utf8');
        console.log(`\n  Trigger results saved to: ${RESULTS_FILE}`);
      } catch (err) {
        console.error(`\n⚠ Could not write trigger results: ${err.message}`);
      }
    }

    if (execJsonResults.length > 0) {
      const totalA = execJsonResults.reduce((s, c) => s + c.assertions.length, 0);
      const passedA = execJsonResults.reduce((s, c) => s + c.assertions.filter(a => a.passed === true).length, 0);
      const jsonOutput = {
        type: 'exec',
        model: opts.model,
        timestamp,
        trigger_results: null,
        exec_results: {
          cases: execJsonResults,
          summary: {
            total_assertions: totalA,
            passed: passedA,
            pass_rate: totalA > 0 ? passedA / totalA : 0,
          },
        },
      };
      try {
        writeFileSync(EXEC_RESULTS_FILE, JSON.stringify(jsonOutput, null, 2), 'utf8');
        console.log(`  Execution results saved to: ${EXEC_RESULTS_FILE}`);
      } catch (err) {
        console.error(`\n⚠ Could not write exec results: ${err.message}`);
      }
    }
  }

  process.exit(!opts.dryRun && !overallPass ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
