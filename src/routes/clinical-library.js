'use strict';
const router = require('express').Router();
const store = require('../db');

// GET /api/clinical-library?search=&ingredient=&category=&limit=50&offset=0
router.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const ingredient = req.query.ingredient ? String(req.query.ingredient).trim() : null;
    const category = req.query.category ? String(req.query.category).trim() : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    let query = store.client.from('clinical_info').select('*', { count: 'exact' });

    if (ingredient) {
      query = query.eq('ingredient_key', ingredient);
    } else if (search) {
      query = query.or(`ingredient_key.ilike.%${search}%,title.ilike.%${search}%,indications.ilike.%${search}%,contraindications.ilike.%${search}%,warnings.ilike.%${search}%,adverse_reactions.ilike.%${search}%`);
    }

    if (category) {
      // Category filtering could be added via a tags/category column in the future
    }

    query = query.order('effective_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`clinical_info: ${error.message}`);

    res.json({ data: data || [], count: count || 0, total: count || 0 });
  } catch (e) { next(e); }
});

// GET /api/clinical-library/ingredients - list all ingredients with label counts
router.get('/ingredients', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Number(req.query.limit) || 100, 200);

    let query = store.client
      .from('clinical_info')
      .select('ingredient_key, ingredient_label', { count: 'exact' });

    if (search) {
      query = query.ilike('ingredient_key', `%${search}%`);
    }

    // We need to aggregate in JS since Supabase doesn't support GROUP BY directly in this way
    const { data, error } = await query.limit(5000);
    if (error) throw new Error(`clinical_info: ${error.message}`);

    // Aggregate by ingredient
    const counts = new Map();
    for (const row of data || []) {
      const key = row.ingredient_key;
      if (!counts.has(key)) {
        counts.set(key, { ingredient_key: key, ingredient_label: row.ingredient_label, count: 0 });
      }
      counts.get(key).count++;
    }

    let ingredients = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    res.json({ data: ingredients, total: ingredients.length });
  } catch (e) { next(e); }
});

// GET /api/clinical-library/categories - list clinical categories (from sections that have content)
router.get('/categories', async (req, res, next) => {
  try {
    const categories = [
      { key: 'indications', label: 'Indications & Uses', description: 'What the medicine is used for' },
      { key: 'dosage', label: 'Dosage & Administration', description: 'How to take the medicine' },
      { key: 'contraindications', label: 'Contraindications', description: 'When not to use the medicine' },
      { key: 'warnings', label: 'Warnings & Precautions', description: 'Important safety warnings' },
      { key: 'adverse_reactions', label: 'Adverse Reactions', description: 'Known side effects' },
      { key: 'interactions', label: 'Drug Interactions', description: 'Interactions with other medicines' },
      { key: 'use_in_specific_populations', label: 'Use in Specific Populations', description: 'Pregnancy, pediatric, geriatric use' },
      { key: 'pharmacology', label: 'Clinical Pharmacology', description: 'Mechanism of action, pharmacokinetics' },
    ];
    res.json({ data: categories });
  } catch (e) { next(e); }
});

// GET /api/clinical-library/sections/:ingredient - get all sections for a specific ingredient
router.get('/sections/:ingredient', async (req, res, next) => {
  try {
    const ingredient = String(req.params.ingredient).trim();
    const { data, error } = await store.client
      .from('clinical_info')
      .select('*')
      .eq('ingredient_key', ingredient)
      .order('effective_date', { ascending: false });
    if (error) throw new Error(`clinical_info: ${error.message}`);

    // Group by section
    const sections = {
      indications: [],
      dosage: [],
      contraindications: [],
      warnings: [],
      adverse_reactions: [],
      interactions: [],
      use_in_specific_populations: [],
      pharmacology: [],
    };
    for (const row of data || []) {
      for (const key of Object.keys(sections)) {
        if (row[key]) sections[key].push(row);
      }
    }
    res.json({ data: sections, ingredient });
  } catch (e) { next(e); }
});

// Also support the /library prefix for backward compatibility
router.get('/library', async (req, res, next) => {
  req.url = '/';
  router.handle(req, res, next);
});

router.get('/library/ingredients', async (req, res, next) => {
  req.url = '/ingredients';
  router.handle(req, res, next);
});

router.get('/library/categories', async (req, res, next) => {
  req.url = '/categories';
  router.handle(req, res, next);
});

router.get('/library/sections/:ingredient', async (req, res, next) => {
  req.url = `/sections/${req.params.ingredient}`;
  router.handle(req, res, next);
});

module.exports = router;