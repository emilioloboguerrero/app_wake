#!/usr/bin/env node
'use strict';

/**
 * Backfill Cache-Control headers on Firebase Storage video objects.
 *
 * Why: Firebase Storage uploads default to no Cache-Control, so the
 *      Google CDN edge revalidates with origin on most requests. Setting a
 *      long max-age on demo exercise clips lets repeat plays come straight
 *      from the user's browser cache and from CDN edge cache.
 *
 * Safety:
 *   - Metadata-only change. Reversible by running again with a different
 *     --cache-control string (or omit to use the default).
 *   - Runs against the bucket of whichever project the script is invoked
 *     with via --project (default: wake-staging). Always dry-run on
 *     staging first; production (wolf-20b8b) requires --confirm-prod.
 *   - Skips objects that already have a matching cacheControl header
 *     (idempotent; safe to re-run).
 *
 * Usage:
 *   node scripts/backfill-video-cache-headers.js --project wake-staging --dry-run
 *   node scripts/backfill-video-cache-headers.js --project wake-staging
 *   node scripts/backfill-video-cache-headers.js --project wolf-20b8b --confirm-prod
 *
 *   Flags:
 *     --project <id>           Firebase project ID. Default: wake-staging.
 *     --bucket <name>          Override bucket. Default: <project>.firebasestorage.app.
 *     --prefix <path>          Only process objects under this prefix (e.g. exercise-videos/).
 *     --cache-control <value>  Header value. Default: public, max-age=31536000.
 *     --dry-run                Print what would change, do nothing.
 *     --limit <n>              Stop after N objects (good for testing).
 *     --confirm-prod           Required when --project is wolf-20b8b.
 *
 * Auth:
 *   Uses application default credentials. Run `gcloud auth application-default
 *   login` once with an account that has Storage Admin on the target project.
 */

const admin = require('firebase-admin');

const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000';
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v'];

function parseArgs(argv) {
  const args = { dryRun: false, confirmProd: false, project: 'wake-staging', cacheControl: DEFAULT_CACHE_CONTROL };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--confirm-prod') args.confirmProd = true;
    else if (a === '--project') args.project = argv[++i];
    else if (a === '--bucket') args.bucket = argv[++i];
    else if (a === '--prefix') args.prefix = argv[++i];
    else if (a === '--cache-control') args.cacheControl = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') { printHelpAndExit(); }
    else { console.error(`Unknown arg: ${a}`); process.exit(1); }
  }
  return args;
}

function printHelpAndExit() {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
  process.exit(0);
}

function isVideoObject(name) {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.project === 'wolf-20b8b' && !args.confirmProd) {
    console.error('Refusing to run against production (wolf-20b8b) without --confirm-prod.');
    process.exit(1);
  }

  const bucketName = args.bucket || `${args.project}.firebasestorage.app`;
  console.log(`Project: ${args.project}`);
  console.log(`Bucket:  ${bucketName}`);
  console.log(`Prefix:  ${args.prefix || '(all)'}`);
  console.log(`Header:  Cache-Control: ${args.cacheControl}`);
  console.log(`Mode:    ${args.dryRun ? 'DRY RUN' : 'WRITE'}`);
  console.log('');

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: args.project,
    storageBucket: bucketName,
  });

  const bucket = admin.storage().bucket();

  let pageToken = undefined;
  let scanned = 0;
  let videos = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  do {
    const [files, , apiResp] = await bucket.getFiles({
      prefix: args.prefix,
      maxResults: 1000,
      pageToken,
      autoPaginate: false,
    });
    pageToken = apiResp?.nextPageToken;

    for (const file of files) {
      scanned++;
      if (!isVideoObject(file.name)) continue;
      videos++;

      const current = file.metadata?.cacheControl || '';
      if (current === args.cacheControl) {
        skipped++;
        continue;
      }

      if (args.dryRun) {
        console.log(`would update: ${file.name}  (was: "${current}")`);
        updated++;
      } else {
        try {
          await file.setMetadata({ cacheControl: args.cacheControl });
          updated++;
          if (updated % 25 === 0) console.log(`  updated ${updated} so far…`);
        } catch (e) {
          failed++;
          console.error(`  FAIL ${file.name}: ${e.message}`);
        }
      }

      if (args.limit && (updated + skipped) >= args.limit) {
        pageToken = undefined;
        break;
      }
    }
  } while (pageToken);

  console.log('');
  console.log(`Scanned: ${scanned}`);
  console.log(`Videos:  ${videos}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped} (already correct)`);
  console.log(`Failed:  ${failed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
