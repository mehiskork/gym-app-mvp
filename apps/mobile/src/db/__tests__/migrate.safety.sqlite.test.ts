import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import historical from '../../../test-support/historicalMigrations.json';
import { migrations } from '../migrations';

type Hook = (sql: string, params: SQLInputValue[], phase: 'before' | 'after') => void;
type Harness = {
  native: DatabaseSync;
  runMigrations: () => void;
  resetLocalDatabase: () => void;
  setHook: (hook: Hook) => void;
  close: () => void;
};
const { createMigrationHarness } = require('../../../test-support/sqliteMigrationHarness.cjs') as {
  createMigrationHarness: (filename?: string) => Harness;
};
const supportRoot = path.resolve(__dirname, '../../../test-support');
const userData = fs.readFileSync(path.join(supportRoot, 'historicalUserData.sql'), 'utf8');
const opened = new Set<Harness>();
let tempRoot: string;

function open(filename?: string): Harness {
  const harness = createMigrationHarness(filename);
  opened.add(harness);
  return harness;
}

function close(harness: Harness) {
  harness.close();
  opened.delete(harness);
}

function populateHistorical(h: Harness, version: number, account = 'linked') {
  for (const migration of historical.migrations.slice(0, version)) {
    h.native.exec(migration.up);
    h.native
      .prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)')
      .run(migration.id, migration.name, '2026-08-01 09:00:00');
  }
  h.native.exec(userData);
  if (version >= 2)
    h.native.exec("UPDATE workout_session_exercise SET plan_note_snapshot = 'Original plan note'");
  if (version >= 3)
    h.native.exec(`UPDATE program_day_exercise SET
    planned_cardio_duration_minutes = 25, planned_cardio_distance_km = 3.5,
    planned_cardio_speed_kph = 8.4, planned_cardio_incline_percent = 2.5,
    planned_cardio_resistance_level = 4, planned_cardio_pace_seconds_per_km = 300,
    planned_cardio_floors = 12, planned_cardio_stair_level = 6`);
  if (version >= 4)
    h.native.exec(`INSERT INTO workout_session_initial_snapshot
    (workout_session_id, snapshot_json) VALUES ('active-1', '{"title":"Unfinished workout","exercises":[]}')`);
  if (version >= 5)
    h.native.exec(`INSERT INTO exercise_favorite
    (id, exercise_id, version, last_modified_by_device_id) VALUES ('favorite-1', 'exercise-1', 3, 'device-1')`);
  if (account === 'guest')
    h.native.exec(`
    UPDATE app_meta SET value = 'false' WHERE key = 'claimed';
    DELETE FROM app_meta WHERE key = 'claimed_user_id';
    UPDATE outbox_op SET user_id = NULL;
    UPDATE exercise SET owner_user_id = NULL;
    UPDATE program SET owner_user_id = NULL;
  `);
}

function markerIds(h: Harness) {
  return h.native
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all()
    .map((row) => row.id);
}

function schema(h: Harness) {
  return h.native
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .all();
}

function dataSnapshot(h: Harness) {
  return h.native
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name",
    )
    .all()
    .map(({ name }) => {
      const table = String(name);
      const columns = h.native
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => String(row.name));
      return {
        table,
        columns,
        rows: h.native.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
      };
    });
}

function expectPreserved(h: Harness, before: ReturnType<typeof dataSnapshot>) {
  for (const { table, columns, rows } of before) {
    // Compare all historical column values, including timestamps and tombstones.
    // New nullable columns are allowed; missing or extra historical rows are not.
    expect(
      h.native
        .prepare(
          `SELECT ${columns.map((column) => `"${column}"`).join(', ')} FROM "${table}" ORDER BY rowid`,
        )
        .all(),
    ).toEqual(rows);
  }
  expect(h.native.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  expect(h.native.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trainframe-migration-safety-'));
});
afterEach(() => {
  for (const h of opened) close(h);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('atomic migrations with real SQLite', () => {
  it('preserves every historical definition except relocating the WAL statement', () => {
    expect(historical.sourceCommit).toBe('50c6e28b0a6cda6a828ce4726e24a69e68d7aabd');
    expect(migrations).toEqual(
      historical.migrations.map((migration) => ({
        ...migration,
        up:
          migration.id === 1
            ? migration.up.replace('    PRAGMA journal_mode = WAL;\n\n', '')
            : migration.up,
      })),
    );
  });

  it('initializes a fresh file-backed database with WAL before BEGIN and the same final schema', () => {
    const h = open(path.join(tempRoot, 'fresh.db'));
    const statements: string[] = [];
    h.setHook((sql, _params, phase) => {
      if (phase === 'before') statements.push(sql);
    });
    h.runMigrations();
    expect(markerIds(h)).toEqual([1, 2, 3, 4, 5]);
    expect(h.native.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(statements.indexOf('PRAGMA journal_mode = WAL')).toBeLessThan(
      statements.indexOf('BEGIN'),
    );
    expect(statements.filter((sql) => sql === 'COMMIT')).toHaveLength(5);
    const reference = open();
    populateHistorical(reference, 5);
    expect(schema(h)).toEqual(schema(reference));
  });

  it.each(
    [1, 2, 3, 4, 5].flatMap((version) =>
      ['guest', 'linked'].map((account) => ({ version, account })),
    ),
  )(
    'preserves all data upgrading a $account database from version $version',
    ({ version, account }) => {
      const h = open(path.join(tempRoot, 'upgrade.db'));
      populateHistorical(h, version, account);
      const before = dataSnapshot(h);
      const markers = h.native.prepare('SELECT * FROM schema_migrations ORDER BY id').all();
      const statements: string[] = [];
      h.setHook((sql, _params, phase) => {
        if (phase === 'before') statements.push(sql);
      });
      h.runMigrations();
      expectPreserved(h, before);
      expect(markerIds(h)).toEqual([1, 2, 3, 4, 5]);
      expect(
        h.native.prepare('SELECT * FROM schema_migrations WHERE id <= ? ORDER BY id').all(version),
      ).toEqual(markers);
      expect(statements.some((sql) => sql.includes('journal_mode'))).toBe(false);
      const after = dataSnapshot(h);
      const afterSchema = schema(h);
      const afterMarkers = h.native.prepare('SELECT * FROM schema_migrations ORDER BY id').all();
      statements.length = 0;
      h.runMigrations();
      expect(dataSnapshot(h)).toEqual(after);
      expect(schema(h)).toEqual(afterSchema);
      expect(h.native.prepare('SELECT * FROM schema_migrations ORDER BY id').all()).toEqual(
        afterMarkers,
      );
      expect(statements).not.toContain('BEGIN');
    },
  );

  it.each(['column', 'marker', 'commit'])(
    'rolls back a %s failure, then retries successfully after reopen',
    (failurePoint) => {
      const filename = path.join(tempRoot, 'retry.db');
      const h = open(filename);
      populateHistorical(h, 2);
      const before = dataSnapshot(h);
      const beforeSchema = schema(h);
      h.setHook((sql, params, phase) => {
        if (phase !== 'before') return;
        if (
          (failurePoint === 'column' && sql.includes('ADD COLUMN planned_cardio_distance_km')) ||
          (failurePoint === 'marker' &&
            sql.startsWith('INSERT INTO schema_migrations') &&
            params[0] === 3) ||
          (failurePoint === 'commit' && sql === 'COMMIT')
        )
          throw new Error(`injected ${failurePoint} failure`);
      });
      expect(() => h.runMigrations()).toThrow(`injected ${failurePoint} failure`);
      expect(h.native.isTransaction).toBe(false);
      expect(markerIds(h)).toEqual([1, 2]);
      expect(schema(h)).toEqual(beforeSchema);
      expectPreserved(h, before);
      close(h);
      const reopened = open(filename);
      expect(schema(reopened)).toEqual(beforeSchema);
      reopened.runMigrations();
      expect(markerIds(reopened)).toEqual([1, 2, 3, 4, 5]);
      expectPreserved(reopened, before);
    },
  );

  it('can retry on the same connection after a commit failure was rolled back', () => {
    const h = open();
    populateHistorical(h, 2);
    const before = dataSnapshot(h);
    h.setHook((sql, _params, phase) => {
      if (sql === 'COMMIT' && phase === 'before') throw new Error('commit failed');
    });
    expect(() => h.runMigrations()).toThrow('commit failed');
    const statements: string[] = [];
    h.setHook((sql, _params, phase) => {
      if (phase === 'before') statements.push(sql);
    });
    h.runMigrations();
    expect(statements.filter((sql) => sql === 'BEGIN')).toHaveLength(3);
    expectPreserved(h, before);
  });

  it('blocks retries before reading uncommitted markers when rollback fails', () => {
    const filename = path.join(tempRoot, 'uncertain.db');
    const h = open(filename);
    populateHistorical(h, 2);
    const before = dataSnapshot(h);
    h.setHook((sql, _params, phase) => {
      if (phase === 'before' && (sql === 'COMMIT' || sql === 'ROLLBACK')) throw new Error(sql);
    });
    expect(() => h.runMigrations()).toThrow('Close and reopen TrainFrame');
    expect(h.native.isTransaction).toBe(true);
    expect(markerIds(h)).toEqual([1, 2, 3]); // Uncommitted marker is visible on this connection only.
    const statements: string[] = [];
    h.setHook((sql) => {
      statements.push(sql);
    });
    expect(() => h.runMigrations()).toThrow('Close and reopen TrainFrame');
    expect(statements).toEqual([]);
    close(h);
    const reopened = open(filename);
    expect(markerIds(reopened)).toEqual([1, 2]);
    reopened.runMigrations();
    expectPreserved(reopened, before);
  });

  it('leaves a previously partial migration unchanged and does not mark it complete', () => {
    const h = open();
    populateHistorical(h, 2);
    h.native.exec(historical.migrations[2].up.split(';')[0]);
    h.native.exec('UPDATE program_day_exercise SET planned_cardio_duration_minutes = 17');
    const before = dataSnapshot(h);
    const beforeSchema = schema(h);
    expect(() => h.runMigrations()).toThrow('duplicate column name');
    expect(() => h.runMigrations()).toThrow('duplicate column name');
    expect(markerIds(h)).toEqual([1, 2]);
    expect(schema(h)).toEqual(beforeSchema);
    expectPreserved(h, before);
  });

  it('keeps earlier migrations committed when a later migration fails', () => {
    const h = open();
    populateHistorical(h, 1);
    const before = dataSnapshot(h);
    h.setHook((sql, _params, phase) => {
      if (phase === 'before' && sql.includes('ADD COLUMN planned_cardio_distance_km'))
        throw new Error('migration 3 failed');
    });
    expect(() => h.runMigrations()).toThrow('migration 3 failed');
    expect(markerIds(h)).toEqual([1, 2]);
    expect(
      h.native
        .prepare('PRAGMA table_info(workout_session_exercise)')
        .all()
        .some((row) => row.name === 'plan_note_snapshot'),
    ).toBe(true);
    expectPreserved(h, before);
  });

  it('rolls back a failed baseline and retries without a reset', () => {
    const h = open(path.join(tempRoot, 'baseline.db'));
    h.setHook((sql, _params, phase) => {
      if (phase === 'before' && sql.includes('CREATE TABLE IF NOT EXISTS program ('))
        throw new Error('baseline failed');
    });
    expect(() => h.runMigrations()).toThrow('baseline failed');
    expect(markerIds(h)).toEqual([]);
    expect(h.native.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()).toEqual([
      { name: 'schema_migrations' },
    ]);
    h.setHook(() => {});
    h.runMigrations();
    expect(markerIds(h)).toEqual([1, 2, 3, 4, 5]);
  });

  it('fails before applying migrations when WAL initialization fails', () => {
    const h = open();
    h.setHook((sql, _params, phase) => {
      if (phase === 'before' && sql.includes('journal_mode')) throw new Error('WAL failed');
    });
    expect(() => h.runMigrations()).toThrow('WAL failed');
    expect(markerIds(h)).toEqual([]);
    expect(h.native.isTransaction).toBe(false);
  });

  it('supports the existing explicit reset bootstrap and repeated cleanup migration calls', () => {
    const h = open(path.join(tempRoot, 'reset.db'));
    populateHistorical(h, 5);
    // This is the user-confirmed reset path, never migration failure recovery.
    h.resetLocalDatabase();
    h.runMigrations();
    h.runMigrations();
    expect(markerIds(h)).toEqual([1, 2, 3, 4, 5]);
    expect(h.native.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(h.native.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(h.native.prepare('SELECT * FROM workout_session').all()).toEqual([]);
  });

  it.each(['column', 'marker'])(
    'recovers after process termination following a migration %s write',
    (crashPoint) => {
      const filename = path.join(tempRoot, 'crash.db');
      const h = open(filename);
      populateHistorical(h, 2);
      const before = dataSnapshot(h);
      const beforeSchema = schema(h);
      close(h);
      const child = spawnSync(
        process.execPath,
        [path.join(supportRoot, 'crashMigration.cjs'), filename, crashPoint],
        { encoding: 'utf8', timeout: 15000 },
      );
      expect(child.error).toBeUndefined();
      expect(child.signal).toBe('SIGKILL');
      const reopened = open(filename);
      expect(markerIds(reopened)).toEqual([1, 2]);
      expect(schema(reopened)).toEqual(beforeSchema);
      expectPreserved(reopened, before);
      reopened.runMigrations();
      expect(markerIds(reopened)).toEqual([1, 2, 3, 4, 5]);
      expectPreserved(reopened, before);
    },
    20000,
  );
});
