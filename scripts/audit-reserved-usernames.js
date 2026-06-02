#!/usr/bin/env node
/**
 * Audit existing usernames against the reserved-username denylist.
 *
 * Read-only. Lists any users whose `username` field collides with the denylist
 * introduced for the public creator storefront (wakelab.co/{username}).
 *
 * If this script reports collisions, those users must either be grandfathered
 * (acceptable for low-value names) or renamed (necessary for actual route
 * collisions like 'app', 'creators', 'api') BEFORE the storefront ships.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=<path-to-sa.json> \
 *     node scripts/audit-reserved-usernames.js [--project PROJECT_ID]
 *
 * Defaults to wolf-20b8b (production). Use --project wake-staging for staging.
 */

'use strict';

const admin = require('firebase-admin');

const PROJECT_IDX = process.argv.indexOf('--project');
const PROJECT_ID = PROJECT_IDX !== -1 ? process.argv[PROJECT_IDX + 1] : 'wolf-20b8b';

// Mirror functions/src/api/utils/reservedUsernames.ts. Keep these in sync.
const RESERVED = new Set([
  // Routes & infra
  'app', 'creators', 'creadores', 'api', 'e', 'www', 'mail', 'ftp', 'smtp',
  'admin', 'root', 'system', 'status', 'staging', 'dev', 'test',
  'static', 'assets', 'public', 'cdn', 'cache',
  'developers', 'developer', 'design', 'landing',
  '404', '500', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'manifest.json',
  '.well-known', 'well-known',
  // Auth & account
  'login', 'logout', 'signin', 'signup', 'signout', 'register', 'auth',
  'password', 'reset', 'verify', 'confirm', 'forgot', 'oauth', 'sso',
  'account', 'profile', 'settings', 'dashboard', 'me',
  // Brand & legal
  'wake', 'wakelab', 'lab', 'oficial', 'official', 'support', 'soporte',
  'ayuda', 'contacto', 'contact', 'legal', 'privacidad', 'privacy',
  'terminos', 'terms', 'cookies', 'gdpr', 'dmca',
  'about', 'sobre', 'equipo', 'team', 'careers', 'jobs', 'prensa', 'press',
  // Future routes
  'tienda', 'store', 'shop', 'programas', 'programs', 'eventos', 'events',
  'blog', 'comunidad', 'community', 'entrenadores', 'coaches',
  'precios', 'pricing', 'planes', 'plans', 'descargar', 'download',
  'faq', 'success', 'error', 'checkout',
  'pagar', 'pago', 'comprar', 'comprado', 'gracias', 'cancelar',
  'invite', 'invites', 'ref', 'referral', 'partners',
  'go', 'l', 'link', 'share', 'qr', 'u', 'c',
  // Confusables
  'null', 'undefined', 'true', 'false', 'anonymous', 'anonimo',
  'user', 'usuario', 'guest', 'demo', 'sample', 'default',
]);

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

function normalizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  // Unicode-normalize to NFC then lowercase. The hosting regex and the API
  // both reject non-ASCII usernames, so a value that fails this scrub already
  // can't have been written through the API — but the audit needs to surface
  // legacy / direct-Firestore writes too, so be lenient on input.
  return raw.normalize('NFC').toLowerCase().trim();
}

async function main() {
  console.log(`\nReserved-username collision audit — project: ${PROJECT_ID}`);
  console.log(`Denylist size: ${RESERVED.size}`);
  console.log('');

  const collisions = [];
  let scanned = 0;

  // Stream the users collection so we don't hold the entire doc set in memory.
  // .stream() emits a 'data' event per snapshot — far cheaper than .get() for
  // large collections.
  await new Promise((resolve, reject) => {
    const stream = db
      .collection('users')
      .select('username', 'role', 'email', 'displayName')
      .stream();

    stream.on('error', reject);
    stream.on('end', resolve);
    stream.on('data', (doc) => {
      scanned += 1;
      const data = doc.data();
      const username = normalizeUsername(data.username);
      if (!username) return;
      if (RESERVED.has(username)) {
        collisions.push({
          userId: doc.id,
          username,
          role: data.role || 'user',
          email: data.email || null,
          displayName: data.displayName || null,
        });
      }
      if (scanned % 5000 === 0) {
        // Progress signal for very large collections.
        console.log(`  …scanned ${scanned} so far, ${collisions.length} collisions`);
      }
    });
  });

  console.log(`Scanned ${scanned} user docs.`);
  console.log(`Collisions found: ${collisions.length}\n`);

  if (collisions.length === 0) {
    console.log('No collisions. Safe to enforce the denylist.');
    return;
  }

  console.log('Username                role     userId                          displayName / email');
  console.log('----------------------- -------- ------------------------------- ------------------------');
  for (const c of collisions) {
    const u = c.username.padEnd(23);
    const r = c.role.padEnd(8);
    const id = c.userId.padEnd(31);
    const label = c.displayName || c.email || '(no name)';
    console.log(`${u} ${r} ${id} ${label}`);
  }

  console.log('\nResolve each collision before enforcing:');
  console.log('  - Low-value names: grandfather (no action)');
  console.log('  - Route-conflict names (app, creators, api, e, etc.): rename the user');
  console.log('\nThe denylist is already enforced on writes; existing names are not blocked.');
  console.log('Only NEW writes hitting these names will fail going forward.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
