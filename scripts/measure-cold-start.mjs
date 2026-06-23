#!/usr/bin/env node
/**
 * scripts/measure-cold-start.mjs
 *
 * Measure CLI cold-start latency for `squad --version` and `squad help`
 * over N runs.
 *
 * Why this script exists
 * ----------------------
 * The squad-cli entry point (packages/squad-cli/src/cli-entry.ts, ~28 KB)
 * has many top-level imports plus postinstall ESM patches that affect
 * cold-start latency. v0.8.23 added lazy imports for some commands; this
 * script lets us see whether further deferral helps.
 *
 * Usage
 * -----
 *   npm run bench:cold-start                       # 5 runs of each command
 *   npm run bench:cold-start -- --runs=10
 *   npm run bench:cold-start -- --json
 *
 * Exit codes
 * ----------
 *   0  success
 *   1  CLI not built or runtime error
 */

import { spawn } from 'node:child_process';
import { argv, exit, stdout, stderr, execPath } from 'node:process';
import { resolve as resolvePath, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolvePath(__dirname, '..');
const CLI_ENTRY = resolvePath(REPO_ROOT, 'packages/squad-cli/dist/cli-entry.js');

const DEFAULT_COMMANDS = [
  ['--version'],
  ['help'],
];

function parseArgs(args) {
  const opts = { runs: 5, json: false };
  for (const arg of args) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--runs=')) {
      const n = Number.parseInt(arg.slice('--runs='.length), 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`--runs must be a positive integer, got: ${arg}`);
      }
      opts.runs = n;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  stdout.write(
    [
      'Usage: npm run bench:cold-start -- [options]',
      '',
      'Options:',
      '  --runs=N          Number of runs per command (default: 5)',
      '  --json            Emit JSON instead of a formatted table',
      '  -h, --help        Show this help',
      '',
      'Note: requires `npm run build` to have produced packages/squad-cli/dist/.',
      '',
    ].join('\n'),
  );
}

/**
 * Run the CLI once with the given args; resolve with elapsed milliseconds.
 *
 * We measure wall-clock from spawn() until the child fully exits. This
 * captures everything the user perceives as cold start: process spawn,
 * Node startup, ESM patching, top-level imports, and the actual command.
 */
function timeSingleRun(args) {
  return new Promise((resolveP, rejectP) => {
    const start = performance.now();
    const child = spawn(execPath, [CLI_ENTRY, ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });
    child.on('error', rejectP);
    child.on('exit', (code) => {
      const elapsed = performance.now() - start;
      if (code !== 0) {
        // Some help/version paths may exit non-zero on errors; surface stderr
        // but still record the timing so users see what happened.
        stderr.write(`(exit ${code} from squad ${args.join(' ')}): ${stderrBuf.trim()}\n`);
      }
      resolveP({ elapsed, code });
    });
  });
}

function summarise(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const idx95 = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
  return {
    runs: sorted.length,
    avg,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[idx95],
  };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(argv.slice(2));
  } catch (err) {
    stderr.write(`error: ${err.message}\n`);
    printHelp();
    exit(1);
  }

  if (opts.help) {
    printHelp();
    exit(0);
  }

  if (!existsSync(CLI_ENTRY)) {
    stderr.write(
      `error: CLI build output not found at ${CLI_ENTRY}\n` +
        'Run `npm run build` first.\n',
    );
    exit(1);
  }

  const results = [];
  let anyFailures = false;
  for (const args of DEFAULT_COMMANDS) {
    const label = `squad ${args.join(' ')}`;
    const timings = [];
    let failures = 0;
    for (let i = 0; i < opts.runs; i++) {
      const { elapsed, code } = await timeSingleRun(args);
      timings.push(elapsed);
      if (code !== 0) {
        failures++;
        anyFailures = true;
      }
    }
    results.push({ command: label, timings, failures, ...summarise(timings) });
  }

  if (opts.json) {
    stdout.write(JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2) + '\n');
    exit(anyFailures ? 1 : 0);
  }

  // Formatted table
  const COL_CMD = 24;
  const COL_NUM = 12;
  const header = [
    'Command'.padEnd(COL_CMD),
    'Runs'.padStart(COL_NUM),
    'Fails'.padStart(COL_NUM),
    'Avg (ms)'.padStart(COL_NUM),
    'Min (ms)'.padStart(COL_NUM),
    'Max (ms)'.padStart(COL_NUM),
    'P95 (ms)'.padStart(COL_NUM),
  ].join('  ');
  const sep = '─'.repeat(header.length);
  stdout.write(sep + '\n');
  stdout.write(header + '\n');
  stdout.write(sep + '\n');
  for (const r of results) {
    stdout.write(
      [
        r.command.padEnd(COL_CMD),
        String(r.runs).padStart(COL_NUM),
        String(r.failures).padStart(COL_NUM),
        r.avg.toFixed(2).padStart(COL_NUM),
        r.min.toFixed(2).padStart(COL_NUM),
        r.max.toFixed(2).padStart(COL_NUM),
        r.p95.toFixed(2).padStart(COL_NUM),
      ].join('  ') + '\n',
    );
  }
  stdout.write(sep + '\n');
  if (anyFailures) {
    stderr.write(
      'warning: one or more runs exited with a non-zero status — timings are still reported, but the CLI is broken.\n',
    );
  }

  exit(anyFailures ? 1 : 0);
}

main().catch((err) => {
  stderr.write(`error: ${err.stack ?? err.message ?? String(err)}\n`);
  exit(1);
});
