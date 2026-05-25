import type { CardioSummary } from '../../../db/exerciseTypes';
import { formatCardioInputValue, parseCardioInput } from '../cardioInputParsing';

const fields = [
  'duration_minutes',
  'distance_km',
  'speed_kph',
  'incline_percent',
  'resistance_level',
  'pace_seconds_per_km',
  'floors',
  'stair_level',
] as const satisfies Array<keyof CardioSummary>;

const integerFields = [
  'duration_minutes',
  'resistance_level',
  'floors',
  'stair_level',
] as const satisfies Array<keyof CardioSummary>;

const decimalFields = ['distance_km', 'speed_kph', 'incline_percent'] as const satisfies Array<
  keyof CardioSummary
>;

const maxValues: Record<keyof CardioSummary, number> = {
  duration_minutes: 999,
  distance_km: 999.9,
  speed_kph: 99.9,
  incline_percent: 50,
  resistance_level: 999,
  pace_seconds_per_km: 5999,
  floors: 999,
  stair_level: 999,
};

describe('cardioInputParsing', () => {
  it.each(fields)('parses empty %s as null', (field) => {
    expect(parseCardioInput(field, '')).toEqual({ ok: true, value: null });
  });

  it.each(fields)('parses whitespace %s as null', (field) => {
    expect(parseCardioInput(field, '   ')).toEqual({ ok: true, value: null });
  });

  it.each([...integerFields, ...decimalFields])('parses zero %s as 0', (field) => {
    expect(parseCardioInput(field, '0')).toEqual({ ok: true, value: 0 });
  });

  it.each([...integerFields, ...decimalFields])('accepts max boundary for %s', (field) => {
    expect(parseCardioInput(field, String(maxValues[field]))).toEqual({
      ok: true,
      value: maxValues[field],
    });
  });

  it.each([
    ['duration_minutes', '1000'],
    ['distance_km', '1000'],
    ['speed_kph', '100'],
    ['incline_percent', '50.1'],
    ['resistance_level', '1000'],
    ['floors', '1000'],
    ['stair_level', '1000'],
  ] as const)('rejects above max for %s', (field, input) => {
    expect(parseCardioInput(field, input)).toEqual({ ok: false });
  });

  it.each(decimalFields)('accepts dot and comma decimals for %s', (field) => {
    expect(parseCardioInput(field, '12.5')).toEqual({ ok: true, value: 12.5 });
    expect(parseCardioInput(field, '12,5')).toEqual({ ok: true, value: 12.5 });
  });

  it.each(decimalFields)('rejects malformed decimal %s input', (field) => {
    for (const input of ['82.55', '82.5.1', '82,5,1', '-1', '1e3', 'text', '💪']) {
      expect(parseCardioInput(field, input)).toEqual({ ok: false });
    }
  });

  it.each(integerFields)('rejects non-integer %s input', (field) => {
    for (const input of ['10.5', '10,5', '-1', '1e3', 'text', '💪']) {
      expect(parseCardioInput(field, input)).toEqual({ ok: false });
    }
  });

  it.each([
    ['distance_km', 82.5, '82,5'],
    ['distance_km', 82, '82'],
    ['speed_kph', 12.5, '12,5'],
    ['incline_percent', 5, '5'],
  ] as const)('formats decimal %s value %p', (field, value, expected) => {
    expect(formatCardioInputValue(field, value)).toBe(expected);
  });

  it.each(integerFields)('formats integer %s values plainly', (field) => {
    expect(formatCardioInputValue(field, 10)).toBe('10');
    expect(formatCardioInputValue(field, null)).toBe('');
  });

  it.each([
    ['', null],
    ['   ', null],
    ['5:30', 330],
    ['6:05', 365],
    ['10:00', 600],
    ['5', 300],
    ['530', 330],
    ['605', 365],
    ['1000', 600],
    ['0:01', 1],
    ['99:59', 5999],
  ])('parses pace input %p', (input, value) => {
    expect(parseCardioInput('pace_seconds_per_km', input)).toEqual({ ok: true, value });
  });

  it.each([
    [330, '5:30'],
    [365, '6:05'],
    [600, '10:00'],
  ])('formats pace seconds %p', (value, expected) => {
    expect(formatCardioInputValue('pace_seconds_per_km', value)).toBe(expected);
  });

  it.each(['0', '0:00', '100:00', '5:75', '9999', '5.30', '5,30', '-5:30', '1e3', 'text', '💪'])(
    'rejects invalid pace input %p',
    (input) => {
      expect(parseCardioInput('pace_seconds_per_km', input)).toEqual({ ok: false });
    },
  );
});
