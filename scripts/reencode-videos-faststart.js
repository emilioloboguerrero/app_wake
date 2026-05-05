#!/usr/bin/env node
'use strict';

/**
 * Re-mux Firebase Storage MP4 videos with -movflags +faststart so the moov
 * atom moves to the start of the file, allowing browsers to begin playback
 * before the entire file has downloaded.
 *
 * What this does:
 *   - Lists video objects in the target bucket
 *   - Downloads each to /tmp
 *   - Probes whether moov is already at the start; skips if so (idempotent)
 *   - Runs `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`
 *     This is a pure re-mux (no re-encode), lossless, and fast (~5x realtime
 *     on local disk for typical short demo clips).
 *   - Optionally extracts a poster JPEG at t=1s
 *   - Uploads the new MP4 (overwriting the original) and marks the object
 *     metadata with wakeFaststart=true so future runs skip it.
 *   - Optionally uploads <basename>.jpg next to the video.
 *
 * What this does NOT do:
 *   - Re-encode bitrates, generate adaptive ladders, change resolution.
 *     If you decide later to add a 480p variant, that's a separate script.
 *
 * Safety:
 *   - --dry-run prints what would be processed.
 *   - --project defaults to wake-staging. wolf-20b8b requires --confirm-prod.
 *   - Original file is replaced atomically via Storage object overwrite.
 *     Storage object versioning is NOT enabled by default — if you want a
 *     rollback path, enable it on the bucket before running, or pass
 *     --keep-backup to copy each original to <name>.pre-faststart.mp4 first.
 *   - --limit lets you process N files at a time for staged rollouts.
 *
 * Requirements:
 *   - ffmpeg + ffprobe in PATH
 *   - gcloud auth application-default login (Storage Admin role)
 *
 * Usage:
 *   node scripts/reencode-videos-faststart.js --project wake-staging --dry-run
 *   node scripts/reencode-videos-faststart.js --project wake-staging --limit 5
 *   node scripts/reencode-videos-faststart.js --project wake-staging
 *   node scripts/reencode-videos-faststart.js --project wake-staging --thumbnails
 *   node scripts/reencode-videos-faststart.js --project wolf-20b8b --confirm-prod
 *
 *   Flags:
 *     --project <id>      Firebase project. Default: wake-staging.
 *     --bucket <name>     Override bucket. Default: <project>.firebasestorage.app.
 *     --prefix <path>     Only process objects under this prefix.
 *     --dry-run           Print plan, do nothing.
 *     --limit <n>         Stop after N files processed (skipped don't count).
 *     --thumbnails        Also extract and upload <basename>.jpg posters.
 *     --keep-backup       Copy each original to <name>.pre-faststart.mp4 before overwriting.
 *     --cache-control <v> Cache-Control to set on uploaded objects.
 *                         Default: public, max-age=31536000.
 *     --confirm-prod      Required when --project is wolf-20b8b.
 */

const admin = require('firebase-admin');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000';
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v'];
const FASTSTART_MARKER = 'wakeFaststart';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    confirmProd: false,
    project: 'wake-staging',
    cacheControl: DEFAULT_CACHE_CONTROL,
    thumbnails: false,
    keepBackup: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--confirm-prod') args.confirmProd = true;
    else if (a === '--thumbnails') args.thumbnails = true;
    else if (a === '--keep-backup') args.keepBackup = true;
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
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
  process.exit(0);
}

function isVideoObject(name) {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

// Returns true if moov atom is already before mdat (i.e. already faststart).
async function isAlreadyFaststart(filePath) {
  // ffprobe shows the order of top-level boxes via -show_streams -show_format,
  // but the easiest check is to look at the first 1MB of the file for "moov"
  // appearing before "mdat". This avoids forking ffprobe for every file.
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(Math.min(1024 * 1024, fs.fstatSync(fd).size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    const moovIdx = buf.indexOf('moov');
    const mdatIdx = buf.indexOf('mdat');
    if (moovIdx === -1) return false;
    if (mdatIdx === -1) return true; // moov found, mdat not in first 1MB → moov is at front
    return moovIdx < mdatIdx;
  } finally {
    fs.closeSync(fd);
  }
}

async function ensureFFmpeg() {
  try {
    await run('ffmpeg', ['-version']);
    await run('ffprobe', ['-version']);
  } catch (e) {
    console.error('ffmpeg/ffprobe not found in PATH. Install via `brew install ffmpeg` (macOS) or your platform equivalent.');
    process.exit(1);
  }
}

function tmpPath(suffix) {
  return path.join(os.tmpdir(), `wake-${crypto.randomBytes(6).toString('hex')}${suffix}`);
}

async function processFile(file, args) {
  const name = file.name;
  const meta = file.metadata?.metadata || {};
  if (meta[FASTSTART_MARKER] === 'true') {
    return { status: 'skipped-marker' };
  }

  const localIn = tmpPath(path.extname(name) || '.mp4');
  const localOut = tmpPath('.mp4');
  const localJpg = args.thumbnails ? tmpPath('.jpg') : null;

  try {
    await file.download({ destination: localIn });

    if (await isAlreadyFaststart(localIn)) {
      // Mark and move on — don't re-upload.
      if (!args.dryRun) {
        await file.setMetadata({
          cacheControl: args.cacheControl,
          metadata: { ...meta, [FASTSTART_MARKER]: 'true' },
        });
      }
      return { status: 'skipped-already-faststart' };
    }

    if (args.dryRun) {
      return { status: 'would-process' };
    }

    // Pure re-mux: -c copy means no re-encode, +faststart relocates moov.
    await run('ffmpeg', [
      '-y',
      '-i', localIn,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-loglevel', 'error',
      localOut,
    ]);

    if (args.thumbnails) {
      // Try t=1s first; if the clip is shorter, fall back to t=0.
      try {
        await run('ffmpeg', [
          '-y', '-ss', '1', '-i', localIn,
          '-frames:v', '1', '-q:v', '3',
          '-loglevel', 'error',
          localJpg,
        ]);
      } catch (_) {
        await run('ffmpeg', [
          '-y', '-i', localIn,
          '-frames:v', '1', '-q:v', '3',
          '-loglevel', 'error',
          localJpg,
        ]);
      }
    }

    if (args.keepBackup) {
      const backupName = name.replace(/\.(mp4|mov|m4v)$/i, '.pre-faststart.$1');
      const backupRef = file.bucket.file(backupName);
      const [exists] = await backupRef.exists();
      if (!exists) {
        await file.copy(backupRef);
      }
    }

    await file.bucket.upload(localOut, {
      destination: name,
      resumable: false,
      metadata: {
        contentType: file.metadata?.contentType || 'video/mp4',
        cacheControl: args.cacheControl,
        metadata: { ...meta, [FASTSTART_MARKER]: 'true' },
      },
    });

    if (args.thumbnails && localJpg) {
      const jpgName = name.replace(/\.(mp4|mov|m4v)$/i, '.jpg');
      await file.bucket.upload(localJpg, {
        destination: jpgName,
        resumable: false,
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: args.cacheControl,
        },
      });
    }

    return { status: 'updated' };
  } finally {
    [localIn, localOut, localJpg].filter(Boolean).forEach(p => {
      try { fs.unlinkSync(p); } catch (_) {}
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.project === 'wolf-20b8b' && !args.confirmProd) {
    console.error('Refusing to run against production (wolf-20b8b) without --confirm-prod.');
    process.exit(1);
  }

  await ensureFFmpeg();

  const bucketName = args.bucket || `${args.project}.firebasestorage.app`;
  console.log(`Project:     ${args.project}`);
  console.log(`Bucket:      ${bucketName}`);
  console.log(`Prefix:      ${args.prefix || '(all)'}`);
  console.log(`Mode:        ${args.dryRun ? 'DRY RUN' : 'WRITE'}`);
  console.log(`Thumbnails:  ${args.thumbnails ? 'yes' : 'no'}`);
  console.log(`Backups:     ${args.keepBackup ? 'yes (.pre-faststart.mp4)' : 'no'}`);
  console.log(`Cache-Control: ${args.cacheControl}`);
  console.log('');

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: args.project,
    storageBucket: bucketName,
  });

  const bucket = admin.storage().bucket();

  let pageToken = undefined;
  let scanned = 0, videos = 0, updated = 0, skipped = 0, failed = 0, wouldProcess = 0;
  const startTs = Date.now();

  outer: do {
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

      try {
        const result = await processFile(file, args);
        if (result.status === 'updated') {
          updated++;
          console.log(`  ✓ ${file.name}`);
        } else if (result.status === 'would-process') {
          wouldProcess++;
          console.log(`  would process: ${file.name}`);
        } else {
          skipped++;
        }
      } catch (e) {
        failed++;
        console.error(`  FAIL ${file.name}: ${e.message}`);
      }

      if (args.limit && (updated + wouldProcess) >= args.limit) break outer;
    }
  } while (pageToken);

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log('');
  console.log(`Scanned:       ${scanned}`);
  console.log(`Videos:        ${videos}`);
  console.log(`Updated:       ${updated}`);
  console.log(`Would process: ${wouldProcess} (dry run)`);
  console.log(`Skipped:       ${skipped} (already faststart)`);
  console.log(`Failed:        ${failed}`);
  console.log(`Elapsed:       ${elapsed}s`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
