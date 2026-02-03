global.__DEV__ = true;

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: jest.fn(),
    useNavigation: () => ({
        navigate: jest.fn(),
        setOptions: jest.fn(),
        goBack: jest.fn(),
    }),
    NavigationContainer: ({ children }) => children,
}));