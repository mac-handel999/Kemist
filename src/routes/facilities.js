'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const facilities = require('../lib/facilities');

const TYPES = ['pharmacy', 'hospital', 'clinic', 'doctors', 'laboratory'];
// Stricter limit: a lookup in a new area can trigger a fetch from OpenStreetMap
const limiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false });

// GET /api/facilities/nearby?lat=6.52&lng=3.37&radius=3000&types=pharmacy,hospital
router.get('/nearby', limiter, async (req, res, next) => {
  try {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'A valid lat and lng are required.' });
    }
    const radius = Number(req.query.radius) || 3000;
    const types = String(req.query.types || '').split(',').map((t) => t.trim()).filter((t) => TYPES.includes(t));
    const result = await facilities.nearby({ lat, lng, radius, types: types.length ? types : null, limit: 80 });
    res.json({
      count: result.facilities.length,
      radius_m: result.radius_m,
      data: result.facilities,
      note: result.note,
      attribution: 'Facility data from OpenStreetMap contributors and Google Maps listings. Listings can be incomplete or out of date: call before you travel.',
    });
  } catch (e) { next(e); }
});

module.exports = router;
