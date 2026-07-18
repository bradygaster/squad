/**
 * Characterization tests for history-shadow round-trip and merge behavior.
 *
 * Covers Gap H1: append shape per canonical section, unknown section append
 * fallback, and timestamp format stability. Concurrency and happy-path
 * lifecycle are already covered by `test/history-shadow.test.ts` and are
 * intentionally not duplicated here.
 *
 * Current-bug note: the section-boundary regex in `appendToHistory`
 * (`packages/squad-sdk/src/agents/history-shadow.ts`) is built as
 * `` (?=^##\s|\Z) `` and intends `\Z` to mean "end of string". JavaScript has
 * no `\Z` end-of-string escape; it is parsed as the literal character "Z".
 * For every section except the last one, a following `## ` header still
 * lets the lookahead succeed, so those appends work, but the same
 * `trimEnd()`-before-splice step also collapses the blank line that used to
 * separate sections. For the terminal section (`References`, which has no
 * following header and no literal "Z" in its body) the lookahead can never
 * succeed, so the existing header is never matched and a *second*
 * `## References` header is appended at the tail of the file instead of the
 * entry being inserted inline. Both effects are characterized below exactly
 * as they behave today; neither assertion below endorses the behavior as
 * desired. See the tracked follow-up issue for the production fix.
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

// The terminal section is characterized separately below: current
// production behavior duplicates its header instead of appending inline
// (see file-level comment). The remaining sections are each followed by
// another section header, so their append path succeeds.
const NON_TERMINAL_SECTIONS = CANONICAL_SECTIONS.slice(0, -1);
const TERMINAL_SECTION = CANONICAL_SECTIONS[CANONICAL_SECTIONS.length - 1];

const TIMESTAMP_LINE = /^### (\d{4}-\d{2}-\d{2})$/m;

describe('history-shadow characterization (H1)', () => {
  it.each(NON_TERMINAL_SECTIONS)(
    'appends a block to the %s section, immediately abutting the next header',
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

        // Current behavior: appendToHistory trims trailing whitespace off
        // the prior section content before splicing in the new entry. That
        // collapses the blank line that originally separated sections, so
        // the entry's own trailing newline becomes the single newline
        // immediately preceding the next `## ` header rather than a
        // preserved blank line plus a separate separator. The section body,
        // as sliced up to that boundary, therefore ends with the entry text
        // minus its final newline (that newline is the boundary itself).
        const entryWithoutTrailingNewline = `\n### ${timestamp}\n\n${content}`;
        expect(sectionBody.endsWith(entryWithoutTrailingNewline)).toBe(true);
      });
    },
  );

  it(
    `current bug: appending to the terminal ${TERMINAL_SECTION} section duplicates its header ` +
      'instead of inserting inline',
    async () => {
      await withHermeticRoot(async (root) => {
        const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
        const agent = 'char-agent-terminal';
        const content = `sample body for ${TERMINAL_SECTION} section with punctuation: !? and unicode \u2603`;

        const shadowPath = await createHistoryShadow(root, agent, undefined, storage);
        const before = await fs.readFile(shadowPath, 'utf8');
        await appendToHistory(root, agent, TERMINAL_SECTION, content, storage);
        const after = await fs.readFile(shadowPath, 'utf8');

        const sectionHeader = `## ${TERMINAL_SECTION}`;

        // See file-level comment: the `\Z` typo means the section-boundary
        // regex never matches for the terminal section, so appendToHistory
        // falls back to its "section not found" branch and appends a brand
        // new header at the tail instead of writing into the existing one.
        const occurrences = after.split(sectionHeader).length - 1;
        expect(occurrences, 'current bug duplicates the header').toBe(2);

        const firstIndex = after.indexOf(sectionHeader);
        const secondIndex = after.indexOf(sectionHeader, firstIndex + sectionHeader.length);
        expect(secondIndex).toBeGreaterThan(firstIndex);

        // The original section's content is left untouched by the append
        // (aside from trailing-whitespace normalization performed by the
        // "section not found" branch's own trimEnd(), which happens before
        // the duplicate header is spliced in).
        const originalSectionSlice = before.slice(before.indexOf(sectionHeader));
        const untouchedSlice = after.slice(firstIndex, secondIndex);
        expect(untouchedSlice.trimEnd()).toBe(originalSectionSlice.trimEnd());

        // The duplicated (second) header starts a fresh section containing
        // only the new entry, and is the exact tail of the file.
        const timestampMatch = after.match(TIMESTAMP_LINE);
        expect(timestampMatch, 'timestamp header missing').not.toBeNull();
        const timestamp = timestampMatch![1];
        const expectedTail = `${sectionHeader}\n### ${timestamp}\n\n${content}\n`;
        expect(after.slice(secondIndex)).toBe(expectedTail);
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
