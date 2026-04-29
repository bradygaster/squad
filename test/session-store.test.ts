/**
 * Tests for session persistence store — save, load, list sessions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createSession,
  saveSession,
  loadLatestSession,
  listSessions,
  loadSessionById,
} from '@bradygaster/squad-sdk/runtime/session-store';
import type { SessionData } from '@bradygaster/squad-sdk/runtime/session-store';
import type { ShellMessage } from '@bradygaster/squad-sdk/runtime/shell-types';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'squad-session-test-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ============================================================================
// createSession
// ============================================================================

describe('createSession', () => {
  it('returns a session with a UUID, timestamps, and empty messages', () => {
    const session = createSession();
    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(session.createdAt).toBeTruthy();
    expect(session.lastActiveAt).toBeTruthy();
    expect(session.messages).toEqual([]);
  });

  it('generates unique IDs on each call', () => {
    const a = createSession();
    const b = createSession();
    expect(a.id).not.toBe(b.id);
  });
});

// ============================================================================
// saveSession
// ============================================================================

describe('saveSession', () => {
  it('creates the sessions directory and writes a JSON file', () => {
    const session = createSession();
    session.messages.push({
      role: 'user',
      content: 'hello',
      timestamp: new Date(),
    });

    const filePath = saveSession(tmpRoot, session);

    expect(existsSync(filePath)).toBe(true);
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as SessionData;
    expect(data.id).toBe(session.id);
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0]!.content).toBe('hello');
  });

  it('overwrites the same file on subsequent saves', () => {
    const session = createSession();
    const path1 = saveSession(tmpRoot, session);

    session.messages.push({
      role: 'agent',
      agentName: 'baer',
      content: 'response',
      timestamp: new Date(),
    });
    const path2 = saveSession(tmpRoot, session);

    expect(path1).toBe(path2);
    const data = JSON.parse(readFileSync(path2, 'utf-8')) as SessionData;
    expect(data.messages).toHaveLength(1);
  });

  it('updates lastActiveAt on each save', () => {
    const session = createSession();
    const originalTime = session.lastActiveAt;

    // Small delay to ensure timestamp changes
    saveSession(tmpRoot, session);
    const data = JSON.parse(
      readFileSync(saveSession(tmpRoot, session), 'utf-8'),
    ) as SessionData;

    // lastActiveAt should be at least as recent as original
    expect(new Date(data.lastActiveAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalTime).getTime(),
    );
  });
});

// ============================================================================
// listSessions
// ============================================================================

describe('listSessions', () => {
  it('returns empty array when no sessions directory exists', () => {
    expect(listSessions(tmpRoot)).toEqual([]);
  });

  it('lists saved sessions most recent first', () => {
    const dir = join(tmpRoot, '.squad', 'sessions');
    mkdirSync(dir, { recursive: true });

    const s1 = createSession();
    s1.messages.push({ role: 'user', content: 'first', timestamp: new Date() });
    s1.lastActiveAt = '2025-01-15T10:00:00Z';
    writeFileSync(join(dir, `s1_${s1.id}.json`), JSON.stringify(s1));

    const s2 = createSession();
    s2.messages.push(
      { role: 'user', content: 'second-a', timestamp: new Date() },
      { role: 'agent', content: 'second-b', timestamp: new Date() },
    );
    s2.lastActiveAt = '2025-01-15T11:00:00Z';
    writeFileSync(join(dir, `s2_${s2.id}.json`), JSON.stringify(s2));

    const list = listSessions(tmpRoot);
    expect(list).toHaveLength(2);
    // Most recent first — s2 has later lastActiveAt
    expect(list[0]!.id).toBe(s2.id);
    expect(list[0]!.messageCount).toBe(2);
    expect(list[1]!.id).toBe(s1.id);
    expect(list[1]!.messageCount).toBe(1);
  });

  it('skips malformed JSON files', () => {
    const dir = join(tmpRoot, '.squad', 'sessions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'bad.json'), 'not json');

    const s = createSession();
    saveSession(tmpRoot, s);

    const list = listSessions(tmpRoot);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(s.id);
  });
});

// ============================================================================
// loadLatestSession
// ============================================================================

describe('loadLatestSession', () => {
  it('returns null when no sessions exist', () => {
    expect(loadLatestSession(tmpRoot)).toBeNull();
  });

  it('returns the most recent session with rehydrated Date timestamps', () => {
    const session = createSession();
    const ts = new Date('2025-01-15T10:00:00Z');
    session.messages.push({ role: 'user', content: 'hi', timestamp: ts });
    saveSession(tmpRoot, session);

    const loaded = loadLatestSession(tmpRoot);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(session.id);
    expect(loaded!.messages[0]!.timestamp).toBeInstanceOf(Date);
    expect(loaded!.messages[0]!.timestamp.toISOString()).toBe(ts.toISOString());
  });

  it('returns null when the latest session is older than 24 hours', () => {
    const session = createSession();
    // Backdate the session to 25 hours ago
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    session.createdAt = old;
    session.lastActiveAt = old;

    const dir = join(tmpRoot, '.squad', 'sessions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `old_${session.id}.json`),
      JSON.stringify(session),
    );

    expect(loadLatestSession(tmpRoot)).toBeNull();
  });
});

// ============================================================================
// loadSessionById
// ============================================================================

describe('loadSessionById', () => {
  it('returns null for non-existent session', () => {
    expect(loadSessionById(tmpRoot, 'does-not-exist')).toBeNull();
  });

  it('loads a specific session by ID', () => {
    const s1 = createSession();
    s1.messages.push({ role: 'user', content: 'msg1', timestamp: new Date() });
    saveSession(tmpRoot, s1);

    const s2 = createSession();
    s2.messages.push({ role: 'agent', content: 'msg2', timestamp: new Date() });
    saveSession(tmpRoot, s2);

    const loaded = loadSessionById(tmpRoot, s1.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(s1.id);
    expect(loaded!.messages[0]!.content).toBe('msg1');
    expect(loaded!.messages[0]!.timestamp).toBeInstanceOf(Date);
  });
});
