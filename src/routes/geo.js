'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { cleanText } = require('../lib/helpers');

// GET /api/geo/locate : approximate location from the visitor's network (city level), used when the browser cannot locate the device
router.get('/locate', (req, res) => {
  const h = req.headers;
  const lat = Number(h['x-vercel-ip-latitude'] || h['cf-iplatitude']);
  const lng = Number(h['x-vercel-ip-longitude'] || h['cf-iplongitude']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.json({ found: false });
  let city = h['x-vercel-ip-city'] || h['cf-ipcity'] || null;
  try { city = city && decodeURIComponent(city); } catch { /* keep as is */ }
  res.json({ found: true, lat, lng, city, country: h['x-vercel-ip-country'] || h['cf-ipcountry'] || null, accuracy: 'approximate (city level)' });
});

const cache = new Map();             // geocoding answers are cached: Nominatim's policy asks for light use
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

async function geocode(q) {
  const key = process.env.GEOAPIFY_API_KEY;
  if (key) {
    const url = `https://api.geoapify.com/v1/geocode/search?${new URLSearchParams({ text: q, filter: 'countrycode:ng', limit: '5', format: 'json', apiKey: key })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    return ((await res.json()).results || []).map((r) => ({ name: r.formatted, lat: r.lat, lng: r.lon }));
  }
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'ng', limit: '5' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': `Kemist/0.1 ${process.env.NOMINATIM_EMAIL || ''}`.trim() }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  return (await res.json()).map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

// GET /api/geo/search?q=Ikeja : place name -> coordinates (Nigeria only)
router.get('/search', limiter, async (req, res, next) => {
  try {
    const q = cleanText(String(req.query.q || ''), 80);
    if (q.length < 3) return res.status(400).json({ error: 'Type at least 3 letters.' });
    const k = q.toLowerCase();
    if (!cache.has(k)) {
      cache.set(k, await geocode(q));
      if (cache.size > 300) cache.delete(cache.keys().next().value);
    }
    res.json({ data: cache.get(k) });
  } catch (e) { console.warn('[geo] search failed:', e.message); res.status(502).json({ error: 'Place search is not available right now. Use "Use my location" or pick a city.' }); }
});

module.exports = router;