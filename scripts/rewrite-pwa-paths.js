#!/usr/bin/env node
/**
 * Rewrites PWA build output (dist/) so asset and script paths use the base path when set.
 * When basePathPwa is '' (PWA at root), paths stay as /_expo/, /sw.js, etc.
 * Run after inject-expo-script.js (build:pwa).
 */
const fs = require('fs');
const path = require('path');
const { dirPwaOutput, basePathPwa } = require('./paths.js');

const indexPath = path.join(dirPwaOutput, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('rewrite-pwa-paths.js: dist/index.html not found. Run build:pwa (expo export + inject) first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// Rewrite script and link URLs from root to /app so they load when deployed under /app
html = html.replace(/\s(src|href)="\/(_expo\/[^"]*)"/g, ` $1="${basePathPwa}/$2"`);
// Service worker and manifest (PWA is served from /app)
html = html.replace(/(["'])\/sw\.js\1/g, `$1${basePathPwa}/sw.js$1`);
html = html.replace(/(["'])\/manifest\.json\1/g, `$1${basePathPwa}/manifest.json$1`);
// Inline script that registers /sw.js
html = html.replace(/fetch\s*\(\s*['"]\/sw\.js['"]/g, `fetch('${basePathPwa}/sw.js'`);
html = html.replace(/navigator\.serviceWorker\.register\s*\(\s*['"]\/sw\.js['"]/g, `navigator.serviceWorker.register('${basePathPwa}/sw.js'`);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('rewrite-pwa-paths.js: Rewrote dist/index.html for base path', basePathPwa);
