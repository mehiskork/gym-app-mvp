jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../db/workoutHistoryExportRepo', () => ({
  listWorkoutHistoryExportRows: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { listWorkoutHistoryExportRows } from '../../../db/workoutHistoryExportRepo';
import {
  exportWorkoutHistoryCsv,
  serializeWorkoutHistoryCsv,
  WORKOUT_HISTORY_CSV_HEADERS,
} from '../workoutHistoryCsv';
import type { WorkoutHistoryExportRow } from '../../../db/workoutHistoryExportRepo';

const strengthRow: WorkoutHistoryExportRow = {
  workout_date: '2026-01-01',
  workout_started_at: '2026-01-01T09:00:00.000Z',
  workout_ended_at: '2026-01-01T10:00:00.000Z',
  workout_name: 'Push, Pull',
  workout_source: 'quick_workout',
  exercise_name: 'Bench "Press"',
  exercise_id: 'ex-1',
  exercise_type: 'strength',
  exercise_order: 1,
  set_index: 1,
  is_completed: 1,
  reps: 8,
  weight: 80,
  duration_minutes: null,
  distance_km: null,
  speed_kph: null,
  incline_percent: null,
  resistance_level: null,
  pace_seconds_per_km: null,
  floors: null,
  stair_level: null,
  workout_note: ' line one\nline two ',
  exercise_note: 'comma, quote " note\r\nnext',
};

describe('workoutHistoryCsv', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (FileSystem as typeof FileSystem & { cacheDirectory: string | null }).cacheDirectory =
      'file:///cache/';
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('serializes the stable CSV header and escapes special values', () => {
    const csv = serializeWorkoutHistoryCsv([strengthRow]);

    expect(csv.split('\n')[0]).toBe(WORKOUT_HISTORY_CSV_HEADERS.join(','));
    expect(csv).toContain('"Push, Pull"');
    expect(csv).toContain('"Bench ""Press"""');
    expect(csv).toContain('" line one\nline two "');
    expect(csv).toContain('"comma, quote "" note\r\nnext"');
    expect(csv).toContain('80,,,,,,,,,');
  });

  it('returns noData without writing or sharing when there are no rows', async () => {
    (listWorkoutHistoryExportRows as jest.Mock).mockReturnValue([]);

    await expect(exportWorkoutHistoryCsv(new Date('2026-06-10T12:00:00.000Z'))).resolves.toEqual({
      status: 'noData',
    });

    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('writes a UTF-8 CSV file and opens the share sheet', async () => {
    (listWorkoutHistoryExportRows as jest.Mock).mockReturnValue([strengthRow]);

    const result = await exportWorkoutHistoryCsv(new Date('2026-06-10T12:00:00.000Z'));

    expect(result).toEqual({
      status: 'shared',
      path: 'file:///cache/trainframe-workout-history-2026-06-10.csv',
      rowCount: 1,
    });
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/trainframe-workout-history-2026-06-10.csv',
      expect.stringContaining(WORKOUT_HISTORY_CSV_HEADERS.join(',')),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
    expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/trainframe-workout-history-2026-06-10.csv',
      {
        dialogTitle: 'Export workout history CSV',
        mimeType: 'text/csv',
      },
    );
  });

  it('returns sharingUnavailable after writing when sharing is unavailable', async () => {
    (listWorkoutHistoryExportRows as jest.Mock).mockReturnValue([strengthRow]);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    await expect(exportWorkoutHistoryCsv(new Date('2026-06-10T12:00:00.000Z'))).resolves.toEqual({
      status: 'sharingUnavailable',
      path: 'file:///cache/trainframe-workout-history-2026-06-10.csv',
      rowCount: 1,
    });

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('returns error when file writing or sharing fails', async () => {
    const error = new Error('write failed');
    (listWorkoutHistoryExportRows as jest.Mock).mockReturnValue([strengthRow]);
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValue(error);

    await expect(exportWorkoutHistoryCsv(new Date('2026-06-10T12:00:00.000Z'))).resolves.toEqual({
      status: 'error',
      error,
    });
  });
});
