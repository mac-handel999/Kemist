'use strict';
require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const store = require('./src/db');
const { tileConfig } = require('./src/routes/meta');

/** CSP img-src entry for the configured map tile host (supports {s} subdomain templates). */
function tileImgSrc() {
  try {
    const t = tileConfig().url;
    const u = new URL(t.replace('{s}', 'a').replace(/\{[a-z]\}/g, '0'));
    return t.includes('{s}') ? `${u.protocol}//*.${u.hostname.replace(/^a\./, '')}` : u.origin;
  } catch { return null; }
}

/** CSP img-src entry for Supabase storage bucket. */
function supabaseStorageImgSrc() {
  try {
    const u = new URL(process.env.SUPABASE_URL || '');
    return u.origin;
  } catch { return null; }
}

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://cdnjs.cloudflare.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org', 'https://cdnjs.cloudflare.com', tileImgSrc(), supabaseStorageImgSrc()].filter(Boolean),
      'connect-src': ["'self'"],
      'worker-src': ["'self'"],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
app.use(express.json({ limit: '50kb' }));

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'Kemist', database: store.mode }));
app.use('/api/meta', require('./src/routes/meta'));
app.use('/api/drugs', require('./src/routes/drugs'));
app.use('/api/facilities', require('./src/routes/facilities'));
app.use('/api/reports', require('./src/routes/reports'));
app.use('/api/clinical', require('./src/routes/clinical'));
app.use('/api/alerts', require('./src/routes/alerts'));
app.use('/api/news', require('./src/routes/news'));
app.use('/api/geo', require('./src/routes/geo'));
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res, file) {
    if (/sw\.js$|manifest\.json$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

const port = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Kemist running at http://localhost:${port}  (data: ${store.mode})`);
    if (store.mode === 'demo') console.log('Demo mode: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env to use your own database.');
    else {
      store.client.from('drugs').select('id').limit(1).then(({ error }) => {
        if (error) console.error(`Supabase is connected but the Kemist tables are missing or the key is wrong. Run supabase/schema.sql in the Supabase SQL Editor, then check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. (${error.message})`);
      });
    }
  });
}
module.exports = app;