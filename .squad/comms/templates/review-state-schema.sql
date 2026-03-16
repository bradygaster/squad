-- PAO External Communications: Review State Database
-- Created at runtime in .squad/comms/review-state.db
-- Zero new dependencies (Copilot CLI already uses SQLite)

CREATE TABLE IF NOT EXISTS review_locks (
    session_id TEXT PRIMARY KEY,
    reviewer TEXT NOT NULL,
    hostname TEXT NOT NULL,
    pid INTEGER NOT NULL,
    acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+1 hour')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired'))
);

-- Atomic lock acquisition using INSERT ... ON CONFLICT
-- If a lock exists and is expired, it gets replaced
-- If a lock exists and is active, the INSERT fails (lock held)
CREATE TRIGGER IF NOT EXISTS cleanup_expired_locks
BEFORE INSERT ON review_locks
BEGIN
    DELETE FROM review_locks 
    WHERE expires_at < datetime('now') 
    AND status = 'active';
END;

-- Draft tracking table
CREATE TABLE IF NOT EXISTS draft_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('issue', 'discussion', 'pr')),
    item_number INTEGER NOT NULL,
    item_url TEXT,
    response_type TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    draft_content TEXT NOT NULL,
    thread_depth INTEGER DEFAULT 0,
    long_thread_flag INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'edited', 'skipped', 'posted', 'halted', 'deleted')),
    reviewer TEXT,
    reviewed_at TEXT,
    posted_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES review_locks(session_id)
);

-- Halt state (safe word mechanism)
CREATE TABLE IF NOT EXISTS halt_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    halted INTEGER NOT NULL DEFAULT 0,
    halted_by TEXT,
    halted_at TEXT,
    reason TEXT
);

-- Initialize halt state (not halted by default)
INSERT OR IGNORE INTO halt_state (id, halted) VALUES (1, 0);

-- Audit log (append-only, mirrors markdown audit files)
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
