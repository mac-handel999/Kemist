'use strict';
const router = require('express').Router();
const store = require('../db');

// GET /api/alerts?search=&status=active&type=&severity=&limit=50&offset=0
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.search || '').trim();
    const status = String(req.query.status || 'active');
    const type = req.query.type ? String(req.query.type) : null;
    const severity = req.query.severity ? String(req.query.severity) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error } = await store.client.rpc('search_medicine_alerts', {
      q, p_status: status, p_alert_type: type, p_severity: severity, lim: limit, off_set: offset
    });
    if (error) throw new Error(`search_medicine_alerts: ${error.message}`);

    res.json({ data: data || [], count: (data || []).length });
  } catch (e) { next(e); }
});

// GET /api/alerts/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await store.client
      .from('medicine_alerts')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(`get alert: ${error.message}`);
    if (!data) return res.status(404).json({ error: 'Alert not found' });
    res.json(data);
  } catch (e) { next(e); }
});

// POST /api/alerts (admin only - would need auth middleware in production)
router.post('/', async (req, res, next) => {
  try {
    const {
      alert_type, severity, title, description, product_name, nrn,
      batch_numbers, active_ingredients, strength, dosage_form,
      manufacturer, manufacturer_country, source, source_url, source_date,
      affected_countries, expires_at
    } = req.body;

    if (!alert_type || !severity || !title || !description || !source) {
      return res.status(400).json({ error: 'Required fields: alert_type, severity, title, description, source' });
    }

    const { data, error } = await store.client
      .from('medicine_alerts')
      .insert({
        alert_type, severity, title, description, product_name, nrn,
        batch_numbers, active_ingredients, strength, dosage_form,
        manufacturer, manufacturer_country, source, source_url, source_date,
        affected_countries, expires_at
      })
      .select()
      .single();
    if (error) throw new Error(`create alert: ${error.message}`);

    res.status(201).json(data);
  } catch (e) { next(e); }
});

// PATCH /api/alerts/:id (admin only)
router.patch('/:id', async (req, res, next) => {
  try {
    const updates = req.body;
    delete updates.id;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await store.client
      .from('medicine_alerts')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`update alert: ${error.message}`);
    if (!data) return res.status(404).json({ error: 'Alert not found' });
    res.json(data);
  } catch (e) { next(e); }
});

module.exports = router;