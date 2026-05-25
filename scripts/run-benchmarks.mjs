#!/usr/bin/env node
/**
 * scripts/run-benchmarks.mjs
 *
 * Foundation runner for the existing @bradygaster/squad-sdk BenchmarkSuite.
 *
 * Why this script exists
 * ----------------------
 * The SDK already ships `BenchmarkSuite` (packages/squad-sdk/src/runtime/benchmarks.ts)
 * with five built-in micro-benchmarks (configLoad, charterCompile, routing,
 * modelSelection, exportImport). Until now there was no `npm run bench` entry
 * point, so the suite was only used programmatically and from its own tests.
 *
 * This script gives perf-improvement PRs a single command to capture
 * before/after numbers consistently. It is intentionally tiny — all logic
 * lives in `BenchmarkSuite`; this is a CLI shim.
 *
 * Usage
 * -----
 *   npm run bench                      # default 100 iterations, all benches
 *   npm run bench -- --iterations=50   # custom iteration count
 *   npm run bench -- --json            # emit JSON (for CI diffing)
 *   npm run bench -- --filter routing  # only run benches whose name matches
 *
 * Exit codes
 * ----------
 *   0  success
 *   1  argument error or runtime failure
 *
 * Note: this script imports from the BUILT SDK (`packages/squad-sdk/dist/...`).
 * Run `npm run build` first if you have not built the workspace.
 */

import { argv, exit, stdout, stderr } from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolvePath(__dirname, '..');
const SDK_DIST = resolvePath(REPO_ROOT, 'packages/squad-sdk/dist/runtime/benchmarks.js');

function parseArgs(args) {
  const opts = { iterations: 100, json: false, filter: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg.startsWith('--iterations=')) {
      const n = Number.parseInt(arg.slice('--iterations='.length), 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`--iterations must be a positive integer, got: ${arg}`);
      }
      opts.iterations = n;
    } else if (arg.startsWith('--filter=')) {
      opts.filter = arg.slice('--filter='.length);
    } else if (arg === '--filter') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new Error('--filter requires a value');
      }
      opts.filter = next;
      i++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  stdout.write(
    [
      'Usage: npm run bench -- [options]',
      '',
      'Options:',
      '  --iterations=N    Number of iterations per benchmark (default: 100)',
      '  --filter=NAME     Only run benchmarks whose name contains NAME',
      '  --json            Emit JSON instead of a formatted table',
      '  -h, --help        Show this help',
      '',
      'Note: requires `npm run build` to have produced packages/squad-sdk/dist/.',
      '',
    ].join('\n'),
  );
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

  if (!existsSync(SDK_DIST)) {
    stderr.write(
      `error: SDK build output not found at ${SDK_DIST}\n` +
        'Run `npm run build` first.\n',
    );
    exit(1);
  }

  const { BenchmarkSuite, formatBenchmarkReport } = await import(
    pathToFileURL(SDK_DIST).href
  );

  const suite = new BenchmarkSuite();

  if (opts.filter) {
    const keep = new Set(suite.list().filter((n) => n.includes(opts.filter)));
    if (keep.size === 0) {
      stderr.write(`error: no benchmarks match filter "${opts.filter}"\n`);
      stderr.write(`available: ${suite.list().join(', ')}\n`);
      exit(1);
    }
    for (const name of suite.list()) {
      if (!keep.has(name)) suite.unregister(name);
    }
  }

  const report = await suite.runAll(opts.iterations);

  if (opts.json) {
    stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    stdout.write(formatBenchmarkReport(report.results) + '\n');
    stdout.write(`\nTotal time: ${report.totalTime.toFixed(2)} ms\n`);
    stdout.write(`Timestamp:  ${report.timestamp}\n`);
  }

  exit(0);
}

main().catch((err) => {
  stderr.write(`error: ${err.stack ?? err.message ?? String(err)}\n`);
  exit(1);
});
