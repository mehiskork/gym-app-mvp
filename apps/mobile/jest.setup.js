global.__DEV__ = true;

const React = require('react');

jest.spyOn(React, 'useState');


jest.mock('@react-navigation/native', () => ({
    useFocusEffect: jest.fn(),
    useNavigation: () => ({
        navigate: jest.fn(),
        setOptions: jest.fn(),
        goBack: jest.fn(),
    }),
    NavigationContainer: ({ children }) => children,
}));

jest.mock(
    'expo-notifications',
    () => ({
        AndroidImportance: { DEFAULT: 'default' },
        setNotificationChannelAsync: jest.fn(),
        getPermissionsAsync: jest.fn(),
        requestPermissionsAsync: jest.fn(),
        scheduleNotificationAsync: jest.fn(),
        cancelScheduledNotificationAsync: jest.fn(),
    }),
    { virtual: true },
);