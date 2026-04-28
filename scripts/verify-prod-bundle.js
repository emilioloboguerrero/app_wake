#!/usr/bin/env node
/**
 * Pre-deploy guard for production hosting.
 *
 * Scans the assembled hosting/ directory for any sign that a staging
 * Firebase build was accidentally placed there. If found, exits non-zero
 * and aborts the firebase deploy.
 *
 * History: on 2026-04-27 a `build:pwa:staging` build wrote to apps/pwa/dist/,
 * was assembled into hosting/, and shipped to production wolf-20b8b. PWA
 * users got staging-issued ID tokens that production API rejected → infinite
 * onboarding loops, "wrong password" errors, broken social login. This
 * script makes that mistake un-shippable.
 *
 * Detection: any occurrence of the wake-staging Firebase API key or the
 * staging messagingSenderId in the bundle. Both are unique to wake-staging
 * and have no business being in a production bundle.
 */
const fs = require('fs');
const path = require('path');

const HOSTING_DIR = path.resolve(__dirname, '..', 'hosting');

// Identifiers that uniquely belong to wake-staging Firebase project.
// If any of these strings appear in production hosting bundles, the build
// was poisoned. The legitimate `wake-staging` substring (used in telemetry
// hostname routing) is intentionally NOT on this list — only Firebase
// config-level identifiers.
const STAGING_FORBIDDEN_TOKENS = [
  'AIzaSyBTyB0RC_wJcyaoekcpHsQ8febGKdIXm1c', // staging Web API key
  '950952211622',                            // staging messagingSenderId
  'wake-staging.firebaseapp.com',            // staging authDomain
  'wake-staging.firebasestorage.app',        // staging storageBucket
];

// Required production marker — if missing, the bundle isn't a real prod
// build (could mean Expo silently produced an empty output, etc).
const PROD_REQUIRED_TOKEN = 'AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g'; // production Web API key

const SCAN_EXTENSIONS = new Set(['.js', '.html', '.css', '.json']);
const IGNORE_FILE_SUBSTRINGS = ['.map']; // sourcemaps may legitimately reference staging

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(name)) && !IGNORE_FILE_SUBSTRINGS.some(s => name.includes(s))) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(HOSTING_DIR)) {
    console.error(`[verify-prod-bundle] hosting/ does not exist at ${HOSTING_DIR}`);
    console.error('[verify-prod-bundle] Run `npm run assemble-hosting` first.');
    process.exit(1);
  }

  const files = walk(HOSTING_DIR);
  if (files.length === 0) {
    console.error('[verify-prod-bundle] hosting/ is empty — nothing to deploy.');
    process.exit(1);
  }

  const violations = [];
  let prodMarkerSeen = false;

  for (const file of files) {
    const rel = path.relative(HOSTING_DIR, file);
    const content = fs.readFileSync(file, 'utf8');

    if (content.includes(PROD_REQUIRED_TOKEN)) prodMarkerSeen = true;

    for (const token of STAGING_FORBIDDEN_TOKENS) {
      if (content.includes(token)) {
        violations.push({ file: rel, token });
      }
    }
  }

  if (violations.length > 0) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('  ABORTING DEPLOY: staging Firebase config detected in bundle');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('');
    console.error('hosting/ contains identifiers that belong to wake-staging.');
    console.error('Shipping this would issue staging tokens that production rejects.');
    console.error('');
    console.error('Violations:');
    for (const v of violations.slice(0, 20)) {
      console.error(`  ${v.file}: contains ${v.token}`);
    }
    if (violations.length > 20) {
      console.error(`  ...and ${violations.length - 20} more`);
    }
    console.error('');
    console.error('Fix:');
    console.error('  rm -rf apps/pwa/dist hosting/app');
    console.error('  npm run build:pwa');
    console.error('  npm run assemble-hosting');
    console.error('');
    process.exit(1);
  }

  if (!prodMarkerSeen) {
    console.error('[verify-prod-bundle] Production API key not found in hosting/.');
    console.error('[verify-prod-bundle] PWA bundle may be missing or built for a different project.');
    process.exit(1);
  }

  console.log(`[verify-prod-bundle] OK — scanned ${files.length} files, no staging identifiers, prod marker present.`);
}

main();
