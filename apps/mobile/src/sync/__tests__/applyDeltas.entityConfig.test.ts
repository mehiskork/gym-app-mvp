import { applyDeltas, getSyncApplyEntityTypes, type SyncDelta } from '../applyDeltas';
import { exec, query } from '../../db/db';
import { logEvent } from '../../utils/logger';

jest.mock('../../db/db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

describe('sync apply entity inventory', () => {
  const expectedSyncedEntityOrder = [
    'program',
    'program_week',
    'program_day',
    'exercise',
    'program_day_exercise',
    'planned_set',
    'workout_session',
    'workout_session_exercise',
    'workout_set',
    'app_meta',
  ];

  // Intentionally duplicated here to catch accidental backend/mobile/docs drift.
  const localDerivedEntities = ['pr_event'];
  const mobileLocalOnlyInfraTables = [
    'outbox_op',
    'sync_state',
    'sync_run',
    'app_log',
    'schema_migrations',
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('matches the current synced entity order', () => {
    expect(getSyncApplyEntityTypes()).toEqual(expectedSyncedEntityOrder);
  });

  it('excludes local-derived and mobile-only infrastructure tables from apply config', () => {
    const entityTypes = getSyncApplyEntityTypes();

    for (const entityType of localDerivedEntities) {
      expect(entityTypes).not.toContain(entityType);
    }
    for (const table of mobileLocalOnlyInfraTables) {
      expect(entityTypes).not.toContain(table);
    }
  });

  it('skips inbound pr_event because PR events are local-derived cache', () => {
    const delta: SyncDelta = {
      entityType: 'pr_event',
      entityId: 'pr-1',
      opType: 'upsert',
      payload: { id: 'pr-1' },
    };

    const result = applyDeltas([delta]);

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'sync',
      'Skipped delta with unknown entity type',
      expect.objectContaining({ entityType: 'pr_event', entityId: 'pr-1' }),
    );
  });
});
