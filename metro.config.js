const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable fast refresh for better hot reloading
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Optimize for faster reloads
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

module.exports = config;