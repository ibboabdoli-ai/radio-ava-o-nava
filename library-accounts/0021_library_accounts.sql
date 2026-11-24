CREATE TABLE IF NOT EXISTS library_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  club_user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  google_subject TEXT UNIQUE,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  CHECK ((club_user_id IS NOT NULL) <> (google_subject IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS library_account_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES library_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS library_account_sessions_expiry ON library_account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS library_playlists (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES library_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS library_playlists_owner ON library_playlists(account_id,created_at);
CREATE TABLE IF NOT EXISTS library_playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES library_playlists(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL REFERENCES song_catalog(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id,song_id)
);
CREATE INDEX IF NOT EXISTS library_playlist_tracks_order ON library_playlist_tracks(playlist_id,position);
