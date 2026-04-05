/**
 * Path diagnostics — show Squad path resolution outputs and decision traces.
 *
 * The command starts with a summary of the major resolved paths and, when
 * `--verbose` is enabled, prints a trace of how each resolver reached its
 * decision.
 *
 * @module cli/commands/pathDiagnostics
 */

import path from 'node:path';
import {
  FSStorageProvider,
  deriveProjectKey,
  isConsultMode,
  loadDirConfig,
  resolveExternalStateDir,
  resolveGlobalSquadPath,
  resolvePersonalSquadDir,
  resolveSquadInDir,
  resolveSquadPaths,
} from '@bradygaster/squad-sdk';
import { detectSquadDir, resolveWorktreeMainCheckout } from '../core/detect-squad-dir.js';

const storage = new FSStorageProvider();

export interface PathDiagnosticsOptions {
  verbose?: boolean;
}

export interface PathDiagnosticsItem {
  label: string;
  value: string;
}

export interface PathDiagnosticsTrace {
  method: string;
  result: string;
  steps: string[];
}

export interface PathDiagnosticsReport {
  startDir: string;
  items: PathDiagnosticsItem[];
  traces: PathDiagnosticsTrace[];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function traceResolveSquadInDir(startDir: string): PathDiagnosticsTrace {
  let current = path.resolve(startDir);
  const steps: string[] = [`start at ${current}`];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, '.squad');
    const candidateExists = storage.existsSync(candidate) && storage.isDirectorySync(candidate);
    steps.push(`checked ${candidate} -> ${candidateExists ? 'found' : 'missing'}`);
    if (candidateExists) {
      return { method: 'resolveSquadInDir', result: candidate, steps };
    }

    const gitMarker = path.join(current, '.git');
    if (storage.existsSync(gitMarker)) {
      if (storage.isDirectorySync(gitMarker)) {
        steps.push(`encountered ${gitMarker} directory -> stop at repo boundary`);
        return { method: 'resolveSquadInDir', result: 'null', steps };
      }

      steps.push(`encountered ${gitMarker} file -> worktree fallback path`);
      const mainCheckout = resolveWorktreeMainCheckout(current);
      if (!mainCheckout) {
        steps.push('could not resolve a main checkout from the worktree pointer');
        return { method: 'resolveSquadInDir', result: 'null', steps };
      }

      steps.push(`resolved main checkout to ${mainCheckout}`);
      const mainCandidate = path.join(mainCheckout, '.squad');
      const mainExists = storage.existsSync(mainCandidate) && storage.isDirectorySync(mainCandidate);
      steps.push(`checked ${mainCandidate} -> ${mainExists ? 'found fallback' : 'missing'}`);
      return { method: 'resolveSquadInDir', result: mainExists ? mainCandidate : 'null', steps };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      steps.push(`reached filesystem root at ${current}`);
      return { method: 'resolveSquadInDir', result: 'null', steps };
    }

    steps.push(`moving up to ${parent}`);
    current = parent;
  }
}

function traceResolveSquadPaths(startDir: string): PathDiagnosticsTrace {
  const steps: string[] = [`start at ${path.resolve(startDir)}`];
  const markerDir = resolveSquadInDir(startDir);
  const resolved = resolveSquadPaths(startDir);

  if (!markerDir) {
    steps.push('no .squad/ marker found, so resolveSquadPaths() returned null');
    return { method: 'resolveSquadPaths', result: 'null', steps };
  }

  steps.push(`marker directory resolved to ${markerDir}`);

  const config = loadDirConfig(markerDir);
  if (!config) {
    steps.push('no config.json found -> local mode');
  } else {
    steps.push(`loaded config.json -> ${JSON.stringify(config)}`);
    if (config.stateBackend === 'external') {
      const projectRoot = path.resolve(markerDir, '..');
      const projectKey = config.projectKey || deriveProjectKey(projectRoot);
      const externalRoot = config.externalStateRoot
        ? path.resolve(projectRoot, config.externalStateRoot)
        : path.join(resolveGlobalSquadPath(), 'projects');
      steps.push(`stateBackend=external -> projectKey=${projectKey}`);
      steps.push(`external root resolved to ${externalRoot}`);
      steps.push(`external state dir = ${resolveExternalStateDir(projectKey, false, externalRoot)}`);
    } else if (config.teamRoot) {
      const projectRoot = path.resolve(markerDir, '..');
      steps.push(`teamRoot=${config.teamRoot}`);
      steps.push(`teamDir resolved to ${path.resolve(projectRoot, config.teamRoot)}`);
    }
  }

  if (!resolved) {
    steps.push('resolveSquadPaths() returned null');
    return { method: 'resolveSquadPaths', result: 'null', steps };
  }

  steps.push(`mode=${resolved.mode}`);
  steps.push(`projectDir=${resolved.projectDir}`);
  steps.push(`teamDir=${resolved.teamDir}`);
  steps.push(`personalDir=${resolved.personalDir ?? 'null'}`);
  return {
    method: 'resolveSquadPaths',
    result: JSON.stringify({
      mode: resolved.mode,
      projectDir: resolved.projectDir,
      teamDir: resolved.teamDir,
      personalDir: resolved.personalDir,
    }),
    steps,
  };
}

function traceResolveGlobalSquadPath(): PathDiagnosticsTrace {
  const steps: string[] = [`platform=${process.platform}`];

  if (process.platform === 'win32') {
    steps.push(`APPDATA=${process.env['APPDATA'] ?? '(unset)'}`);
    steps.push(`LOCALAPPDATA=${process.env['LOCALAPPDATA'] ?? '(unset)'}`);
  } else if (process.platform === 'darwin') {
    steps.push(`HOME=${process.env['HOME'] ?? '(unset)'}`);
    steps.push('using ~/Library/Application Support as the base config directory');
  } else {
    steps.push(`XDG_CONFIG_HOME=${process.env['XDG_CONFIG_HOME'] ?? '(unset)'}`);
    steps.push(`HOME=${process.env['HOME'] ?? '(unset)'}`);
  }

  const result = resolveGlobalSquadPath();
  steps.push(`returned ${result}`);
  return { method: 'resolveGlobalSquadPath', result, steps };
}

function traceResolvePersonalSquadDir(globalDir: string): PathDiagnosticsTrace {
  const personalCandidate = path.join(globalDir, 'personal-squad');
  const steps: string[] = [
    `SQUAD_NO_PERSONAL=${process.env['SQUAD_NO_PERSONAL'] ?? '(unset)'}`,
    `checked ${personalCandidate} -> ${storage.existsSync(personalCandidate) ? 'exists' : 'missing'}`,
  ];
  const result = resolvePersonalSquadDir();
  steps.push(`returned ${result ?? 'null'}`);
  return { method: 'resolvePersonalSquadDir', result: result ?? 'null', steps };
}

function traceResolveExternalStateDir(projectKey: string, externalStateRoot?: string): PathDiagnosticsTrace {
  const steps: string[] = [`projectKey=${projectKey}`];
  if (externalStateRoot) {
    steps.push(`using custom externalStateRoot=${externalStateRoot}`);
  } else {
    steps.push(`using default external root ${path.join(resolveGlobalSquadPath(), 'projects')}`);
  }

  const result = resolveExternalStateDir(projectKey, false, externalStateRoot);
  steps.push(`returned ${result}`);
  return { method: 'resolveExternalStateDir', result, steps };
}

export function collectPathDiagnostics(
  startDir: string = process.cwd(),
  options: PathDiagnosticsOptions = {},
): PathDiagnosticsReport {
  const resolvedStart = path.resolve(startDir);
  const markerDir = resolveSquadInDir(resolvedStart);
  const globalDir = resolveGlobalSquadPath();
  const resolvedPaths = resolveSquadPaths(resolvedStart);
  const personalDir = resolvePersonalSquadDir();
  const config = markerDir ? loadDirConfig(markerDir) : null;
  const projectRoot = markerDir ? path.resolve(markerDir, '..') : resolvedStart;
  const projectKey = config?.projectKey || deriveProjectKey(projectRoot);
  const externalStateRoot = config?.externalStateRoot
    ? path.resolve(projectRoot, config.externalStateRoot)
    : undefined;

  const detectBaseDir = markerDir ? path.resolve(markerDir, '..') : resolvedStart;
  const detected = detectSquadDir(detectBaseDir);
  const detectedPath = `${detected.path}${storage.existsSync(detected.path) ? '' : ' (default candidate)'}`;

  let externalStateDir: string;
  try {
    externalStateDir = resolveExternalStateDir(projectKey, false, externalStateRoot);
  } catch (error) {
    externalStateDir = `error: ${error instanceof Error ? error.message : String(error)}`;
  }

  const items: PathDiagnosticsItem[] = [
    { label: 'startDir', value: resolvedStart },
    { label: 'resolveSquadInDir(startDir)', value: markerDir ?? 'null' },
    { label: 'loadDirConfig(markerDir)', value: formatValue(config) },
    { label: 'isConsultMode(config)', value: String(isConsultMode(config)) },
    { label: 'resolveSquadPaths(startDir).mode', value: resolvedPaths?.mode ?? 'null' },
    { label: 'resolveSquadPaths(startDir).projectDir', value: resolvedPaths?.projectDir ?? 'null' },
    { label: 'resolveSquadPaths(startDir).teamDir', value: resolvedPaths?.teamDir ?? 'null' },
    { label: 'resolveSquadPaths(startDir).personalDir', value: resolvedPaths?.personalDir ?? 'null' },
    { label: 'detectSquadDir(baseDir).path', value: detectedPath },
    { label: 'deriveProjectKey(projectRoot)', value: projectKey },
    { label: 'resolveExternalStateDir(projectKey, false)', value: externalStateDir },
    { label: 'resolveGlobalSquadPath()', value: globalDir },
    { label: 'resolvePersonalSquadDir()', value: personalDir ?? 'null' },
  ];

  const traces = options.verbose
    ? [
        traceResolveSquadInDir(resolvedStart),
        traceResolveSquadPaths(resolvedStart),
        traceResolveGlobalSquadPath(),
        traceResolvePersonalSquadDir(globalDir),
        traceResolveExternalStateDir(projectKey, externalStateRoot),
      ]
    : [];

  return {
    startDir: resolvedStart,
    items,
    traces,
  };
}

export function printPathDiagnosticsReport(
  report: PathDiagnosticsReport,
  write: (line: string) => void = console.log,
): void {
  write('');
  write('Path Diagnostics');
  write(`Start dir: ${report.startDir}`);
  write('');
  write('Resolved values:');
  for (const item of report.items) {
    write(`  - ${item.label}: ${item.value}`);
  }

  if (report.traces.length === 0) {
    return;
  }

  write('');
  write('Verbose analysis:');
  for (const trace of report.traces) {
    write(`  • ${trace.method}: ${trace.result}`);
    for (const step of trace.steps) {
      write(`    - ${step}`);
    }
  }
}

export function pathDiagnosticsCommand(
  startDir: string = process.cwd(),
  options: PathDiagnosticsOptions = {},
): PathDiagnosticsReport {
  const report = collectPathDiagnostics(startDir, options);
  printPathDiagnosticsReport(report);
  return report;
}
