#!/usr/bin/env node
/**
 * Post-build script: after `expo export --platform web` (from apps/pwa), replace
 * apps/pwa/dist/index.html with our custom PWA template (apps/pwa/web/index.html)
 * while injecting the Expo bundle script tags. Paths from scripts/paths.js.
 */

const fs = require('fs');
const path = require('path');
const { dirPwaOutput, dirPwaWeb } = require('./paths.js');

const distIndexPath = path.join(dirPwaOutput, 'index.html');
const webTemplatePath = path.join(dirPwaWeb, 'index.html');

const PLACEHOLDER = '  <!-- EXPO_BUNDLE_SCRIPT: replaced by build script with actual bundle script tag -->';
const EXPO_SCRIPT_REGEX = /<script\s+src="\/_expo\/[^"]+"[^>]*><\/script>/g;

if (!fs.existsSync(distIndexPath)) {
  console.error('scripts/inject-expo-script.js: PWA dist/index.html not found. Run "npm run build:pwa" or "npm run build:web" first.');
  process.exit(1);
}
if (!fs.existsSync(webTemplatePath)) {
  console.error('scripts/inject-expo-script.js: PWA web/index.html not found at', webTemplatePath);
  process.exit(1);
}

const expoIndex = fs.readFileSync(distIndexPath, 'utf8');
const scriptTags = expoIndex.match(EXPO_SCRIPT_REGEX);
if (!scriptTags || scriptTags.length === 0) {
  console.error('scripts/inject-expo-script.js: could not find Expo bundle script(s) in dist/index.html');
  process.exit(1);
}

const scriptTagsBlock = scriptTags.map(tag => '  ' + tag).join('\n');

let customIndex = fs.readFileSync(webTemplatePath, 'utf8');
if (!customIndex.includes('EXPO_BUNDLE_SCRIPT')) {
  console.error('scripts/inject-expo-script.js: web/index.html must contain EXPO_BUNDLE_SCRIPT placeholder');
  process.exit(1);
}
customIndex = customIndex.replace(PLACEHOLDER, scriptTagsBlock);

fs.writeFileSync(distIndexPath, customIndex, 'utf8');
console.log('Injected', scriptTags.length, 'Expo bundle script(s) into', path.relative(process.cwd(), distIndexPath));
