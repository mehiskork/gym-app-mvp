import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  listWorkoutHistoryExportRows,
  type WorkoutHistoryExportRow,
} from '../../db/workoutHistoryExportRepo';

export const WORKOUT_HISTORY_CSV_HEADERS = [
  'workout_date',
  'workout_started_at',
  'workout_ended_at',
  'workout_name',
  'workout_source',
  'exercise_name',
  'exercise_id',
  'exercise_type',
  'exercise_order',
  'set_index',
  'is_completed',
  'reps',
  'weight',
  'duration_minutes',
  'distance_km',
  'speed_kph',
  'incline_percent',
  'resistance_level',
  'pace_seconds_per_km',
  'floors',
  'stair_level',
  'workout_note',
  'exercise_note',
] as const;

type CsvHeader = (typeof WORKOUT_HISTORY_CSV_HEADERS)[number];

export type WorkoutHistoryCsvExportResult =
  | { status: 'shared'; path: string; rowCount: number }
  | { status: 'noData' }
  | { status: 'sharingUnavailable'; path: string; rowCount: number }
  | { status: 'error'; error: unknown };

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = String(value);
  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text.trim() !== text
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function serializeWorkoutHistoryCsv(rows: WorkoutHistoryExportRow[]): string {
  const lines = [
    WORKOUT_HISTORY_CSV_HEADERS.join(','),
    ...rows.map((row) =>
      WORKOUT_HISTORY_CSV_HEADERS.map((header: CsvHeader) => escapeCsvValue(row[header])).join(','),
    ),
  ];

  return lines.join('\n');
}

function formatDateForFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function exportWorkoutHistoryCsv(
  now: Date = new Date(),
): Promise<WorkoutHistoryCsvExportResult> {
  try {
    const rows = listWorkoutHistoryExportRows();
    if (rows.length === 0) return { status: 'noData' };

    const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!baseDir) {
      return { status: 'error', error: new Error('No writable export directory available.') };
    }

    const csv = serializeWorkoutHistoryCsv(rows);
    const path = `${baseDir}trainframe-workout-history-${formatDateForFileName(now)}.csv`;

    await FileSystem.writeAsStringAsync(path, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (!(await Sharing.isAvailableAsync())) {
      return { status: 'sharingUnavailable', path, rowCount: rows.length };
    }

    await Sharing.shareAsync(path, {
      dialogTitle: 'Export workout history CSV',
      mimeType: 'text/csv',
    });

    return { status: 'shared', path, rowCount: rows.length };
  } catch (error) {
    return { status: 'error', error };
  }
}
