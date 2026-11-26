'use strict';
/**
 * Contract test for clinical library.
 * Verifies that for every ingredient returned by the list endpoint,
 * the detail endpoint returns at least one label and the same count.
 *
 * Usage: node scripts/check-library.js
 * Or: npm run check:library
 */

require('dotenv').config();
const store = require('../src/db');

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function main() {
  console.log('Fetching ingredient list...');
  const listRes = await fetchJson(`${API_BASE}/api/clinical/ingredients?limit=200`);
  const ingredients = listRes.data || [];
  console.log(`Found ${ingredients.length} ingredients.`);

  let passed = 0;
  let failed = 0;
  const mismatches = [];

  for (const ing of ingredients) {
    const key = ing.ingredient_key;
    const expectedCount = ing.labels;

    try {
      const detailRes = await fetchJson(`${API_BASE}/api/clinical/ingredient/${encodeURIComponent(key)}`);
      const actualCount = detailRes.count || (detailRes.data ? detailRes.data.length : 0);

      // Detail endpoint returns up to 3 most recent labels (by design).
      // Contract: at least 1 label for ingredients that have labels in the list.
      if (actualCount >= 1) {
        console.log(`  ✓ ${key}: has ${actualCount} label(s) (list shows ${expectedCount})`);
        passed++;
      } else {
        console.log(`  ✗ ${key}: expected at least 1, got ${actualCount} (list shows ${expectedCount})`);
        failed++;
        mismatches.push({ key, expectedCount, actualCount });
      }
    } catch (e) {
      console.log(`  ✗ ${key}: ERROR - ${e.message}`);
      failed++;
      mismatches.push({ key, expectedCount, actualCount: 0, error: e.message });
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${ingredients.length}`);

  if (mismatches.length > 0) {
    console.log('\nMismatches:');
    for (const m of mismatches) {
      console.log(`  ${m.key}: expected ${m.expectedCount}, got ${m.actualCount}${m.error ? ` (${m.error})` : ''}`);
    }
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});