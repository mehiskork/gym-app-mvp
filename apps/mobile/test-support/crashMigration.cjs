const { createMigrationHarness } = require('./sqliteMigrationHarness.cjs');

const harness = createMigrationHarness(process.argv[2]);
const crashPoint = process.argv[3];
harness.native.exec('PRAGMA cache_size = 1');
harness.setHook((sql, params, phase) => {
  if (phase !== 'after') return;
  const afterColumn = sql.includes('ADD COLUMN planned_cardio_duration_minutes');
  const afterMarker = sql.startsWith('INSERT INTO schema_migrations') && params[0] === 3;
  if ((crashPoint === 'column' && afterColumn) || (crashPoint === 'marker' && afterMarker)) {
    // No finally/close/ROLLBACK: exercise actual process-loss recovery.
    process.kill(process.pid, 'SIGKILL');
  }
});
harness.runMigrations();
throw new Error('Crash injection point was not reached');
