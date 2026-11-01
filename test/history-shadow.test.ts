/**
 * Tests for history-shadow.ts — specifically the race condition fix (#479).
 *
 * Verifies that:
 *  1. appendToHistory still works correctly for single callers (regression)
 *  2. Concurrent appendToHistory calls do not lose data (the race condition)
 *  3. Lock files are cleaned up after operations complete
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  createHistoryShadow,
  appendToHistory,
  readHistory,
  deleteHistoryShadow,
  shadowExists,
} from '@bradygaster/squad-sdk/agents';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'squad-history-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('history-shadow (#479 race condition fix)', () => {

  describe('appendToHistory — single caller (regression)', () => {
    it('should append to an existing section', async () => {
      await createHistoryShadow(tmpDir, 'testbot', 'Initial context');

      await appendToHistory(tmpDir, 'testbot', 'Learnings', 'Learned thing one');

      const history = await readHistory(tmpDir, 'testbot');
      expect(history.learnings).toContain('Learned thing one');
    });

    it('should append multiple entries sequentially', async () => {
      await createHistoryShadow(tmpDir, 'testbot');

      await appendToHistory(tmpDir, 'testbot', 'Learnings', 'Entry A');
      await appendToHistory(tmpDir, 'testbot', 'Learnings', 'Entry B');
      await appendToHistory(tmpDir, 'testbot', 'Decisions', 'Decision X');

      const history = await readHistory(tmpDir, 'testbot');
      expect(history.learnings).toContain('Entry A');
      expect(history.learnings).toContain('Entry B');
      expect(history.decisions).toContain('Decision X');
    });

    it('should create a section if it does not exist', async () => {
      // Create a minimal history file without a Patterns section
      const agentDir = path.join(tmpDir, '.squad', 'agents', 'testbot');
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(
        path.join(agentDir, 'history.md'),
        '# Testbot — Session History\n\n## Learnings\n\n<!-- empty -->\n',
        'utf-8',
      );

      await appendToHistory(tmpDir, 'testbot', 'Patterns', 'Pattern found');

      const history = await readHistory(tmpDir, 'testbot');
      expect(history.fullContent).toContain('## Patterns');
      expect(history.fullContent).toContain('Pattern found');
    });
  });

  describe('section boundaries', () => {
    async function writeHistory(content: string): Promise<string> {
      const agentDir = path.join(tmpDir, '.squad', 'agents', 'testbot');
      await fs.mkdir(agentDir, { recursive: true });
      const file = path.join(agentDir, 'history.md');
      await fs.writeFile(file, content, 'utf-8');
      return file;
    }

    it('should append to a terminal section without duplicating its header', async () => {
      const file = await writeHistory('# Testbot\n\n## Learnings\n\nfirst\n\n## References\n\n- ref one\n');

      await appendToHistory(tmpDir, 'testbot', 'References', 'ref two');

      const raw = await fs.readFile(file, 'utf-8');
      expect(raw.match(/^## References/gm)).toHaveLength(1);
      const history = await readHistory(tmpDir, 'testbot');
      expect(history.references).toContain('ref one');
      expect(history.references).toContain('ref two');
    });

    it('should keep a blank line before the next section header', async () => {
      const file = await writeHistory('# Testbot\n\n## Learnings\n\nfirst\n\n## Decisions\n\nd1\n');

      await appendToHistory(tmpDir, 'testbot', 'Learnings', 'second');

      const raw = await fs.readFile(file, 'utf-8');
      expect(raw).toMatch(/second\n\n## Decisions/);
    });

    it('should read a terminal section', async () => {
      await writeHistory('# Testbot\n\n## Learnings\n\nfirst\n\n## References\n\n- ref one\n');

      const history = await readHistory(tmpDir, 'testbot');
      expect(history.references).toBe('- ref one');
      expect(history.learnings).toBe('first');
    });
  });

  describe('appendToHistory — concurrent callers (race condition)', () => {
    it('should not lose data when 5 agents append concurrently', async () => {
      await createHistoryShadow(tmpDir, 'sharedbot', 'Shared context');

      const entries = Array.from({ length: 5 }, (_, i) => `Concurrent entry ${i}`);

      // Fire all appends concurrently — the old code would lose all but the last
      await Promise.all(
        entries.map(entry =>
          appendToHistory(tmpDir, 'sharedbot', 'Learnings', entry),
        ),
      );

      const history = await readHistory(tmpDir, 'sharedbot');

      // Every single entry must be present — no last-write-wins data loss
      for (const entry of entries) {
        expect(history.learnings).toContain(entry);
      }
    });

    it('should not lose data when appending to different sections concurrently', async () => {
      await createHistoryShadow(tmpDir, 'multibot', 'Multi-section test');

      await Promise.all([
        appendToHistory(tmpDir, 'multibot', 'Learnings', 'Learn concurrent'),
        appendToHistory(tmpDir, 'multibot', 'Decisions', 'Decide concurrent'),
        appendToHistory(tmpDir, 'multibot', 'Patterns', 'Pattern concurrent'),
      ]);

      const history = await readHistory(tmpDir, 'multibot');
      expect(history.learnings).toContain('Learn concurrent');
      expect(history.decisions).toContain('Decide concurrent');
      expect(history.fullContent).toContain('Pattern concurrent');
    });

    it('should handle 10 rapid concurrent appends without data loss', async () => {
      await createHistoryShadow(tmpDir, 'stressbot', 'Stress test');

      const count = 10;
      const entries = Array.from({ length: count }, (_, i) => `Stress-entry-${i}`);

      await Promise.all(
        entries.map(entry =>
          appendToHistory(tmpDir, 'stressbot', 'Learnings', entry),
        ),
      );

      const history = await readHistory(tmpDir, 'stressbot');
      for (const entry of entries) {
        expect(history.learnings).toContain(entry);
      }
    });
  });

  describe('lock file cleanup', () => {
    it('should not leave lock files after successful operation', async () => {
      await createHistoryShadow(tmpDir, 'cleanbot');
      await appendToHistory(tmpDir, 'cleanbot', 'Learnings', 'Clean entry');

      const agentDir = path.join(tmpDir, '.squad', 'agents', 'cleanbot');
      const files = await fs.readdir(agentDir);
      const lockFiles = files.filter(f => f.endsWith('.lock'));

      expect(lockFiles).toHaveLength(0);
    });

    it('should not leave temp files after successful operation', async () => {
      await createHistoryShadow(tmpDir, 'cleanbot2');
      await appendToHistory(tmpDir, 'cleanbot2', 'Learnings', 'Clean entry 2');

      const agentDir = path.join(tmpDir, '.squad', 'agents', 'cleanbot2');
      const files = await fs.readdir(agentDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));

      expect(tmpFiles).toHaveLength(0);
    });

    it('should not leave lock files after concurrent operations', async () => {
      await createHistoryShadow(tmpDir, 'cleanbot3');

      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          appendToHistory(tmpDir, 'cleanbot3', 'Learnings', `Clean concurrent ${i}`),
        ),
      );

      const agentDir = path.join(tmpDir, '.squad', 'agents', 'cleanbot3');
      const files = await fs.readdir(agentDir);
      const lockFiles = files.filter(f => f.endsWith('.lock'));
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));

      expect(lockFiles).toHaveLength(0);
      expect(tmpFiles).toHaveLength(0);
    });
  });

  describe('existing API contract (regression)', () => {
    it('createHistoryShadow creates the file', async () => {
      const shadowPath = await createHistoryShadow(tmpDir, 'newbot', 'Hello');
      expect(await shadowExists(tmpDir, 'newbot')).toBe(true);
      const content = await fs.readFile(shadowPath, 'utf-8');
      expect(content).toContain('Hello');
    });

    it('createHistoryShadow does not overwrite existing', async () => {
      await createHistoryShadow(tmpDir, 'existbot', 'First');
      await appendToHistory(tmpDir, 'existbot', 'Learnings', 'Important');

      // Call create again — must not overwrite
      await createHistoryShadow(tmpDir, 'existbot', 'Second');
      const history = await readHistory(tmpDir, 'existbot');
      expect(history.learnings).toContain('Important');
    });

    it('deleteHistoryShadow removes the file', async () => {
      await createHistoryShadow(tmpDir, 'delbot');
      expect(await shadowExists(tmpDir, 'delbot')).toBe(true);
      await deleteHistoryShadow(tmpDir, 'delbot');
      expect(await shadowExists(tmpDir, 'delbot')).toBe(false);
    });

    it('readHistory returns empty for non-existent agent', async () => {
      const history = await readHistory(tmpDir, 'ghost');
      expect(history.fullContent).toBe('');
    });

    it('appendToHistory throws if shadow does not exist', async () => {
      await expect(
        appendToHistory(tmpDir, 'nobot', 'Learnings', 'Fail'),
      ).rejects.toThrow(/History shadow not found/);
    });
  });
});
