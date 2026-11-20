'use strict';
/** Storage for externally sourced facilities (SerpApi) and the monthly API-call counter. */
const store = require('./index');

const memUsage = new Map();

module.exports = {
  mode: store.mode,

  async getUsage(provider, month) {
    if (store.mode === 'supabase') {
      const { data, error } = await store.client.from('api_usage').select('calls').eq('provider', provider).eq('month', month).maybeSingle();
      if (error) throw new Error(`api_usage: ${error.message} (did you run supabase/003_serpapi.sql?)`);
      return data ? data.calls : 0;
    }
    return memUsage.get(`${provider}:${month}`) || 0;
  },

  async addUsage(provider, month, n = 1) {
    const now = (await this.getUsage(provider, month)) + n;
    if (store.mode === 'supabase') {
      const { error } = await store.client.from('api_usage').upsert({ provider, month, calls: now });
      if (error) throw new Error(`api_usage: ${error.message}`);
    } else memUsage.set(`${provider}:${month}`, now);
    return now;
  },

  async upsertFacilities(rows) {
    if (!rows.length) return;
    await store.upsertFacilities(rows);          // same table and conflict key (osm_id) as the OpenStreetMap rows
  },
};
