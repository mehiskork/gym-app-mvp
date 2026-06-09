import type { CardioSummary } from '../../db/exerciseTypes';
import type { CardioProfile } from '../../db/exerciseTypes';

export type ParsedCardioInput =
  | {
      ok: true;
      value: number | null;
    }
  | {
      ok: false;
    };

type CardioFieldConfig = {
  kind: 'integer' | 'decimal' | 'pace';
  max: number;
};

export const cardioFieldConfigs: Record<keyof CardioSummary, CardioFieldConfig> = {
  duration_minutes: { kind: 'integer', max: 999 },
  distance_km: { kind: 'decimal', max: 999.9 },
  speed_kph: { kind: 'decimal', max: 99.9 },
  incline_percent: { kind: 'decimal', max: 50 },
  resistance_level: { kind: 'integer', max: 999 },
  pace_seconds_per_km: { kind: 'pace', max: 5999 },
  floors: { kind: 'integer', max: 999 },
  stair_level: { kind: 'integer', max: 999 },
};

export const cardioFieldMaxLengths: Record<keyof CardioSummary, number> = {
  duration_minutes: 3,
  distance_km: 5,
  speed_kph: 4,
  incline_percent: 4,
  resistance_level: 3,
  pace_seconds_per_km: 5,
  floors: 3,
  stair_level: 3,
};

export function fieldsForCardioProfile(
  profile: CardioProfile | null,
): Array<{ key: keyof CardioSummary; label: string }> {
  switch (profile) {
    case 'treadmill':
      return [
        { key: 'duration_minutes', label: 'Duration (min)' },
        { key: 'distance_km', label: 'Distance (km)' },
        { key: 'speed_kph', label: 'Speed (km/h)' },
        { key: 'incline_percent', label: 'Incline (%)' },
      ];
    case 'bike':
      return [
        { key: 'duration_minutes', label: 'Duration (min)' },
        { key: 'distance_km', label: 'Distance (km)' },
        { key: 'resistance_level', label: 'Resistance' },
      ];
    case 'ergometer':
      return [
        { key: 'duration_minutes', label: 'Duration (min)' },
        { key: 'distance_km', label: 'Distance (km)' },
        { key: 'pace_seconds_per_km', label: 'Pace (min/km)' },
      ];
    case 'stairs':
      return [
        { key: 'duration_minutes', label: 'Duration (min)' },
        { key: 'floors', label: 'Floors' },
        { key: 'stair_level', label: 'Level' },
      ];
    case 'elliptical':
      return [
        { key: 'duration_minutes', label: 'Duration (min)' },
        { key: 'distance_km', label: 'Distance (km)' },
        { key: 'resistance_level', label: 'Resistance' },
      ];
    default:
      return [{ key: 'duration_minutes', label: 'Duration (min)' }];
  }
}

const INTEGER_INPUT_RE = /^[0-9]+$/;
const DECIMAL_INPUT_RE = /^[0-9]+([.,][0-9])?$/;
const PACE_INPUT_RE = /^[0-9]{1,2}:[0-9]{2}$/;
const PACE_SHORTHAND_INPUT_RE = /^[0-9]{1,4}$/;

export function isCardioSummaryField(field: string): field is keyof CardioSummary {
  return Object.prototype.hasOwnProperty.call(cardioFieldConfigs, field);
}

function parseIntegerInput(input: string, max: number): ParsedCardioInput {
  if (!INTEGER_INPUT_RE.test(input)) return { ok: false };

  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 0 || value > max) return { ok: false };

  return { ok: true, value };
}

function parseDecimalInput(input: string, max: number): ParsedCardioInput {
  if (!DECIMAL_INPUT_RE.test(input)) return { ok: false };

  const value = Number(input.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > max) return { ok: false };

  return { ok: true, value };
}

function parsePaceInput(input: string): ParsedCardioInput {
  const parts = (() => {
    if (PACE_INPUT_RE.test(input)) return input.split(':');
    if (!PACE_SHORTHAND_INPUT_RE.test(input)) return null;
    if (input.length <= 2) return [input, '00'];
    return [input.slice(0, -2), input.slice(-2)];
  })();

  if (!parts) return { ok: false };

  const [minutesText, secondsText] = parts;
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds)) return { ok: false };
  if (seconds < 0 || seconds > 59) return { ok: false };

  const value = minutes * 60 + seconds;
  if (value < 1 || value > cardioFieldConfigs.pace_seconds_per_km.max) return { ok: false };

  return { ok: true, value };
}

export function parseCardioInput(field: keyof CardioSummary, input: string): ParsedCardioInput {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  const config = cardioFieldConfigs[field];
  if (config.kind === 'integer') return parseIntegerInput(trimmed, config.max);
  if (config.kind === 'decimal') return parseDecimalInput(trimmed, config.max);
  return parsePaceInput(trimmed);
}

export function isValidCardioSummaryValue(field: keyof CardioSummary, value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;

  const config = cardioFieldConfigs[field];
  if (value < 0 || value > config.max) return false;
  if (config.kind === 'decimal') return Math.round(value * 10) === value * 10;
  if (config.kind === 'pace') return Number.isSafeInteger(value) && value >= 1;
  return Number.isSafeInteger(value);
}

function formatDecimalValue(value: number): string {
  return value % 1 === 0 ? String(Math.trunc(value)) : value.toFixed(1).replace('.', ',');
}

function formatPaceValue(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatCardioInputValue(field: keyof CardioSummary, value: number | null): string {
  if (value === null) return '';

  const config = cardioFieldConfigs[field];
  if (config.kind === 'decimal') return formatDecimalValue(value);
  if (config.kind === 'pace') return formatPaceValue(value);
  return String(value);
}
