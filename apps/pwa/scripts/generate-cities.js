/**
 * Generate top 200 cities per country by population (GeoNames cities15000).
 * Run from apps/pwa: node scripts/generate-cities.js
 * Requires: npm install --save-dev adm-zip (and network to download geonames dump).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const MAX_CITIES_PER_COUNTRY = 200;
const GEONAMES_URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const COUNTRIES_PATH = path.join(__dirname, '../assets/data/countries.json');
const CITIES_DIR = path.join(__dirname, '../public/data/cities');

// geoname table: 0=id, 1=name, 2=asciiname, 3=alternatenames, 4=lat, 5=lng, 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2, 10=admin1, 11=admin2, 12=admin3, 13=admin4, 14=population, 15=elevation, 16=dem, 17=timezone, 18=moddate
const COL_COUNTRY = 8;
const COL_NAME = 1;
const COL_POPULATION = 14;

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseTsv(buffer) {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length > COL_POPULATION) {
      rows.push({
        countryCode: cols[COL_COUNTRY].trim().toUpperCase(),
        name: cols[COL_NAME].trim(),
        population: parseInt(cols[COL_POPULATION], 10) || 0
      });
    }
  }
  return rows;
}

function main() {
  let AdmZip;
  try {
    AdmZip = require('adm-zip');
  } catch (e) {
    console.error('Install adm-zip first: npm install --save-dev adm-zip');
    process.exit(1);
  }

  const countriesJson = fs.readFileSync(COUNTRIES_PATH, 'utf8');
  const countries = JSON.parse(countriesJson);
  if (!Array.isArray(countries) || !countries.every(c => c.iso2)) {
    console.error('countries.json must be an array of { iso2, name }');
    process.exit(1);
  }

  const iso2Set = new Set(countries.map(c => c.iso2.toUpperCase()));

  if (!fs.existsSync(CITIES_DIR)) {
    fs.mkdirSync(CITIES_DIR, { recursive: true });
  }

  console.log('Downloading cities15000.zip from GeoNames...');
  download(GEONAMES_URL)
    .then((zipBuffer) => {
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      const txtEntry = entries.find(e => e.entryName.endsWith('.txt'));
      if (!txtEntry) {
        throw new Error('No .txt file found in zip');
      }
      const raw = zip.readAsText(txtEntry, 'utf8');
      const rows = parseTsv(Buffer.from(raw, 'utf8'));

      // Group by country, sort by population desc
      const byCountry = new Map();
      for (const row of rows) {
        if (!iso2Set.has(row.countryCode)) continue;
        if (!byCountry.has(row.countryCode)) {
          byCountry.set(row.countryCode, []);
        }
        byCountry.get(row.countryCode).push({ name: row.name, population: row.population });
      }

      for (const { iso2 } of countries) {
        const key = iso2.toUpperCase();
        let list = byCountry.get(key) || [];
        list = list
          .sort((a, b) => b.population - a.population)
          .slice(0, MAX_CITIES_PER_COUNTRY)
          .map(x => x.name);
        const names = [...new Set(list)];
        const outPath = path.join(CITIES_DIR, `${iso2}.json`);
        fs.writeFileSync(outPath, JSON.stringify(names, null, 0), 'utf8');
        console.log(`${iso2}: ${names.length} cities`);
      }

      console.log('Done. City files written to public/data/cities/');
    })
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

main();
