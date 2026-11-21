'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const store = require('../db');

// Stricter limit for report submission
const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

// POST /api/reports - Submit a medicine report
router.post('/', limiter, async (req, res, next) => {
  try {
    const {
      report_type, product_name, nrn, batch_number, expiry_date,
      manufacturer, where_bought, purchase_date, details, contact, images
    } = req.body;

    if (!report_type || !product_name || !details) {
      return res.status(400).json({ error: 'Required fields: report_type, product_name, details' });
    }

    const { data, error } = await store.client
      .from('medicine_reports')
      .insert({
        report_type, product_name, nrn, batch_number, expiry_date,
        manufacturer, where_bought, purchase_date, details, contact, images: images || []
      })
      .select('id')
      .single();
    if (error) throw new Error(`insert report: ${error.message}`);

    res.status(201).json({ id: data.id, message: 'Report submitted successfully' });
  } catch (e) { next(e); }
});

// GET /api/reports (admin only - would need auth)
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.search || '').trim();
    const status = req.query.status ? String(req.query.status) : null;
    const type = req.query.type ? String(req.query.type) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error } = await store.client.rpc('search_medicine_reports', {
      q, p_status: status, p_report_type: type, lim: limit, off_set: offset
    });
    if (error) throw new Error(`search_medicine_reports: ${error.message}`);

    res.json({ data: data || [], count: (data || []).length });
  } catch (e) { next(e); }
});

// GET /api/reports/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await store.client
      .from('medicine_reports')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(`get report: ${error.message}`);
    if (!data) return res.status(404).json({ error: 'Report not found' });
    res.json(data);
  } catch (e) { next(e); }
});

// PATCH /api/reports/:id (admin only)
router.patch('/:id', async (req, res, next) => {
  try {
    const updates = req.body;
    delete updates.id;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await store.client
      .from('medicine_reports')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`update report: ${error.message}`);
    if (!data) return res.status(404).json({ error: 'Report not found' });
    res.json(data);
  } catch (e) { next(e); }
});

module.exports = router;