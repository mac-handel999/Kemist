'use strict';
/**
 * Retrieval for the assistant: find the NAFDAC records, US label text and NAFDAC alerts that relate to a question.
 * No embeddings needed for this stage: we search the same database the rest of the app uses.
 * Dosing is never retrieved (it is not stored).
 */
const store = require('../db');
const clinical = require('../db/clinical');
const alertsDb = require('../db/alerts');
const { canonicalIngredient, singleIngredientKey } = require('./ingredients');
const { nrnKey, cleanProductName } = require('./helpers');

const STOP = new Set(('what whats which who whom whose this that these those with without from have has had does did doing about into your you are is was were the and for can could should would will shall may might not any some how why when where tell me please give show list there their them then than also very much many more most other another take taking taken used use using safe safety okay fine ok drug drugs medicine medicines medication tablet tablets capsule capsules syrup injection dose doses dosage thing things need needs want know like just only really one two get got been being does is it its im ive').split(/\s+/));
const NRN_LETTER = /\b([A-Za-z]{1,2}\d{1,3})\s?[-–]?\s?(\d{3,7})\b/g;     // A4-7559, a4 7559
const NRN_NUMERIC = /\b(\d{2})\s?[-–]\s?(\d{4,6})\b/g;                    // 04-4335 (needs the dash)

const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t; };

function tokens(message) {
  const words = String(message || '').toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
  return [...new Set(words)].slice(0, 6);
}

function nrnsIn(message) {
  const out = new Set();
  for (const re of [NRN_LETTER, NRN_NUMERIC]) for (const m of String(message || '').matchAll(re)) out.add(nrnKey(m[0]));
  return [...out].slice(0, 3);
}

function drugText(d) {
  return [
    `Product: ${cleanProductName(d.product_name)}`, `NAFDAC number: ${d.nrn}`, `Registration status in source: ${d.status}`,
    d.active_ingredients && `Active ingredients: ${d.active_ingredients}`, d.strength && `Strength: ${d.strength}`, d.dosage_form && `Form: ${d.dosage_form}`,
    d.marketing_category && `Sold as: ${d.marketing_category}`, d.applicant && `Applicant: ${d.applicant}`, d.manufacturer && `Manufacturer: ${d.manufacturer}`,
    d.approval_date && `Approved: ${String(d.approval_date).slice(0, 10)}`, d.expiry_date && `Registration expires: ${String(d.expiry_date).slice(0, 10)}`,
  ].filter(Boolean).join(' | ');
}

function labelText(l) {
  const parts = [['Used for', l.indications], ['Who should not use it', l.contraindications], ['Warnings', l.warnings], ['Side effects', l.adverse_reactions], ['Interactions', l.interactions]]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${cut(v, 600)}`);
  return `US drug label information (openFDA, not NAFDAC; may differ in Nigeria) for ${l.ingredient_label || l.ingredient_key}. ${parts.join(' | ')}`;
}

function alertText(a) {
  return [`NAFDAC alert: ${a.title}`, `Type: ${a.alert_type}`, a.published_at && `Date: ${String(a.published_at).slice(0, 10)}`, (a.nrns || []).length && `Registration numbers mentioned: ${a.nrns.join(', ')}`, a.summary && `Summary: ${cut(a.summary, 300)}`].filter(Boolean).join(' | ');
}

/**
 * @returns {Promise<{sources: {id:string, kind:string, title:string, link:string|null, external?:boolean, text:string}[], flags:{nrns:string[]}}>}
 */
async function retrieve(message, { maxChars = 9000 } = {}) {
  const sources = [];
  const seen = new Set();
  const add = (kind, key, title, link, text, external = false) => {
    if (seen.has(`${kind}:${key}`) || sources.length >= 10) return;
    seen.add(`${kind}:${key}`);
    sources.push({ id: `S${sources.length + 1}`, kind, title, link, external, text });
  };

  const nrns = nrnsIn(message);
  for (const key of nrns) {
    for (const d of (await store.findByNrn(key)).slice(0, 3)) add('drug', d.id, cleanProductName(d.product_name), `#/drug/${d.id}`, drugText(d));
    for (const a of (await alertsDb.byNrnKey(key).catch(() => [])).slice(0, 2)) add('alert', a.id, a.title, a.source_url, alertText(a), true);
  }

  const words = tokens(message);
  const ingredientKeys = new Set((await clinical.listIngredients('').catch(() => [])).map((x) => x.ingredient_key));
  const matchedKeys = [...new Set(words.map((w) => canonicalIngredient(w)).filter((k) => ingredientKeys.has(k)))].slice(0, 2);
  for (const k of matchedKeys) {
    const [label] = await clinical.getByIngredient(k, 1).catch(() => []);
    if (label) add('label', k, `US label information: ${label.ingredient_label || k}`, `#/library/${encodeURIComponent(k)}`, labelText(label));
  }

  for (const w of words.slice(0, 3)) {
    for (const d of (await store.searchDrugs(w, 4, 0).catch(() => []))) {
      add('drug', d.id, cleanProductName(d.product_name), `#/drug/${d.id}`, drugText(d));
      if (sources.length >= 6) break;
    }
    for (const a of (await alertsDb.list({ q: w, limit: 2 }).catch(() => []))) add('alert', a.id, a.title, a.source_url, alertText(a), true);
  }

  // keep within the size budget (drop later sources first)
  let total = 0;
  const kept = [];
  for (const s of sources) { total += s.text.length; if (total > maxChars) break; kept.push(s); }
  return { sources: kept, flags: { nrns } };
}

module.exports = { retrieve, tokens, nrnsIn, singleIngredientKey };
