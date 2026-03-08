import { parseTimestampMs } from '../timestamp';

describe('parseTimestampMs', () => {
    it('parses ISO-8601 timestamps', () => {
        expect(parseTimestampMs('2026-03-08T12:34:56.000Z')).toBe(Date.parse('2026-03-08T12:34:56.000Z'));
    });

    it('parses SQLite timestamps', () => {
        expect(parseTimestampMs('2026-03-08 12:34:56')).toBe(Date.parse('2026-03-08T12:34:56Z'));
    });

    it('returns null for invalid timestamps', () => {
        expect(parseTimestampMs('not-a-date')).toBeNull();
    });
});