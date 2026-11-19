-- Attendance points are only attributed from trusted, explicitly supplied observations.
-- No Clubhouse integration or automatic observation exists in this repository.
CREATE TABLE IF NOT EXISTS listener_scores (
 clubhouse_user_id TEXT PRIMARY KEY,
 display_name TEXT NOT NULL,
 total_seconds INTEGER NOT NULL DEFAULT 0 CHECK(total_seconds >= 0),
 first_seen_ms INTEGER NOT NULL,
 last_seen_ms INTEGER NOT NULL,
 last_room_id TEXT NOT NULL,
 leaderboard_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(leaderboard_opt_in IN (0,1))
);
CREATE INDEX IF NOT EXISTS listener_scores_ranking
ON listener_scores(total_seconds DESC, clubhouse_user_id ASC);
