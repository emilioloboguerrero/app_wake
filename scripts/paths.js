/**
 * Single source of truth for build and hosting paths.
 * Used by assemble-hosting.js, inject-expo-script.js, rewrite-pwa-paths.js, copy-pwa-public.js.
 */
const path = require('path');

const root = path.resolve(__dirname, '..');

// PWA lives in apps/pwa; build output is apps/pwa/dist
const dirPwaRoot = path.join(root, 'apps', 'pwa');

module.exports = {
  root,

  // PWA (apps/pwa)
  dirPwaRoot,
  dirPwaOutput: path.join(dirPwaRoot, 'dist'),
  dirPwaWeb: path.join(dirPwaRoot, 'web'),
  dirPwaPublic: path.join(dirPwaRoot, 'public'),

  // Build output directories (each app's build writes here)
  dirLandingOutput: path.join(root, 'apps', 'landing', 'dist'),
  dirCreatorOutput: path.join(root, 'apps', 'creator-dashboard', 'build'),

  // Assembled hosting directory (firebase.json "public" points here)
  dirHosting: path.join(root, 'hosting'),
  dirHostingApp: path.join(root, 'hosting', 'app'),
  dirHostingLanding: path.join(root, 'hosting', 'landing'),
  dirHostingCreators: path.join(root, 'hosting', 'creators'),

  // Base paths for deployed apps (PWA at /app; landing at / and /landing; creators at /creators)
  basePathPwa: '/app',
  basePathCreators: '/creators',
};
