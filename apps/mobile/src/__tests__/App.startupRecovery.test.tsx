jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useEffect: jest.fn(),
        useState: jest.fn(),
        useCallback: (fn: unknown) => fn,
    };
});

jest.mock('react-native', () => {
    const React = require('react');
    return {
        ActivityIndicator: (props: unknown) => React.createElement('ActivityIndicator', props),
        StyleSheet: { create: (styles: unknown) => styles },
        View: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('View', props, children),
    };
});

jest.mock('react-native-safe-area-context', () => {
    const React = require('react');
    return {
        SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
            React.createElement('SafeAreaProvider', null, children),
    };
});

jest.mock('react-native-gesture-handler', () => {
    const React = require('react');
    return {
        GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) =>
            React.createElement('GestureHandlerRootView', null, children),
    };
});

jest.mock('../navigation/RootNavigator', () => ({
    RootNavigator: () => 'RootNavigator',
}));

jest.mock('../theme/theme', () => {
    const React = require('react');
    return {
        ThemeProvider: ({ children }: { children?: React.ReactNode }) =>
            React.createElement('ThemeProvider', null, children),
        useAppTheme: () => ({
            colors: {
                primary: '#000',
                primaryBorder: '#000',
                secondary: '#000',
                border: '#000',
                danger: '#000',
                text: '#fff',
                onSecondary: '#fff',
                primaryTextOnColor: '#fff',
            },
        }),
    };
});

jest.mock('../theme/tokens', () => ({
    tokens: {
        spacing: { sm: 8, lg: 16, xl: 24 },
        radius: { md: 8 },
    },
}));

jest.mock('../db/migrate', () => ({ runMigrations: jest.fn() }));
jest.mock('../db/curatedExerciseSeed', () => ({ seedCuratedExercises: jest.fn() }));
jest.mock('../db/outboxRepo', () => ({ repairStaleInFlightOps: jest.fn() }));
jest.mock('../utils/restTimerNotifications', () => ({
    ensureRestTimerNotificationChannel: jest.fn(),
}));
jest.mock('../db/db', () => ({ resetLocalDatabase: jest.fn() }));
jest.mock('../auth/resetSensitiveStorage', () => ({ clearSensitiveAuthStorage: jest.fn(() => Promise.resolve()) }));

jest.mock('../ui/Text', () => {
    const React = require('react');
    return {
        Text: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Text', props, children),
    };
});

jest.mock('../ui/Button', () => {
    const React = require('react');
    return {
        Button: ({ title, ...props }: { title: string }) =>
            React.createElement('Button', { title, ...props }),
    };
});

import React from 'react';

import App from '../../App';
import { seedCuratedExercises } from '../db/curatedExerciseSeed';
import { resetLocalDatabase } from '../db/db';
import { runMigrations } from '../db/migrate';
import { repairStaleInFlightOps } from '../db/outboxRepo';
import { ensureRestTimerNotificationChannel } from '../utils/restTimerNotifications';
import { clearSensitiveAuthStorage } from '../auth/resetSensitiveStorage';

const useEffectMock = React.useEffect as jest.Mock;
const useStateMock = React.useState as jest.Mock;

function findElements(
    node: React.ReactNode,
    predicate: (element: React.ReactElement<any>) => boolean,
    acc: Array<React.ReactElement<any>> = [],
): Array<React.ReactElement<any>> {
    if (!node) return acc;
    if (Array.isArray(node)) {
        node.forEach((child) => findElements(child, predicate, acc));
        return acc;
    }
    if (React.isValidElement(node)) {
        const element = node as React.ReactElement<any>;
        if (predicate(element)) acc.push(element);
        if (typeof element.type === 'function') {
            return findElements((element.type as (props: any) => React.ReactNode)(element.props), predicate, acc);
        }
        return findElements(element.props?.children, predicate, acc);
    }
    return acc;
}

describe('App startup recovery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useEffectMock.mockImplementation((cb: () => void) => cb());
        useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
    });

    it('starts normally when initialization succeeds', () => {
        App();

        expect(runMigrations).toHaveBeenCalledTimes(1);
        expect(seedCuratedExercises).toHaveBeenCalledTimes(1);
        expect(repairStaleInFlightOps).toHaveBeenCalledWith(120);
        expect(ensureRestTimerNotificationChannel).toHaveBeenCalledWith(false);
    });

    it('renders recovery UI when startup failed', () => {
        useEffectMock.mockImplementation(() => undefined);
        useStateMock.mockReturnValue([{ kind: 'failed', error: new Error('migration failed') }, jest.fn()]);

        const element = App();

        const buttons = findElements(element, (el) => typeof el.props.title === 'string');
        const titles = Array.from(new Set(buttons.map((button) => button.props.title)));
        expect(titles).toEqual(['Try again', 'Reset local data']);

        const textNodes = findElements(element, (el) => el.type === 'Text');
        const textContent = textNodes
            .map((node) => node.props.children)
            .flat()
            .join(' ');
        expect(textContent).toContain("Couldn't open app data");
    });

    it('retry action reruns initialization without reset', () => {
        useEffectMock.mockImplementation(() => undefined);
        useStateMock.mockReturnValue([{ kind: 'failed', error: new Error('boom') }, jest.fn()]);

        const element = App();
        const buttons = findElements(
            element,
            (el) => typeof el.props.title === 'string' && typeof el.props.onPress === 'function',
        );

        const retryButton = buttons.find((button) => button.props.title === 'Try again');
        expect(retryButton).toBeDefined();
        retryButton!.props.onPress();

        expect(runMigrations).toHaveBeenCalledTimes(1);
        expect(resetLocalDatabase).not.toHaveBeenCalled();
    });

    it('reset action performs explicit reset then retries startup', async () => {
        useEffectMock.mockImplementation(() => undefined);
        useStateMock.mockReturnValue([{ kind: 'failed', error: new Error('boom') }, jest.fn()]);

        const element = App();
        const buttons = findElements(
            element,
            (el) => typeof el.props.title === 'string' && typeof el.props.onPress === 'function',
        );

        const resetButton = buttons.find((button) => button.props.title === 'Reset local data');
        expect(resetButton).toBeDefined();
        await resetButton!.props.onPress();

        expect(clearSensitiveAuthStorage).toHaveBeenCalledTimes(1);
        expect(runMigrations).toHaveBeenCalledTimes(1);
    });
});