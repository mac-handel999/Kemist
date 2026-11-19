'use strict';
/**
 * Demo store: used automatically when Supabase is not configured.
 * Nothing is saved to disk; data resets when the server restarts.
 */
const path = require('node:path');
const { normalizeNafdacRecord } = require('../lib/nafdac');
const { nrnKey, haversineM, withVerdict } = require('../lib/helpers');
const crypto = require('node:crypto');

const drugs = [];
const facilities = new Map();   // osm_id -> facility
const cells = new Map();        // cell -> fetched_at ms
const reports = [];

for (const raw of require(path.join(__dirname, '..', '..', 'data', 'sample-drugs.json'))) {
  const r = normalizeNafdacRecord(raw, { source: 'Demo sample' });
  if (!r.ok) continue;
  const row = { id: crypto.randomUUID(), ...r.row };
  row.nrn_key = nrnKey(row.nrn);
  row.ingredients_key = (row.active_ingredients || '').toLowerCase().replace(/[^a-z0-9;]/g, '');
  row.search_text = [row.product_name, row.active_ingredients, row.applicant, row.manufacturer, row.nrn]
    .filter(Boolean).join(' ').toLowerCase();
  drugs.push(row);
}

const trigrams = (s) => {
  const t = new Set();
  const p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
  return t;
};
function similarity(a, b) {
  const A = trigrams(a), B = trigrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

module.exports = {
  mode: 'demo',

  async searchDrugs(q, limit = 20, offset = 0) {
    const term = String(q).trim().toLowerCase();
    const key = nrnKey(q);
    if (term.length < 2) return [];
    let hits = drugs.filter((d) => d.nrn_key === key || d.search_text.includes(term));
    if (!hits.length) {
      // typo tolerance: compare the term with each word of the product name / ingredients
      hits = drugs.filter((d) => d.search_text.split(/[^a-z0-9]+/).some((w) => w.length > 3 && similarity(term, w) >= 0.45));
    }
    hits.sort((a, b) =>
      (b.nrn_key === key) - (a.nrn_key === key) ||
      (b.product_name.toLowerCase().startsWith(term)) - (a.product_name.toLowerCase().startsWith(term)) ||
      a.product_name.localeCompare(b.product_name));
    return hits.slice(offset, offset + limit);
  },

  async findByNrn(key) { return drugs.filter((d) => d.nrn_key === key); },
  async getDrug(id) { return drugs.find((d) => d.id === id) || null; },

  async similarDrugs(id, limit = 30) {
    const d = drugs.find((x) => x.id === id);
    if (!d || !d.ingredients_key) return [];
    return drugs
      .filter((x) => x.id !== id && x.ingredients_key === d.ingredients_key)
      .sort((a, b) =>
        ((b.dosage_form || '') === (d.dosage_form || '')) - ((a.dosage_form || '') === (d.dosage_form || '')) ||
        ((b.strength || '') === (d.strength || '')) - ((a.strength || '') === (d.strength || '')) ||
        a.product_name.localeCompare(b.product_name))
      .slice(0, limit);
  },

  async stats() {
    return { drug_count: drugs.length, last_synced: null, mode: 'demo' };
  },

  async nearbyFacilities({ lat, lng, radius, types, limit = 60 }) {
    return [...facilities.values()]
      .filter((f) => !types || types.includes(f.type))
      .map((f) => ({ ...f, distance_m: haversineM(lat, lng, f.lat, f.lng) }))
      .filter((f) => f.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limit);
  },

  async upsertFacilities(rows) {
    for (const r of rows) {
      const prev = facilities.get(r.osm_id);
      facilities.set(r.osm_id, { id: prev?.id || crypto.randomUUID(), is_verified: false, ...prev, ...r });
    }
  },

  async cellFetchedRecently(cell, ttlMs) {
    const t = cells.get(cell);
    return Boolean(t && Date.now() - t < ttlMs);
  },
  async markCellFetched(cell) { cells.set(cell, Date.now()); },

  async insertReport(report) {
    const row = { id: crypto.randomUUID(), status: 'new', created_at: new Date().toISOString(), ...report };
    reports.push(row);
    return { id: row.id };
  },

  // exposed for tests
  _withVerdict: withVerdict,
};
