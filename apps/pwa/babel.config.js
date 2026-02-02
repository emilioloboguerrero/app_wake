// MINIMAL BABEL CONFIG - Simplified to avoid caching errors
module.exports = function(api) {
  api.cache(true);
  
  // For web builds, exclude Reanimated plugin (causes freezes)
  // Use environment variable check as primary method
  const isWeb = process.env.EXPO_PUBLIC_PLATFORM === 'web' || 
                process.env.BABEL_ENV === 'web';
  
  const plugins = [];
  
  // Only add Reanimated for native platforms
  // CRITICAL: Exclude for web to prevent freezes
  if (!isWeb) {
    plugins.push('react-native-reanimated/plugin');
  }
  
  return {
    presets: ['babel-preset-expo'],
    plugins: plugins,
  };
};
