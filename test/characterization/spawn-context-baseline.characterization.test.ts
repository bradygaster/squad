/**
 * Characterization test for spawn-context byte counts (Gap S1).
 *
 * Pins byte-exact JSON output of `runMemoryValueBenchmark()` for the
 * default fixture. Any future change to the benchmark output, the fixture,
 * or the assembly logic will diff loudly against the committed golden.
 *
 * This is a baseline of *current* behavior; it does not encode any target
 * tier design and it does not evaluate the #1309 proposal.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMemoryValueBenchmark } from '../../packages/squad-sdk/src/runtime/memory-value-benchmark.js';

import { withHermeticRoot } from './_helpers/hermetic-root.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = path.resolve(
  HERE,
  '..',
  '..',
  'test-fixtures',
  'characterization',
  'spawn-context-baseline.json',
);

describe('spawn-context baseline characterization (S1)', () => {
  it('runMemoryValueBenchmark output matches the committed golden byte for byte', async () => {
    // Defensive: run under a hermetic root so any accidental future filesystem
    // side effect is caught. The current benchmark is pure and in-memory.
    await withHermeticRoot(async (_root) => {
      const report = runMemoryValueBenchmark();
      const actual = JSON.stringify(report, null, 2) + '\n';
      const goldenRaw = await fs.readFile(GOLDEN_PATH, 'utf8');
      // Byte-exact equality; failure prints only the two JSON blobs, never
      // caller-machine paths.
      expect(actual).toBe(goldenRaw);
    });
  });
});
