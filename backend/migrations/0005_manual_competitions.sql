-- Apply once after 0004_auth_atomic_recovery.sql. Additive: preserves every
-- existing user, request and point transaction. Registration remains the
-- approved external form; only an administrator verifies account linkage.
PRAGMA foreign_keys = ON;

ALTER TABLE point_transactions ADD COLUMN actor_user_id TEXT REFERENCES users(id);
ALTER TABLE point_transactions ADD COLUMN source_type TEXT CHECK(source_type IS NULL OR source_type IN ('manual','competition_prize'));

CREATE TABLE competitions (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 description TEXT NOT NULL CHECK(length(description) <= 1000),
 rules TEXT NOT NULL CHECK(length(rules) <= 4000),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
 results_public INTEGER NOT NULL DEFAULT 0 CHECK(results_public IN (0,1)),
 created_by_user_id TEXT NOT NULL REFERENCES users(id),
 updated_by_user_id TEXT NOT NULL REFERENCES users(id),
 created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL
);
CREATE INDEX competitions_public ON competitions(status,updated_at_ms DESC);

CREATE TABLE competition_participants (
 competition_id TEXT NOT NULL REFERENCES competitions(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 verified_by_user_id TEXT NOT NULL REFERENCES users(id),
 verified_at_ms INTEGER NOT NULL,
 PRIMARY KEY(competition_id,user_id)
);

CREATE TABLE competition_results (
 competition_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 placement INTEGER CHECK(placement IS NULL OR placement BETWEEN 1 AND 100000),
 result_text TEXT NOT NULL CHECK(length(result_text) BETWEEN 1 AND 500),
 is_winner INTEGER NOT NULL CHECK(is_winner IN (0,1)),
 public_approved INTEGER NOT NULL CHECK(public_approved IN (0,1)),
 public_name_consent INTEGER NOT NULL CHECK(public_name_consent IN (0,1)),
 recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
 recorded_at_ms INTEGER NOT NULL,
 PRIMARY KEY(competition_id,user_id),
 FOREIGN KEY(competition_id,user_id) REFERENCES competition_participants(competition_id,user_id)
);
CREATE UNIQUE INDEX competition_placement ON competition_results(competition_id,placement) WHERE placement IS NOT NULL;

CREATE TABLE competition_awards (
 id TEXT PRIMARY KEY,
 competition_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 1000),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300),
 awarded_by_user_id TEXT NOT NULL REFERENCES users(id),
 created_at_ms INTEGER NOT NULL,
 UNIQUE(competition_id,user_id),
 FOREIGN KEY(competition_id,user_id) REFERENCES competition_results(competition_id,user_id)
);

-- All debits, including song spending and manual deductions, are guarded
-- inside the same SQLite write statement. Concurrent writers cannot both
-- spend the same balance.
CREATE TRIGGER point_balance_guard BEFORE INSERT ON point_transactions
WHEN NEW.delta < 0 AND
 (SELECT COALESCE(SUM(delta),0) FROM point_transactions WHERE user_id=NEW.user_id)+NEW.delta < 0
BEGIN SELECT RAISE(IGNORE); END;

CREATE TRIGGER manual_points_audit AFTER INSERT ON point_transactions
WHEN NEW.source_type='manual'
BEGIN
 INSERT INTO admin_events(id,actor_user_id,action,target_id,note,created_at_ms)
 VALUES(lower(hex(randomblob(16))),NEW.actor_user_id,'points_adjust',NEW.user_id,NEW.note,NEW.created_at_ms);
END;

CREATE TRIGGER competition_award_apply AFTER INSERT ON competition_awards
BEGIN
 INSERT INTO point_transactions(id,user_id,delta,kind,source_id,note,created_at_ms,actor_user_id,source_type)
 VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.points,'admin_adjustment','competition:'||NEW.id,NEW.reason,NEW.created_at_ms,NEW.awarded_by_user_id,'competition_prize');
 INSERT INTO admin_events(id,actor_user_id,action,target_id,note,created_at_ms)
 VALUES(lower(hex(randomblob(16))),NEW.awarded_by_user_id,'competition_prize',NEW.competition_id,NEW.reason,NEW.created_at_ms);
END;
