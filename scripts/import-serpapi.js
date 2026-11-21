'use strict';
/**
 * Fetch pharmacies, hospitals and clinics from Google Maps (via SerpApi) into the facilities table.
 * Run it from your computer or GitHub Actions. Visitors never trigger SerpApi calls: the app reads from your database.
 *
 *   node scripts/import-serpapi.js --city ibadan --dry                 # show the plan and the call budget, call nothing
 *   node scripts/import-serpapi.js --city ibadan --queries pharmacy,hospital --max-calls 20
 *   node scripts/import-serpapi.js --lat 7.38 --lng 3.95 --radius 0.06 --step 0.03 --queries pharmacy
 *   node scripts/import-serpapi.js --file tests/fixtures/serpapi-sample.json   # offline test with saved API responses
 *
 * Cells nearest the centre are searched first. One call = one SerpApi search (20 results per page).
 * The monthly limit (SERPAPI_MONTHLY_LIMIT, default 240 of the free 250) is enforced and remembered in the database.
 */
require('dotenv').config();
const fs = require('node:fs');
const external = require('../src/db/external');
const { CITIES } = require('../src/lib/prefill');
const serp = require('../src/lib/providers/serpapi');
const apiKeys = require('../src/lib/api-keys');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROVIDER = 'serpapi';

async function main() {
  // Offline mode: parse saved API responses, no key, no budget.
  if (opt('file')) {
    const responses = JSON.parse(fs.readFileSync(opt('file'), 'utf8'));
    let saved = 0;
    for (const json of responses) {
      const { rows, rawCount } = serp.parseResponse(json);
      if (!flag('dry')) await external.upsertFacilities(rows);
      saved += rows.length;
      console.log(`  response: ${rawCount} listings, ${rows.length} health facilities`);
    }
    console.log(`Done (offline). ${flag('dry') ? 'Would save' : 'Saved'}: ${saved}`);
    return;
  }

  let area;
  if (opt('city')) {
    const c = CITIES[opt('city').toLowerCase()];
    if (!c) { console.error(`Unknown city. Known: ${Object.keys(CITIES).join(', ')}`); process.exitCode = 1; return; }
    area = { lat: c.lat, lng: c.lng };
  } else if (opt('lat') && opt('lng')) area = { lat: Number(opt('lat')), lng: Number(opt('lng')) };
  else { console.error('Use --city <name> or --lat/--lng. Add --dry to preview.'); process.exitCode = 1; return; }

  const queries = opt('queries', 'pharmacy').split(',').map((s) => s.trim()).filter(Boolean);
  const plan = serp.planCalls({
    ...area, radius: Number(opt('radius', 0.06)), step: Number(opt('step', 0.03)), queries, pages: Number(opt('pages', 1)),
  });

  const limit = Number(process.env.SERPAPI_MONTHLY_LIMIT || 240);
  const month = new Date().toISOString().slice(0, 7);
  const used = await external.getUsage(PROVIDER, month);
  const maxCalls = opt('max-calls') ? Number(opt('max-calls')) : Infinity;
  const allowed = serp.budgetAllowed({ limit, used, maxCalls, planned: plan.length });

  console.log(`Plan: ${plan.length} calls (${queries.join(', ')}). Used this month: ${used}/${limit}. This run will make: ${allowed}.`);
  if (flag('dry')) {
    plan.slice(0, Math.min(allowed, 10)).forEach((c, i) => console.log(`  ${i + 1}. "${c.q}" @ ${c.lat.toFixed(4)},${c.lng.toFixed(4)} start=${c.start}`));
    if (allowed > 10) console.log(`  ... and ${allowed - 10} more`);
    return;
  }
  if (!allowed) { console.error('No budget left for this month (or nothing planned). Nothing was called.'); process.exitCode = 1; return; }
  if (external.mode !== 'supabase') console.warn('Warning: Supabase is not configured, so results are kept in memory only and will be lost.');

  let saved = 0, empty = 0, failed = 0;
  for (let i = 0; i < allowed; i++) {
    const c = plan[i];
    try {
      const { key, credentialId } = await apiKeys.getKey('serpapi');
      const start = Date.now();
      const { rows } = await serp.search({ apiKey: key, ...c, gl: process.env.SERPAPI_GL || '' });
      const latency = Date.now() - start;
      await apiKeys.recordResult(credentialId, {
        success: true, statusCode: 200, latencyMs: latency,
        requestMetadata: { endpoint: 'search', query: c.q, lat: c.lat, lng: c.lng }
      });
      await external.addUsage(PROVIDER, month, 1);          // count every attempted call straight away
      if (rows.length) { await external.upsertFacilities(rows); saved += rows.length; } else empty++;
      console.log(`  ${i + 1}/${allowed} "${c.q}" @ ${c.lat.toFixed(3)},${c.lng.toFixed(3)} -> ${rows.length} facilities`);
    } catch (e) {
      failed++;
      console.error(`  ${i + 1}/${allowed} failed: ${e.message}`);
      if (/api_key|invalid|plan|limit|credits/i.test(e.message)) { console.error('Stopping: this looks like an account or key problem.'); break; }
    }
    await sleep(1000);
  }
  console.log(`\nDone. Saved/updated: ${saved}. Empty calls: ${empty}. Failed: ${failed}. Used this month: ${await external.getUsage(PROVIDER, month)}/${limit}.`);
  if (failed && !saved) process.exitCode = 1;
}

main().catch((e) => { console.error('Import failed:', e.message); process.exitCode = 1; });
