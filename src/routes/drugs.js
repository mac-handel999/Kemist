'use strict';
const router = require('express').Router();
const store = require('../db');
const { nrnKey, clampInt, cleanText, withVerdict } = require('../lib/helpers');
const alertsDb = require('../db/alerts');

const alertView = (a) => ({ id: a.id, alert_no: a.alert_no, title: a.title, alert_type: a.alert_type, source_url: a.source_url, published_at: a.published_at });
const ALERT_NOTE = 'NAFDAC has published an alert that mentions this number. Read it and compare it with your pack: it may describe a counterfeit that copies this number.';
const activeFirst = (rows) => [...rows].sort((a, b) => Number(/inactive|cancel|suspend|withdraw|expired/i.test(a.status || '')) - Number(/inactive|cancel|suspend|withdraw|expired/i.test(b.status || '')));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFETY_NOTE =
  'This confirms a registration record only. It cannot prove that the pack in your hand is genuine, because fake packs can copy real numbers.';

function attachImages(rows) {
  if (!rows.length) return Promise.resolve(rows);
  const ids = rows.map(r => r.id);
  return store.getDrugImages(ids).then(images => {
    const byDrug = new Map();
    for (const img of images) {
      if (!byDrug.has(img.drug_id)) byDrug.set(img.drug_id, []);
      byDrug.get(img.drug_id).push({ url: `${process.env.SUPABASE_URL}/storage/v1/object/public/drug-images/${img.storage_path}`, kind: img.kind, credit: img.credit });
    }
    return rows.map(r => {
      const imgs = byDrug.get(r.id) || [];
      return { ...r, image: imgs[0] || null, images: imgs };
    });
  });
}

// GET /api/drugs?q=paracetamol  (name, ingredient, company or NAFDAC number)
router.get('/', async (req, res, next) => {
  try {
    const q = cleanText(String(req.query.q || ''), 100);
    if (q.length < 2) return res.status(400).json({ error: 'Type at least 2 characters.' });
    const limit = clampInt(req.query.limit, 1, 50, 20);
    const offset = clampInt(req.query.offset, 0, 5000, 0);
    const rows = await store.searchDrugs(q, limit, offset);
    const withImages = await attachImages(rows);
    res.json({ query: q, count: withImages.length, data: withImages.map(withVerdict) });
  } catch (e) { next(e); }
});

// GET /api/drugs/verify?nrn=A4-7559   exact NAFDAC number check
router.get('/verify', async (req, res, next) => {
  try {
    const nrn = cleanText(String(req.query.nrn || ''), 40);
    const key = nrnKey(nrn);
    if (key.length < 3) return res.status(400).json({ error: 'Enter the NAFDAC registration number printed on the pack.' });
    const rows = activeFirst(await store.findByNrn(key));
    const stats = await store.stats();
    const found_alerts = await alertsDb.byNrnKey(key).catch(() => []);
    const withImages = await attachImages(rows);
    res.json({
      nrn,
      found: rows.length > 0,
      matches: withImages.map(withVerdict),
      alerts: found_alerts.map(alertView),
      alert_note: found_alerts.length ? ALERT_NOTE : null,
      last_synced: stats.last_synced,
      note: SAFETY_NOTE,
      not_found_hint: rows.length ? null :
        'No record with this number in Kemist\'s copy of the NAFDAC Greenbook. Check for typing mistakes, then confirm on NAFDAC\'s own Greenbook before drawing any conclusion.',
    });
  } catch (e) { next(e); }
});

// GET /api/drugs/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid medicine ID.' });
    const row = await store.getDrug(req.params.id);
    if (!row) return res.status(404).json({ error: 'Medicine record not found.' });
    const found_alerts = await alertsDb.byNrnKey(nrnKey(row.nrn)).catch(() => []);
    const withImages = await attachImages([row]);
    res.json({ data: withVerdict(withImages[0]), note: SAFETY_NOTE, alerts: found_alerts.map(alertView), alert_note: found_alerts.length ? ALERT_NOTE : null });
  } catch (e) { next(e); }
});

// GET /api/drugs/:id/similar   other registered brands with the same active ingredient(s)
router.get('/:id/similar', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid medicine ID.' });
    const rows = await store.similarDrugs(req.params.id, clampInt(req.query.limit, 1, 60, 30));
    const withImages = await attachImages(rows);
    res.json({ count: withImages.length, data: withImages.map(withVerdict) });
  } catch (e) { next(e); }
});

module.exports = router;