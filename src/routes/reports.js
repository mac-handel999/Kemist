'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const store = require('../db');
const { cleanText } = require('../lib/helpers');

const REPORT_TYPES = ['suspected_fake', 'packaging_mismatch', 'adverse_reaction', 'incorrect_record', 'other'];
const limiter = rateLimit({
  windowMs: 60 * 60_000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many reports from this connection. Please try again later.' },
});

// POST /api/reports
router.post('/', limiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ message: 'Report received.' });   // honeypot: bots fill hidden fields

    const report = {
      report_type: REPORT_TYPES.includes(b.report_type) ? b.report_type : 'suspected_fake',
      product_name: cleanText(b.product_name, 150),
      nrn: cleanText(b.nrn, 40) || null,
      where_bought: cleanText(b.where_bought, 200) || null,
      details: cleanText(b.details, 2000),
      contact: cleanText(b.contact, 120) || null,
    };
    if (report.product_name.length < 2) return res.status(400).json({ error: 'Enter the name of the medicine.' });
    if (report.details.length < 10) return res.status(400).json({ error: 'Tell us what looked wrong (at least 10 characters).' });

    const saved = await store.insertReport(report);
    res.status(201).json({ message: 'Report received. Thank you.', id: saved.id });
  } catch (e) { next(e); }
});

module.exports = router;
