# Kemist add-on: Google Maps facilities via SerpApi (POC)

New files only: copy the folders in this zip into the project root (nothing is overwritten), then make the edits below.

## 1. Database
Run `supabase/003_serpapi.sql` once in the Supabase SQL Editor (adds the API-call counter and makes the map query return each listing's source).

## 2. Small edits to existing files
1. `src/lib/facilities.js`
   - add near the top: `const { dedupeFacilities } = require('./dedupe');`
   - in `nearby()`, replace
     `const facilities = await store.nearbyFacilities({ lat, lng, radius: r, types, limit });`
     with
     `const found = await store.nearbyFacilities({ lat, lng, radius: r, types, limit });`
     `const facilities = dedupeFacilities(found);`
2. `src/routes/facilities.js`: change the `attribution` text to: `'Facility data from OpenStreetMap contributors and Google Maps listings. Listings can be incomplete or out of date: call before you travel.'`
3. `public/js/app.js`: in the facility list, the line `h('div', { class: 'meta' }, [LABEL[f.type], f.emergency && 'Emergency', f.opening_hours === '24/7' && 'Open 24 hours'].filter(Boolean).join(' · ')),`
   gets one more item before `.filter(Boolean)`: `f.source && !/OpenStreetMap/i.test(f.source) && 'Google Maps listing, not verified'`
4. `package.json` scripts: add `"import:serpapi": "node scripts/import-serpapi.js"`
5. `.env`: add `SERPAPI_API_KEY=` (from https://serpapi.com/manage-api-key) and `SERPAPI_MONTHLY_LIMIT=240`

## 3. Use it
- Preview (calls nothing): `npm run import:serpapi -- --city ibadan --queries pharmacy,hospital --dry`
- Small real run: `npm run import:serpapi -- --city ibadan --queries pharmacy --max-calls 10`
- Offline test: `npm run import:serpapi -- --file tests/fixtures/serpapi-sample.json`
- GitHub Actions: add secret `SERPAPI_API_KEY`, then Actions > "Import Google Maps facilities (SerpApi)" > Run workflow (manual only).
- Tests: `npm test`

## How it behaves
- Visitors never trigger SerpApi calls; the app reads your database.
- Every attempted call is counted in `api_usage`; the importer stops at `SERPAPI_MONTHLY_LIMIT` (free plan = 250/month).
- Cells nearest the city centre are searched first. One call returns up to 20 listings.
- Rows are labelled "Google Maps (via SerpApi)", never marked verified, and shown in the app as "Google Maps listing, not verified".
- Near-identical entries from OpenStreetMap and Google are merged when shown.
- Only essentials are stored: name, type, address, phone, weekly hours, coordinates, listing ID. No photos or reviews, and no live "open now" text.
- Off switch: `delete from facilities where source like 'Google Maps%';`
