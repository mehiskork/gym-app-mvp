jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useState: jest.fn(),
        useCallback: (fn: () => unknown) => fn,
    };
});

jest.mock('react-native', () => {
    const React = require('react');
    return {
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
        TextInput: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('TextInput', props, children),
        View: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('View', props, children),
        StyleSheet: {
            create: (styles: unknown) => styles,
            flatten: (styles: unknown) =>
                Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles,
        },
    };
});

jest.mock('@expo/vector-icons', () => {
    const React = require('react');
    return {
        Ionicons: ({ name, ...props }: { name: string }) =>
            React.createElement('Ionicons', { name, ...props }),
    };
});

jest.mock('react-native-safe-area-context', () => {
    const React = require('react');
    return {
        SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('SafeAreaView', props, children),
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    };
});

import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { SetRow } from '../SetRow';
import { tokens } from '../../../theme/tokens';

const findElementsByType = <P,>(
    node: React.ReactNode,
    type: React.ElementType | string,
    acc: Array<React.ReactElement<P>> = [],
) => {
    if (!node) return acc;
    if (Array.isArray(node)) {
        node.forEach((child) => findElementsByType<P>(child, type, acc));
        return acc;
    }
    if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
        if (node.type === type) acc.push(node as React.ReactElement<P>);
        return findElementsByType<P>(node.props.children, type, acc);
    }
    return acc;
};

const createSet = () => ({
    id: 'set-1',
    workout_session_exercise_id: 'exercise-1',
    set_index: 1,
    weight: 100,
    reps: 8,
    rpe: null,
    rest_seconds: 90,
    notes: null,
    is_completed: 0,
});

describe('SetRow layout sizing', () => {
    it('uses equal widths for weight and reps and a fixed right actions width', () => {
        const useStateMock = React.useState as jest.Mock;
        let rowWidthState = 0;

        useStateMock.mockImplementation(() => [
            rowWidthState,
            (value: number) => {
                rowWidthState = value;
            },
        ]);

        const element = SetRow({
            set: createSet(),
            onWeightEndEditing: jest.fn(),
            onRepsEndEditing: jest.fn(),
            onToggleComplete: jest.fn(),
            onDelete: jest.fn(),
        });

        const views = findElementsByType(element, View) as Array<
            React.ReactElement<{ style?: unknown; onLayout?: (event: unknown) => void }>
        >;
        const rowView = views.find((view) => typeof view.props.onLayout === 'function');
        expect(rowView).toBeDefined();

        rowView?.props.onLayout?.({ nativeEvent: { layout: { width: 360 } } });

        const updatedElement = SetRow({
            set: createSet(),
            onWeightEndEditing: jest.fn(),
            onRepsEndEditing: jest.fn(),
            onToggleComplete: jest.fn(),
            onDelete: jest.fn(),
        });

        const inputs = findElementsByType(updatedElement, TextInput) as Array<
            React.ReactElement<{ style?: unknown }>
        >;
        const weightStyle = StyleSheet.flatten(inputs[0]?.props.style) as { width?: number };
        const repsStyle = StyleSheet.flatten(inputs[1]?.props.style) as { width?: number };

        expect(weightStyle?.width).toBeDefined();
        expect(weightStyle?.width).toBe(repsStyle?.width);

        const expectedRightActionsWidth = tokens.touchTargetMin * 2 + tokens.spacing.xs;
        const updatedViews = findElementsByType(updatedElement, View) as Array<
            React.ReactElement<{ style?: unknown }>
        >;
        const rightActionsView = updatedViews.find((view) => {
            const style = StyleSheet.flatten(view.props.style) as { width?: number };
            return style?.width === expectedRightActionsWidth;
        });

        expect(rightActionsView).toBeDefined();
    });
});