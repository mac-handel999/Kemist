'use strict';
const store = require('./index');
const { singleIngredientKey } = require('../lib/ingredients');

let demoRows = [];
if (store.mode !== 'supabase') {
  try { demoRows = require('../../data/sample-clinical.json'); } catch { demoRows = []; }
}

const DAILYMED_BASE = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';

async function fetchMediaFromDailyMed(setid) {
  const url = `${DAILYMED_BASE}/spls/${encodeURIComponent(setid)}/media.json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Kemist/0.1' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`DailyMed media ${res.status}`);
  return res.json();
}

async function cacheMedia(setid, splVersion, media) {
  if (store.mode !== 'supabase') return;
  const rows = (media || []).filter(m => m.mime_type?.startsWith('image/')).map(m => ({
    setid,
    spl_version: splVersion,
    image_name: m.name,
    mime_type: m.mime_type,
    image_url: m.url,
    source_url: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(setid)}`,
  }));
  if (!rows.length) return;
  const { error } = await store.client.from('dailymed_media').upsert(rows, { onConflict: 'setid,image_name', ignoreDuplicates: true });
  if (error) throw new Error(`dailymed_media upsert: ${error.message}`);
}

async function getCachedMedia(setid) {
  if (store.mode !== 'supabase') return [];
  const { data, error } = await store.client.from('dailymed_media')
    .select('image_name,mime_type,image_url,source_url')
    .eq('setid', setid);
  if (error) {
    if (error.code === 'PGRST205') return [];
    throw new Error(`dailymed_media: ${error.message}`);
  }
  return data || [];
}

async function getMediaForSetids(setids) {
  if (!setids.length || store.mode !== 'supabase') return new Map();
  const { data, error } = await store.client.from('dailymed_media')
    .select('setid,image_name,mime_type,image_url,source_url')
    .in('setid', setids);
  if (error) {
    if (error.code === 'PGRST205') return new Map();
    throw new Error(`dailymed_media: ${error.message}`);
  }
  const map = new Map();
  for (const m of data || []) {
    if (!map.has(m.setid)) map.set(m.setid, []);
    map.get(m.setid).push({ name: m.image_name, mime: m.mime_type, url: m.image_url, source: m.source_url });
  }
  return map;
}

module.exports = {
  mode: store.mode,

  async getByIngredient(key, limit = 2) {
    if (store.mode === 'supabase') {
      const { data, error } = await store.client.from('clinical_info').select('*')
        .ilike('ingredient_key', key).order('effective_date', { ascending: false, nullsFirst: false }).limit(limit);
      if (error) throw new Error(`clinical_info: ${error.message}`);
      return data || [];
    }
    return demoRows.filter((r) => r.ingredient_key.toLowerCase() === key.toLowerCase()).slice(0, limit);
  },

  /** One entry per ingredient that has label text. */
  async listIngredients(q = '') {
    let rows;
    if (store.mode === 'supabase') {
      const { data, error } = await store.client.from('clinical_info').select('ingredient_key,ingredient_label,effective_date,source').limit(5000);
      if (error) throw new Error(`clinical_info: ${error.message}`);
      rows = data || [];
    } else rows = demoRows;
    const map = new Map();
    for (const r of rows) {
      const cur = map.get(r.ingredient_key) || { ingredient_key: r.ingredient_key, label: r.ingredient_label || r.ingredient_key, labels: 0, latest: null, source: r.source };
      cur.labels++;
      if (r.effective_date && (!cur.latest || r.effective_date > cur.latest)) cur.latest = r.effective_date;
      map.set(r.ingredient_key, cur);
    }
    const term = String(q).toLowerCase().trim();
    return [...map.values()].filter((x) => !term || x.ingredient_key.includes(term) || String(x.label).toLowerCase().includes(term)).sort((a, b) => a.ingredient_key.localeCompare(b.ingredient_key));
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

  // DailyMed media
  async fetchAndCacheMedia(setid, splVersion) {
    try {
      const res = await fetchMediaFromDailyMed(setid);
      const media = res?.data?.media || [];
      await cacheMedia(setid, splVersion, media);
      return media.filter(m => m.mime_type?.startsWith('image/')).map(m => ({ name: m.name, mime: m.mime_type, url: m.url, source: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(setid)}` }));
    } catch (e) {
      return [];
    }
  },

  async getMedia(setid) {
    const cached = await getCachedMedia(setid);
    if (cached.length) return cached.map(m => ({ name: m.image_name, mime: m.mime_type, url: m.image_url, source: m.source_url }));
    // Try to fetch if not cached (will cache for next time)
    const labels = await this.getByIngredient(''); // dummy call to check mode
    return [];
  },

  async getMediaBatch(setids) {
    return getMediaForSetids(setids);
  },
};
