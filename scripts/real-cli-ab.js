/**
 * Run bounded real Copilot CLI paired A/B turns against local repositories.
 *
 * The harness intentionally isolates COPILOT_HOME by repo and variant:
 *   <out-dir>/copilot-home/<repo-slug>/<variant>/
 *
 * It captures stdout/stderr, Copilot log-dir output, command metadata, and
 * measured memory diagnostics evidence. If Copilot cannot be made to run
 * in-turn memory commands, the diagnostics summary records that limitation
 * instead of inventing evidence.
 */

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, resolve, join, basename, dirname } from 'node:path';
import { argv, cwd, env, exit, stderr, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_PRODUCT_CLI = resolve(__dirname, '..', 'cli.js');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MEMORY_MARKER = /\[memory:(error|info|debug)]\s+([^\r\n]+)/g;

export function slugifyPath(repoPath) {
  const resolved = resolve(repoPath);
  const leaf = basename(resolved) || 'repo';
  const hash = [...resolved].reduce((acc, ch) => ((acc * 33) ^ ch.charCodeAt(0)) >>> 0, 5381).toString(16);
  return `${leaf.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo'}-${hash}`;
}

export function parseArgs(args) {
  const opts = {
    repos: [],
    variants: ['baseline', 'memory-governance'],
    outDir: env['SESSION_FILES']
      ? join(env['SESSION_FILES'], 'expanded-memory-ab', `real-cli-rerun-${new Date().toISOString().replace(/[:.]/g, '-')}`)
      : resolve(cwd(), 'artifacts', 'expanded-memory-ab', `real-cli-rerun-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    copilotBin: 'copilot',
    productCli: DEFAULT_PRODUCT_CLI,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    model: undefined,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const readValue = (name) => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      if (arg === name) return args[++index];
      return undefined;
    };

    const repo = readValue('--repo');
    if (repo !== undefined) {
      opts.repos.push(repo);
      continue;
    }

    const repos = readValue('--repos');
    if (repos !== undefined) {
      opts.repos.push(...repos.split(/[;,]/).map(value => value.trim()).filter(Boolean));
      continue;
    }

    const variants = readValue('--variants');
    if (variants !== undefined) {
      opts.variants = variants.split(',').map(value => value.trim()).filter(Boolean);
      continue;
    }

    const outDir = readValue('--out-dir');
    if (outDir !== undefined) {
      opts.outDir = outDir;
      continue;
    }

    const copilotBin = readValue('--copilot-bin');
    if (copilotBin !== undefined) {
      opts.copilotBin = copilotBin;
      continue;
    }

    const productCli = readValue('--product-cli');
    if (productCli !== undefined) {
      opts.productCli = productCli;
      continue;
    }

    const timeoutMs = readValue('--timeout-ms');
    if (timeoutMs !== undefined) {
      opts.timeoutMs = Number.parseInt(timeoutMs, 10);
      continue;
    }

    const model = readValue('--model');
    if (model !== undefined) {
      opts.model = model;
      continue;
    }

    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be an integer >= 1000');
  }
  return opts;
}

export function buildPrompt({ repoPath, variant, productCli }) {
  const shared = [
    'You are executing one bounded A/B measurement turn for the Squad memory governance experiment.',
    'Do not modify files. Do not commit. Do not install packages. Do not access private remotes.',
    `Repository under test: ${repoPath}`,
    'Keep the run short: execute only the requested shell commands and then summarize observations.',
  ];

  if (variant === 'baseline') {
    return [
      ...shared,
      'Variant: baseline.',
      'Run: git status --short',
      'Run: git rev-parse --show-toplevel',
      'Run: list the first 20 non-hidden top-level files/directories using the platform shell.',
      'Do not run `squad memory` or `node cli.js memory` commands in this baseline turn.',
      'Summarize whether any memory diagnostics appeared naturally.',
    ].join('\n');
  }

  return [
    ...shared,
    `Variant: ${variant}.`,
    'This variant measures whether memory command diagnostics can be captured during an actual Copilot turn.',
    'Run exactly these memory diagnostics commands from the repository under test, adapting only path quoting for the shell:',
    `node "${productCli}" memory provider --log-level debug`,
    `node "${productCli}" memory classify --log-level debug --content "Use governed memory only for durable cross-session facts." --class LOCAL --load-guidance ON-DEMAND`,
    'Then run: git status --short',
    'In your final answer, state whether the memory commands executed and whether diagnostic lines beginning with [memory: appeared.',
  ].join('\n');
}

export function buildRunPlan(options) {
  const repos = options.repos.map(repo => resolve(repo));
  const outDir = resolve(options.outDir);
  return repos.flatMap(repoPath => {
    if (!existsSync(repoPath)) throw new Error(`Repository path does not exist: ${repoPath}`);
    const repoSlug = slugifyPath(repoPath);
    return options.variants.map(variant => {
      const runDir = join(outDir, repoSlug, variant);
      return {
        repoPath,
        repoSlug,
        variant,
        runDir,
        copilotHome: join(outDir, 'copilot-home', repoSlug, variant),
        logDir: join(runDir, 'copilot-logs'),
        stdoutPath: join(runDir, 'stdout.jsonl'),
        stderrPath: join(runDir, 'stderr.txt'),
        commandPath: join(runDir, 'command.json'),
        diagnosticsPath: join(runDir, 'diagnostics.json'),
        productCli: resolve(options.productCli),
      };
    });
  });
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const entries = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walkFiles(full));
    } else if (stat.isFile()) {
      entries.push(full);
    }
  }
  return entries;
}

export function extractMemoryDiagnostics(text) {
  const events = [];
  for (const match of text.matchAll(MEMORY_MARKER)) {
    events.push({ level: match[1], message: match[2].trim() });
  }
  return events;
}

function removePromptOnlyJsonl(text) {
  return text
    .split(/\r?\n/)
    .filter(line => {
      if (!line.trim().startsWith('{')) return true;
      try {
        return JSON.parse(line).type !== 'user.message';
      } catch {
        return true;
      }
    })
    .join('\n');
}

export function collectDiagnostics(run, stdoutText, stderrText) {
  const logFiles = walkFiles(run.logDir);
  const logEvidence = [];
  for (const file of logFiles) {
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const events = extractMemoryDiagnostics(text);
    if (events.length > 0) {
      logEvidence.push({ file, events });
    }
  }

  const stdioEvents = [
    ...extractMemoryDiagnostics(stdoutText).map(event => ({ stream: 'stdout', ...event })),
    ...extractMemoryDiagnostics(stderrText).map(event => ({ stream: 'stderr', ...event })),
  ];

  const combinedText = removePromptOnlyJsonl(`${stdoutText}\n${stderrText}`);
  const memoryCommandMentions = [
    /squad\s+memory/i,
    /node\s+["']?[^"'\r\n]*cli\.js["']?\s+memory/i,
    /memory\s+(provider|classify|write|search|audit)/i,
  ].filter(pattern => pattern.test(combinedText)).length;

  return {
    memoryCommandMentioned: memoryCommandMentions > 0,
    memoryDiagnosticEventCount: stdioEvents.length + logEvidence.reduce((sum, item) => sum + item.events.length, 0),
    stdioEvents,
    logEvidence,
    limitation: stdioEvents.length === 0 && logEvidence.length === 0
      ? 'No [memory:*] diagnostics were captured from stdout/stderr or Copilot log files for this run.'
      : undefined,
  };
}

function runProcess(command, args, options) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
    });

    let stdoutText = '';
    let stderrText = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeoutMs);

    child.stdout?.on('data', chunk => {
      stdoutText += chunk.toString();
    });
    child.stderr?.on('data', chunk => {
      stderrText += chunk.toString();
    });
    child.on('error', error => {
      clearTimeout(timer);
      resolvePromise({
        exitCode: null,
        signal: null,
        durationMs: Date.now() - startedAt,
        stdoutText,
        stderrText: `${stderrText}\n${error.stack ?? error.message}`,
      });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        stdoutText,
        stderrText,
      });
    });
  });
}

export async function runOne(run, options, executor = runProcess) {
  mkdirSync(run.runDir, { recursive: true });
  mkdirSync(run.copilotHome, { recursive: true });
  mkdirSync(run.logDir, { recursive: true });

  const prompt = buildPrompt(run);
  const args = [
    '-C', run.repoPath,
    '--prompt', prompt,
    '--allow-all-tools',
    '--allow-all-paths',
    '--no-ask-user',
    '--no-auto-update',
    '--disable-builtin-mcps',
    '--output-format', 'json',
    '--log-level', 'debug',
    '--log-dir', run.logDir,
    '--name', `squad-memory-ab-${run.repoSlug}-${run.variant}`,
  ];
  if (options.model) args.push('--model', options.model);

  const commandMetadata = {
    command: options.copilotBin,
    args,
    cwd: run.repoPath,
    variant: run.variant,
    repoPath: run.repoPath,
    copilotHome: run.copilotHome,
    logDir: run.logDir,
    productCli: run.productCli,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(run.commandPath, `${JSON.stringify(commandMetadata, null, 2)}\n`);

  if (options.dryRun) {
    const diagnostics = {
      skipped: true,
      reason: 'dry-run',
      memoryCommandMentioned: run.variant !== 'baseline',
      memoryDiagnosticEventCount: 0,
    };
    writeFileSync(run.stdoutPath, '');
    writeFileSync(run.stderrPath, '');
    writeFileSync(run.diagnosticsPath, `${JSON.stringify(diagnostics, null, 2)}\n`);
    return { ...run, exitCode: 0, signal: null, durationMs: 0, diagnostics };
  }

  const result = await executor(options.copilotBin, args, {
    cwd: run.repoPath,
    timeoutMs: options.timeoutMs,
    env: {
      ...env,
      COPILOT_HOME: run.copilotHome,
      COPILOT_ALLOW_ALL: 'true',
      NO_COLOR: '1',
      CI: env['CI'] ?? '1',
    },
  });

  writeFileSync(run.stdoutPath, result.stdoutText);
  writeFileSync(run.stderrPath, result.stderrText);
  const diagnostics = collectDiagnostics(run, result.stdoutText, result.stderrText);
  writeFileSync(run.diagnosticsPath, `${JSON.stringify(diagnostics, null, 2)}\n`);

  return {
    ...run,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    diagnostics,
  };
}

export async function runExperiment(options, executor = runProcess) {
  if (options.repos.length === 0) {
    throw new Error('At least one --repo or --repos path is required.');
  }
  if (!existsSync(resolve(options.productCli))) {
    throw new Error(`Product CLI not found: ${options.productCli}`);
  }

  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });
  const plan = buildRunPlan({ ...options, outDir });
  const results = [];
  for (const run of plan) {
    stdout.write(`Running ${run.variant} on ${run.repoPath}\n`);
    results.push(await runOne(run, { ...options, outDir }, executor));
  }

  const summary = {
    startedAt: new Date().toISOString(),
    outDir,
    repos: [...new Set(plan.map(run => run.repoPath))],
    variants: options.variants,
    results: results.map(result => ({
      repoPath: result.repoPath,
      variant: result.variant,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      copilotHome: result.copilotHome,
      logDir: result.logDir,
      stdoutPath: result.stdoutPath,
      stderrPath: result.stderrPath,
      commandPath: result.commandPath,
      diagnosticsPath: result.diagnosticsPath,
      memoryCommandMentioned: result.diagnostics.memoryCommandMentioned,
      memoryDiagnosticEventCount: result.diagnostics.memoryDiagnosticEventCount,
      limitation: result.diagnostics.limitation,
    })),
  };
  const summaryPath = join(outDir, 'summary.json');
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { summaryPath, summary };
}

function printHelp() {
  stdout.write([
    'Usage: node scripts/real-cli-ab.mjs --repo <path> --repo <path> [options]',
    '',
    'Options:',
    '  --repo <path>          Local repository to test (repeatable)',
    `  --repos <paths>        Comma/semicolon-separated repositories (path delimiter is ${JSON.stringify(delimiter)})`,
    '  --out-dir <path>       Artifact directory',
    '  --variants <csv>       Variants to run (default: baseline,memory-governance)',
    '  --copilot-bin <path>   Copilot CLI executable (default: copilot)',
    '  --product-cli <path>   Built Squad CLI entry point (default: ./cli.js)',
    '  --timeout-ms <n>       Per-turn timeout (default: 600000)',
    '  --model <name>         Optional Copilot model override',
    '  --dry-run              Write the plan/artifact skeleton without invoking Copilot',
    '',
  ].join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(argv.slice(2));
    if (options.help) {
      printHelp();
      exit(0);
    }
    const { summaryPath, summary } = await runExperiment(options);
    stdout.write(`Summary: ${summaryPath}\n`);
    stdout.write(`${JSON.stringify(summary.results, null, 2)}\n`);
    exit(summary.results.every(result => result.exitCode === 0) ? 0 : 1);
  } catch (error) {
    stderr.write(`error: ${error.stack ?? error.message ?? String(error)}\n`);
    printHelp();
    exit(1);
  }
}
