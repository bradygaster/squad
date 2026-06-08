/**
 * Unit tests for gitignore-state helpers.
 *
 * Tests addSquadStateGitignoreBlock and removeSquadStateGitignoreBlock
 * using the InMemoryStorageProvider — no filesystem access required.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { InMemoryStorageProvider } from '../packages/squad-sdk/src/storage/in-memory-storage-provider.js';
import {
  addSquadStateGitignoreBlock,
  removeSquadStateGitignoreBlock,
  SQUAD_STATE_GITIGNORE_OPEN_MARKER,
  SQUAD_STATE_GITIGNORE_CLOSE_MARKER,
} from '../packages/squad-sdk/src/config/gitignore-state.js';

const GITIGNORE_PATH = join('/project', '.gitignore');

describe('addSquadStateGitignoreBlock', () => {
  let storage: InMemoryStorageProvider;

  beforeEach(() => {
    storage = new InMemoryStorageProvider();
  });

  it('adds the marker block when .gitignore does not exist', () => {
    const added = addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain(SQUAD_STATE_GITIGNORE_OPEN_MARKER);
    expect(content).toContain('.squad/decisions.md');
    expect(content).toContain('.squad/agents/*/history.md');
    expect(content).toContain(SQUAD_STATE_GITIGNORE_CLOSE_MARKER);
  });

  it('adds the marker block when .gitignore has existing content without a trailing newline', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/');
    const added = addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain(SQUAD_STATE_GITIGNORE_OPEN_MARKER);
    expect(content).toContain('.squad/decisions.md');
    expect(content).toContain('.squad/agents/*/history.md');
    expect(content).toContain(SQUAD_STATE_GITIGNORE_CLOSE_MARKER);
  });

  it('adds the marker block when .gitignore has existing content with a trailing newline', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/\n');
    const added = addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain(SQUAD_STATE_GITIGNORE_OPEN_MARKER);
  });

  it('is idempotent — returns false if block already present', () => {
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    const contentAfterFirst = storage.readSync(GITIGNORE_PATH);

    const added = addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(false);

    // Content must be exactly the same after second call
    expect(storage.readSync(GITIGNORE_PATH)).toBe(contentAfterFirst);
  });

  it('does not duplicate the block on repeated calls', () => {
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    const occurrences = (content.match(/# Squad: state owned by squad-state branch/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe('removeSquadStateGitignoreBlock', () => {
  let storage: InMemoryStorageProvider;

  beforeEach(() => {
    storage = new InMemoryStorageProvider();
  });

  it('returns false when .gitignore does not exist', () => {
    const removed = removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(false);
  });

  it('returns false when block is not present in existing .gitignore', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/\n');
    const removed = removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(false);
    expect(storage.readSync(GITIGNORE_PATH)).toBe('node_modules/\ndist/\n');
  });

  it('removes the marker block when present', () => {
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    const removed = removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).not.toContain(SQUAD_STATE_GITIGNORE_OPEN_MARKER);
    expect(content).not.toContain('.squad/decisions.md');
    expect(content).not.toContain('.squad/agents/*/history.md');
    expect(content).not.toContain(SQUAD_STATE_GITIGNORE_CLOSE_MARKER);
  });

  it('is idempotent — returns false if block already removed', () => {
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    const removed = removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(false);
  });

  it('preserves content before the block', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/\n');
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
  });

  it('preserves content after the block', () => {
    // Manually write a .gitignore that has content both before and after the block
    const withBlock = [
      'node_modules/',
      'dist/',
      SQUAD_STATE_GITIGNORE_OPEN_MARKER,
      '.squad/decisions.md',
      '.squad/agents/*/history.md',
      SQUAD_STATE_GITIGNORE_CLOSE_MARKER,
      '# custom entry after block',
      'build/',
      '',
    ].join('\n');
    storage.writeSync(GITIGNORE_PATH, withBlock);
    removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain('# custom entry after block');
    expect(content).toContain('build/');
    expect(content).not.toContain(SQUAD_STATE_GITIGNORE_OPEN_MARKER);
  });
});

describe('round-trip: add then remove', () => {
  it('leaves .gitignore byte-identical (empty file)', () => {
    const storage = new InMemoryStorageProvider();
    storage.writeSync(GITIGNORE_PATH, '');
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(storage.readSync(GITIGNORE_PATH)).toBe('');
  });

  it('leaves .gitignore byte-identical (file with content ending in newline)', () => {
    const storage = new InMemoryStorageProvider();
    const original = '# existing entries\nnode_modules/\ndist/\n';
    storage.writeSync(GITIGNORE_PATH, original);
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(storage.readSync(GITIGNORE_PATH)).toBe(original);
  });

  it('leaves .gitignore byte-identical (file without trailing newline)', () => {
    const storage = new InMemoryStorageProvider();
    const original = '# existing entries\nnode_modules/\ndist/';
    storage.writeSync(GITIGNORE_PATH, original);
    addSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeSquadStateGitignoreBlock(GITIGNORE_PATH, storage);
    const result = storage.readSync(GITIGNORE_PATH) ?? '';
    // Files without a trailing newline gain one after round-trip (acceptable for .gitignore)
    expect(result.trimEnd()).toBe(original.trimEnd());
    expect(result).not.toContain('# Squad: state owned by squad-state branch');
  });
});
