#!/usr/bin/env node
'use strict';

/**
 * Dump Felipe Bejarano's 7 .xlsm client-tracker files to JSON.
 *
 * For each file:
 *   - Lists all sheet names
 *   - For each sheet, emits the full 2D array of cells + merged-cell ranges
 *   - Writes one JSON per file to excel_bejarano/parsed/<file>.json
 *
 * Also prints a compact summary to stdout.
 *
 * Usage:  node scripts/dump-bejarano-excels.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SRC = path.join(__dirname, '..', 'excel_bejarano');
const OUT = path.join(SRC, 'parsed');

const FILES = [
  'Reporte_EntrenoCasa.xlsm',
  'Rutina_3 DIAS FULL BODY.xlsm',
  'Rutina_4 DIAS UL - UL.xlsm',
  'Rutina_5 DIAS PPL - UL.xlsm',
  'Rutina_Abdomen.xlsm',
  'Rutina_GluteOptimization x5 .xlsm',
  'Rutina_PushPullLegs .xlsm',
];

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function dumpFile(filename) {
  const srcPath = path.join(SRC, filename);
  if (!fs.existsSync(srcPath)) {
    console.log(`  ! missing: ${filename}`);
    return null;
  }
  const wb = XLSX.readFile(srcPath, { cellDates: true, cellNF: false, cellText: false });
  const out = { file: filename, sheets: {} };

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const ref = sheet['!ref'] || 'A1:A1';
    const merges = sheet['!merges'] || [];

    // 2D array. defval:'' so empty cells don't collapse rows.
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: true });

    out.sheets[sheetName] = {
      ref,
      rows: grid.length,
      cols: grid.reduce((m, r) => Math.max(m, r.length), 0),
      merges: merges.map((m) => XLSX.utils.encode_range(m)),
      grid,
    };
  }

  const outPath = path.join(OUT, filename.replace(/\.xlsm$/, '.json'));
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  return out;
}

function summarize(dump) {
  if (!dump) return;
  console.log(`\n=== ${dump.file} ===`);
  for (const [sheetName, s] of Object.entries(dump.sheets)) {
    const nonEmptyRows = s.grid.filter((r) => r.some((c) => c !== '' && c !== null && c !== undefined)).length;
    console.log(`  sheet "${sheetName}"  range=${s.ref}  ${s.rows}×${s.cols}  non-empty-rows=${nonEmptyRows}  merges=${s.merges.length}`);
  }
}

(async () => {
  console.log(`Dumping ${FILES.length} files → ${path.relative(process.cwd(), OUT)}/`);
  for (const f of FILES) {
    const dump = dumpFile(f);
    summarize(dump);
  }
  console.log(`\n✓ done. JSON written to excel_bejarano/parsed/*.json`);
})();
