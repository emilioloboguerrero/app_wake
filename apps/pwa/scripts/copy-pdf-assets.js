#!/usr/bin/env node
/**
 * Copies the pdf.js legacy UMD library + worker from node_modules into public/
 * so they ship as same-origin static assets at /app/pdf.min.js and
 * /app/pdf.worker.min.js. ResourcesScreen loads them on demand to render PDFs
 * in-app (canvas), the only reliable way to view a PDF inside the app on mobile
 * WebKit/Chrome — an <iframe>/<object> renders blank or downloads instead.
 *
 * Lib + worker are copied together from the same installed pdfjs-dist version,
 * so their API versions always match (pdf.js throws on a mismatch otherwise).
 * Both files are gitignored — this script is the source of truth, run via
 * postinstall and again at the start of build:pwa.
 */
const fs = require('fs');
const path = require('path');

const buildDir = path.resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const publicDir = path.resolve(__dirname, '..', 'public');
const files = ['pdf.min.js', 'pdf.worker.min.js'];

if (!fs.existsSync(path.join(buildDir, files[0]))) {
  console.warn('copy-pdf-assets.js: pdfjs-dist not installed at', buildDir, '— skipping.');
  process.exit(0);
}

for (const name of files) {
  fs.copyFileSync(path.join(buildDir, name), path.join(publicDir, name));
}
console.log('copy-pdf-assets.js: Copied pdf.js lib + worker into public/');
