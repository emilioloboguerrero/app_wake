// MINIMAL METRO CONFIG
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable web platform
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Configure source extensions to prioritize .js over .web.js for explicit imports
// This prevents require cycles when .web.js files import from base .js files
// Metro will automatically resolve .web.js files on web platform
config.resolver.sourceExts = [
  ...config.resolver.sourceExts.filter(ext => ext !== 'js' && ext !== 'web.js'),
  'js',      // Prioritize .js for explicit imports
  'web.js',  // Then .web.js for platform-specific
  'json',
];

module.exports = config;
