import { db } from './db';

let txDepth = 0;

export function inTransaction<T>(fn: () => T): T {
  const isOuter = txDepth === 0;

  if (isOuter) {
    db.execSync('BEGIN');
  }

  txDepth += 1;

  try {
    const result = fn();
    txDepth -= 1;

    if (isOuter) {
      db.execSync('COMMIT');
    }

    return result;
  } catch (e) {
    txDepth -= 1;

    if (isOuter) {
      db.execSync('ROLLBACK');
    }

    throw e;
  }
}
