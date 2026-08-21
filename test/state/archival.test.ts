/**
 * Archival integrity tests — #1774, #1783, #1760.
 *
 * The bar for this file: **every behavioral test here fails against the
 * pre-fix state.** Not "asserts the instruction text exists" — instruction
 * text being present can never prove the instruction is obeyed (#1784).
 *
 * The centerpiece is `archives across a real commit boundary`: it builds an
 * actual git repo with `.squad/` in `.git/info/exclude`, reproduces the
 * pre-fix behavior to prove the data loss is real, then runs the fixed path
 * over identical inputs and asserts zero loss after committing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  archiveEntries,
  countEntries,
  demoteHeadings,
  extractHeadings,
  formatArchivalReport,
  isTrackedInGit,
  prepareInboxBodyForMerge,
  resolveTrackedDestination,
  splitEntries,
  ArchiveVerificationError,
  UntrackedArchiveDestinationError,
} from '../../packages/squad-sdk/src/state/io/archival.js';

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, stdio: 'pipe', encoding: 'utf8' });
}

const DECISIONS = `# Decisions

### 2026-03-26: Copilot git safety rules
**By:** EECOM
Never \`git add .\`.

### 2026-07-27: Dispatch Enforcement
**By:** Procedures
Stop the coordinator doing domain work inline.

### 2026-08-19: Recent decision that must survive
**By:** Flight
Still inside the retention window.
`;

const OLD_HEADINGS = [
  '### 2026-03-26: Copilot git safety rules',
  '### 2026-07-27: Dispatch Enforcement',
];

const isOld = (e: { heading: string }) => OLD_HEADINGS.includes(e.heading);

describe('archival integrity', () => {
  let repo: string;
  let squad: string;
  let source: string;
  let trackedArchive: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'squad-archival-'));
    squad = path.join(repo, '.squad');
    mkdirSync(squad, { recursive: true });

    git(repo, 'init', '--initial-branch=main');
    git(repo, 'config', 'user.email', 'fido@squad.test');
    git(repo, 'config', 'user.name', 'FIDO');
    git(repo, 'config', 'commit.gpgsign', 'false');

    source = path.join(squad, 'decisions.md');
    trackedArchive = path.join(squad, 'decisions-archive.md');
    writeFileSync(source, DECISIONS, 'utf8');
    writeFileSync(trackedArchive, '# Decisions Archive\n', 'utf8');

    // Track both files FIRST, then exclude `.squad/`. This reproduces the exact
    // production condition in #1783: already-tracked files still commit, but
    // anything new under `.squad/` is silently never added.
    git(repo, 'add', '--', '.squad/decisions.md', '.squad/decisions-archive.md');
    git(repo, 'commit', '-m', 'seed state');
    appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '\n.squad/\n', 'utf8');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  describe('#1783 — writes to untracked destinations are deletions', () => {
    it('reproduces the pre-fix data loss across a real commit boundary', () => {
      // Pre-fix behavior, replayed literally: append to a NEW timestamped file,
      // then trim the source. No tracked-destination check anywhere.
      const untracked = path.join(squad, 'decisions', 'archive', '2026-08-20-archived-pre7d.md');
      mkdirSync(path.dirname(untracked), { recursive: true });

      const { preamble, entries } = splitEntries(readFileSync(source, 'utf8'));
      const moved = entries.filter(isOld);
      writeFileSync(untracked, moved.map((e) => e.text).join('\n\n'), 'utf8');
      writeFileSync(
        source,
        [preamble.trim(), ...entries.filter((e) => !isOld(e)).map((e) => e.text.trim())].join('\n\n'),
        'utf8',
      );

      // Stage the way a real run does. `git add -u` is the only staging verb
      // that works on tracked files once `.squad/` is excluded — and it stages
      // ONLY tracked paths, so the brand-new archive is silently skipped.
      // That asymmetry is defect #1783 in one command.
      git(repo, 'add', '-u');
      git(repo, 'commit', '-m', 'archive');

      const staged = git(repo, 'show', '--stat', '--name-only', 'HEAD');
      expect(staged).not.toContain('decisions/archive');

      const committed = git(repo, 'ls-tree', '-r', '--name-only', 'HEAD');
      // The destination never made it into the commit...
      expect(committed).not.toContain('decisions/archive');

      // ...and the entries are gone from the committed tree entirely.
      const committedSource = git(repo, 'show', 'HEAD:.squad/decisions.md');
      const committedArchive = git(repo, 'show', 'HEAD:.squad/decisions-archive.md');
      for (const heading of OLD_HEADINGS) {
        expect(committedSource).not.toContain(heading);
        expect(committedArchive).not.toContain(heading);
      }
    });

    it('refuses to write to an untracked destination', () => {
      const untracked = path.join(squad, 'decisions', 'archive', '2026-08-20-archived-pre7d.md');
      mkdirSync(path.dirname(untracked), { recursive: true });

      expect(() =>
        archiveEntries({
          sourcePath: source,
          destinationPath: untracked,
          repoRoot: repo,
          select: isOld,
        }),
      ).toThrow(UntrackedArchiveDestinationError);

      // Source is untouched — a refused archive is a no-op, never a deletion.
      const after = readFileSync(source, 'utf8');
      for (const heading of OLD_HEADINGS) expect(after).toContain(heading);
    });

    it('redirects to a tracked archive and loses nothing across a commit boundary', () => {
      const untracked = path.join(squad, 'decisions', 'archive', '2026-08-20-archived-pre7d.md');
      mkdirSync(path.dirname(untracked), { recursive: true });

      const result = archiveEntries({
        sourcePath: source,
        destinationPath: untracked,
        repoRoot: repo,
        fallbackDestination: trackedArchive,
        select: isOld,
      });

      expect(result.redirected).toBe(true);
      expect(result.destination).toBe(trackedArchive);
      expect(result.removedFromSource).toBe(2);
      expect(result.addedToDestination).toBe(2);

      git(repo, 'add', '-u');
      git(repo, 'commit', '-m', 'archive');

      // Literal containment across the commit boundary: every heading that left
      // the source is present in the committed archive. Zero loss.
      const committedSource = git(repo, 'show', 'HEAD:.squad/decisions.md');
      const committedArchive = git(repo, 'show', 'HEAD:.squad/decisions-archive.md');
      for (const heading of OLD_HEADINGS) {
        expect(committedSource).not.toContain(heading);
        expect(committedArchive).toContain(heading);
      }
      expect(committedSource).toContain('### 2026-08-19: Recent decision that must survive');
    });

    it('detects tracked vs untracked correctly under an excluded .squad/', () => {
      const untracked = path.join(squad, 'brand-new.md');
      writeFileSync(untracked, 'x\n', 'utf8');

      expect(isTrackedInGit(trackedArchive, repo)).toBe(true);
      expect(isTrackedInGit(untracked, repo)).toBe(false);
      expect(resolveTrackedDestination({ destination: trackedArchive, repoRoot: repo })).toEqual({
        destination: trackedArchive,
        redirected: false,
      });
    });
  });

  describe('#1774 — append must land before the trim', () => {
    it('archives to a tracked destination and balances the counts', () => {
      const result = archiveEntries({
        sourcePath: source,
        destinationPath: trackedArchive,
        repoRoot: repo,
        select: isOld,
      });

      expect(result.removedFromSource).toBe(2);
      expect(result.addedToDestination).toBe(2);

      const archive = readFileSync(trackedArchive, 'utf8');
      const remaining = readFileSync(source, 'utf8');
      for (const heading of OLD_HEADINGS) {
        expect(archive).toContain(heading);
        expect(remaining).not.toContain(heading);
      }
      // Bodies travel with their headings — not just the heading lines.
      expect(archive).toContain('Never `git add .`.');
      expect(archive).toContain('Stop the coordinator doing domain work inline.');
    });

    it('leaves the source intact when the append cannot be verified', () => {
      // #1774's failure mode: the append does not happen. The trim must not
      // happen either. Destination is a directory, so the append throws — and
      // git tracking is stubbed so we get past rule 1 and actually exercise
      // the ordering rule rather than the destination rule.
      const brokenDest = path.join(squad, 'not-a-file');
      mkdirSync(brokenDest, { recursive: true });
      const original = readFileSync(source, 'utf8');

      expect(() =>
        archiveEntries({
          sourcePath: source,
          destinationPath: brokenDest,
          repoRoot: repo,
          select: isOld,
          git: () => 0,
        }),
      ).toThrow();

      // The trim never ran: every entry is still in the source.
      expect(readFileSync(source, 'utf8')).toBe(original);
      for (const heading of OLD_HEADINGS) expect(readFileSync(source, 'utf8')).toContain(heading);
    });

    it('leaves the source intact when the destination silently drops the append', () => {
      // #1774 verbatim: the append is issued and reports success, but nothing
      // lands. Verification re-reads and must catch it — and the trim must
      // never run. The io seam models a destination that swallows writes.
      const original = readFileSync(source, 'utf8');
      let appendCalls = 0;

      expect(() =>
        archiveEntries({
          sourcePath: source,
          destinationPath: trackedArchive,
          repoRoot: repo,
          select: isOld,
          io: {
            readFile: (p) => readFileSync(p, 'utf8'),
            exists: () => true,
            writeFile: (p, d) => writeFileSync(p, d, 'utf8'),
            // Swallow the append — exactly what #1774 did.
            appendFile: () => {
              appendCalls += 1;
            },
          },
        }),
      ).toThrow(ArchiveVerificationError);

      expect(appendCalls).toBe(1);
      // The trim never ran. This is the whole point of append-verify-then-trim.
      expect(readFileSync(source, 'utf8')).toBe(original);
      for (const heading of OLD_HEADINGS) {
        expect(readFileSync(source, 'utf8')).toContain(heading);
      }
    });

    it('reports counts, and refuses to report an unbalanced result', () => {
      const result = archiveEntries({
        sourcePath: source,
        destinationPath: trackedArchive,
        repoRoot: repo,
        select: isOld,
      });

      const report = formatArchivalReport(result, repo);
      expect(report).toContain('2 removed from source');
      expect(report).toContain('2 added to');
      // Rule 3: sizes are never an integrity signal, so they never appear.
      expect(report).not.toMatch(/\d+\s*(KB|bytes|B\b)/i);

      expect(() =>
        formatArchivalReport({ ...result, addedToDestination: 0 }),
      ).toThrow(ArchiveVerificationError);
    });

    it('reports a measured zero rather than assuming "no archival required"', () => {
      const result = archiveEntries({
        sourcePath: source,
        destinationPath: trackedArchive,
        repoRoot: repo,
        select: () => false,
      });
      expect(formatArchivalReport(result)).toContain('measured 0 entries eligible');
    });
  });

  describe('#1760 — inbox headings must be demoted on merge', () => {
    it('demotes ## sections to #### beneath an ### entry', () => {
      const inbox = '## Context\nWhy.\n\n## Decision\nWhat.\n\n## Consequences\nSo what.\n';
      const merged = prepareInboxBodyForMerge(inbox);

      expect(merged).toContain('#### Context');
      expect(merged).toContain('#### Decision');
      expect(merged).toContain('#### Consequences');
      expect(merged).not.toMatch(/^## /m);
    });

    it('preserves relative structure', () => {
      const inbox = '## Context\n### Detail\n#### Sub\n';
      expect(prepareInboxBodyForMerge(inbox)).toBe('#### Context\n##### Detail\n###### Sub\n');
    });

    it('normalizes an inbox body that already starts at ###', () => {
      expect(prepareInboxBodyForMerge('### Context\nx\n')).toBe('#### Context\nx\n');
    });

    it('is fence-aware — # comments in code samples are never demoted', () => {
      const inbox = [
        '## Context',
        '',
        '```bash',
        '# Just add to the Modes table:',
        '# In workflows/squad.md:',
        '```',
        '',
        '## Decision',
      ].join('\n');

      const merged = prepareInboxBodyForMerge(inbox);
      expect(merged).toContain('# Just add to the Modes table:');
      expect(merged).toContain('# In workflows/squad.md:');
      expect(merged).not.toContain('### Just add to the Modes table:');
      expect(merged).toContain('#### Context');
      expect(merged).toContain('#### Decision');
    });

    it('clamps at h6 instead of emitting #######', () => {
      expect(demoteHeadings('##### Deep\n', 3)).toBe('###### Deep\n');
    });

    it('does not count fenced # comments as headings', () => {
      const md = '### Real\n\n```\n# Fake\n## Also fake\n```\n\n### Second\n';
      expect(countEntries(md)).toBe(2);
      expect(extractHeadings(md, 3)).toEqual(['### Real', '### Second']);
    });

    it('does not split entries on fenced headings', () => {
      const md = '# Decisions\n\n### One\n```\n### Not an entry\n```\nbody\n\n### Two\nbody\n';
      const { entries } = splitEntries(md);
      expect(entries.map((e) => e.heading)).toEqual(['### One', '### Two']);
      expect(entries[0].text).toContain('### Not an entry');
    });
  });

  // `.squad/decisions.md` is CRLF on Windows, where this repo is developed.
  // JS's `.` does not match `\r`, so a heading regex ending in `(.*)$` matches
  // ZERO headings in a CRLF document. That failure mode is silent and total:
  // demotion becomes a no-op, and append-verification "passes" having checked
  // nothing. These tests pin the behaviour on real CRLF input.
  describe('CRLF documents must behave identically to LF', () => {
    const crlf = (s: string) => s.replace(/\n/g, '\r\n');

    it('counts entries in a CRLF document', () => {
      const md = crlf('# Decisions\n\n### One\nbody\n\n### Two\nbody\n');
      expect(countEntries(md)).toBe(2);
      expect(extractHeadings(md, 3)).toEqual(['### One', '### Two']);
    });

    it('splits entries in a CRLF document', () => {
      const md = crlf('# Decisions\n\n### One\nbody\n\n### Two\nbody\n');
      const { entries } = splitEntries(md);
      expect(entries.map((e) => e.heading)).toEqual(['### One', '### Two']);
    });

    it('demotes CRLF inbox headings and preserves the line endings', () => {
      const inbox = crlf('## Context\nWhy.\n\n## Decision\nWhat.\n');
      const merged = prepareInboxBodyForMerge(inbox);

      expect(merged).toContain('#### Context');
      expect(merged).toContain('#### Decision');
      expect(merged).toBe(crlf('#### Context\nWhy.\n\n#### Decision\nWhat.\n'));
      expect(merged).not.toMatch(/\r\r/);
    });

    it('stays fence-aware in a CRLF document', () => {
      const inbox = crlf('## Context\n\n```bash\n# In workflows/squad.md:\n```\n\n## Decision\n');
      const merged = prepareInboxBodyForMerge(inbox);

      expect(merged).toContain('# In workflows/squad.md:');
      expect(merged).not.toContain('### In workflows/squad.md:');
      expect(merged).toContain('#### Context');
    });

    it('does not silently report "no archival required" for a CRLF source', () => {
      // The pre-fix regex found no `###` headings here, so archiveEntries
      // short-circuited to a 0/0 result — reproducing the exact false
      // "no archival required" gate report from #1783.
      writeFileSync(source, crlf('# Decisions\n\n### Old entry\nbody\n\n### Keep me\nbody\n'), 'utf8');

      const result = archiveEntries({
        sourcePath: source,
        destinationPath: trackedArchive,
        repoRoot: repo,
        select: (e) => e.heading.includes('Old entry'),
      });

      expect(result.removedFromSource).toBe(1);
      expect(result.addedToDestination).toBe(1);
      expect(formatArchivalReport(result)).not.toContain('measured 0 entries eligible');
      expect(readFileSync(trackedArchive, 'utf8')).toContain('### Old entry');
      expect(readFileSync(source, 'utf8')).toContain('### Keep me');
      expect(readFileSync(source, 'utf8')).not.toContain('### Old entry');
    });

    it('preserves CRLF line endings rather than rewriting the whole file', () => {
      writeFileSync(source, crlf('# Decisions\n\n### Old entry\nbody\n\n### Keep me\nbody\n'), 'utf8');
      writeFileSync(trackedArchive, crlf('# Decisions Archive\n'), 'utf8');

      archiveEntries({
        sourcePath: source,
        destinationPath: trackedArchive,
        repoRoot: repo,
        select: (e) => e.heading.includes('Old entry'),
      });

      // No bare LF may survive: every \n must be preceded by \r.
      for (const file of [source, trackedArchive]) {
        const text = readFileSync(file, 'utf8');
        expect(text.replace(/\r\n/g, '')).not.toContain('\n');
      }
    });
  });

  // A split that is not lossless is a data-loss bug wearing a parser costume.
  // `.squad/decisions.md` carries ~60 stray `##`/`#` headings spliced under
  // `###` entries (#1760); if those act as entry boundaries, everything after
  // them is re-homed into the preamble and the rebuild reorders the document.
  describe('splitEntries must be lossless', () => {
    const roundTrip = (md: string) => {
      const { preamble, entries } = splitEntries(md);
      return [preamble, ...entries.map((e) => e.text)].join('\n');
    };

    it('round-trips a document whose entries contain stray shallower headings', () => {
      const md = [
        '# Decisions',
        '',
        '### 2026-01-01: First',
        '## Context',
        'why',
        '## Decision',
        'what',
        '',
        '### 2026-02-02: Second',
        '# Stray h1 inside an entry',
        'tail that must stay with Second',
        '',
      ].join('\n');

      expect(roundTrip(md)).toBe(md);

      const { entries } = splitEntries(md);
      expect(entries.map((e) => e.heading)).toEqual([
        '### 2026-01-01: First',
        '### 2026-02-02: Second',
      ]);
      expect(entries[1]?.text).toContain('tail that must stay with Second');
    });

    it('round-trips the real .squad/decisions.md byte-for-byte', () => {
      const real = path.join(process.cwd(), '.squad', 'decisions.md');
      if (!existsSync(real)) return; // not present in a consumer checkout
      const md = readFileSync(real, 'utf8');

      expect(countEntries(md)).toBeGreaterThan(0);
      expect(roundTrip(md)).toBe(md);
    });
  });
});
