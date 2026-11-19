'use strict';
const router = require('express').Router();
const store = require('../db');

// Tile provider. If GEOAPIFY_API_KEY is set the tile URL is composed server-side so the key
// never reaches the browser; otherwise MAP_TILE_URL/MAP_TILE_ATTRIBUTION take over, defaulting
// to OpenStreetMap.
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || '';
const MAP_TILE_URL = GEOAPIFY_API_KEY
  ? `https://maps.geoapify.com/v1/tile/carto/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`
  : (process.env.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
const MAP_TILE_ATTRIBUTION = process.env.MAP_TILE_ATTRIBUTION || '\u00a9 OpenStreetMap contributors, \u00a9 Geoapify';

router.get('/', async (_req, res, next) => {
  try {
    res.json({
      ...(await store.stats()),
      tile_url: MAP_TILE_URL,
      tile_attribution: MAP_TILE_ATTRIBUTION,
      source: 'NAFDAC Greenbook (registration data)',
      notice: 'A registration record cannot prove that a physical pack is genuine.',
    });
  } catch (e) {
    // Surface the underlying error in the logs so "500 on /api/meta" is diagnosable without
    // digging through the Supabase dashboard.
    console.error('GET /api/meta failed:', e.message);
    next(e);
  }
});
module.exports = router;
