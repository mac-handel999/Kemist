'use strict';
/**
 * SerpApi "google_news" engine -> Kemist news rows. Discovery only: headline, publisher, date, snippet and a link to the original.
 * We never copy article text. Official medicine-safety records come from NAFDAC itself (see alerts), not from here.
 * Docs: https://serpapi.com/google-news-api
 */
const crypto = require('node:crypto');
const API = 'https://serpapi.com/search.json';

/** Each query is one SerpApi call. Category is a default label; headlines about recalls/counterfeits are re-labelled "safety". */
const QUERIES = [
  { id: 'ng-health', category: 'nigeria', q: 'Nigeria health hospitals Federal Ministry of Health' },
  { id: 'ng-pharmacy', category: 'pharmacy', q: 'Nigeria pharmacy pharmaceutical medicines drugs' },
  { id: 'ng-safety', category: 'safety', q: 'NAFDAC alert recall counterfeit fake drugs' },
  { id: 'ng-outbreak', category: 'outbreak', q: 'NCDC Nigeria disease outbreak Lassa cholera' },
  { id: 'ng-pcn', category: 'pharmacy', q: 'Pharmacists Council of Nigeria PCN pharmacy' },
  { id: 'world-safety', category: 'world', q: 'WHO medical product alert falsified medicines' },
  { id: 'world-fda', category: 'world', q: 'FDA drug safety communication recall' },
  { id: 'world-health', category: 'world', q: 'global health WHO news' },
];

const SAFETY = /(nafdac|recall|counterfeit|falsified|fake drug|substandard|unregistered|drug alert|safety alert)/i;

const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function normalizeItem(r, { category, queryId }) {
  if (!r || !r.title || !r.link) return null;
  const publisher = typeof r.source === 'string' ? r.source : r.source && r.source.name;
  const iso = r.iso_date && !Number.isNaN(Date.parse(r.iso_date)) ? new Date(r.iso_date).toISOString() : null;
  const title = clean(r.title, 300);
  return {
    title,
    snippet: clean(r.snippet || r.description, 400) || null,
    url: String(r.link).slice(0, 1000),
    publisher: clean(publisher, 100) || null,
    published_at: iso,
    category: SAFETY.test(title) ? 'safety' : category,
    query_id: queryId,
    country: /Nigeria|NAFDAC|NCDC|PCN/i.test(title) || category === 'nigeria' ? 'NG' : null,
    content_hash: crypto.createHash('sha256').update(`${title.toLowerCase()}|${(publisher || '').toLowerCase()}`).digest('hex').slice(0, 32),
    fetched_at: new Date().toISOString(),
  };
}

/** Story clusters carry their own articles in `stories`: flatten them. */
function parseNews(json, ctx) {
  const out = [];
  for (const r of (json && json.news_results) || []) {
    const items = Array.isArray(r.stories) && r.stories.length ? [r, ...r.stories] : [r];
    for (const it of items) { const n = normalizeItem(it, ctx); if (n) out.push(n); }
  }
  const seen = new Set();
  return out.filter((n) => (seen.has(n.url) ? false : seen.add(n.url)));
}

async function searchNews({ apiKey, q, gl = 'ng', hl = 'en', category, queryId }) {
  if (!apiKey) throw new Error('SERPAPI_API_KEY is missing');
  const params = new URLSearchParams({ engine: 'google_news', q, gl, hl, api_key: apiKey });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(45000) });
  const json = await res.json().catch(() => ({}));
  if (json.error && /hasn't returned any results|no results/i.test(json.error)) return [];
  if (!res.ok || json.error) { const e = new Error(`SerpApi: ${json.error || res.status}`); e.status = res.status; throw e; }
  return parseNews(json, { category, queryId });
}

/** Pick `n` queries for today, rotating through the list so every query gets its turn without spending the whole budget. */
function pickQueries(n, date = new Date(), list = QUERIES) {
  const day = Math.floor(date.getTime() / 86400000);
  const count = Math.min(n, list.length);
  return Array.from({ length: count }, (_, i) => list[(day * count + i) % list.length]);
}

module.exports = { QUERIES, normalizeItem, parseNews, searchNews, pickQueries, SAFETY };
