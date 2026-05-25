#!/usr/bin/env node
/**
 * Run the deterministic memory-value benchmark.
 *
 * Requires `npm run build` because it imports the built SDK, matching the
 * existing benchmark runner behavior.
 */

import { existsSync } from 'node:fs';
import { resolve as resolvePath, dirname } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolvePath(__dirname, '..');
const SDK_DIST = resolvePath(REPO_ROOT, 'packages/squad-sdk/dist/runtime/memory-value-benchmark.js');

function printHelp() {
  stdout.write([
    'Usage: npm run experiment:memory-value -- [options]',
    '',
    'Options:',
    '  --json      Emit JSON instead of a formatted report',
    '  -h, --help  Show this help',
    '',
    'Note: requires `npm run build` to have produced packages/squad-sdk/dist/.',
    '',
  ].join('\n'));
}

function parseArgs(args) {
  const opts = { json: false, help: false };
  for (const arg of args) {
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(argv.slice(2));
  } catch (error) {
    stderr.write(`error: ${error.message}\n`);
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

  const { runMemoryValueBenchmark, formatMemoryValueReport } = await import(pathToFileURL(SDK_DIST).href);
  const report = runMemoryValueBenchmark();
  stdout.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatMemoryValueReport(report)}\n`);
  exit(report.verdict === 'pass' ? 0 : 1);
}

main().catch(error => {
  stderr.write(`error: ${error.stack ?? error.message ?? String(error)}\n`);
  exit(1);
});
