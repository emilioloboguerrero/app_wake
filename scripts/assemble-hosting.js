#!/usr/bin/env node
/**
 * Assembles the hosting directory from build outputs:
 *   apps/landing/dist  → hosting/ (root; landing at / and /landing)
 *   apps/pwa/dist      → hosting/app/
 *   apps/creator-dashboard/build → hosting/creators/
 * Copies only directories that exist. Run after build:landing, build:pwa, and/or build:creator.
 * Full deploy: npm run build:all (builds all three then runs this).
 */
const fs = require('fs');
const path = require('path');
const {
  dirLandingOutput,
  dirPwaOutput,
  dirPwaPublic,
  dirCreatorOutput,
  dirHosting,
  dirHostingApp,
  dirHostingCreators,
} = require('./paths.js');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

function copyDirContents(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return false;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, dest, { recursive: true });
    else fs.copyFileSync(src, dest);
  }
  return true;
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

// Clear hosting root so we don't keep stale app/ or creators/ when only landing is built
rmDir(dirHosting);
fs.mkdirSync(dirHosting, { recursive: true });

let copied = 0;
if (copyDirContents(dirLandingOutput, dirHosting)) {
  console.log('assemble-hosting: copied landing → hosting/ (root)');
  copied++;
}
// Favicon at root so landing and creators (which use href="/app_icon.png") can load it
const appIconSrc = path.join(dirPwaPublic, 'app_icon.png');
if (fs.existsSync(appIconSrc)) {
  fs.copyFileSync(appIconSrc, path.join(dirHosting, 'app_icon.png'));
  console.log('assemble-hosting: copied app_icon.png to hosting root');
}
if (copyDirContents(dirPwaOutput, dirHostingApp)) {
  console.log('assemble-hosting: copied PWA dist → hosting/app/');
  copied++;
}
if (copyDir(dirCreatorOutput, dirHostingCreators)) {
  console.log('assemble-hosting: copied creator build → hosting/creators/');
  copied++;
}

if (copied === 0) {
  console.warn('assemble-hosting: No build output found. Run build:landing, build:pwa, and/or build:creator first.');
  process.exit(1);
}
console.log('assemble-hosting: done. Deploy with: firebase deploy --only hosting');
