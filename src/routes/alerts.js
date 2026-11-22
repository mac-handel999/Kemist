'use strict';
const router = require('express').Router();
const alerts = require('../db/alerts');
const { clampInt, cleanText } = require('../lib/helpers');

const pub = (a) => ({ id: a.id, alert_no: a.alert_no, title: a.title, summary: a.summary, alert_type: a.alert_type, nrns: a.nrns || [], batch_numbers: a.batch_numbers || [], published_at: a.published_at, source: a.source, source_url: a.source_url });

// GET /api/alerts?q=&type=counterfeit&limit=30&offset=0
router.get('/', async (req, res, next) => {
  try {
    const type = alerts.TYPES.includes(req.query.type) ? req.query.type : null;
    const rows = await alerts.list({ q: cleanText(String(req.query.q || ''), 80), type, limit: clampInt(req.query.limit, 1, 100, 30), offset: clampInt(req.query.offset, 0, 5000, 0) });
    res.json({ count: rows.length, data: rows.map(pub), source_note: 'Notices published by NAFDAC. Always read the original notice.' });
  } catch (e) { next(e); }
});

module.exports = router;