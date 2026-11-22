'use strict';
const store = require('./index');
const CATEGORIES = ['nigeria', 'pharmacy', 'safety', 'outbreak', 'world'];
const mem = [];
const clean = (q) => String(q || '').replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const byDate = (a, b) => String(b.published_at || b.fetched_at).localeCompare(String(a.published_at || a.fetched_at));

module.exports = {
  mode: store.mode,
  CATEGORIES,

  async list({ category = null, q = '', limit = 20, offset = 0 } = {}) {
    const term = clean(q);
    if (store.mode === 'supabase') {
      let query = store.client.from('news_articles').select('*').order('published_at', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);
      if (category && CATEGORIES.includes(category)) query = query.eq('category', category);
      if (term) query = query.ilike('title', `%${term}%`);
      const { data, error } = await query;
      if (error) throw new Error(`news_articles: ${error.message} (did you run supabase/005_news.sql?)`);
      return data || [];
    }
    return mem.filter((a) => (!category || a.category === category) && (!term || a.title.toLowerCase().includes(term.toLowerCase()))).sort(byDate).slice(offset, offset + limit);
  },

  async lastFetched() {
    if (store.mode === 'supabase') {
      const { data } = await store.client.from('news_articles').select('fetched_at').order('fetched_at', { ascending: false }).limit(1);
      return (data && data[0] && data[0].fetched_at) || null;
    }
    return mem.length ? mem.map((a) => a.fetched_at).sort().pop() : null;
  },

  async upsertMany(rows) {
    if (!rows.length) return 0;
    if (store.mode === 'supabase') {
      const { error } = await store.client.from('news_articles').upsert(rows, { onConflict: 'url' });
      if (error) throw new Error(`news_articles upsert: ${error.message}`);
    } else for (const r of rows) { const i = mem.findIndex((m) => m.url === r.url); if (i >= 0) mem[i] = { ...mem[i], ...r }; else mem.push({ id: `demo-news-${mem.length}`, ...r }); }
    return rows.length;
  },
};
