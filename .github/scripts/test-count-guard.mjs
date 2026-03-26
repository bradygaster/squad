#!/usr/bin/env node
// Test Count Guard — CI script to prevent AI agents from deleting tests.
//
// Usage:
//   node .github/scripts/test-count-guard.mjs --actual 243
//   node .github/scripts/test-count-guard.mjs --from-json ./test-results.json
//
// Exit codes:
//   0 — actual >= baseline (pass), or baseline file missing (warning)
//   1 — actual < baseline (fail)

import { readFileSync } from 'fs';
import { resolve } from 'path';

function checkTestCount(actual, baseline) {
  if (baseline === null) {
    return { status: 'warning', message: 'No baseline file found. Skipping test count check (first run).' };
  }
  if (actual >= baseline.count) {
    return { status: 'pass', message: `Test count OK: ${actual} >= ${baseline.count}` };
  }
  const delta = baseline.count - actual;
  return {
    status: 'fail',
    message: `Test count decreased by ${delta}: expected >= ${baseline.count}, got ${actual}`,
    delta,
  };
}

function parseBaseline(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.count !== 'number') throw new Error('count field missing or not a number');
    return parsed;
  } catch {
    return null;
  }
}

function loadBaseline(baselinePath) {
  try {
    const raw = readFileSync(baselinePath, 'utf8');
    return parseBaseline(raw);
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const baselinePath = resolve(process.cwd(), '.github/test-baseline.json');
const baseline = loadBaseline(baselinePath);

let actual = null;

const actualIdx = args.indexOf('--actual');
if (actualIdx !== -1 && args[actualIdx + 1] !== undefined) {
  actual = parseInt(args[actualIdx + 1], 10);
}

const fromJsonIdx = args.indexOf('--from-json');
if (fromJsonIdx !== -1 && args[fromJsonIdx + 1] !== undefined) {
  try {
    const jsonPath = resolve(process.cwd(), args[fromJsonIdx + 1]);
    const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
    actual = data.numTotalTests ?? 0;
  } catch {
    console.error('❌ Failed to read test results JSON');
    process.exit(1);
  }
}

if (actual === null || isNaN(actual)) {
  console.error('❌ No actual test count provided. Use --actual <count> or --from-json <path>');
  process.exit(1);
}

const result = checkTestCount(actual, baseline);

if (result.status === 'pass') {
  console.log(`✅ ${result.message}`);
  process.exit(0);
} else if (result.status === 'warning') {
  console.warn(`⚠️  ${result.message}`);
  process.exit(0);
} else {
  console.error(`❌ ${result.message}`);
  process.exit(1);
}
