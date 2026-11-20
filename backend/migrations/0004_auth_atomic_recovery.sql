-- Apply after 0003_auth_recovery.sql. Replaces only the auth trigger; user data is unchanged.
DROP TRIGGER IF EXISTS user_password_change_revoke_sessions;
CREATE TRIGGER user_password_change_revoke_sessions
AFTER UPDATE OF password_hash ON users
WHEN NEW.password_hash <> OLD.password_hash
BEGIN
 DELETE FROM user_sessions WHERE user_id=NEW.id;
 DELETE FROM account_recovery WHERE user_id=NEW.id;
END;
