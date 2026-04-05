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
import { detectSquadDir } from '../core/detect-squad-dir.js';

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

function captureTrace<T>(
  method: string,
  run: (trace: (line: string) => void) => T,
): PathDiagnosticsTrace {
  const steps: string[] = [];

  try {
    const result = run((line) => steps.push(line));
    if (steps.length === 0) {
      steps.push(`[${method}] no trace emitted`);
    }
    return {
      method,
      result: formatValue(result),
      steps,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    steps.push(`[${method}] threw: ${message}`);
    return {
      method,
      result: `error: ${message}`,
      steps,
    };
  }
}

function traceResolveSquadInDir(startDir: string): PathDiagnosticsTrace {
  return captureTrace('resolveSquadInDir', (trace) => resolveSquadInDir(startDir, trace));
}

function traceLoadDirConfig(markerDir: string | null): PathDiagnosticsTrace {
  if (!markerDir) {
    return {
      method: 'loadDirConfig',
      result: 'null',
      steps: ['[loadDirConfig] no squad marker directory available'],
    };
  }
  return captureTrace('loadDirConfig', (trace) => loadDirConfig(markerDir, trace));
}

function traceResolveSquadPaths(startDir: string): PathDiagnosticsTrace {
  return captureTrace('resolveSquadPaths', (trace) => resolveSquadPaths(startDir, trace));
}

function traceDeriveProjectKey(projectRoot: string): PathDiagnosticsTrace {
  return captureTrace('deriveProjectKey', (trace) => deriveProjectKey(projectRoot, trace));
}

function traceResolveGlobalSquadPath(): PathDiagnosticsTrace {
  return captureTrace('resolveGlobalSquadPath', (trace) => resolveGlobalSquadPath(trace));
}

function traceResolvePersonalSquadDir(): PathDiagnosticsTrace {
  return captureTrace('resolvePersonalSquadDir', (trace) => resolvePersonalSquadDir(trace));
}

function traceResolveExternalStateDir(projectKey: string, externalStateRoot?: string): PathDiagnosticsTrace {
  return captureTrace('resolveExternalStateDir', (trace) =>
    resolveExternalStateDir(projectKey, false, externalStateRoot, trace),
  );
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
        traceLoadDirConfig(markerDir),
        traceResolveSquadPaths(resolvedStart),
        traceDeriveProjectKey(projectRoot),
        traceResolveGlobalSquadPath(),
        traceResolvePersonalSquadDir(),
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
