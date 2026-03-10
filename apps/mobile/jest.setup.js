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
jest.mock('expo-sqlite', () => {
    const createResult = () => {
        const rows = [];
        rows[Symbol.iterator] = function* iterator() {
            for (const row of []) yield row;
        };
        return rows;
    };

    return {
        openDatabaseSync: jest.fn(() => ({
            execSync: jest.fn(),
            prepareSync: jest.fn(() => ({
                executeSync: jest.fn(() => createResult()),
                finalizeSync: jest.fn(),
            })),
        })),
    };
});


jest.mock('uuid', () => ({
    v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));