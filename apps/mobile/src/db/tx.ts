import { db } from './db';

export function inTransaction<T>(fn: () => T): T {
  db.execSync('BEGIN');
  try {
    const result = fn();
    db.execSync('COMMIT');
    return result;
  } catch (e) {
    db.execSync('ROLLBACK');
    throw e;
  }
}
