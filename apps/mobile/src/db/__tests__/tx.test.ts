jest.mock('../db', () => ({
  exec: jest.fn(),
  db: { isInTransactionSync: jest.fn(() => false) },
}));

describe('synchronous transaction failure recovery', () => {
  function setup() {
    jest.resetModules();
    const { exec, db } = require('../db');
    const tx = require('../tx') as typeof import('../tx');
    return { ...tx, exec: exec as jest.Mock, state: db.isInTransactionSync as jest.Mock };
  }

  it('returns the callback value and shares the outer transaction with nested calls', () => {
    const { inTransaction, exec } = setup();
    expect(inTransaction(() => inTransaction(() => 42))).toBe(42);
    expect(exec.mock.calls).toEqual([['BEGIN'], ['COMMIT']]);
  });

  it('rolls back once when a nested failure propagates to the outer transaction', () => {
    const { inTransaction, exec } = setup();
    const failure = new Error('nested failure');
    expect(() =>
      inTransaction(() =>
        inTransaction(() => {
          throw failure;
        }),
      ),
    ).toThrow(failure);
    expect(exec.mock.calls).toEqual([['BEGIN'], ['ROLLBACK']]);
    inTransaction(() => undefined);
    expect(exec.mock.calls.slice(2)).toEqual([['BEGIN'], ['COMMIT']]);
  });

  it('preserves existing behavior when the outer callback handles a nested error', () => {
    const { inTransaction, exec } = setup();
    inTransaction(() => {
      try {
        inTransaction(() => {
          throw new Error('handled');
        });
      } catch {
        /* handled by caller */
      }
    });
    expect(exec.mock.calls).toEqual([['BEGIN'], ['COMMIT']]);
  });

  it('does not run the callback or roll back when BEGIN fails', () => {
    const { inTransaction, exec } = setup();
    const failure = new Error('busy');
    exec.mockImplementationOnce(() => {
      throw failure;
    });
    const callback = jest.fn();
    expect(() => inTransaction(callback)).toThrow(failure);
    expect(callback).not.toHaveBeenCalled();
    expect(exec.mock.calls).toEqual([['BEGIN']]);
    inTransaction(callback);
    expect(exec.mock.calls.slice(1)).toEqual([['BEGIN'], ['COMMIT']]);
  });

  it.each(['callback', 'commit'])(
    'restores depth after a %s failure and successful rollback',
    (stage) => {
      const { inTransaction, exec } = setup();
      const failure = new Error(stage);
      if (stage === 'commit') {
        exec
          .mockImplementationOnce(() => undefined)
          .mockImplementationOnce(() => {
            throw failure;
          });
      }
      expect(() =>
        inTransaction(() => {
          if (stage === 'callback') throw failure;
        }),
      ).toThrow(failure);
      expect(exec.mock.calls).toEqual(
        stage === 'callback' ? [['BEGIN'], ['ROLLBACK']] : [['BEGIN'], ['COMMIT'], ['ROLLBACK']],
      );
      exec.mockClear();
      inTransaction(() => undefined);
      expect(exec.mock.calls).toEqual([['BEGIN'], ['COMMIT']]);
    },
  );

  it.each(['ended', 'active', 'unknown'])(
    'retains both errors when rollback fails and state is %s',
    (stateKind) => {
      const {
        inTransaction,
        assertTransactionConnectionReady,
        exec,
        state,
        TransactionRollbackError,
      } = setup();
      const original = new Error('write failed');
      const rollback = new Error('rollback failed');
      const stateFailure = new Error('state unavailable');
      exec
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw rollback;
        });
      if (stateKind === 'unknown')
        state.mockImplementation(() => {
          throw stateFailure;
        });
      else state.mockReturnValue(stateKind === 'active');
      let caught: unknown;
      try {
        inTransaction(() => {
          throw original;
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(TransactionRollbackError);
      expect(caught).toMatchObject({
        cause: original,
        rollbackError: rollback,
        restartRequired: stateKind !== 'ended',
      });
      if (stateKind === 'unknown')
        expect(caught).toHaveProperty('transactionStateError', stateFailure);

      exec.mockClear();
      const callback = jest.fn();
      if (stateKind === 'ended') {
        expect(assertTransactionConnectionReady).not.toThrow();
        inTransaction(callback);
        expect(exec.mock.calls).toEqual([['BEGIN'], ['COMMIT']]);
      } else {
        expect(assertTransactionConnectionReady).toThrow(caught as Error);
        expect(() => inTransaction(callback)).toThrow(caught as Error);
        expect(exec).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
      }
    },
  );
});
