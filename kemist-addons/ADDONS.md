# Kemist add-ons: facility pre-fill + clinical info

New files only. Copy the folders in this zip into your project root (nothing is overwritten), then make the 4 small edits below.

## Wiring (4 edits)
1. `server.js`: add this line next to the other `app.use('/api/...')` routes, before the `/api` 404 handler:
   `app.use('/api/clinical', require('./src/routes/clinical'));`
2. `public/index.html`: add after the app.js script tag:
   `<script src="/js/clinical.js" defer></script>`
3. `public/js/app.js`, in `DrugView`, right after the medicine page has been drawn (after the `put(page, ...)` call, before `view.focus(...)`):
   `document.dispatchEvent(new CustomEvent('kemist:drug-rendered', { detail: { drug: d, page } }));`
4. `package.json` scripts: add
   `"sync:clinical": "node scripts/import-clinical.js"`, `"prefill:facilities": "node scripts/prefill-facilities.js"`, and `"test": "node --test"` (keep an existing test script if you already have one).
   Optional `.env`: `OPENFDA_API_KEY=` (free key raises openFDA's rate limit).

## Database
Run `supabase/002_clinical.sql` once in the Supabase SQL Editor.

## Commands
- Fill the map for a city: `npm run prefill:facilities -- --city lagos` (list: `--list`, everything: `--all`, preview: `--dry`). Safe to stop and rerun.
- Load US label info: `npm run sync:clinical -- --top 50` (the 50 most common single ingredients in your drugs table), or `-- --ingredient paracetamol`. Preview with `--dry`.
- `npm test`

## Rules built in
- Clinical text is shown as "US label information", never as Nigerian prescribing instructions.
- Dosing is not imported or shown. Combination products are skipped until matching can be reviewed.
- Medicines with no imported label simply show no extra section.
