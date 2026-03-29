import React from 'react';

import { FinishWorkoutSheet } from '../FinishWorkoutSheet';
import { Button, BottomSheetModal } from '../../../ui';

type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode }>;

jest.mock('../../../ui', () => {
    const React = require('react');
    return {
        BottomSheetModal: (props: { children?: React.ReactNode }) => React.createElement('BottomSheetModal', props, props.children),
        Button: (props: { children?: React.ReactNode }) => React.createElement('Button', props, props.children),
        Input: (props: { children?: React.ReactNode }) => React.createElement('Input', props, props.children),
        Text: (props: { children?: React.ReactNode }) => React.createElement('Text', props, props.children),
    };
});

jest.mock('react-native', () => {
    const React = require('react');
    return {
        View: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('View', props, children),
    };
});

const findElementsByType = (
    node: React.ReactNode,
    type: React.ElementType | string,
    acc: React.ReactElement[] = [],
): React.ReactElement[] => {
    if (!node) return acc;
    if (Array.isArray(node)) {
        node.forEach((child) => findElementsByType(child, type, acc));
        return acc;
    }
    if (React.isValidElement(node)) {
        if (node.type === type) acc.push(node);
        findElementsByType((node as ElementWithChildren).props.children, type, acc);
    }
    return acc;
};

describe('FinishWorkoutSheet', () => {
    it('renders action buttons in BottomSheetModal actions footer', () => {
        const element = FinishWorkoutSheet({
            visible: true,
            onClose: jest.fn(),
            onFinish: jest.fn(),
            completedSets: 4,
            totalSets: 4,
            durationMinutes: 42,
            workoutNote: '',
            onWorkoutNoteChange: jest.fn(),
        });

        const modal = findElementsByType(element, BottomSheetModal)[0] as React.ReactElement<{
            actions?: React.ReactNode;
        }>;

        expect(modal.props.actions).toBeTruthy();

        const actionButtons = findElementsByType(modal.props.actions, Button) as Array<React.ReactElement<{ title: string }>>;
        expect(actionButtons.map((button) => button.props.title)).toEqual(['Keep Training', 'Finish']);
    });
});