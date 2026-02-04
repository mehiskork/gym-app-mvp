import { formatRestCountdown } from '../format';

describe('formatRestCountdown', () => {
    it('formats countdown values as mm:ss', () => {
        expect(formatRestCountdown(90)).toBe('1:30');
    });

    it('clamps negative values to zero', () => {
        expect(formatRestCountdown(-10)).toBe('0:00');
    });
});