'use strict';
/**
 * Import NAFDAC public alerts (counterfeit / recall / substandard notices) into the alerts table.
 *
 *   node scripts/import-alerts.js --file alerts.json [--dry]       # JSON array of { title, link, date, excerpt, content }
 *   node scripts/import-alerts.js --wp [--pages 3] [--dry]         # read NAFDAC's website feed (works only if the site exposes its WordPress API)
 *
 * Only the title, a short summary, registration numbers mentioned and a link back to NAFDAC are stored.
 */
require('dotenv').config();
const fs = require('node:fs');
const alertsDb = require('../src/db/alerts');
const { alertFromPost } = require('../src/lib/alerts');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const WP = 'https://nafdac.gov.ng/wp-json/wp/v2/posts';

async function fetchWp(pages) {
  const posts = [];
  for (let page = 1; page <= pages; page++) {
    const url = `${WP}?search=${encodeURIComponent('Public Alert')}&per_page=50&page=${page}&_fields=id,date,link,title,excerpt,content`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Kemist/0.1 (alerts import)' }, signal: AbortSignal.timeout(30000) });
    if (res.status === 400) break;                                                   // past the last page
    if (!res.ok) throw new Error(`NAFDAC site answered ${res.status}. Its WordPress API may be switched off: use --file instead.`);
    const json = await res.json();
    if (!Array.isArray(json) || !json.length) break;
    for (const p of json) posts.push({ title: p.title && p.title.rendered, link: p.link, date: p.date, excerpt: p.excerpt && p.excerpt.rendered, content: p.content && p.content.rendered });
  }
  return posts;
}

async function main() {
  let posts;
  if (opt('file')) posts = JSON.parse(fs.readFileSync(opt('file'), 'utf8'));
  else if (flag('wp')) posts = await fetchWp(Number(opt('pages', 2)));
  else { console.error('Use --file alerts.json or --wp. Add --dry to preview.'); process.exitCode = 1; return; }

  const rows = posts.map((p) => (p.source_url && p.alert_type ? p : alertFromPost(p))).filter(Boolean).filter((r) => /alert|recall|counterfeit|fake|substandard|falsified/i.test(r.title));
  console.log(`Posts read: ${posts.length}. Alerts recognised: ${rows.length}. With registration numbers: ${rows.filter((r) => r.nrns.length).length}.`);
  rows.slice(0, 5).forEach((r) => console.log(`  [${r.alert_type}] ${r.title.slice(0, 90)}${r.nrns.length ? `  NRN: ${r.nrns.join(', ')}` : ''}`));
  if (flag('dry')) return;
  await alertsDb.upsertMany(rows);
  console.log('Saved.');
}

main().catch((e) => { console.error('Import failed:', e.message); process.exitCode = 1; });
