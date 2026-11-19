import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['schema.sql', 'attendance.sql', 'migrations/0002_radio_platform.sql']) {
    sqlite.exec(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  }
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; }
      };
    }
  };
}
