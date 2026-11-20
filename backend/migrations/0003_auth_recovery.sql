-- Apply after 0002_radio_platform.sql. Safe to rerun; existing users and sessions stay intact.
CREATE TABLE IF NOT EXISTS account_recovery (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL CHECK(length(code_hash)=64),
 created_at_ms INTEGER NOT NULL
);

-- Password changes and legacy hash upgrades revoke every older session atomically.
CREATE TRIGGER IF NOT EXISTS user_password_change_revoke_sessions
AFTER UPDATE OF password_hash ON users
WHEN NEW.password_hash <> OLD.password_hash
BEGIN
 DELETE FROM user_sessions WHERE user_id=NEW.id;
END;
