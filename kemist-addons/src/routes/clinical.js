'use strict';
const router = require('express').Router();
const store = require('../db');
const clinical = require('../db/clinical');
const { singleIngredientKey } = require('../lib/ingredients');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE =
  'This is information from a United States drug label for the same active ingredient. It is not the NAFDAC-approved ' +
  'leaflet for this product, and strengths, uses and advice can differ in Nigeria. It is not medical advice. ' +
  'Ask a pharmacist or doctor before you take any medicine.';

// GET /api/clinical/by-drug/:id  -> US label information for the drug's single active ingredient
router.get('/by-drug/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid medicine ID.' });
    const drug = await store.getDrug(req.params.id);
    if (!drug) return res.status(404).json({ error: 'Medicine record not found.' });

    const key = singleIngredientKey(drug.active_ingredients);
    if (!key) return res.json({ matched: false, reason: 'combination_or_unknown_ingredient', labels: [], note: NOTE });

    const rows = await clinical.getByIngredient(key, 1);
    res.json({
      matched: rows.length > 0,
      ingredient_key: key,
      reason: rows.length ? null : 'no_label_imported',
      note: NOTE,
      labels: rows.map((r) => ({
        source: r.source, jurisdiction: r.jurisdiction, title: r.title, effective_date: r.effective_date,
        label_version: r.label_version, source_url: r.source_url,
        sections: {
          indications: r.indications, contraindications: r.contraindications, warnings: r.warnings,
          adverse_reactions: r.adverse_reactions, interactions: r.interactions,
        },
      })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
