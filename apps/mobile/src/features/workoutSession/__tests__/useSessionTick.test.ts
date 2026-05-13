import { getDurationMinutes } from '../useSessionTick';

describe('getDurationMinutes', () => {
  const nowMs = new Date('2024-01-01T01:30:30Z').getTime();

  it('returns 0 when startedAt is missing', () => {
    expect(getDurationMinutes(null, nowMs)).toBe(0);
    expect(getDurationMinutes(undefined, nowMs)).toBe(0);
    expect(getDurationMinutes('', nowMs)).toBe(0);
  });

  it('returns 0 when startedAt is invalid', () => {
    expect(getDurationMinutes('not-a-date', nowMs)).toBe(0);
  });

  it('clamps future durations to 0', () => {
    expect(getDurationMinutes('2024-01-01T01:31:00Z', nowMs)).toBe(0);
  });

  it('rounds positive durations in minutes', () => {
    expect(getDurationMinutes('2024-01-01T00:00:00Z', nowMs)).toBe(91);
  });
});
