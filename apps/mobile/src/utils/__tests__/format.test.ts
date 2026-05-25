import { formatPacePerKm, formatPaceSeconds, formatRestCountdown } from '../format';

describe('formatRestCountdown', () => {
  it('formats countdown values as mm:ss', () => {
    expect(formatRestCountdown(90)).toBe('1:30');
  });

  it('clamps negative values to zero', () => {
    expect(formatRestCountdown(-10)).toBe('0:00');
  });
});

describe('pace formatting', () => {
  it.each([
    [330, '5:30'],
    [355, '5:55'],
    [365, '6:05'],
    [600, '10:00'],
  ])('formats pace seconds %p as min:sec', (seconds, expected) => {
    expect(formatPaceSeconds(seconds)).toBe(expected);
  });

  it('formats pace per kilometer for user-facing display', () => {
    expect(formatPacePerKm(355)).toBe('5:55 /km');
  });
});
