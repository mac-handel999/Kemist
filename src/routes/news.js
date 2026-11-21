'use strict';
/**
 * News API routes for health and pharmacy news.
 */

const router = require('express').Router();
const store = require('../db');

// GET /api/news?category=&country=&source_type=&featured=&limit=20&offset=0&q=
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const category = req.query.category ? String(req.query.category) : null;
    const country = req.query.country ? String(req.query.country) : null;
    const sourceType = req.query.source_type ? String(req.query.source_type) : null;
    const featured = req.query.featured ? req.query.featured === 'true' : null;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error } = await store.client.rpc('search_news_articles', {
      q, p_category: category, p_country: country, p_source_type: sourceType, p_featured: featured, lim: limit, off_set: offset
    });
    if (error) throw new Error(`search_news_articles: ${error.message}`);

    res.json({ data: data || [], count: (data || []).length });
  } catch (e) { next(e); }
});

// GET /api/news/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await store.client
      .from('news_articles')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(`get article: ${error.message}`);
    if (!data) return res.status(404).json({ error: 'Article not found' });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/news/sources
router.get('/sources', async (req, res, next) => {
  try {
    const active = req.query.active !== 'false';
    const country = req.query.country ? String(req.query.country) : null;

    const { data, error } = await store.client.rpc('get_news_sources', {
      p_active: active, p_country: country
    });
    if (error) throw new Error(`get_news_sources: ${error.message}`);

    res.json({ data: data || [] });
  } catch (e) { next(e); }
});

// POST /api/admin/news/sync - Trigger news synchronization (admin only)
router.post('/sync', async (req, res, next) => {
  try {
    // In production, add authentication middleware here
    const { query, provider = 'serpapi' } = req.body;
    
    // This would trigger a background job or run inline
    // For now, return a placeholder
    res.json({ 
      message: 'News sync triggered. Use the CLI script: node scripts/sync-news.js',
      query,
      provider
    });
  } catch (e) { next(e); }
});

// GET /api/admin/news/sync-logs
router.get('/sync-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error } = await store.client
      .from('news_sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`get sync logs: ${error.message}`);

    res.json({ data: data || [] });
  } catch (e) { next(e); }
});

module.exports = router;