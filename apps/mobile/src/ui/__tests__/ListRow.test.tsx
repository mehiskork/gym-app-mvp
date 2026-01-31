import React from 'react';
import { Pressable } from 'react-native';

import { ListRow } from '../ListRow';

jest.mock('react-native', () => {
    const React = require('react');
    return {
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
        View: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('View', props, children),
        Text: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Text', props, children),
        Platform: { select: () => 'monospace' },
    };
});

jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

describe('ListRow', () => {
    it('calls onPress when pressed', () => {
        const handlePress = jest.fn();
        const element = ListRow({ title: 'Recent workout', onPress: handlePress });

        expect(element.type).toBe(Pressable);

        element.props.onPress();

        expect(handlePress).toHaveBeenCalledTimes(1);
    });
});