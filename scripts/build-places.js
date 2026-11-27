'use strict';
/**
 * Build Nigerian places list from Overpass API (OpenStreetMap).
 * Fetches cities and towns, writes to data/ng-places.json and upserts to coverage_areas table.
 *
 * Usage:
 *   node scripts/build-places.js --dry           # fetch and print, don't write to DB
 *   node scripts/build-places.js                 # fetch and upsert to coverage_areas
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const store = require('../src/db');
const { startJob } = require('../src/lib/jobrun');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="NG"]->.searchArea;
(
  node["place"="city"](area.searchArea);
  node["place"="town"](area.searchArea);
);
out body;
>;`;

// Types to exclude
const EXCLUDE_NAMES = new Set([
  'airport', 'heliport', 'helipad', 'seaport', 'port', 'harbour', 'marina',
  'industrial', 'commercial', 'residential', 'suburb', 'neighbourhood',
  'village', 'hamlet', 'isolated_dwelling', 'farm', 'farmstead',
]);

function isValidPlace(place) {
  if (!place.tags || !place.tags.name) return false;
  if (place.tags.place === 'village' || place.tags.place === 'hamlet') return false;
  const name = place.tags.name.toLowerCase();
  if (EXCLUDE_NAMES.has(name)) return false;
  return true;
}

async function fetchFromOverpass() {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Kemist/0.1' },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
    signal: AbortSignal.timeout(300000), // 5 min timeout
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.elements || [];
}

function processElements(elements) {
  const places = [];
  for (const el of elements) {
    if (!isValidPlace(el)) continue;
    const name = el.tags.name;
    const lat = el.lat;
    const lng = el.lon;
    if (!lat || !lng) continue;
    
    // Population-based radius
    const pop = el.tags.population ? parseInt(el.tags.population.replace(/[^0-9]/g, ''), 10) : 0;
    let r = 0.1; // default town radius (degrees ~ 11km)
    if (el.tags.place === 'city' || pop > 500000) r = 0.2; // city radius ~ 22km
    
    // Generate key: lowercase, no spaces/special chars
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    
    places.push({ key, name, lat, lng, r, status: 'pending' });
  }
  return places;
}

async function writeJson(places) {
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'ng-places.json');
  fs.writeFileSync(outFile, JSON.stringify(places, null, 2));
  console.log(`Written ${places.length} places to ${outFile}`);
}

async function upsertToDb(places) {
  if (store.mode !== 'supabase') {
    console.warn('Supabase not configured, skipping DB upsert');
    return;
  }
  const db = store.client;
  const rows = places.map(p => ({
    key: p.key,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    r: p.r,
    status: 'pending',
  }));
  const { error } = await db.from('coverage_areas').upsert(rows, { onConflict: 'key', ignoreDuplicates: true });
  if (error) throw new Error(`coverage_areas upsert: ${error.message}`);
  console.log(`Upserted ${rows.length} places to coverage_areas`);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const job = await startJob('build-places');
  
  try {
    console.log('Fetching Nigerian places from Overpass...');
    const elements = await fetchFromOverpass();
    console.log(`Fetched ${elements.length} OSM elements`);
    
    const places = processElements(elements);
    console.log(`Processed ${places.length} valid places`);
    
    // Sort by population (largest first) - approximate by city/town and population tag
    places.sort((a, b) => {
      if (a.r !== b.r) return b.r - a.r; // cities first
      return 0;
    });
    
    await writeJson(places);
    
    if (!dry) {
      await upsertToDb(places);
    } else {
      console.log('Dry run - skipping DB upsert');
      console.log('Sample places:', places.slice(0, 10));
    }
    
    await job.finish('success', { records_seen: elements.length, records_saved: places.length });
    console.log('Done.');
  } catch (e) {
    await job.finish('failed', { error_message: e.message });
    throw e;
  }
}

main().catch((e) => { console.error('Build places failed:', e.message); process.exitCode = 1; });