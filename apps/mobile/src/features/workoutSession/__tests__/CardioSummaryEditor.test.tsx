const mockUseStateSetters: jest.Mock[] = [];

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useRef: () => ({ current: {} }),
    useCallback: (fn: () => unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useEffect: (fn: () => unknown) => fn(),
    useState: (initial: unknown) => {
      const setter = jest.fn();
      mockUseStateSetters.push(setter);
      return [initial, setter];
    },
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

import React from 'react';
import { CardioSummaryEditor } from '../CardioSummaryEditor';
import { tokens } from '../../../theme/tokens';

jest.mock('../../../ui', () => {
  const React = require('react');
  return {
    Input: (props: unknown) => React.createElement('Input', props),
    Text: (props: unknown) => React.createElement('Text', props),
  };
});

const findByLabel = <P,>(node: React.ReactNode, acc: Array<React.ReactElement<P>> = []) => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => findByLabel<P>(child, acc));
    return acc;
  }
  if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
    if ('label' in (node.props as object)) acc.push(node as React.ReactElement<P>);
    return findByLabel<P>((node.props as { children?: React.ReactNode }).children, acc);
  }
  return acc;
};

const findRowViews = (
  node: React.ReactNode,
  acc: Array<React.ReactElement<{ style?: { flexDirection?: string } }>> = [],
) => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => findRowViews(child, acc));
    return acc;
  }
  if (React.isValidElement(node)) {
    const style = (node.props as { style?: { flexDirection?: string } }).style;
    if (style?.flexDirection === 'row') {
      acc.push(node as React.ReactElement<{ style?: { flexDirection?: string } }>);
    }
    return findRowViews((node.props as { children?: React.ReactNode }).children, acc);
  }
  return acc;
};

describe('CardioSummaryEditor', () => {
  beforeEach(() => {
    mockUseStateSetters.length = 0;
  });

  it('applies explicit max lengths for cardio value inputs', () => {
    const treadmillElement = CardioSummaryEditor({
      profile: 'treadmill',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });
    const treadmillInputs = findByLabel<{ label?: string; maxLength?: number }>(treadmillElement);
    expect(treadmillInputs.map((input) => [input.props.label, input.props.maxLength])).toEqual([
      ['Duration (min)', 3],
      ['Distance (km)', 5],
      ['Speed (km/h)', 4],
      ['Incline (%)', 4],
    ]);

    const bikeElement = CardioSummaryEditor({
      profile: 'bike',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });
    const bikeInputs = findByLabel<{ label?: string; maxLength?: number }>(bikeElement);
    expect(bikeInputs.map((input) => [input.props.label, input.props.maxLength])).toEqual([
      ['Duration (min)', 3],
      ['Distance (km)', 5],
      ['Resistance', 3],
    ]);

    const ergometerElement = CardioSummaryEditor({
      profile: 'ergometer',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });
    const ergometerInputs = findByLabel<{ label?: string; maxLength?: number }>(ergometerElement);
    expect(ergometerInputs.map((input) => [input.props.label, input.props.maxLength])).toEqual([
      ['Duration (min)', 3],
      ['Distance (km)', 5],
      ['Pace (min/km)', 5],
    ]);

    const stairsElement = CardioSummaryEditor({
      profile: 'stairs',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });
    const stairsInputs = findByLabel<{ label?: string; maxLength?: number }>(stairsElement);
    expect(stairsInputs.map((input) => [input.props.label, input.props.maxLength])).toEqual([
      ['Duration (min)', 3],
      ['Floors', 3],
      ['Level', 3],
    ]);
  });

  it('displays saved decimal values with comma and pace as min:sec', () => {
    const element = CardioSummaryEditor({
      profile: 'ergometer',
      summary: {
        duration_minutes: 10,
        distance_km: 2.5,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: 355,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });

    const inputs = findByLabel<{ label?: string; value?: string }>(element);
    expect(inputs.map((input) => [input.props.label, input.props.value])).toEqual([
      ['Duration (min)', '10'],
      ['Distance (km)', '2,5'],
      ['Pace (min/km)', '5:55'],
    ]);
  });

  it('valid decimal edit calls save handler and formats with comma', () => {
    const onFieldEndEditing = jest.fn().mockReturnValue(true);
    const element = CardioSummaryEditor({
      profile: 'bike',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing,
    });

    const inputs = findByLabel<{
      label?: string;
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element);
    const setter = mockUseStateSetters[0];

    inputs[1]?.props.onEndEditing?.({ nativeEvent: { text: '12.5' } });

    expect(onFieldEndEditing).toHaveBeenCalledWith('distance_km', '12.5');
    expect(setter).toHaveBeenCalledWith(expect.any(Function));
    expect(setter.mock.calls.at(-1)?.[0]({ distance_km: '' })).toEqual({ distance_km: '12,5' });
  });

  it.each([
    ['6:05', '6:05'],
    ['530', '5:30'],
    ['605', '6:05'],
  ])('valid pace edit %p calls save handler and formats as min:sec', (inputText, expectedText) => {
    const onFieldEndEditing = jest.fn().mockReturnValue(true);
    const element = CardioSummaryEditor({
      profile: 'ergometer',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing,
    });

    const inputs = findByLabel<{
      label?: string;
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element);
    const setter = mockUseStateSetters[0];

    inputs[2]?.props.onEndEditing?.({ nativeEvent: { text: inputText } });

    expect(onFieldEndEditing).toHaveBeenCalledWith('pace_seconds_per_km', inputText);
    expect(setter.mock.calls.at(-1)?.[0]({ pace_seconds_per_km: '' })).toEqual({
      pace_seconds_per_km: expectedText,
    });
  });

  it('adds pace placeholder, helper text, and number-pad keyboard', () => {
    const element = CardioSummaryEditor({
      profile: 'ergometer',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });

    const inputs = findByLabel<{
      label?: string;
      placeholder?: string;
      helperText?: string;
      keyboardType?: string;
    }>(element);
    const paceInput = inputs.find((input) => input.props.label === 'Pace (min/km)');

    expect(paceInput?.props.placeholder).toBe('5:30');
    expect(paceInput?.props.helperText).toBe('Type 530 for 5:30');
    expect(paceInput?.props.keyboardType).toBe('number-pad');
  });

  it('invalid edit does not call save handler and resets visible value', () => {
    const onFieldEndEditing = jest.fn();
    const element = CardioSummaryEditor({
      profile: 'bike',
      summary: {
        duration_minutes: 20,
        distance_km: 4.5,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing,
    });

    const inputs = findByLabel<{
      label?: string;
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element);
    const setter = mockUseStateSetters[0];

    inputs[1]?.props.onEndEditing?.({ nativeEvent: { text: '1e3' } });

    expect(onFieldEndEditing).not.toHaveBeenCalled();
    expect(setter.mock.calls.at(-1)?.[0]({ distance_km: '1e3' })).toEqual({
      distance_km: '4,5',
    });
  });

  it('invalid pace shorthand resets to the previous saved value', () => {
    const onFieldEndEditing = jest.fn();
    const element = CardioSummaryEditor({
      profile: 'ergometer',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: 355,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing,
    });

    const inputs = findByLabel<{
      label?: string;
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element);
    const setter = mockUseStateSetters[0];

    inputs[2]?.props.onEndEditing?.({ nativeEvent: { text: '9999' } });

    expect(onFieldEndEditing).not.toHaveBeenCalled();
    expect(setter.mock.calls.at(-1)?.[0]({ pace_seconds_per_km: '9999' })).toEqual({
      pace_seconds_per_km: '5:55',
    });
  });

  it('empty edit calls save handler with null-equivalent text and resets to empty', () => {
    const onFieldEndEditing = jest.fn().mockReturnValue(true);
    const element = CardioSummaryEditor({
      profile: 'bike',
      summary: {
        duration_minutes: null,
        distance_km: 4.5,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing,
    });

    const inputs = findByLabel<{
      label?: string;
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element);
    const setter = mockUseStateSetters[0];

    inputs[1]?.props.onEndEditing?.({ nativeEvent: { text: '   ' } });

    expect(onFieldEndEditing).toHaveBeenCalledWith('distance_km', '   ');
    expect(setter.mock.calls.at(-1)?.[0]({ distance_km: '4,5' })).toEqual({ distance_km: '' });
  });

  it('empty pace edit calls save handler and resets to empty', () => {
    const onFieldEndEditing = jest.fn().mockReturnValue(true);
    const element = CardioSummaryEditor({
      profile: 'ergometer',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: 355,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing,
    });

    const inputs = findByLabel<{
      label?: string;
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element);
    const setter = mockUseStateSetters[0];

    inputs[2]?.props.onEndEditing?.({ nativeEvent: { text: '   ' } });

    expect(onFieldEndEditing).toHaveBeenCalledWith('pace_seconds_per_km', '   ');
    expect(setter.mock.calls.at(-1)?.[0]({ pace_seconds_per_km: '5:55' })).toEqual({
      pace_seconds_per_km: '',
    });
  });

  it('resyncs local state when summary props change', () => {
    CardioSummaryEditor({
      profile: 'bike',
      summary: {
        duration_minutes: 30,
        distance_km: 8.5,
        speed_kph: null,
        incline_percent: null,
        resistance_level: 7,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });

    expect(mockUseStateSetters[0]).toHaveBeenCalledWith(
      expect.objectContaining({
        duration_minutes: '30',
        distance_km: '8,5',
        resistance_level: '7',
      }),
    );
  });

  it('renders treadmill-specific fields', () => {
    const element = CardioSummaryEditor({
      profile: 'treadmill',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });

    const inputs = findByLabel<{ label?: string; placeholder?: string }>(element);
    const labels = inputs.map((input) => input.props.label);
    const rows = findRowViews(element);
    expect(labels).toEqual(['Duration (min)', 'Distance (km)', 'Speed (km/h)', 'Incline (%)']);
    expect(rows).toHaveLength(2);
    expect(inputs.every((input) => input.props.placeholder === undefined)).toBe(true);
  });

  it('renders stairs-specific fields', () => {
    const element = CardioSummaryEditor({
      profile: 'stairs',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });

    const inputs = findByLabel<{ label?: string; placeholder?: string }>(element);
    const rows = findRowViews(element);
    const labels = inputs.map((input) => input.props.label);
    expect(labels).toEqual(['Duration (min)', 'Floors', 'Level']);
    expect(rows).toHaveLength(2);
    expect(inputs.every((input) => input.props.placeholder === undefined)).toBe(true);
  });

  it('uses strength-matching value typography for cardio inputs', () => {
    const element = CardioSummaryEditor({
      profile: 'bike',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
    });

    const inputs = findByLabel<{
      inputStyle?: { fontSize?: number; fontWeight?: string; lineHeight?: number };
    }>(element);
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input.props.inputStyle).toEqual({
        fontSize: tokens.typography.subtitle.fontSize + 2,
        fontWeight: tokens.typography.subtitle.fontWeight,
        lineHeight: tokens.typography.subtitle.fontSize + 6,
      });
    }
  });
  it('wires focus handling so cardio fields can participate in keyboard-safe scrolling', () => {
    const onEditFocus = jest.fn();
    const element = CardioSummaryEditor({
      profile: 'bike',
      summary: {
        duration_minutes: null,
        distance_km: null,
        speed_kph: null,
        incline_percent: null,
        resistance_level: null,
        pace_seconds_per_km: null,
        floors: null,
        stair_level: null,
      },
      editable: true,
      onFieldEndEditing: jest.fn(),
      onEditFocus,
    });

    const inputs = findByLabel<{ onFocus?: () => void }>(element);
    expect(inputs).toHaveLength(3);
    expect(inputs.every((input) => typeof input.props.onFocus === 'function')).toBe(true);
  });
});
