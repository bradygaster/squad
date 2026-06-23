/**
 * Shared test helpers for repo health check script tests.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { resolve } from 'node:path';

export const ROOT = resolve(__dirname, '..', '..');

/**
 * Extract the first top-level JSON object from mixed stdout output.
 * Scripts emit pretty-printed JSON followed by human-readable summary lines.
 */
export function extractJson(output: string): Record<string, unknown> {
  const lines = output.split('\n');
  const jsonLines: string[] = [];
  let inJson = false;
  let depth = 0;
  for (const line of lines) {
    if (!inJson && line.trimStart().startsWith('{')) {
      inJson = true;
    }
    if (inJson) {
      jsonLines.push(line);
      for (const ch of line) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth === 0) break;
    }
  }
  if (jsonLines.length === 0) throw new Error('No JSON object found in output');
  return JSON.parse(jsonLines.join('\n'));
}

/**
 * Run a health-check script as a subprocess and return the result.
 */
export function runScript(
  scriptName: string,
  args: string[] = [],
): SpawnSyncReturns<string> {
  const script = resolve(ROOT, 'scripts', scriptName);
  return spawnSync('node', [script, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
  });
}
