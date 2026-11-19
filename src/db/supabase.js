'use strict';
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const fail = (error, what) => {
  const e = new Error(`${what}: ${error.message}`);
  e.cause = error;
  throw e;
};

module.exports = {
  mode: 'supabase',
  client: db,

  async searchDrugs(q, limit = 20, offset = 0) {
    const { data, error } = await db.rpc('search_drugs', { q, lim: limit, off_set: offset });
    if (error) fail(error, 'search_drugs');
    return data || [];
  },

  async findByNrn(nrnKey) {
    const { data, error } = await db.from('drugs').select('*').eq('nrn_key', nrnKey).limit(10);
    if (error) fail(error, 'findByNrn');
    return data || [];
  },

  async getDrug(id) {
    const { data, error } = await db.from('drugs').select('*').eq('id', id).maybeSingle();
    if (error) fail(error, 'getDrug');
    return data;
  },

  async similarDrugs(id, limit = 30) {
    const { data, error } = await db.rpc('similar_drugs', { p_id: id, lim: limit });
    if (error) fail(error, 'similar_drugs');
    return data || [];
  },

  async stats() {
    const { count, error } = await db.from('drugs').select('id', { count: 'exact', head: true });
    if (error) fail(error, 'stats count');
    const { data, error: e2 } = await db.from('drugs').select('fetched_at').order('fetched_at', { ascending: false }).limit(1);
    if (e2) fail(e2, 'stats last_synced');
    return { drug_count: count || 0, last_synced: data?.[0]?.fetched_at || null, mode: 'supabase' };
  },

  async nearbyFacilities({ lat, lng, radius, types, limit = 60 }) {
    const { data, error } = await db.rpc('nearby_facilities', {
      in_lat: lat, in_lng: lng, radius_m: Math.round(radius), types: types || null, lim: limit,
    });
    if (error) fail(error, 'nearby_facilities');
    return data || [];
  },

  async upsertFacilities(rows) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      const { error } = await db.from('facilities').upsert(chunk, { onConflict: 'osm_id' });
      if (error) fail(error, 'upsert facilities');
    }
  },

  async cellFetchedRecently(cell, ttlMs) {
    const { data, error } = await db.from('facility_fetch_log').select('fetched_at').eq('cell', cell).maybeSingle();
    if (error) fail(error, 'cell lookup');
    return Boolean(data && Date.now() - new Date(data.fetched_at).getTime() < ttlMs);
  },

  async markCellFetched(cell) {
    const { error } = await db.from('facility_fetch_log').upsert({ cell, fetched_at: new Date().toISOString() });
    if (error) fail(error, 'cell mark');
  },

  async insertReport(report) {
    const { data, error } = await db.from('reports').insert(report).select('id').single();
    if (error) fail(error, 'insert report');
    return { id: data.id };
  },
};
