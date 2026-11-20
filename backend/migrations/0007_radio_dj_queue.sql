ALTER TABLE song_catalog ADD COLUMN genre TEXT NOT NULL DEFAULT '';
CREATE INDEX song_catalog_genre ON song_catalog(genre, active);

CREATE TABLE radio_daily_genres (
 day TEXT PRIMARY KEY NOT NULL,
 genre TEXT NOT NULL CHECK(length(genre) BETWEEN 1 AND 40),
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at_ms INTEGER NOT NULL
);

CREATE TABLE radio_dj_runtime (
 slot INTEGER PRIMARY KEY CHECK(slot=1),
 token_hash TEXT,
 token_expires_ms INTEGER NOT NULL DEFAULT 0,
 issued_by TEXT REFERENCES users(id),
 request_id TEXT,
 lease_id TEXT,
 lease_expires_ms INTEGER NOT NULL DEFAULT 0,
 phase TEXT NOT NULL DEFAULT 'idle' CHECK(phase IN ('idle','claimed','playing','paused','completed')),
 position_ms INTEGER NOT NULL DEFAULT 0 CHECK(position_ms>=0)
);
INSERT INTO radio_dj_runtime(slot) VALUES(1);

CREATE TRIGGER radio_dj_complete_request
AFTER UPDATE OF phase ON radio_dj_runtime
WHEN NEW.phase='completed' AND OLD.phase IN ('playing','paused')
BEGIN
 UPDATE song_requests SET status='played',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=NEW.request_id AND status='approved';
END;
