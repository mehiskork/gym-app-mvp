jest.mock('react-native', () => {
    const React = require('react');
    return {
        View: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('View', props, children),
    };
});

import React from 'react';
import { CardioSummaryEditor } from '../CardioSummaryEditor';

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

describe('CardioSummaryEditor', () => {
    it('renders treadmill-specific fields', () => {
        const element = CardioSummaryEditor({
            profile: 'treadmill',
            summary: {
                duration_seconds: null,
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

        const inputs = findByLabel<{ label?: string }>(element);
        const labels = inputs.map((input) => input.props.label);
        expect(labels).toEqual(['Duration (sec)', 'Distance (km)', 'Speed (km/h)', 'Incline (%)']);
    });

    it('renders stairs-specific fields', () => {
        const element = CardioSummaryEditor({
            profile: 'stairs',
            summary: {
                duration_seconds: null,
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

        const inputs = findByLabel<{ label?: string }>(element);
        const labels = inputs.map((input) => input.props.label);
        expect(labels).toEqual(['Duration (sec)', 'Floors', 'Level']);
    });
});