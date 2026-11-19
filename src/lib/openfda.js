'use strict';
/**
 * openFDA drug-label client. These are UNITED STATES labels. Kemist shows them as "US label information"
 * and never as Nigerian prescribing instructions. Dosing is intentionally not imported.
 * Docs: https://open.fda.gov/apis/drug/label/
 */
const { canonicalIngredient, searchNames } = require('./ingredients');

const BASE = 'https://api.fda.gov/drug/label.json';
const MAX_SECTION_CHARS = 6000;

const SECTIONS = [
  ['indications', ['indications_and_usage']],
  ['contraindications', ['contraindications']],
  ['warnings', ['warnings_and_cautions', 'warnings_and_precautions', 'warnings']],
  ['adverse_reactions', ['adverse_reactions']],
  ['interactions', ['drug_interactions']],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeTerm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9 \-]/g, ' ').replace(/\s+/g, ' ').trim();

function sectionText(raw, keys) {
  for (const k of keys) {
    const v = raw[k];
    const text = (Array.isArray(v) ? v.join('\n\n') : v ? String(v) : '').replace(/\r/g, '').trim();
    if (text) return text.length > MAX_SECTION_CHARS ? `${text.slice(0, MAX_SECTION_CHARS).trimEnd()}…` : text;
  }
  return null;
}

function effectiveDate(v) {
  const m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Is this a single-ingredient label for the key we asked about? */
function isSingleIngredientLabel(raw, key) {
  const names = raw.openfda && raw.openfda.generic_name;
  if (!Array.isArray(names) || names.length !== 1) return false;
  return canonicalIngredient(names[0]) === key;
}

/** @returns a clinical_info row, or null when the label has no usable text */
function normalizeLabel(raw, key) {
  const setId = raw.set_id || raw.id;
  if (!setId) return null;
  const sections = {};
  for (const [name, keys] of SECTIONS) sections[name] = sectionText(raw, keys);
  if (!sections.indications) return null;                       // we only keep labels that say what the medicine is for
  const brand = raw.openfda && raw.openfda.brand_name && raw.openfda.brand_name[0];
  const generic = raw.openfda && raw.openfda.generic_name && raw.openfda.generic_name[0];
  return {
    ingredient_key: key,
    ingredient_label: generic || key,
    source: 'openFDA',
    source_record_id: String(setId),
    jurisdiction: 'United States',
    title: [brand, generic].filter(Boolean).join(' / ') || key,
    ...sections,
    label_version: raw.version ? String(raw.version) : null,
    effective_date: effectiveDate(raw.effective_time),
    source_url: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(setId)}`,
    fetched_at: new Date().toISOString(),
    review_status: 'unreviewed',
  };
}

async function requestLabels(search, { apiKey, limit = 25 } = {}) {
  const params = new URLSearchParams({ search, limit: String(limit), sort: 'effective_time:desc' });
  if (apiKey) params.set('api_key', apiKey);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}?${params}`, { headers: { 'User-Agent': 'Kemist/0.1' }, signal: AbortSignal.timeout(30000) });
    if (res.status === 404) return [];                           // openFDA answers 404 when nothing matches
    if (res.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`openFDA ${res.status}`);
    return (await res.json()).results || [];
  }
  throw new Error('openFDA rate limit: add OPENFDA_API_KEY to .env or retry later');
}

/** Find up to `per` recent single-ingredient labels for a canonical ingredient key. */
async function fetchLabelsFor(key, { per = 2, apiKey } = {}) {
  for (const name of searchNames(key)) {
    const term = safeTerm(name);
    if (!term) continue;
    // Use case-insensitive match (not .exact:) since openFDA stores generic_name in uppercase
    const results = await requestLabels(`openfda.generic_name:${term}`, { apiKey });
    const rows = [];
    const seen = new Set();
    for (const raw of results) {
      if (!isSingleIngredientLabel(raw, key)) continue;
      const row = normalizeLabel(raw, key);
      if (!row || seen.has(row.source_record_id)) continue;
      seen.add(row.source_record_id);
      rows.push(row);
      if (rows.length >= per) break;
    }
    if (rows.length) return rows;
  }
  return [];
}

module.exports = { fetchLabelsFor, normalizeLabel, isSingleIngredientLabel, sleep };
