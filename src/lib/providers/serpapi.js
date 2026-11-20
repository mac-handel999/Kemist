'use strict';
/**
 * SerpApi "google_maps" engine -> Kemist facility rows.
 * POC data source: results are labelled "Google Maps (via SerpApi)" and are NEVER marked verified.
 * Kept behind this small adapter so it can be swapped for another provider later.
 * Docs: https://serpapi.com/google-maps-api
 */
const API = 'https://serpapi.com/search.json';
const SOURCE = 'Google Maps (via SerpApi)';
const PAGE = 20;                                   // results per page; SerpApi pages by +20

// Order matters: first match wins. Checked against the listing's category text first, then the title.
const TYPE_RULES = [
  ['pharmacy', /(pharmac|chemist|drug ?store|medicine store)/i],
  ['laboratory', /(laborator|diagnostic|\blab\b|imaging|radiolog|pathology)/i],
  ['hospital', /hospital/i],
  ['clinic', /(clinic|health cent|medical cent|maternity|dispensary|primary health|dental|dentist)/i],
  ['doctors', /(doctor|physician|general practitioner)/i],
];

function classifyType(result) {
  const categories = [result.type, ...(Array.isArray(result.types) ? result.types : [])].filter(Boolean).join(' ');
  for (const text of [categories, result.title || '']) {
    for (const [type, re] of TYPE_RULES) if (text && re.test(text)) return type;
  }
  return null;                                     // not a health facility: skip it
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

/** operating_hours is a weekly table. We keep a compact weekly string, never the live "Open now" text (it goes stale). */
function formatHours(oh) {
  if (!oh || typeof oh !== 'object') return null;
  const entries = DAYS.filter((d) => typeof oh[d] === 'string' && oh[d].trim()).map((d) => [d, oh[d].trim()]);
  if (!entries.length) return null;
  const values = new Set(entries.map(([, v]) => v));
  if (entries.length === 7 && values.size === 1) return /24 hours/i.test(entries[0][1]) ? '24/7' : `Daily ${entries[0][1]}`;
  return entries.map(([d, v]) => `${SHORT[d]} ${v}`).join('; ').slice(0, 200);
}

function normalizeResult(r) {
  if (!r || typeof r !== 'object') return null;
  const lat = Number(r.gps_coordinates && r.gps_coordinates.latitude);
  const lng = Number(r.gps_coordinates && r.gps_coordinates.longitude);
  const id = r.place_id || r.data_id || r.data_cid;
  const type = classifyType(r);
  if (!id || !type || !Number.isFinite(lat) || !Number.isFinite(lng) || !r.title) return null;
  return {
    osm_id: `serpapi:${id}`,                       // generic external-ID column; the prefix keeps it apart from OSM IDs
    name: String(r.title).slice(0, 200),
    type,
    address: r.address ? String(r.address).slice(0, 300) : null,
    phone: r.phone ? String(r.phone).slice(0, 60) : null,
    opening_hours: formatHours(r.operating_hours),
    emergency: false,
    is_verified: false,
    lat, lng,
    source: SOURCE,
  };
}

/** Pull the facility rows out of one API response. */
function parseResponse(json) {
  const list = Array.isArray(json && json.local_results) ? json.local_results
    : json && json.place_results ? [json.place_results] : [];     // Google sometimes answers with a single place
  const rows = list.map(normalizeResult).filter(Boolean);
  return { rows, rawCount: list.length };
}

async function search({ apiKey, lat, lng, q, start = 0, zoom = 14, gl = '' }) {
  if (!apiKey) throw new Error('SERPAPI_API_KEY is missing in .env');
  const params = new URLSearchParams({
    engine: 'google_maps', type: 'search', q, ll: `@${lat.toFixed(5)},${lng.toFixed(5)},${zoom}z`, hl: 'en', start: String(start), api_key: apiKey,
  });
  if (gl) params.set('gl', gl);
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(45000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !json.error) throw new Error(`SerpApi ${res.status}`);
  if (json.error) {
    if (/hasn't returned any results|no results/i.test(json.error)) return { rows: [], rawCount: 0 };
    throw new Error(`SerpApi: ${json.error}`);
  }
  return parseResponse(json);
}

/** Spiral plan: cells nearest the centre first, so a limited budget is spent where people are. */
function planCalls({ lat, lng, radius = 0.06, step = 0.03, queries = ['pharmacy'], pages = 1 }) {
  const n = Math.max(0, Math.round(radius / step));
  const cells = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) cells.push({ lat: lat + i * step, lng: lng + j * step, d: Math.hypot(i, j) });
  cells.sort((a, b) => a.d - b.d);
  const calls = [];
  for (const c of cells) for (const q of queries) for (let p = 0; p < pages; p++) calls.push({ lat: c.lat, lng: c.lng, q, start: p * PAGE });
  return calls;
}

/** How many calls may we make now? */
function budgetAllowed({ limit, used, maxCalls, planned }) {
  const remaining = Math.max(0, limit - used);
  return Math.min(planned, remaining, Number.isFinite(maxCalls) ? maxCalls : Infinity);
}

module.exports = { SOURCE, classifyType, formatHours, normalizeResult, parseResponse, search, planCalls, budgetAllowed };
