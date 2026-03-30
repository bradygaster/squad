/**
 * Session persistence — save and restore shell message history across restarts.
 *
 * Sessions are stored as JSON files in `.squad/sessions/`.
 * Each file is named `{safeTimestamp}_{sessionId}.json`.
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { FSStorageProvider, safeTimestamp } from '@bradygaster/squad-sdk';
import type { ShellMessage } from './types.js';

const storage = new FSStorageProvider();

/** Serialisable session envelope persisted to disk. */
export interface SessionData {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  messages: ShellMessage[];
}

/** Lightweight summary returned by {@link listSessions}. */
export interface SessionSummary {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
  filePath: string;
}

/** 24 hours in milliseconds — sessions older than this are not offered for resume. */
const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function sessionsDir(teamRoot: string): string {
  return join(teamRoot, '.squad', 'sessions');
}

function ensureDir(dir: string): void {
  if (!storage.existsSync(dir)) {
    storage.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a new, empty session and return its data envelope.
 */
export function createSession(): SessionData {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    lastActiveAt: now,
    messages: [],
  };
}

/**
 * Persist a session to disk.
 *
 * The file is named `{safeTimestamp}_{id}.json` so that lexicographic sorting
 * equals chronological ordering while remaining Windows-safe.
 */
export function saveSession(teamRoot: string, session: SessionData): string {
  const dir = sessionsDir(teamRoot);
  ensureDir(dir);

  session.lastActiveAt = new Date().toISOString();

  // Determine file path — reuse existing file for this session ID if present
  const existing = findSessionFile(dir, session.id);
  const filePath = existing ?? join(dir, `${safeTimestamp()}_${session.id}.json`);

  storage.writeSync(filePath, JSON.stringify(session, null, 2));
  return filePath;
}

/**
 * List all persisted sessions, most recent first.
 */
export function listSessions(teamRoot: string): SessionSummary[] {
  const dir = sessionsDir(teamRoot);
  if (!storage.existsSync(dir)) return [];

  const files = storage.listSync(dir).filter(f => f.endsWith('.json'));
  const summaries: SessionSummary[] = [];

  for (const file of files) {
    try {
      const filePath = join(dir, file);
      const raw = storage.readSync(filePath);
      if (raw === undefined) continue;
      const data = JSON.parse(raw) as SessionData;
      summaries.push({
        id: data.id,
        createdAt: data.createdAt,
        lastActiveAt: data.lastActiveAt,
        messageCount: data.messages.length,
        filePath,
      });
    } catch {
      // Skip malformed files
    }
  }

  // Most recent first
  summaries.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  return summaries;
}

/**
 * Load the most recent session if it was active within the last 24 hours.
 * Returns `null` when no recent session exists.
 */
export function loadLatestSession(teamRoot: string): SessionData | null {
  const sessions = listSessions(teamRoot);
  if (sessions.length === 0) return null;

  const latest = sessions[0]!;
  const age = Date.now() - new Date(latest.lastActiveAt).getTime();
  if (age > RECENT_THRESHOLD_MS) return null;

  return loadSessionById(teamRoot, latest.id);
}

/**
 * Load a specific session by ID.
 */
export function loadSessionById(teamRoot: string, sessionId: string): SessionData | null {
  const dir = sessionsDir(teamRoot);
  if (!storage.existsSync(dir)) return null;

  const filePath = findSessionFile(dir, sessionId);
  if (!filePath) return null;

  try {
    const raw = storage.readSync(filePath);
    if (raw === undefined) return null;
    const data = JSON.parse(raw) as SessionData;
    // Rehydrate Date objects on messages
    data.messages = data.messages.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findSessionFile(dir: string, sessionId: string): string | null {
  const files = storage.listSync(dir);
  const match = files.find(f => f.includes(sessionId) && f.endsWith('.json'));
  return match ? join(dir, match) : null;
}
