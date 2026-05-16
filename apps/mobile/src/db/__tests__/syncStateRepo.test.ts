import { exec, query } from '../db';
import { getSyncState, normalizeCursor, resetSyncCursor, updateSyncState } from '../syncStateRepo';

jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

describe('syncStateRepo cursor handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves opaque non-empty cursor strings exactly', () => {
    expect(normalizeCursor('snapshot:abc')).toBe('snapshot:abc');
    expect(normalizeCursor('not-a-number')).toBe('not-a-number');
  });

  it('uses 0 only for empty initial cursor values', () => {
    expect(normalizeCursor(null)).toBe('0');
    expect(normalizeCursor(undefined)).toBe('0');
    expect(normalizeCursor('')).toBe('0');
  });

  it('returns stored opaque cursor unchanged', () => {
    (query as jest.Mock).mockReturnValue([
      {
        id: 1,
        cursor: 'snapshot:590:program:program-1',
        last_sync_at: null,
        last_error: null,
        backoff_until: null,
        consecutive_failures: 0,
        last_delta_count: 0,
      },
    ]);

    expect(getSyncState().cursor).toBe('snapshot:590:program:program-1');
  });

  it('stores backend cursor exactly as returned', () => {
    updateSyncState({ cursor: 'snapshot:abc' });

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE sync_state'), [
      'snapshot:abc',
    ]);
  });

  it('resets cursor and sync bookkeeping for a fresh restore', () => {
    resetSyncCursor();

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE sync_state'), [
      '0',
      null,
      null,
      null,
      0,
      0,
    ]);
  });
});
