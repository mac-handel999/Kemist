'use strict';
const router = require('express').Router();
const news = require('../db/news');
const { clampInt, cleanText } = require('../lib/helpers');

const pub = (a) => ({ id: a.id, title: a.title, snippet: a.snippet, url: a.url, publisher: a.publisher, published_at: a.published_at, category: a.category });

// GET /api/news?category=pharmacy&q=nafdac&limit=20&offset=0
router.get('/', async (req, res, next) => {
  try {
    const category = news.CATEGORIES.includes(req.query.category) ? req.query.category : null;
    const rows = await news.list({ category, q: cleanText(String(req.query.q || ''), 80), limit: clampInt(req.query.limit, 1, 50, 20), offset: clampInt(req.query.offset, 0, 2000, 0) });
    res.json({
      count: rows.length, data: rows.map(pub), last_updated: await news.lastFetched(),
      note: 'Headlines found through Google News. Open the publisher for the full story. For official medicine safety notices, see the Safety alerts tab.',
    });
  } catch (e) { next(e); }
});

module.exports = router;