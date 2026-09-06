import { db, exec } from './db';

let txDepth = 0;
let connectionFailure: TransactionRollbackError | null = null;

export class TransactionRollbackError extends Error {
  constructor(
    readonly cause: unknown,
    readonly rollbackError: unknown,
    readonly restartRequired: boolean,
    readonly transactionStateError?: unknown,
  ) {
    super(
      restartRequired
        ? 'Database rollback could not be confirmed. Close and reopen TrainFrame before trying again.'
        : 'Database transaction failed and SQLite had already ended the transaction.',
    );
    this.name = 'TransactionRollbackError';
  }
}

// Do not read migration markers or start another transaction on an uncertain connection.
// Only reopening the app (and its database connection) clears this guard.
export function assertTransactionConnectionReady(): void {
  if (connectionFailure) throw connectionFailure;
}

export function inTransaction<T>(fn: () => T): T {
  assertTransactionConnectionReady();
  const isOuter = txDepth === 0;

  if (isOuter) {
    exec('BEGIN');
  }

  txDepth += 1;

  try {
    const result = fn();

    if (isOuter) {
      exec('COMMIT');
    }

    return result;
  } catch (e) {
    if (isOuter) {
      try {
        exec('ROLLBACK');
      } catch (rollbackError) {
        // SQLite may have automatically rolled back (e.g. SQLITE_FULL). Distinguish
        // that harmless extra ROLLBACK from an active or unknown transaction.
        let restartRequired = true;
        let transactionStateError: unknown;
        try {
          restartRequired = db.isInTransactionSync();
        } catch (stateError) {
          transactionStateError = stateError;
        }
        const failure = new TransactionRollbackError(
          e,
          rollbackError,
          restartRequired,
          transactionStateError,
        );
        if (restartRequired) connectionFailure = failure;
        throw failure;
      }
    }

    throw e;
  } finally {
    // COMMIT can throw too. Always restore depth exactly once, after cleanup.
    txDepth -= 1;
  }
}
