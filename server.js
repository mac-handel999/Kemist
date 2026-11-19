'use strict';
require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const store = require('./src/db');

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');

// Map tile host(s) allowed by CSP img-src. Parsed from MAP_TILE_URL (or GEOAPIFY_API_KEY) so a
// custom tile provider is automatically permitted to load tiles.
const TILE_HOSTS = (() => {
  const u = process.env.GEOAPIFY_API_KEY
    ? 'https://maps.geoapify.com/v1/tile/carto/{z}/{x}/{y}.png'
    : process.env.MAP_TILE_URL;
  if (!u) return ['https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'];
  try { return [new URL(u).origin, `${new URL(u).origin}/*`]; }
  catch { return []; }
})();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://cdnjs.cloudflare.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://cdnjs.cloudflare.com', ...TILE_HOSTS],
      'connect-src': ["'self'"],
      'worker-src': ["'self'"],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginEmbedderPolicy: false,
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
  app.listen(port, async () => {
    console.log(`Kemist running at http://localhost:${port}  (data: ${store.mode})`);
    if (store.mode === 'demo') {
      console.log('Demo mode: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env to use your own database.');
    } else {
      // Cheap startup probe: fail fast with a clear message if the tables are missing or the key is wrong.
      try {
        await store.stats();
      } catch (e) {
        console.error('Supabase is connected but the Kemist tables are missing or the key is wrong. Run supabase/schema.sql in the Supabase SQL Editor, then check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        console.error('Underlying error:', e.message);
      }
    }
  });
}
module.exports = app;
