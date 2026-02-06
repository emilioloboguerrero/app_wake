#!/usr/bin/env node
/**
 * Merges public/data/cities/*.json into assets/data/cities.json so cities
 * are bundled with the app and load without fetch (avoids hosting/rewrite issues).
 * Run before export:web (e.g. in build:pwa).
 */
const fs = require('fs');
const path = require('path');

const pwaRoot = path.join(__dirname, '..');
const citiesDir = path.join(pwaRoot, 'public', 'data', 'cities');
const outPath = path.join(pwaRoot, 'assets', 'data', 'cities.json');

if (!fs.existsSync(citiesDir)) {
  console.warn('bundle-cities: public/data/cities not found, skipping');
  process.exit(0);
}

const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const names = fs.readdirSync(citiesDir).filter((n) => n.endsWith('.json'));
const bundle = {};

for (const name of names) {
  const iso2 = name.slice(0, -5);
  const filePath = path.join(citiesDir, name);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(raw);
    bundle[iso2] = Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('bundle-cities: skip', name, e.message);
  }
}

fs.writeFileSync(outPath, JSON.stringify(bundle), 'utf8');
console.log('bundle-cities: wrote', Object.keys(bundle).length, 'countries to assets/data/cities.json');
