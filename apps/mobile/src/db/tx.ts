import { exec } from './db';

let txDepth = 0;

export function inTransaction<T>(fn: () => T): T {
  const isOuter = txDepth === 0;

  if (isOuter) {
    exec('BEGIN');
  }

  txDepth += 1;

  try {
    const result = fn();
    txDepth -= 1;

    if (isOuter) {
      exec('COMMIT');
    }

    return result;
  } catch (e) {
    txDepth -= 1;

    if (isOuter) {
      exec('ROLLBACK');
    }

    throw e;
  }
}
