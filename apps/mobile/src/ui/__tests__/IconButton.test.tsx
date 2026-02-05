import React from 'react';
import { Pressable } from 'react-native';

import { IconButton } from '../IconButton';
import { tokens } from '../../theme/tokens';

jest.mock('react-native', () => {
    const React = require('react');
    return {
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
    };
});

describe('IconButton', () => {
    it('renders as a pressable button', () => {
        const element = IconButton({
            onPress: jest.fn(),
            accessibilityLabel: 'Open info',
            icon: React.createElement('Ionicons', { name: 'information-circle-outline', size: 20 }),
        });

        expect(element.type).toBe(Pressable);
        expect(element.props.accessibilityRole).toBe('button');
        expect(element.props.accessibilityLabel).toBe('Open info');
    });

    it('calls onPress when pressed', () => {
        const handlePress = jest.fn();
        const element = IconButton({
            onPress: handlePress,
            accessibilityLabel: 'Delete item',
            icon: React.createElement('Ionicons', { name: 'trash-outline', size: 20 }),
        });

        element.props.onPress();

        expect(handlePress).toHaveBeenCalledTimes(1);
    });

    it('applies danger color to icon', () => {
        const element = IconButton({
            onPress: jest.fn(),
            accessibilityLabel: 'Delete item',
            variant: 'danger',
            icon: React.createElement('Ionicons', {
                name: 'trash-outline',
                size: 20,
                color: '#ffffff',
            }),
        });

        expect(element.props.children.props.color).toBe(tokens.colors.destructive);
    });
});