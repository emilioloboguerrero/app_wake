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

const base = basePathPwa || '';

// Login path placeholder (used in web/index.html inline script)
html = html.replace(/__LOGIN_PATH__/g, base + '/login');

// Rewrite script and link URLs from root to base path so they load when deployed under /app
html = html.replace(/\s(src|href)="\/(_expo\/[^"]*)"/g, ` $1="${basePathPwa}/$2"`);
// Service worker and manifest
html = html.replace(/(["'])\/sw\.js\1/g, `$1${basePathPwa}/sw.js$1`);
html = html.replace(/(["'])\/manifest\.json\1/g, `$1${basePathPwa}/manifest.json$1`);
// Inline script that registers /sw.js
html = html.replace(/fetch\s*\(\s*['"]\/sw\.js['"]/g, `fetch('${basePathPwa}/sw.js'`);
html = html.replace(/navigator\.serviceWorker\.register\s*\(\s*['"]\/sw\.js['"]/g, `navigator.serviceWorker.register('${basePathPwa}/sw.js'`);
// Icon and loading assets (base is '' or '/app')
html = html.replace(/\s(href|src)="\/(app_icon\.png)"/g, ` $1="${base}/$2"`);
html = html.replace(/\ssrc="\/(assets\/[^"]*)"/g, ` src="${base}/$1"`);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('rewrite-pwa-paths.js: Rewrote dist/index.html for base path', basePathPwa);

// Rewrite asset URLs inside JS bundles (require() resolves to /_expo/... at root; under /app they must be /app/_expo/...)
if (basePathPwa) {
  const prefix = basePathPwa.endsWith('/') ? basePathPwa.slice(0, -1) : basePathPwa;
  let jsCount = 0;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) {
        let content = fs.readFileSync(full, 'utf8');
        // Metro embeds asset URLs as "/_expo/..." or "/assets/..."; prefix with base path when under /app
        let next = content.replace(/(["'])\/_expo\//g, `$1${prefix}/_expo/`);
        next = next.replace(/(["'])\/assets\//g, `$1${prefix}/assets/`);
        if (next !== content) {
          fs.writeFileSync(full, next, 'utf8');
          jsCount++;
        }
      }
    }
  }
  walk(dirPwaOutput);
  if (jsCount > 0) console.log('rewrite-pwa-paths.js: Rewrote', jsCount, 'JS file(s) for asset base path');
}
