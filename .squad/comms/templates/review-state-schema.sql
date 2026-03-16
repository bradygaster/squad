-- Runtime reminder: PRAGMA foreign_keys = ON;
-- PAO External Communications: Review State Database
-- Created at runtime in .squad/comms/review-state.db
-- Zero new dependencies (Copilot CLI already uses SQLite)

-- Single global review lease — only ONE reviewer at a time
CREATE TABLE IF NOT EXISTS review_lease (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held')),
    reviewer TEXT,
    hostname TEXT,
    pid INTEGER,
    acquired_at TEXT,
    expires_at TEXT
);

-- Initialize the single lease row
INSERT OR IGNORE INTO review_lease (id, status) VALUES (1, 'available');

-- Acquire: UPDATE review_lease
--          SET status = 'held', reviewer = ?, hostname = ?, pid = ?, acquired_at = datetime('now'), expires_at = datetime('now', '+1 hour')
--          WHERE id = 1 AND (status = 'available' OR expires_at < datetime('now'));
-- Release: UPDATE review_lease
--          SET status = 'available', reviewer = NULL, hostname = NULL, pid = NULL, acquired_at = NULL, expires_at = NULL
--          WHERE id = 1;
-- Check:   SELECT * FROM review_lease WHERE id = 1;
-- Cleanup expired lease before work: UPDATE review_lease
--          SET status = 'available', reviewer = NULL, hostname = NULL, pid = NULL, acquired_at = NULL, expires_at = NULL
--          WHERE id = 1 AND status = 'held' AND expires_at < datetime('now');

-- Draft tracking table
CREATE TABLE IF NOT EXISTS draft_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewer TEXT,
    item_type TEXT NOT NULL CHECK (item_type IN ('issue', 'discussion')),
    item_number INTEGER NOT NULL,
    item_url TEXT,
    response_type TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    draft_content TEXT NOT NULL,
    thread_depth INTEGER DEFAULT 0,
    long_thread_flag INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'edited', 'skipped', 'posted', 'halted', 'deleted')),
    reviewed_at TEXT,
    posted_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Halt state (safe word "banana" mechanism)
CREATE TABLE IF NOT EXISTS halt_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    halted INTEGER NOT NULL DEFAULT 0,
    halted_by TEXT,
    halted_at TEXT,
    reason TEXT
);

-- Initialize halt state (not halted by default)
INSERT OR IGNORE INTO halt_state (id, halted) VALUES (1, 0);

-- Audit log (append-only, mirrors runtime audit files)
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    action TEXT NOT NULL,
    item_type TEXT,
    item_number INTEGER,
    draft_id INTEGER,
    reviewer TEXT,
    outcome TEXT,
    details TEXT
);
