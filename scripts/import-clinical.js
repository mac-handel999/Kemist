'use strict';
/**
 * Import US drug-label information (openFDA) for the active ingredients in your database.
 *
 *   node scripts/import-clinical.js --top 50                       # the 50 most common single ingredients in your drugs table
 *   node scripts/import-clinical.js --ingredient paracetamol --ingredient ibuprofen
 *   node scripts/import-clinical.js --top 50 --dry                 # show what would be saved, write nothing
 *   node scripts/import-clinical.js --file labels.json --ingredient paracetamol   # offline test with openFDA-shaped JSON
 *
 * Only single-ingredient labels are used. Combination products are skipped on purpose (matching them safely needs review).
 * Dosing text is NOT imported.
 */
require('dotenv').config();
const fs = require('node:fs');
const clinical = require('../src/db/clinical');
const { canonicalIngredient } = require('../src/lib/ingredients');
const { fetchLabelsFor, normalizeLabel, isSingleIngredientLabel, sleep } = require('../src/lib/openfda');
const { startJob } = require('../src/lib/jobrun');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opts = (n) => args.flatMap((a, i) => (a === `--${n}` && args[i + 1] ? [args[i + 1]] : []));
const opt = (n, d = null) => opts(n)[0] ?? d;

async function main() {
  const dry = flag('dry');
  const per = Number(opt('per', 2));
  const apiKey = process.env.OPENFDA_API_KEY || null;

  let keys = opts('ingredient').map(canonicalIngredient).filter(Boolean);
  if (opt('top')) keys = keys.concat(await clinical.topIngredientKeys(Number(opt('top'))));
  keys = [...new Set(keys)];
  if (!keys.length) { console.error('Nothing to do. Use --top N or --ingredient name.'); process.exitCode = 1; return; }
  console.log(`Ingredients to look up: ${keys.length}`);

  let fixture = null;
  if (opt('file')) fixture = JSON.parse(fs.readFileSync(opt('file'), 'utf8'));

  const job = await startJob('import-clinical');
  let saved = 0, missing = 0, failed = 0;
  for (const key of keys) {
    try {
      let rows;
      if (fixture) {
        rows = fixture.filter((raw) => isSingleIngredientLabel(raw, key)).map((raw) => normalizeLabel(raw, key)).filter(Boolean).slice(0, per);
      } else {
        rows = await fetchLabelsFor(key, { per, apiKey });
        await sleep(apiKey ? 300 : 700);
      }
      if (!rows.length) { missing++; console.log(`  - ${key}: no single-ingredient US label found`); continue; }
      if (dry) {
        console.log(`  ~ ${key}: ${rows.length} label(s), e.g. "${rows[0].title}" (${rows[0].effective_date || 'no date'})`);
      } else {
        await clinical.upsertMany(rows);
        console.log(`  + ${key}: saved ${rows.length}`);
      }
      saved += rows.length;
    } catch (e) {
      failed++;
      console.error(`  ! ${key}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${dry ? 'Would save' : 'Saved'}: ${saved}. No label: ${missing}. Errors: ${failed}.`);

  await job.finish(failed && !saved ? 'failed' : saved > 0 ? 'success' : 'partial', {
    records_seen: keys.length,
    records_saved: saved,
    errors: failed,
    details: { missing }
  });

  if (failed && !saved) process.exitCode = 1;
}

main().catch((e) => { console.error('Import failed:', e.message); process.exitCode = 1; });