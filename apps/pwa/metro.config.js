// MINIMAL METRO CONFIG
const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const defaultResolve = require('metro-resolver').resolve;

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

// Single source of truth for layout viewport on web: use our Dimensions so useWindowDimensions() returns canonical size.
// On web, prefer WakeLoader.web.jsx (shimmer) over WakeLoader.js (pulse). Resolve proactively so we don't depend on defaultResolve return shape.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    context.originModulePath &&
    context.originModulePath.includes('useWindowDimensions') &&
    moduleName === '../Dimensions'
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'src/utils/layoutViewportDimensions.web.js'),
    };
  }
  if (platform === 'web' && (moduleName === 'WakeLoader' || moduleName.endsWith('/WakeLoader') || moduleName.endsWith('\\WakeLoader'))) {
    const originDir = context.originModulePath ? path.dirname(context.originModulePath) : path.join(__dirname, 'src');
    const resolvedDir = path.resolve(originDir, path.dirname(moduleName));
    const webPath = path.join(resolvedDir, 'WakeLoader.web.jsx');
    if (fs.existsSync(webPath)) {
      return { type: 'sourceFile', filePath: webPath };
    }
  }
  return defaultResolve(
    { ...context, resolveRequest: defaultResolve },
    moduleName,
    platform
  );
};

module.exports = config;
