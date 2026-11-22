'use strict';
const store = require('./index');
const { nrnKey } = require('../lib/helpers');

const TYPES = ['counterfeit', 'recall', 'substandard', 'unregistered', 'notice'];
let demo = [];
if (store.mode !== 'supabase') {
  demo = require('../../data/sample-alerts.json').map((a, i) => ({ id: `demo-alert-${i}`, source: 'NAFDAC', ...a }));
}

const dateDesc = (a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')) || String(b.alert_no || '').localeCompare(String(a.alert_no || ''));
const clean = (q) => String(q || '').replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);   // keep user text out of filter syntax

module.exports = {
  mode: store.mode,
  TYPES,

  async list({ q = '', type = null, limit = 30, offset = 0 } = {}) {
    const term = clean(q);
    if (store.mode === 'supabase') {
      let query = store.client.from('alerts').select('*').order('published_at', { ascending: false, nullsFirst: false }).order('alert_no', { ascending: false }).range(offset, offset + limit - 1);
      if (type && TYPES.includes(type)) query = query.eq('alert_type', type);
      if (term) query = query.ilike('title', `%${term}%`);
      const { data, error } = await query;
      if (error) throw new Error(`alerts: ${error.message} (did you run supabase/004_alerts.sql?)`);
      return data || [];
    }
    return demo.filter((a) => (!type || a.alert_type === type) && (!term || a.title.toLowerCase().includes(term.toLowerCase()) || (a.nrn_keys || []).includes(nrnKey(term)))).sort(dateDesc).slice(offset, offset + limit);
  },

  async byNrnKey(key) {
    if (!key) return [];
    if (store.mode === 'supabase') {
      const { data, error } = await store.client.from('alerts').select('*').contains('nrn_keys', [key]).limit(10);
      if (error) throw new Error(`alerts: ${error.message}`);
      return data || [];
    }
    return demo.filter((a) => (a.nrn_keys || []).includes(key));
  },

  async upsertMany(rows) {
    if (store.mode !== 'supabase') throw new Error('Supabase is not configured (see .env)');
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await store.client.from('alerts').upsert(rows.slice(i, i + 200), { onConflict: 'source,source_url' });
      if (error) throw new Error(`alerts upsert: ${error.message}`);
    }
  },
};
