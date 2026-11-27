'use strict';
/**
 * Fill the facilities table for whole cities from OpenStreetMap.
 *
 *   node scripts/prefill-facilities.js --list
 *   node scripts/prefill-facilities.js --city lagos
 *   node scripts/prefill-facilities.js --all              # takes a while: one request per block, 20 s apart
 *   node scripts/prefill-facilities.js --lat 7.40 --lng 3.90 --radius 0.15 --name "My area"
 *   node scripts/prefill-facilities.js --queue --max-blocks 50   # process next pending areas from coverage_areas
 *   add --dry to only print the plan
 *
 * Safe to stop and restart: blocks that were already fetched in the last 30 days are skipped.
 */
require('dotenv').config();
const store = require('../src/db');
const { CITIES, planBlocks, fetchBlock, sleep } = require('../src/lib/prefill');
const { startJob } = require('../src/lib/jobrun');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const TTL = 30 * 24 * 3600 * 1000;
const PAUSE_MS = Number(opt('pause') || 20000);

async function processArea(area, dry, maxBlocks = Infinity) {
  const blocks = planBlocks(area);
  console.log(`\n${area.name}: ${blocks.length} block(s)`);
  let n = 0, total = 0, skipped = 0, failed = 0;
  for (const b of blocks) {
    if (n >= maxBlocks) { console.log(`  Reached max-blocks limit (${maxBlocks})`); break; }
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
  return { total, skipped, failed };
}

async function queueMode(dry, maxBlocks) {
  if (store.mode !== 'supabase') throw new Error('Supabase required for queue mode');
  const db = store.client;
  
  // Get pending areas sorted by population (r desc) and last_run
  const { data: areas, error } = await db.from('coverage_areas')
    .select('key,name,lat,lng,r,last_run,places_found')
    .eq('status', 'pending')
    .order('r', { ascending: false })
    .order('last_run', { ascending: true, nullsFirst: true });
  
  if (error) throw new Error(`coverage_areas select: ${error.message}`);
  if (!areas.length) { console.log('No pending areas in queue.'); return { total: 0, skipped: 0, failed: 0 }; }
  
  console.log(`Queue mode: ${areas.length} pending area(s). Will process up to ${maxBlocks} blocks.`);
  
  let grandTotal = 0, grandSkipped = 0, grandFailed = 0, blocksProcessed = 0;
  
  for (const a of areas) {
    if (blocksProcessed >= maxBlocks) break;
    const remaining = maxBlocks - blocksProcessed;
    console.log(`\n=== ${a.name} (r=${a.r}, key=${a.key}) ===`);
    
    // Mark area as running
    await db.from('coverage_areas').update({ status: 'running' }).eq('key', a.key);
    
    const areaObj = { name: a.name, lat: a.lat, lng: a.lng, r: a.r };
    const result = await processArea(areaObj, dry, remaining);
    
    blocksProcessed += result.total > 0 || result.skipped > 0 || result.failed > 0 ? 1 : 0;
    grandTotal += result.total;
    grandSkipped += result.skipped;
    grandFailed += result.failed;
    
    // Mark area as done
    await db.from('coverage_areas').update({
      status: 'done',
      last_run: new Date().toISOString(),
      places_found: result.total,
    }).eq('key', a.key);
    
    if (blocksProcessed >= maxBlocks) break;
  }
  
  return { total: grandTotal, skipped: grandSkipped, failed: grandFailed };
}

async function main() {
  const dry = flag('dry');
  const maxBlocks = opt('max-blocks') ? Number(opt('max-blocks')) : Infinity;
  
  if (flag('list')) { for (const [k, c] of Object.entries(CITIES)) console.log(`${k.padEnd(14)} ${c.name} (${planBlocks(c).length} blocks)`); return; }

  let targets = [];
  if (flag('all')) targets = Object.values(CITIES);
  else if (opt('city')) {
    const c = CITIES[opt('city').toLowerCase()];
    if (!c) { console.error(`Unknown city. Run with --list. Known: ${Object.keys(CITIES).join(', ')}`); process.exitCode = 1; return; }
    targets = [c];
  } else if (opt('lat') && opt('lng')) {
    targets = [{ name: opt('name') || 'Custom area', lat: Number(opt('lat')), lng: Number(opt('lng')), r: Number(opt('radius') || 0.15) }];
  }
  
  const job = await startJob('prefill-facilities');
  
  if (!dry && store.mode !== 'supabase') {
    await job.finish('failed', { error_message: 'Supabase not configured' });
    console.error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
    process.exitCode = 1; return;
  }

  try {
    let total = 0, skipped = 0, failed = 0;
    
    if (flag('queue')) {
      const result = await queueMode(dry, maxBlocks);
      total = result.total;
      skipped = result.skipped;
      failed = result.failed;
    } else {
      if (!targets.length) { console.error('Use --city <name>, --all, --lat/--lng, --queue, or --list.'); await job.finish('failed', { error_message: 'No target specified' }); process.exitCode = 1; return; }
      for (const t of targets) {
        const result = await processArea(t, dry, maxBlocks);
        total += result.total;
        skipped += result.skipped;
        failed += result.failed;
      }
    }
    
    console.log(`\nDone. Places saved: ${total}. Blocks skipped: ${skipped}. Blocks failed: ${failed}.`);
    await job.finish(failed && total === 0 ? 'failed' : total > 0 ? 'success' : 'partial', {
      records_seen: total + skipped + failed,
      records_saved: total,
      errors: failed,
      details: { skipped }
    });
    
    if (failed && total === 0) process.exitCode = 1;
  } catch (e) {
    await job.finish('failed', { error_message: e.message });
    throw e;
  }
}

main().catch((e) => { console.error('Prefill failed:', e.message); process.exitCode = 1; });