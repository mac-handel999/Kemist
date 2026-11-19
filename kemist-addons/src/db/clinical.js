'use strict';
const store = require('./index');
const { singleIngredientKey } = require('../lib/ingredients');

let demoRows = [];
if (store.mode !== 'supabase') {
  try { demoRows = require('../../data/sample-clinical.json'); } catch { demoRows = []; }
}

module.exports = {
  mode: store.mode,

  async getByIngredient(key, limit = 2) {
    if (store.mode === 'supabase') {
      const { data, error } = await store.client.from('clinical_info').select('*')
        .eq('ingredient_key', key).order('effective_date', { ascending: false, nullsFirst: false }).limit(limit);
      if (error) throw new Error(`clinical_info: ${error.message}`);
      return data || [];
    }
    return demoRows.filter((r) => r.ingredient_key === key).slice(0, limit);
  },

  async upsertMany(rows) {
    if (store.mode !== 'supabase') throw new Error('Supabase is not configured (see .env)');
    const { error } = await store.client.from('clinical_info').upsert(rows, { onConflict: 'source,source_record_id' });
    if (error) throw new Error(`clinical_info upsert: ${error.message}`);
  },

  /** Most common single-ingredient keys among the drugs in the database. */
  async topIngredientKeys(n = 50) {
    const counts = new Map();
    if (store.mode === 'supabase') {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await store.client.from('drugs').select('active_ingredients').range(from, from + 999);
        if (error) throw new Error(`drugs: ${error.message}`);
        for (const r of data) { const k = singleIngredientKey(r.active_ingredients); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
        if (data.length < 1000) break;
      }
    } else {
      for (const r of await store.searchDrugs('a', 50)) { const k = singleIngredientKey(r.active_ingredients); if (k) counts.set(k, 1); }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  },
};
