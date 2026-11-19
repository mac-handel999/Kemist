'use strict';
/**
 * Fill the facilities table for whole cities from OpenStreetMap.
 *
 *   node scripts/prefill-facilities.js --list
 *   node scripts/prefill-facilities.js --city lagos
 *   node scripts/prefill-facilities.js --all              # takes a while: one request per block, 20 s apart
 *   node scripts/prefill-facilities.js --lat 7.40 --lng 3.90 --radius 0.15 --name "My area"
 *   add --dry to only print the plan
 *
 * Safe to stop and restart: blocks that were already fetched in the last 30 days are skipped.
 */
require('dotenv').config();
const store = require('../src/db');
const { CITIES, planBlocks, fetchBlock, sleep } = require('../src/lib/prefill');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const TTL = 30 * 24 * 3600 * 1000;
const PAUSE_MS = Number(opt('pause') || 20000);

async function main() {
  if (flag('list')) { for (const [k, c] of Object.entries(CITIES)) console.log(`${k.padEnd(14)} ${c.name} (${planBlocks(c).length} blocks)`); return; }

  let targets = [];
  if (flag('all')) targets = Object.values(CITIES);
  else if (opt('city')) {
    const c = CITIES[opt('city').toLowerCase()];
    if (!c) { console.error(`Unknown city. Run with --list. Known: ${Object.keys(CITIES).join(', ')}`); process.exitCode = 1; return; }
    targets = [c];
  } else if (opt('lat') && opt('lng')) {
    targets = [{ name: opt('name') || 'Custom area', lat: Number(opt('lat')), lng: Number(opt('lng')), r: Number(opt('radius') || 0.15) }];
  } else { console.error('Use --city <name>, --all, --lat/--lng, or --list.'); process.exitCode = 1; return; }

  const dry = flag('dry');
  if (!dry && store.mode !== 'supabase') {
    console.error('Supabase is not configured, so nothing would be saved. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
    process.exitCode = 1; return;
  }

  let total = 0, skipped = 0, failed = 0;
  for (const t of targets) {
    const blocks = planBlocks(t);
    console.log(`\n${t.name}: ${blocks.length} block(s)`);
    let n = 0;
    for (const b of blocks) {
      n++;
      const done = await Promise.all(b.cells.map((c) => store.cellFetchedRecently(c, TTL)));
      if (done.every(Boolean)) { skipped++; console.log(`  ${n}/${blocks.length} already fetched, skipping`); continue; }
      if (dry) { console.log(`  ${n}/${blocks.length} would fetch ${b.cells.length} cells, bbox ${JSON.stringify(b.bbox)}`); continue; }
      try {
        const rows = await fetchBlock(b);
        if (rows.length) await store.upsertFacilities(rows);
        for (const c of b.cells) await store.markCellFetched(c);
        total += rows.length;
        console.log(`  ${n}/${blocks.length} saved ${rows.length} places`);
      } catch (e) {
        failed++;
        console.error(`  ${n}/${blocks.length} failed: ${e.message} (rerun later to retry)`);
      }
      await sleep(PAUSE_MS);
    }
  }
  console.log(`\nDone. Places saved: ${total}. Blocks skipped: ${skipped}. Blocks failed: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('Prefill failed:', e.message); process.exitCode = 1; });
