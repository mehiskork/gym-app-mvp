jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useRef: () => ({ current: {} }),
        useCallback: (fn: () => unknown) => fn,
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

const findRowViews = (node: React.ReactNode, acc: Array<React.ReactElement<{ style?: { flexDirection?: string } }>> = []) => {
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
            ['Speed (km/h)', 5],
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
            ['Resistance', 4],
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
            ['Pace', 5],
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
            ['Floors', 4],
            ['Level', 4],
        ]);
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

        const inputs = findByLabel<{ inputStyle?: { fontSize?: number; fontWeight?: string; lineHeight?: number } }>(element);
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