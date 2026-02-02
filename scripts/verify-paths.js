#!/usr/bin/env node
/**
 * Verifies that all paths in scripts/paths.js exist (for PWA/landing/creator roots)
 * and that build outputs are where we expect. Run from repo root.
 */
const path = require('path');
const fs = require('fs');
const { root, dirPwaRoot, dirPwaWeb, dirPwaPublic, dirLandingOutput, dirCreatorOutput } = require('./paths.js');

let ok = true;

function check(name, dir, required) {
  const exists = fs.existsSync(dir);
  const rel = path.relative(process.cwd(), dir);
  console.log(exists ? '  OK' : (required ? '  MISSING' : '  (optional)'), rel);
  if (required && !exists) ok = false;
}

console.log('Repo root:', root);
console.log('');
console.log('PWA (apps/pwa):');
check('PWA root', dirPwaRoot, true);
check('PWA web/', dirPwaWeb, true);
check('PWA public/', dirPwaPublic, true);
check('PWA dist/ (build output)', path.join(dirPwaRoot, 'dist'), false);
console.log('');
console.log('Landing:');
check('Landing dist/', dirLandingOutput, false);
console.log('');
console.log('Creator:');
check('Creator build/', dirCreatorOutput, false);
console.log('');

if (!ok) {
  console.error('Some required paths are missing.');
  process.exit(1);
}
console.log('Path verification passed.');
