module.exports = function(api) {
  api.cache(true);
  return {
    // Keep Expo defaults minimal; Reanimated plugin stays because library is used.
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
