module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.native.test.@(js|jsx)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-safe-area-context))',
  ],
};
