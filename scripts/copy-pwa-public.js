#!/usr/bin/env node
/**
 * Copies apps/pwa/public/ into apps/pwa/dist/ so PWA build has sw.js, manifest.json, and assets.
 * Run after rewrite-pwa-paths.js when building for combined hosting (build:pwa).
 */
const fs = require('fs');
const path = require('path');
const { dirPwaPublic, dirPwaOutput } = require('./paths.js');

if (!fs.existsSync(dirPwaPublic)) {
  console.warn('copy-pwa-public.js: PWA public/ not found at', dirPwaPublic, ', skipping.');
  process.exit(0);
}
if (!fs.existsSync(dirPwaOutput)) {
  console.error('copy-pwa-public.js: PWA dist/ not found. Run build:pwa (expo export + inject + rewrite) first.');
  process.exit(1);
}

function copyDirContents(srcDir, destDir) {
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, dest, { recursive: true });
    else fs.copyFileSync(src, dest);
  }
}

copyDirContents(dirPwaPublic, dirPwaOutput);

const manifestPath = path.join(dirPwaOutput, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const { basePathPwa } = require('./paths.js');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.start_url = basePathPwa + '/';
  manifest.scope = basePathPwa + '/';
  if (basePathPwa && manifest.icons && Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map((icon) => ({
      ...icon,
      src: basePathPwa + (icon.src.startsWith('/') ? icon.src : '/' + icon.src),
    }));
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('copy-pwa-public.js: Updated manifest.json start_url/scope/icons for', basePathPwa);
}
console.log('copy-pwa-public.js: Copied PWA public/ → dist/');
