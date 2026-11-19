'use strict';
/**
 * Facility lookup with a lazy cache:
 *  1. Round the user's position to a ~5 km grid cell.
 *  2. If we have not pulled that cell from OpenStreetMap recently, fetch it once and save it in our database.
 *  3. Answer every request from our own database (fast, and no per-user hits on OpenStreetMap).
 *  4. Fallback to Geoapify Places API if OpenStreetMap fails and GEOAPIFY_API_KEY is configured.
 */
const store = require('../db');

const CELL_DEG = 0.05;                 // ~5.5 km
const FETCH_RADIUS_M = 9000;           // pulled around the cell centre
const MAX_QUERY_RADIUS_M = 5000;       // largest radius an API caller may ask for (cell offset + this < FETCH_RADIUS_M)
const CELL_TTL_MS = 30 * 24 * 3600 * 1000;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const inflight = new Map();

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;
const GEOAPIFY_URL = 'https://api.geoapify.com/v2/places';

const snap = (v) => Math.round(v / CELL_DEG) * CELL_DEG;
const cellFor = (lat, lng) => ({ lat: snap(lat), lng: snap(lng), key: `${snap(lat).toFixed(2)},${snap(lng).toFixed(2)}` });

function buildQuery(lat, lng) {
  const a = `(around:${FETCH_RADIUS_M},${lat},${lng})`;
  return `[out:json][timeout:25];(
    nwr["amenity"="pharmacy"]${a};
    nwr["amenity"="hospital"]${a};
    nwr["amenity"="clinic"]${a};
    nwr["amenity"="doctors"]${a};
    nwr["healthcare"="laboratory"]${a};
  );out center tags 500;`;
}

function typeOf(tags) {
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'clinic') return 'clinic';
  if (tags.amenity === 'doctors') return 'doctors';
  if (tags.healthcare === 'laboratory') return 'laboratory';
  return null;
}
const FALLBACK_NAME = { pharmacy: 'Pharmacy', hospital: 'Hospital', clinic: 'Clinic', doctors: "Doctor's office", laboratory: 'Laboratory' };

function parseElements(elements) {
  const out = [];
  for (const el of elements || []) {
    const tags = el.tags || {};
    const type = typeOf(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!type || typeof lat !== 'number' || typeof lng !== 'number') continue;
    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city']]
      .filter(Boolean).join(', ');
    out.push({
      osm_id: `${el.type}/${el.id}`,
      name: (tags.name || tags['name:en'] || tags.operator || `${FALLBACK_NAME[type]} (name not listed)`).slice(0, 200),
      type,
      address: address || null,
      phone: (tags.phone || tags['contact:phone'] || null),
      opening_hours: tags.opening_hours || null,
      emergency: tags.emergency === 'yes',
      lat, lng,
      source: 'OpenStreetMap',
    });
  }
  return out;
}

function parseGeoapify(features) {
  const out = [];
  for (const f of features || []) {
    const props = f.properties || {};
    const type = mapGeoapifyCategory(props.categories);
    if (!type) continue;
    const lat = props.lat;
    const lng = props.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    out.push({
      osm_id: `geoapify/${props.place_id}`,
      name: (props.name || `${FALLBACK_NAME[type]} (name not listed)`).slice(0, 200),
      type,
      address: props.formatted || null,
      phone: props.phone || null,
      opening_hours: props.opening_hours || null,
      emergency: false,
      lat, lng,
      source: 'Geoapify',
    });
  }
  return out;
}

function mapGeoapifyCategory(cats) {
  if (!cats) return null;
  const catStr = String(cats).toLowerCase();
  if (catStr.includes('pharmacy')) return 'pharmacy';
  if (catStr.includes('hospital')) return 'hospital';
  if (catStr.includes('clinic') || catStr.includes('doctor')) return 'clinic';
  if (catStr.includes('laboratory') || catStr.includes('lab')) return 'laboratory';
  return null;
}

async function overpass(query) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Kemist/0.1 (health facility finder)' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return await res.json();
    } catch (e) { lastError = e; }
  }
  throw lastError;
}

async function geoapify(lat, lng) {
  if (!GEOAPIFY_KEY) throw new Error('GEOAPIFY_API_KEY not configured');
  const categories = 'healthcare.pharmacy,healthcare.hospital,healthcare.clinic,healthcare.laboratory';
  const url = `${GEOAPIFY_URL}?categories=${categories}&filter=circle:${lng},${lat},${FETCH_RADIUS_M}&limit=500&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Geoapify ${res.status}`);
  return await res.json();
}

async function fetchWithFallback(lat, lng) {
  try {
    const json = await overpass(buildQuery(lat, lng));
    return parseElements(json.elements);
  } catch (e) {
    console.warn('[facilities] OpenStreetMap fetch failed, trying Geoapify:', e.message);
    if (GEOAPIFY_KEY) {
      try {
        const json = await geoapify(lat, lng);
        return parseGeoapify(json.features);
      } catch (e2) {
        console.error('[facilities] Geoapify fallback failed:', e2.message);
      }
    }
    throw e;
  }
}

async function ensureCell(lat, lng) {
  const cell = cellFor(lat, lng);
  if (await store.cellFetchedRecently(cell.key, CELL_TTL_MS)) return { fetched: false };
  if (!inflight.has(cell.key)) {
    inflight.set(cell.key, (async () => {
      const rows = await fetchWithFallback(cell.lat, cell.lng);
      if (rows.length) await store.upsertFacilities(rows);
      await store.markCellFetched(cell.key);
      return { fetched: true, count: rows.length };
    })().finally(() => inflight.delete(cell.key)));
  }
  return inflight.get(cell.key);
}

async function nearby({ lat, lng, radius, types, limit }) {
  const r = Math.min(Math.max(radius || 3000, 300), MAX_QUERY_RADIUS_M);
  let note = null;
  try {
    await ensureCell(lat, lng);
  } catch (e) {
    console.warn('[facilities] All providers failed:', e.message);
    note = 'Live facility data could not be refreshed right now. Showing saved results.';
  }
  const facilities = await store.nearbyFacilities({ lat, lng, radius: r, types, limit });
  return { radius_m: r, facilities, note };
}

module.exports = { nearby, MAX_QUERY_RADIUS_M, parseElements, buildQuery, geoapify };