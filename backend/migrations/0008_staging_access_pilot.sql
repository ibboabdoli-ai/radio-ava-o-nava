CREATE TABLE staging_access_identities (
 subject TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE staging_access_challenges (
 token_hash TEXT PRIMARY KEY NOT NULL,
 expires_at_ms INTEGER NOT NULL
);
CREATE INDEX staging_access_challenges_expiry ON staging_access_challenges(expires_at_ms);
CREATE TABLE staging_access_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 subject TEXT NOT NULL REFERENCES staging_access_identities(subject) ON DELETE CASCADE,
 audience TEXT NOT NULL,
 expires_at_ms INTEGER NOT NULL
);
CREATE INDEX staging_access_sessions_expiry ON staging_access_sessions(expires_at_ms);
CREATE TRIGGER staging_access_identity_is_immutable
BEFORE UPDATE ON staging_access_identities
BEGIN
 SELECT RAISE(ABORT, 'access_identity_is_immutable');
END;
CREATE TRIGGER staging_access_sessions_on_password_change
AFTER UPDATE OF password_hash ON users WHEN OLD.password_hash <> NEW.password_hash
BEGIN
 DELETE FROM staging_access_sessions WHERE subject IN
   (SELECT subject FROM staging_access_identities WHERE user_id=NEW.id);
END;
