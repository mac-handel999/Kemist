'use strict';
/**
 * Import NAFDAC Greenbook records into Supabase.
 *
 *   node scripts/sync-drugs.js --dry                 # fetch from Apify, print mapped samples, write nothing
 *   node scripts/sync-drugs.js                       # run the Apify actor, then import everything
 *   node scripts/sync-drugs.js --dataset <id>        # import an existing Apify dataset (no new run)
 *   node scripts/sync-drugs.js --file export.json    # import a JSON array file
 *
 * Add --dry to any of the above to check the field mapping first.
 */
require('dotenv').config();
const fs = require('node:fs');
const { normalizeNafdacRecord } = require('../src/lib/nafdac');
const { sha256 } = require('../src/lib/helpers');
const { KeyPool, parseKeys } = require('../src/lib/keypool');

const API = 'https://api.apify.com/v2';
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tokens = parseKeys(process.env.APIFY_TOKENS, process.env.APIFY_TOKEN);
const pool = new KeyPool({ provider: 'apify', keys: tokens });          // no call counting: Apify bills by usage, so we fail over on errors

async function apify(pathname, { method = 'GET', body, params = {}, token } = {}) {
  if (!token) throw new Error('APIFY_TOKEN (or APIFY_TOKENS=a,b) is missing in .env');
  const qs = new URLSearchParams({ token, ...params });
  const res = await fetch(`${API}${pathname}?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) { const e = new Error(`Apify ${method} ${pathname} -> ${res.status} ${(await res.text()).slice(0, 300)}`); e.status = res.status; throw e; }
  return res.json();
}

async function runActor() {
  const actor = process.env.APIFY_ACTOR_ID;
  if (!actor) throw new Error('APIFY_ACTOR_ID is missing. Copy it from the actor page on Apify (format: username~actor-name).');
  let input = {};
  if (process.env.APIFY_INPUT) {
    try { input = JSON.parse(process.env.APIFY_INPUT); } catch { throw new Error('APIFY_INPUT is not valid JSON'); }
  }
  return pool.run(async (token) => {                                      // a run belongs to one token, so start AND poll with the same one
    const started = (await apify(`/acts/${encodeURIComponent(actor)}/runs`, { method: 'POST', body: input, token })).data;
    console.log(`Apify run started: ${started.id}`);
    for (let i = 0; i < 360; i++) {                                       // up to 30 minutes
      const run = (await apify(`/actor-runs/${started.id}`, { token })).data;
      if (run.status === 'SUCCEEDED') return { runId: run.id, datasetId: run.defaultDatasetId, token };
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) throw new Error(`Apify run ${run.status}`);
      await sleep(5000);
    }
    throw new Error('Timed out waiting for the Apify run');
  });
}

async function datasetItems(datasetId, token) {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${API}/datasets/${datasetId}/items?${new URLSearchParams({
      token, format: 'json', clean: 'true', limit: '1000', offset: String(offset),
    })}`, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`Apify dataset -> ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error('Apify dataset did not return a JSON array');
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

async function main() {
  const dry = flag('dry');
  let items, runId = null, datasetId = opt('dataset'), token = tokens[0];

  if (opt('file')) {
    items = JSON.parse(fs.readFileSync(opt('file'), 'utf8'));
    if (!Array.isArray(items)) throw new Error('The file must contain a JSON array of records');
  } else {
    if (!datasetId) ({ runId, datasetId, token } = await runActor());
    items = await datasetItems(datasetId, token);
  }
  console.log(`Fetched ${items.length} raw records.`);

  const rows = new Map();                                // dedupe on source_record_id (last one wins)
  const raws = new Map();
  const rejected = [];
  items.forEach((raw, index) => {
    const r = normalizeNafdacRecord(raw);
    if (!r.ok) { rejected.push({ index, reason: r.reason }); return; }
    rows.set(r.row.source_record_id, r.row);
    raws.set(r.row.source_record_id, raw);
  });
  console.log(`Valid: ${rows.size}  Rejected: ${rejected.length}`);
  if (rejected.length) console.log('First rejections:', rejected.slice(0, 5));

  if (dry) {
    console.log('\nFirst mapped rows (check these against the raw data):');
    console.log(JSON.stringify([...rows.values()].slice(0, 3), null, 2));
    console.log('\nFirst raw record, for comparison:');
    console.log(JSON.stringify(items[0], null, 2));
    return;
  }

  const store = require('../src/db');
  if (store.mode !== 'supabase') throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  const db = store.client;

  const { data: job, error: jobErr } = await db.from('sync_logs').insert({
    source: 'NAFDAC Greenbook', job_name: 'nafdac_import', external_run_id: runId, records_seen: items.length,
  }).select('id').single();
  if (jobErr) throw jobErr;

  let imported = 0;
  const errors = [];
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const { error } = await db.from('drugs').upsert(chunk, { onConflict: 'source,source_record_id' });
    if (error) { errors.push({ batch: i / 500, message: error.message }); continue; }
    imported += chunk.length;

    const rawChunk = chunk.map((r) => ({
      source: r.source, source_record_id: r.source_record_id,
      payload: raws.get(r.source_record_id), payload_hash: sha256(raws.get(r.source_record_id)),
      fetched_at: new Date().toISOString(),
    }));
    const { error: rawErr } = await db.from('source_records').upsert(rawChunk, { onConflict: 'source,source_record_id' });
    if (rawErr) errors.push({ batch: i / 500, raw: true, message: rawErr.message });
    process.stdout.write(`\rImported ${imported}/${list.length}`);
  }
  console.log();

  const status = errors.length === 0 && rejected.length === 0 ? 'succeeded' : imported > 0 ? 'completed_with_errors' : 'failed';
  await db.from('sync_logs').update({
    status, records_imported: imported, records_rejected: rejected.length + (list.length - imported),
    completed_at: new Date().toISOString(),
    details: { datasetId, rejected: rejected.slice(0, 100), errors: errors.slice(0, 20) },
  }).eq('id', job.id);

  console.log(`Done: ${status}. Imported ${imported}, rejected ${rejected.length}, batch errors ${errors.length}.`);
  if (status === 'failed') process.exitCode = 1;
}

main().catch((e) => { console.error('Sync failed:', e.message); process.exitCode = 1; });
