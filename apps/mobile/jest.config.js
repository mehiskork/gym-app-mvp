module.exports = {
    testEnvironment: 'node',
    transform: {
        '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
    },
    transformIgnorePatterns: [
        'node_modules/(?!(expo|@expo|react-native|react-native-.*|expo-.*)/)',
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};