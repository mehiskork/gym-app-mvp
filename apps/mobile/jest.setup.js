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