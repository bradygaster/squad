/**
 * Characterization tests for history-shadow round-trip and merge behavior.
 *
 * Covers Gap H1: append shape per canonical section, unknown section append
 * fallback, and timestamp format stability. Concurrency and happy-path
 * lifecycle are already covered by `test/history-shadow.test.ts` and are
 * intentionally not duplicated here.
 *
 * Regression note: the section-boundary regex in `appendToHistory`
 * (`packages/squad-sdk/src/agents/history-shadow.ts`) previously ended in
 * `\Z`, which JavaScript parses as the literal character "Z", so the terminal
 * `References` section was never matched (a duplicate header was appended) and
 * non-terminal appends dropped the blank line before the next header. The
 * regex now uses `(?![\s\S])` for end-of-input; both behaviors are pinned
 * below in their fixed form.
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

// The terminal section is characterized separately below because it has no
// following header. The remaining sections are each followed by another
// section header.
const NON_TERMINAL_SECTIONS = CANONICAL_SECTIONS.slice(0, -1);
const TERMINAL_SECTION = CANONICAL_SECTIONS[CANONICAL_SECTIONS.length - 1];

const TIMESTAMP_LINE = /^### (\d{4}-\d{2}-\d{2})$/m;

describe('history-shadow characterization (H1)', () => {
  it.each(NON_TERMINAL_SECTIONS)(
    'appends a block to the %s section, preserving a blank line before the next header',
    async (section) => {
      await withHermeticRoot(async (root) => {
        const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
        const agent = 'char-agent';
        const content = `sample body for ${section} section with punctuation: !? and unicode \u2603`;

        const shadowPath = await createHistoryShadow(root, agent, undefined, storage);
        await appendToHistory(root, agent, section, content, storage);

        const raw = await fs.readFile(shadowPath, 'utf8');

        const sectionHeader = `## ${section}`;
        expect(
          raw.split(sectionHeader).length - 1,
          `${sectionHeader} should appear exactly once`,
        ).toBe(1);

        const headerIndex = raw.indexOf(sectionHeader);
        expect(headerIndex, `section header ${sectionHeader} missing`).toBeGreaterThanOrEqual(0);

        // Slice from the section header to the next top-level header.
        const afterHeader = raw.slice(headerIndex + sectionHeader.length);
        const nextHeaderMatch = afterHeader.match(/\n## /);
        expect(nextHeaderMatch, 'a following section header is expected').not.toBeNull();
        const sectionBody = afterHeader.slice(0, nextHeaderMatch!.index);

        const timestampMatch = sectionBody.match(TIMESTAMP_LINE);
        expect(timestampMatch, 'timestamp header missing').not.toBeNull();
        const timestamp = timestampMatch![1];

        // appendToHistory trims the prior section content, splices in the
        // entry, and keeps a blank line before the next `## ` header. The
        // body sliced up to that header's "\n## " therefore ends with the
        // entry plus its own trailing newline (the blank line is the
        // remaining newline that is part of the boundary match).
        const entryWithTrailingNewline = `\n### ${timestamp}\n\n${content}\n`;
        expect(sectionBody.endsWith(entryWithTrailingNewline)).toBe(true);
      });
    },
  );

  it(`appends to the terminal ${TERMINAL_SECTION} section inline without duplicating its header`, async () => {
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const agent = 'char-agent-terminal';
      const content = `sample body for ${TERMINAL_SECTION} section with punctuation: !? and unicode \u2603`;

      const shadowPath = await createHistoryShadow(root, agent, undefined, storage);
      const before = await fs.readFile(shadowPath, 'utf8');
      await appendToHistory(root, agent, TERMINAL_SECTION, content, storage);
      const after = await fs.readFile(shadowPath, 'utf8');

      const sectionHeader = `## ${TERMINAL_SECTION}`;
      expect(after.split(sectionHeader).length - 1, 'header should appear once').toBe(1);

      const timestampMatch = after.match(TIMESTAMP_LINE);
      expect(timestampMatch, 'timestamp header missing').not.toBeNull();
      const timestamp = timestampMatch![1];
      expect(after).toBe(`${before.trimEnd()}\n### ${timestamp}\n\n${content}\n`);
    });
  });

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

  it('write guard resolves a relative target against the hermetic root, not process.cwd()', async () => {
    // A relative target must be judged against the hermetic root regardless
    // of the test runner's current working directory. A relative path that
    // stays inside the root is permitted; a relative path that traverses
    // above the root is refused.
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);

      await storage.write('nested/inside.txt', 'ok');
      expect(await storage.exists(path.join(root, 'nested', 'inside.txt'))).toBe(true);

      await expect(storage.write('../escape.txt', 'nope')).rejects.toThrow(
        /Hermetic write guard/,
      );
    });
  });
});
