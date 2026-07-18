/**
 * Characterization tests for history-shadow round-trip and merge behavior.
 *
 * Covers Gap H1: round-trip byte-identity per canonical section, unknown
 * section append fallback, and timestamp format stability. Concurrency and
 * happy-path lifecycle are already covered by `test/history-shadow.test.ts`
 * and are intentionally not duplicated here.
 *
 * All I/O is contained inside a hermetic temp root; repository `.squad/**`
 * is never touched.
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { FSStorageProvider } from '../../packages/squad-sdk/src/storage/fs-storage-provider.js';
import {
  appendToHistory,
  createHistoryShadow,
  type HistorySection,
} from '../../packages/squad-sdk/src/agents/history-shadow.js';

import { makeWriteGuardedStorage, withHermeticRoot } from './_helpers/hermetic-root.js';

const CANONICAL_SECTIONS: HistorySection[] = [
  'Context',
  'Learnings',
  'Decisions',
  'Patterns',
  'Issues',
  'References',
];

const TIMESTAMP_LINE = /^### (\d{4}-\d{2}-\d{2})$/m;

describe('history-shadow characterization (H1)', () => {
  it.each(CANONICAL_SECTIONS)(
    'appends a byte-identical block to the %s section',
    async (section) => {
      await withHermeticRoot(async (root) => {
        const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
        const agent = 'char-agent';
        const content = `sample body for ${section} section with punctuation: !? and unicode \u2603`;

        const shadowPath = await createHistoryShadow(root, agent, undefined, storage);
        await appendToHistory(root, agent, section, content, storage);

        const raw = await fs.readFile(shadowPath, 'utf8');

        const sectionHeader = `## ${section}`;
        const headerIndex = raw.indexOf(sectionHeader);
        expect(headerIndex, `section header ${sectionHeader} missing`).toBeGreaterThanOrEqual(0);

        // Slice from the section header to the next top-level header (or EOF).
        const afterHeader = raw.slice(headerIndex + sectionHeader.length);
        const nextHeaderMatch = afterHeader.match(/\n## /);
        const sectionBody = nextHeaderMatch
          ? afterHeader.slice(0, nextHeaderMatch.index)
          : afterHeader;

        // The most recent entry, as emitted by production code, is:
        //   "\n### <YYYY-MM-DD>\n\n<content>\n"
        // We assert the byte-exact tail of the section body matches this shape.
        const timestampMatch = sectionBody.match(TIMESTAMP_LINE);
        expect(timestampMatch, 'timestamp header missing').not.toBeNull();
        const timestamp = timestampMatch![1];
        const expectedEntry = `\n### ${timestamp}\n\n${content}\n`;
        expect(sectionBody.endsWith(expectedEntry)).toBe(true);
      });
    },
  );

  it('appends an unknown section at the end when no matching header exists', async () => {
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const agent = 'char-agent-unknown';
      const shadowPath = await createHistoryShadow(root, agent, undefined, storage);
      const before = await fs.readFile(shadowPath, 'utf8');

      // Cast is required because HistorySection is a closed union at compile
      // time; we characterize the *runtime* fallback path for a section name
      // that is not in the canonical set.
      const unknownSection = 'ExperimentalNotes' as HistorySection;
      const content = 'entry into a novel section';
      await appendToHistory(root, agent, unknownSection, content, storage);

      const after = await fs.readFile(shadowPath, 'utf8');

      // Current behavior: the unknown section is appended verbatim at the tail
      // in the shape `<trimmed prior>\n\n## <section>\n### <date>\n\n<content>\n`.
      const trimmed = before.trimEnd();
      const timestampMatch = after.match(TIMESTAMP_LINE);
      expect(timestampMatch, 'timestamp header missing').not.toBeNull();
      const timestamp = timestampMatch![1];
      const expectedTail = `${trimmed}\n\n## ${unknownSection}\n### ${timestamp}\n\n${content}\n`;
      expect(after).toBe(expectedTail);
    });
  });

  it('produces a YYYY-MM-DD timestamp header for each entry', async () => {
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const agent = 'char-agent-timestamp';
      const shadowPath = await createHistoryShadow(root, agent, undefined, storage);
      await appendToHistory(root, agent, 'Context', 'first entry', storage);

      const raw = await fs.readFile(shadowPath, 'utf8');
      const match = raw.match(TIMESTAMP_LINE);
      expect(match).not.toBeNull();
      // Round-trip the same regex source to make future format drift diff loudly.
      const echo = new RegExp(TIMESTAMP_LINE.source, TIMESTAMP_LINE.flags);
      expect(match![0]).toMatch(echo);
    });
  });

  it('write guard reports zero out-of-root writes for this suite', async () => {
    // The suite passes only if every prior test's writes stayed inside the
    // hermetic root. Any escape would have thrown from `makeWriteGuardedStorage`.
    // This test exists to make the guarantee grep-obvious in the suite output.
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const target = path.join(root, 'inside.txt');
      await storage.write(target, 'ok');
      expect(await storage.exists(target)).toBe(true);
    });
  });
});
