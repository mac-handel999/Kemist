'use strict';
const router = require('express').Router();
const store = require('../db');

function tileConfig() {
  const geo = process.env.GEOAPIFY_API_KEY;
  const url = process.env.MAP_TILE_URL
    || (geo ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geo}` : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  const attribution = process.env.MAP_TILE_ATTRIBUTION
    || (!process.env.MAP_TILE_URL && geo ? 'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> | &copy; OpenStreetMap contributors' : '&copy; OpenStreetMap contributors');
  return { url, attribution };
}

router.get('/', async (_req, res, next) => {
  try {
    const tiles = tileConfig();
    res.json({
      ...(await store.stats()),
      source: 'NAFDAC Greenbook (registration data)',
      notice: 'A registration record cannot prove that a physical pack is genuine.',
      tile_url: tiles.url,
      tile_attribution: tiles.attribution,
      ai: Boolean(process.env.GROQ_API_KEY || process.env.GROQ_API_KEYS),
    });
  } catch (e) { console.error('[meta] database error:', e.message); next(e); }
});

module.exports = router;
module.exports.tileConfig = tileConfig;