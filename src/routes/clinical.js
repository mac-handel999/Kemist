'use strict';
const router = require('express').Router();
const store = require('../db');
const clinical = require('../db/clinical');
const { singleIngredientKey, canonicalIngredient } = require('../lib/ingredients');
const { cleanText, withVerdict } = require('../lib/helpers');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE =
  'This is information from a United States drug label for the same active ingredient. It is not the NAFDAC-approved ' +
  'leaflet for this product, and strengths, uses and advice can differ in Nigeria. It is not medical advice. ' +
  'Ask a pharmacist or doctor before you take any medicine.';

const DAILYMED_NOTE = 'Images are from the DailyMed label (US FDA) and may not represent the exact product packaging available in Nigeria.';

const sectionsOf = (r) => ({ indications: r.indications, contraindications: r.contraindications, warnings: r.warnings, adverse_reactions: r.adverse_reactions, interactions: r.interactions });

function enrichWithMedia(labels) {
  const setids = labels.filter(l => l.source_record_id).map(l => l.source_record_id);
  if (!setids.length) return Promise.resolve(labels.map(l => ({ ...l, media: [] })));
  return clinical.getMediaBatch(setids).then(mediaMap => labels.map(l => ({
    ...l,
    media: l.source_record_id ? (mediaMap.get(l.source_record_id) || []) : [],
  })));
}

// GET /api/clinical/by-drug/:id  -> US label information for the drug's single active ingredient
router.get('/by-drug/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid medicine ID.' });
    const drug = await store.getDrug(req.params.id);
    if (!drug) return res.status(404).json({ error: 'Medicine record not found.' });

    const key = singleIngredientKey(drug.active_ingredients);
    if (!key) return res.json({ matched: false, reason: 'combination_or_unknown_ingredient', labels: [], note: NOTE });

    const rows = await clinical.getByIngredient(key, 1);
    const labels = rows.map((r) => ({
      source: r.source, jurisdiction: r.jurisdiction, title: r.title, effective_date: r.effective_date,
      label_version: r.label_version, source_url: r.source_url, source_record_id: r.source_record_id,
      sections: sectionsOf(r),
    }));
    const enriched = await enrichWithMedia(labels);
    res.json({
      matched: rows.length > 0,
      ingredient_key: key,
      reason: rows.length ? null : 'no_label_imported',
      note: NOTE,
      dailyMedNote: DAILYMED_NOTE,
      labels: enriched,
    });
  } catch (e) { next(e); }
});

// GET /api/clinical/ingredients?q=para : the library index
router.get('/ingredients', async (req, res, next) => {
  try {
    const rows = await clinical.listIngredients(cleanText(String(req.query.q || ''), 60));
    // Sort alphabetically by ingredient_key for consistent A-Z grouping
    rows.sort((a, b) => a.ingredient_key.localeCompare(b.ingredient_key));
    res.json({ count: rows.length, data: rows, note: NOTE });
  } catch (e) { next(e); }
});

// GET /api/clinical/ingredient/paracetamol : US label text + Nigerian registered products with this single ingredient
// Query params: label_index (0-based), limit (default 3, max 10)
router.get('/ingredient/:key', async (req, res, next) => {
  try {
    const key = canonicalIngredient(cleanText(String(req.params.key || ''), 60));
    if (!key) return res.status(400).json({ error: 'Invalid ingredient.' });

    const labelLimit = Math.min(Math.max(parseInt(req.query.limit) || 3, 1), 10);
    const labelIndex = Math.max(parseInt(req.query.label_index) || 0, 0);

    // Get all labels first to know total count, then slice for pagination
    const allLabels = await clinical.getByIngredient(key, labelLimit + labelIndex);
    if (!allLabels.length) return res.status(404).json({ error: 'No label information for this ingredient yet.' });

    const labels = allLabels.slice(labelIndex, labelIndex + labelLimit);

    const found = await store.searchDrugs(key, 50, 0);
    const products = found.filter((d) => singleIngredientKey(d.active_ingredients) === key).slice(0, 30).map(withVerdict);

    const enrichedLabels = labels.map((r) => ({ source: r.source, jurisdiction: r.jurisdiction, title: r.title, effective_date: r.effective_date, label_version: r.label_version, source_url: r.source_url, source_record_id: r.source_record_id, sections: sectionsOf(r) }));
    const enriched = await enrichWithMedia(enrichedLabels);

    res.json({
      count: allLabels.length,
      label_index: labelIndex,
      label_limit: labelLimit,
      data: enriched,
      ingredient_key: key,
      note: NOTE,
      dailyMedNote: DAILYMED_NOTE,
      products,
    });
  } catch (e) { next(e); }
});

module.exports = router;