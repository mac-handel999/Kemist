'use strict';
/**
 * Collect health headlines from Google News (via SerpApi) into the news_articles table.
 * Visitors never trigger SerpApi calls: the app reads your database. One query = one SerpApi call.
 *
 *   node scripts/import-news.js --rotate 4 --dry           # today's 4 queries (rotating through the list), call nothing
 *   node scripts/import-news.js --rotate 4                  # fetch them
 *   node scripts/import-news.js --all --max-calls 8         # every query once
 *   node scripts/import-news.js --file tests/fixtures/serpnews-sample.json   # offline test with a saved response
 */
require('dotenv').config();
const fs = require('node:fs');
const news = require('../src/db/news');
const external = require('../src/db/external');
const serp = require('../src/lib/providers/serpnews');
const { KeyPool, PoolExhaustedError, parseKeys } = require('../src/lib/keypool');
const { startJob } = require('../src/lib/jobrun');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (opt('file')) {
    const rows = serp.parseNews(JSON.parse(fs.readFileSync(opt('file'), 'utf8')), { category: 'nigeria', queryId: 'file' });
    console.log(`Parsed ${rows.length} articles.`);
    if (!flag('dry')) { await news.upsertMany(rows); console.log('Saved.'); }
    return;
  }

  const job = await startJob('import-news');
  const list = flag('all') ? serp.QUERIES : serp.pickQueries(Number(opt('rotate', 4)));
  const limit = Number(process.env.SERPAPI_MONTHLY_LIMIT || 240);
  const keys = parseKeys(process.env.SERPAPI_API_KEYS, process.env.SERPAPI_API_KEY);
  const pool = new KeyPool({
    provider: 'serpapi', keys, monthlyLimit: limit,
    usage: { get: (p, m) => external.getUsage(p, m), add: (p, m, n) => external.addUsage(p, m, n) },
  });
  const remaining = keys.length ? await pool.remaining() : limit;
  const maxCalls = opt('max-calls') ? Number(opt('max-calls')) : Infinity;
  const allowed = Math.min(list.length, remaining, maxCalls);
  console.log(`Queries planned: ${list.length}. Keys: ${keys.length || 'none set'}. Calls left this month: ${remaining}. This run will make: ${allowed}.`);
  list.slice(0, allowed).forEach((q, i) => console.log(`  ${i + 1}. [${q.category}] ${q.q}`));
  if (flag('dry')) { await job.finish('success', { details: { dryRun: true } }); return; }
  if (!keys.length) { await job.finish('failed', { error_message: 'No SerpAPI keys set' }); console.error('Set SERPAPI_API_KEY (or SERPAPI_API_KEYS=key1,key2) in .env.'); process.exitCode = 1; return; }
  if (!allowed) { await job.finish('partial', { details: { reason: 'No budget left' } }); console.error('No budget left. Nothing was called.'); process.exitCode = 1; return; }

  let saved = 0, failed = 0;
  for (const q of list.slice(0, allowed)) {
    try {
      const rows = await pool.run((key) => serp.searchNews({ apiKey: key, q: q.q, category: q.category, queryId: q.id }));
      saved += await news.upsertMany(rows);
      console.log(`  "${q.q}" -> ${rows.length} headlines`);
    } catch (e) {
      failed++;
      console.error(`  "${q.q}" failed: ${e.message}`);
      if (e instanceof PoolExhaustedError) { console.error('Stopping: every key is used up or rejected.'); break; }
    }
    await sleep(1000);
  }
  console.log(`Done. Headlines saved/updated: ${saved}. Failed queries: ${failed}. Calls left this month: ${await pool.remaining()}.`);

  await job.finish(failed && !saved ? 'failed' : saved > 0 ? 'success' : 'partial', {
    records_seen: list.length,
    records_saved: saved,
    errors: failed,
    details: { callsLeft: await pool.remaining() }
  });

  if (failed && !saved) process.exitCode = 1;
}

main().catch((e) => { console.error('Import failed:', e.message); process.exitCode = 1; });