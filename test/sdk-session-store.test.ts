import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createSession,
  saveSession,
  loadSessionById,
  listSessions,
  loadLatestSession,
} from '@bradygaster/squad-sdk/runtime/session-store';

describe('session-store', () => {
  let teamRoot: string;

  beforeEach(() => {
    teamRoot = mkdtempSync(join(tmpdir(), 'squad-session-store-test-'));
  });

  afterEach(() => {
    rmSync(teamRoot, { recursive: true, force: true });
  });

  it('createSession() returns valid SessionData', () => {
    const session = createSession();
    expect(session.id).toBeTruthy();
    expect(session.createdAt).toBeTruthy();
    expect(session.lastActiveAt).toBeTruthy();
    expect(session.messages).toEqual([]);
  });

  it('createSession() generates unique IDs', () => {
    const a = createSession();
    const b = createSession();
    expect(a.id).not.toBe(b.id);
  });

  it('saveSession() and loadSessionById() round-trip correctly', () => {
    const session = createSession();
    session.messages.push({
      role: 'user',
      content: 'hello',
      timestamp: new Date(),
    });
    saveSession(teamRoot, session);

    const loaded = loadSessionById(teamRoot, session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(session.id);
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0]!.content).toBe('hello');
    expect(loaded!.messages[0]!.timestamp).toBeInstanceOf(Date);
  });

  it('listSessions() returns most recent first', () => {
    const s1 = createSession();
    saveSession(teamRoot, s1);

    // Small delay so timestamps differ
    const s2 = createSession();
    saveSession(teamRoot, s2);

    const list = listSessions(teamRoot);
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Most recent (s2) should be first since its lastActiveAt is newer
    const ids = list.map(s => s.id);
    expect(ids.indexOf(s2.id)).toBeLessThan(ids.indexOf(s1.id));
  });

  it('loadLatestSession() returns null when no sessions exist', () => {
    expect(loadLatestSession(teamRoot)).toBeNull();
  });

  it('loadLatestSession() returns null when session is older than 24h', async () => {
    const session = createSession();
    // Backdate the session
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    session.createdAt = old;
    session.lastActiveAt = old;

    // saveSession updates lastActiveAt to now, so we need to manually write an old session
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const dir = join(teamRoot, '.squad', 'sessions');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `old_${session.id}.json`);
    session.lastActiveAt = old;
    writeFileSync(filePath, JSON.stringify(session));

    expect(loadLatestSession(teamRoot)).toBeNull();
  });
});
