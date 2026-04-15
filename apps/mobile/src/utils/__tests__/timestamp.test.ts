import { formatTimestampForDisplay, parseTimestampMs } from '../timestamp';

describe('parseTimestampMs', () => {
  it('parses ISO-8601 timestamps', () => {
    expect(parseTimestampMs('2026-03-08T12:34:56.000Z')).toBe(
      Date.parse('2026-03-08T12:34:56.000Z'),
    );
  });

  it('parses SQLite timestamps', () => {
    expect(parseTimestampMs('2026-03-08 12:34:56')).toBe(Date.parse('2026-03-08T12:34:56Z'));
  });

  it('returns null for invalid timestamps', () => {
    expect(parseTimestampMs('not-a-date')).toBeNull();
  });
});

describe('formatTimestampForDisplay', () => {
  it('formats SQLite UTC timestamps with local toLocaleString rendering', () => {
    const local = new Date(Date.parse('2026-03-08T12:34:56Z')).toLocaleString();
    expect(formatTimestampForDisplay('2026-03-08 12:34:56')).toBe(local);
  });

  it('returns original value when parsing fails', () => {
    expect(formatTimestampForDisplay('not-a-date')).toBe('not-a-date');
  });

  it('formats epoch milliseconds values', () => {
    const ms = Date.parse('2026-03-08T12:34:56Z');
    expect(formatTimestampForDisplay(ms)).toBe(new Date(ms).toLocaleString());
  });
});
