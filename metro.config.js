// MINIMAL METRO CONFIG
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable web platform
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Configure source extensions to prioritize .js over .web.js for explicit imports
// This prevents require cycles when .web.js files import from base .js files
// Metro will automatically resolve .web.js and .web.jsx files on web platform
config.resolver.sourceExts = [
  ...config.resolver.sourceExts.filter(ext => ext !== 'js' && ext !== 'web.js' && ext !== 'jsx' && ext !== 'web.jsx'),
  'js',      // Prioritize .js for explicit imports
  'web.js',  // Then .web.js for platform-specific
  'jsx',     // Then .jsx
  'web.jsx', // Then .web.jsx for platform-specific JSX
  'json',
];

module.exports = config;
