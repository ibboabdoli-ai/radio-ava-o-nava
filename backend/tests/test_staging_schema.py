"""Offline SQLite compatibility checks for the existing Cloudflare D1 schema.
This does NOT run Cloudflare D1 migrations or contact external services.
"""
import pathlib
import sqlite3
import tomllib
import unittest

BACKEND = pathlib.Path(__file__).resolve().parent.parent


class StagingSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys = ON')
        for filename in ('schema.sql', 'attendance.sql'):
            self.db.executescript((BACKEND / filename).read_text(encoding='utf-8'))

    def tearDown(self):
        self.db.close()

    def test_tables_exist(self):
        names = {r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({'song_requests', 'request_limits', 'listener_scores'} <= names)

    def test_song_request_status_constrained(self):
        self.db.execute('INSERT INTO song_requests(id,title,artist,requested_by) VALUES (?,?,?,?)',
                        ('r1', 'Example', 'Artist', 'Guest'))
        status = self.db.execute('SELECT status FROM song_requests WHERE id=?', ('r1',)).fetchone()[0]
        self.assertEqual(status, 'pending')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('UPDATE song_requests SET status=? WHERE id=?', ('invalid', 'r1'))

    def test_rate_limit_upsert_is_atomic(self):
        query = ('INSERT INTO request_limits(client_hash,last_request_at) VALUES (?,?) '
                 'ON CONFLICT(client_hash) DO UPDATE SET last_request_at=excluded.last_request_at '
                 'WHERE last_request_at <= ?')
        self.db.execute(query, ('ip-hash', 100000, 40000))
        self.assertEqual(self.db.execute('SELECT changes()').fetchone()[0], 1)
        self.db.execute(query, ('ip-hash', 105000, 45000))
        self.assertEqual(self.db.execute('SELECT changes()').fetchone()[0], 0)
        self.db.execute(query, ('ip-hash', 160001, 100001))
        self.assertEqual(self.db.execute('SELECT changes()').fetchone()[0], 1)

    def test_attendance_defaults_private_and_no_negative_seconds(self):
        self.db.execute('INSERT INTO listener_scores(clubhouse_user_id,display_name,first_seen_ms,last_seen_ms,last_room_id) '
                        'VALUES (?,?,?,?,?)', ('test-user', 'Test', 100, 100, 'room'))
        self.assertEqual(self.db.execute('SELECT total_seconds, leaderboard_opt_in FROM listener_scores '
                                         'WHERE clubhouse_user_id=?', ('test-user',)).fetchone(), (0, 0))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('UPDATE listener_scores SET total_seconds=-1 WHERE clubhouse_user_id=?', ('test-user',))

    def test_full_migration_order_preserves_requests_without_legacy_points(self):
        self.db.execute('INSERT INTO song_requests(id,title,artist,requested_by) VALUES (?,?,?,?)',
                        ('legacy-request', 'Old Song', 'Artist', 'Guest'))
        self.db.execute('INSERT INTO listener_scores(clubhouse_user_id,display_name,first_seen_ms,last_seen_ms,last_room_id,total_seconds) '
                        'VALUES (?,?,?,?,?,?)', ('legacy-user', 'Guest', 1, 600001, 'old-room', 600))
        self.db.executescript((BACKEND / 'migrations' / '0002_radio_platform.sql').read_text(encoding='utf-8'))
        request = self.db.execute('SELECT title,status,cost,user_id FROM song_requests WHERE id=?', ('legacy-request',)).fetchone()
        self.assertEqual(request, ('Old Song', 'pending', 0, None))
        self.assertEqual(self.db.execute('SELECT count(*) FROM point_transactions').fetchone()[0], 0)

    def test_staging_template_is_isolated_and_disabled(self):
        with (BACKEND / 'wrangler.staging.toml.example').open('rb') as config_file:
            config = tomllib.load(config_file)
        self.assertEqual(config['name'], 'ava-radio-staging')
        self.assertEqual(config['d1_databases'][0]['database_name'], 'ava-radio-staging')
        self.assertTrue(config['workers_dev'])
        self.assertNotIn('routes', config)
        self.assertNotIn('radio.ibboabdoli.com', config['vars']['ALLOWED_ORIGIN'])
        for key in ('RADIO_FEATURES_ENABLED', 'REGISTRATION_ENABLED', 'ATTENDANCE_OBSERVER_ENABLED'):
            self.assertEqual(config['vars'][key], 'false')


if __name__ == '__main__':
    unittest.main()
