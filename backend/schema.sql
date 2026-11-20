CREATE TABLE IF NOT EXISTS song_requests (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 artist TEXT NOT NULL,
 requested_by TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','played')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS song_requests_status_date ON song_requests(status, created_at);
CREATE TABLE IF NOT EXISTS request_limits (
 client_hash TEXT PRIMARY KEY,
 last_request_at INTEGER NOT NULL
);
