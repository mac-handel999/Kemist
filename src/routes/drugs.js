'use strict';
const router = require('express').Router();
const store = require('../db');
const { nrnKey, clampInt, cleanText, withVerdict } = require('../lib/helpers');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFETY_NOTE =
  'This confirms a registration record only. It cannot prove that the pack in your hand is genuine, because fake packs can copy real numbers.';

/** Sort key for status: active registrations sort before inactive ones. */
function activeRank(status) {
  const s = String(status || '').toLowerCase();
  if (/(active|registered|valid)/.test(s)) return 3;
  if (/(inactive|cancel|suspend|withdraw|revok|expired)/.test(s)) return 1;
  return 2;
}

// GET /api/drugs?q=paracetamol  (name, ingredient, company or NAFDAC number)
router.get('/', async (req, res, next) => {
  try {
    const q = cleanText(String(req.query.q || ''), 100);
    if (q.length < 2) return res.status(400).json({ error: 'Type at least 2 characters.' });
    const limit = clampInt(req.query.limit, 1, 50, 20);
    const offset = clampInt(req.query.offset, 0, 5000, 0);
    const rows = await store.searchDrugs(q, limit, offset);
    res.json({ query: q, count: rows.length, data: rows.map(withVerdict) });
  } catch (e) { next(e); }
});

// GET /api/drugs/verify?nrn=A4-7559   exact NAFDAC number check
router.get('/verify', async (req, res, next) => {
  try {
    const nrn = cleanText(String(req.query.nrn || ''), 40);
    const key = nrnKey(nrn);
    if (key.length < 3) return res.status(400).json({ error: 'Enter the NAFDAC registration number printed on the pack.' });
    const rows = await store.findByNrn(key);
    // Active registrations first: a renewal usually keeps the same number as the older record.
    rows.sort((a, b) => (activeRank(b.status) - activeRank(a.status)) || a.product_name.localeCompare(b.product_name));
    const stats = await store.stats();
    res.json({
      nrn,
      found: rows.length > 0,
      matches: rows.map(withVerdict),
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
    res.json({ data: withVerdict(row), note: SAFETY_NOTE });
  } catch (e) { next(e); }
});

// GET /api/drugs/:id/similar   other registered brands with the same active ingredient(s)
router.get('/:id/similar', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid medicine ID.' });
    const rows = await store.similarDrugs(req.params.id, clampInt(req.query.limit, 1, 60, 30));
    res.json({ count: rows.length, data: rows.map(withVerdict) });
  } catch (e) { next(e); }
});

module.exports = router;
