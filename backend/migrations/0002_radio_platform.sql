-- Apply after schema.sql and attendance.sql from PR #27.
-- Legacy listener_scores are deliberately not imported: admin-supplied observations
-- were not independent proof of presence.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'listener' CHECK(role IN ('listener','admin')),
 leaderboard_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(leaderboard_opt_in IN (0,1)),
 created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at_ms INTEGER NOT NULL,
 created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expiry ON user_sessions(expires_at_ms);
CREATE TABLE IF NOT EXISTS auth_limits (
 client_hash TEXT PRIMARY KEY,
 window_start_ms INTEGER NOT NULL,
 attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS listener_identities (
 clubhouse_user_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 consent_at_ms INTEGER NOT NULL,
 mapped_by_user_id TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS song_catalog (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 artist TEXT NOT NULL,
 source_url TEXT NOT NULL,
 rights_note TEXT NOT NULL,
 cost INTEGER NOT NULL CHECK(cost BETWEEN 1 AND 1000),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 playable_checked_at_ms INTEGER NOT NULL,
 created_by_user_id TEXT NOT NULL REFERENCES users(id),
 created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS song_catalog_search ON song_catalog(active,title,artist);

ALTER TABLE song_requests RENAME TO song_requests_legacy;
CREATE TABLE song_requests (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 artist TEXT NOT NULL,
 requested_by TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','played')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 user_id TEXT,
 catalog_song_id TEXT,
 cost INTEGER NOT NULL DEFAULT 0 CHECK(cost >= 0),
 idempotency_key TEXT,
 queue_priority INTEGER NOT NULL DEFAULT 0
);
INSERT INTO song_requests(id,title,artist,requested_by,status,created_at,updated_at)
 SELECT id,title,artist,requested_by,status,created_at,updated_at FROM song_requests_legacy;
DROP TABLE song_requests_legacy;
CREATE INDEX IF NOT EXISTS song_requests_status_date ON song_requests(status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS song_requests_idempotency
 ON song_requests(user_id,idempotency_key) WHERE user_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS song_requests_one_active_song
 ON song_requests(user_id,catalog_song_id)
 WHERE user_id IS NOT NULL AND catalog_song_id IS NOT NULL AND status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS song_requests_user_date ON song_requests(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS point_transactions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 delta INTEGER NOT NULL CHECK(delta <> 0),
 kind TEXT NOT NULL CHECK(kind IN ('attendance','request_spend','refund','admin_adjustment')),
 source_id TEXT NOT NULL,
 request_id TEXT,
 note TEXT,
 created_at_ms INTEGER NOT NULL,
 UNIQUE(kind,source_id)
);
CREATE INDEX IF NOT EXISTS point_transactions_user_date ON point_transactions(user_id,created_at_ms DESC);

CREATE TABLE IF NOT EXISTS attendance_sessions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 room_id TEXT NOT NULL,
 start_ms INTEGER NOT NULL,
 last_seen_ms INTEGER NOT NULL,
 end_ms INTEGER,
 credited_seconds INTEGER NOT NULL DEFAULT 0 CHECK(credited_seconds >= 0),
 credited_millis INTEGER NOT NULL DEFAULT 0 CHECK(credited_millis >= 0)
);
CREATE INDEX IF NOT EXISTS attendance_sessions_user_date ON attendance_sessions(user_id,start_ms DESC);
CREATE TABLE IF NOT EXISTS attendance_state (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 clubhouse_user_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 last_seen_ms INTEGER NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 total_seconds INTEGER NOT NULL DEFAULT 0 CHECK(total_seconds >= 0),
 total_millis INTEGER NOT NULL DEFAULT 0 CHECK(total_millis >= 0),
 awarded_points INTEGER NOT NULL DEFAULT 0 CHECK(awarded_points >= 0),
 last_delta_seconds INTEGER NOT NULL DEFAULT 0,
 last_delta_ms INTEGER NOT NULL DEFAULT 0,
 session_id TEXT
);
CREATE TABLE IF NOT EXISTS attendance_observations (
 observation_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 clubhouse_user_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('seen','left')),
 received_ms INTEGER NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind='trusted_presence')
);
CREATE INDEX IF NOT EXISTS attendance_observations_age ON attendance_observations(received_ms);

-- Server timestamps can tie; older observations must never roll state backward.
CREATE TRIGGER IF NOT EXISTS attendance_reject_out_of_order
BEFORE INSERT ON attendance_observations
WHEN NEW.received_ms < COALESCE((SELECT last_seen_ms FROM attendance_state WHERE user_id=NEW.user_id),-1)
BEGIN
 SELECT RAISE(IGNORE);
END;

CREATE TRIGGER IF NOT EXISTS attendance_observation_apply
AFTER INSERT ON attendance_observations
BEGIN
 UPDATE attendance_sessions SET end_ms=last_seen_ms
 WHERE id=(SELECT session_id FROM attendance_state WHERE user_id=NEW.user_id)
   AND end_ms IS NULL
   AND (NEW.state='left' OR NOT EXISTS (
    SELECT 1 FROM attendance_state s WHERE s.user_id=NEW.user_id AND s.active=1
      AND s.room_id=NEW.room_id AND NEW.received_ms>=s.last_seen_ms
      AND NEW.received_ms-s.last_seen_ms<=75000));

 INSERT INTO attendance_sessions(id,user_id,room_id,start_ms,last_seen_ms,credited_seconds,credited_millis)
 SELECT NEW.observation_id,NEW.user_id,NEW.room_id,NEW.received_ms,NEW.received_ms,0,0
 WHERE NEW.state='seen' AND NOT EXISTS (
  SELECT 1 FROM attendance_state s WHERE s.user_id=NEW.user_id AND s.active=1
    AND s.room_id=NEW.room_id AND NEW.received_ms>=s.last_seen_ms
    AND NEW.received_ms-s.last_seen_ms<=75000);

 INSERT INTO attendance_state(user_id,clubhouse_user_id,room_id,last_seen_ms,active,total_seconds,total_millis,awarded_points,last_delta_seconds,last_delta_ms,session_id)
 VALUES(NEW.user_id,NEW.clubhouse_user_id,NEW.room_id,NEW.received_ms,
   CASE WHEN NEW.state='seen' THEN 1 ELSE 0 END,0,0,0,0,0,
   CASE WHEN NEW.state='seen' THEN NEW.observation_id ELSE NULL END)
 ON CONFLICT(user_id) DO UPDATE SET
  last_delta_ms=CASE WHEN NEW.state='seen' AND attendance_state.active=1
    AND attendance_state.room_id=NEW.room_id AND NEW.received_ms>attendance_state.last_seen_ms
    AND NEW.received_ms-attendance_state.last_seen_ms<=75000
    THEN NEW.received_ms-attendance_state.last_seen_ms ELSE 0 END,
  last_delta_seconds=CASE WHEN NEW.state='seen' AND attendance_state.active=1
    AND attendance_state.room_id=NEW.room_id AND NEW.received_ms>attendance_state.last_seen_ms
    AND NEW.received_ms-attendance_state.last_seen_ms<=75000
    THEN CAST((NEW.received_ms-attendance_state.last_seen_ms)/1000 AS INTEGER) ELSE 0 END,
  total_millis=attendance_state.total_millis+CASE WHEN NEW.state='seen' AND attendance_state.active=1
    AND attendance_state.room_id=NEW.room_id AND NEW.received_ms>attendance_state.last_seen_ms
    AND NEW.received_ms-attendance_state.last_seen_ms<=75000
    THEN NEW.received_ms-attendance_state.last_seen_ms ELSE 0 END,
  total_seconds=CAST((attendance_state.total_millis+CASE WHEN NEW.state='seen' AND attendance_state.active=1
    AND attendance_state.room_id=NEW.room_id AND NEW.received_ms>attendance_state.last_seen_ms
    AND NEW.received_ms-attendance_state.last_seen_ms<=75000
    THEN NEW.received_ms-attendance_state.last_seen_ms ELSE 0 END)/1000 AS INTEGER),
  clubhouse_user_id=NEW.clubhouse_user_id,
  room_id=NEW.room_id,
  last_seen_ms=MAX(attendance_state.last_seen_ms,NEW.received_ms),
  active=CASE WHEN NEW.state='seen' THEN 1 ELSE 0 END,
  session_id=CASE WHEN NEW.state='left' THEN NULL
    WHEN attendance_state.active=1 AND attendance_state.room_id=NEW.room_id
      AND NEW.received_ms>=attendance_state.last_seen_ms
      AND NEW.received_ms-attendance_state.last_seen_ms<=75000
      THEN attendance_state.session_id ELSE NEW.observation_id END;

 UPDATE attendance_sessions
 SET last_seen_ms=NEW.received_ms,
     credited_millis=credited_millis+(SELECT last_delta_ms FROM attendance_state WHERE user_id=NEW.user_id),
     credited_seconds=CAST((credited_millis+(SELECT last_delta_ms FROM attendance_state WHERE user_id=NEW.user_id))/1000 AS INTEGER)
 WHERE id=(SELECT session_id FROM attendance_state WHERE user_id=NEW.user_id) AND NEW.state='seen';

 INSERT INTO point_transactions(id,user_id,delta,kind,source_id,created_at_ms)
 SELECT lower(hex(randomblob(16))),NEW.user_id,
   CAST(s.total_millis/60000 AS INTEGER)-s.awarded_points,
   'attendance',NEW.observation_id,NEW.received_ms
 FROM attendance_state s WHERE s.user_id=NEW.user_id
   AND CAST(s.total_millis/60000 AS INTEGER)>s.awarded_points;
 UPDATE attendance_state SET awarded_points=CAST(total_millis/60000 AS INTEGER) WHERE user_id=NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS request_approve_on_spend
AFTER INSERT ON point_transactions WHEN NEW.kind='request_spend'
BEGIN
 UPDATE song_requests SET status='approved',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=NEW.request_id AND status='pending';
END;

CREATE TRIGGER IF NOT EXISTS request_refund_on_rejection
AFTER UPDATE OF status ON song_requests
WHEN OLD.status='approved' AND NEW.status IN ('rejected','cancelled') AND OLD.user_id IS NOT NULL AND OLD.cost>0
BEGIN
 INSERT INTO point_transactions(id,user_id,delta,kind,source_id,request_id,note,created_at_ms)
 VALUES(lower(hex(randomblob(16))),OLD.user_id,OLD.cost,'refund',OLD.id,OLD.id,'request rejected',CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TABLE IF NOT EXISTS admin_events (
 id TEXT PRIMARY KEY,
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 target_id TEXT NOT NULL,
 note TEXT,
 created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_events_date ON admin_events(created_at_ms DESC);
