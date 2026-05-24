import {
  formatRepsInputValue,
  formatWeightInputValue,
  parseRepsInput,
  parseWeightInput,
} from '../setInputParsing';

describe('setInputParsing', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['0', 0],
    ['82', 82],
    ['82.5', 82.5],
    ['82,5', 82.5],
    ['82.0', 82],
    ['999.9', 999.9],
  ])('parses valid weight input %p', (input, value) => {
    expect(parseWeightInput(input)).toEqual({ ok: true, value });
  });

  it.each(['1000', '-5', '1e9', '82.55', 'kg', '💪', '82.5.1', '82,5,1', '82.,5'])(
    'rejects invalid weight input %p',
    (input) => {
      expect(parseWeightInput(input)).toEqual({ ok: false });
    },
  );

  it.each([
    [82.5, '82,5'],
    [82, '82'],
    [82.0, '82'],
    [null, ''],
  ])('formats saved weight %p', (value, expected) => {
    expect(formatWeightInputValue(value)).toBe(expected);
  });

  it.each([
    ['', null],
    ['   ', null],
    ['0', 0],
    ['999', 999],
  ])('parses valid reps input %p', (input, value) => {
    expect(parseRepsInput(input)).toEqual({ ok: true, value });
  });

  it.each(['1000', '10.5', '10,5', '-1', '1e3', 'ten', '💪'])(
    'rejects invalid reps input %p',
    (input) => {
      expect(parseRepsInput(input)).toEqual({ ok: false });
    },
  );

  it.each([
    [10, '10'],
    [null, ''],
  ])('formats saved reps %p', (value, expected) => {
    expect(formatRepsInputValue(value)).toBe(expected);
  });
});
