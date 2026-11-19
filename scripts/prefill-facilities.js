#!/usr/bin/env node
'use strict';
/**
 * Prefill facility cache for major Nigerian cities.
 * Run: npm run prefill:facilities -- --city lagos --city abuja
 * Or: node scripts/prefill-facilities.js --city lagos --city abuja
 */
require('dotenv').config();
const facilities = require('../src/lib/facilities');

const CITIES = {
  lagos: { lat: 6.5244, lng: 3.3792 },
  abuja: { lat: 9.0765, lng: 7.3986 },
  'port harcourt': { lat: 4.8156, lng: 7.0498 },
  ibadan: { lat: 7.3775, lng: 3.947 },
  kano: { lat: 12.0022, lng: 8.592 },
  enugu: { lat: 6.4584, lng: 7.5464 },
  'benin city': { lat: 6.335, lng: 5.6037 },
  kaduna: { lat: 10.5105, lng: 7.4165 },
  abeokuta: { lat: 7.1608, lng: 3.3483 },
  jos: { lat: 9.9285, lng: 8.8923 },
  onitsha: { lat: 6.1454, lng: 6.7924 },
  owerri: { lat: 5.4863, lng: 7.0306 },
  'maitama': { lat: 9.0729, lng: 7.4671 },
  'ikeja': { lat: 6.6018, lng: 3.3515 },
  'surulere': { lat: 6.4989, lng: 3.3628 },
  'lekki': { lat: 6.4384, lng: 3.5562 },
  'victoria island': { lat: 6.4281, lng: 3.4219 },
  'gwarinpa': { lat: 9.0783, lng: 7.3765 },
  'wuse': { lat: 9.0676, lng: 7.4856 },
  'asokoro': { lat: 9.0421, lng: 7.5344 },
};

async function main() {
  const args = process.argv.slice(2);
  let cities = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--city') {
      const city = args[i + 1]?.toLowerCase();
      if (city && CITIES[city]) cities.push(city);
      i++;
    }
  }

  if (!cities.length) {
    console.log('Usage: node scripts/prefill-facilities.js --city <city1> --city <city2> ...');
    console.log('Available cities:', Object.keys(CITIES).join(', '));
    process.exit(1);
  }

  console.log('Prefilling facilities for:', cities.join(', '));
  console.log('This will fetch from OpenStreetMap (Overpass API) and cache in your database.');
  console.log('May take 30-60 seconds per city...\n');

  for (const city of cities) {
    const { lat, lng } = CITIES[city];
    console.log(`\n[${city}] Fetching facilities (lat: ${lat}, lng: ${lng})...`);
    try {
      const result = await facilities.nearby({ lat, lng, radius: 5000, limit: 100 });
      console.log(`[${city}] Found ${result.count} facilities. Note: ${result.note || 'OK'}`);
    } catch (e) {
      console.error(`[${city}] Error:`, e.message);
    }
  }

  console.log('\nDone! Run your app and check the Nearby page.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});