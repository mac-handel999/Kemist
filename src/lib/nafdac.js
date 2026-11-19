'use strict';
const { sha256 } = require('./helpers');

/**
 * Maps one raw record (from the Apify NAFDAC Greenbook actor, a JSON export, etc.)
 * into Kemist's drug row.  Field names are matched loosely (case / punctuation ignored)
 * because we have not pinned the actor's exact output yet.
 * Run `npm run sync:drugs -- --dry` on a few real records and check the printed result.
 */
const KEYS = {
  nrn:          ['nrn', 'registrationnumber', 'nafdacregistrationnumber', 'nafdacnumber', 'regno', 'registrationno'],
  name:         ['productname', 'name', 'brandname', 'product', 'title'],
  status:       ['registrationstatus', 'status'],
  ingredients:  ['activeingredients', 'activeingredient', 'ingredients', 'ingredient', 'composition'],
  strength:     ['strength', 'strengths'],
  form:         ['dosageform', 'form', 'productdescription'],
  route:        ['route', 'routeofadministration', 'roa'],
  atc:          ['atccode', 'atc'],
  category:     ['productcategory', 'category'],
  marketing:    ['marketingcategory', 'marketingstatus'],
  pack:         ['packsize', 'pack'],
  applicant:    ['applicant', 'applicantname', 'applicantcompany'],
  manufacturer: ['manufacturer', 'manufacturername'],
  country:      ['manufacturercountry', 'country'],
  approval:     ['approvedat', 'approvaldate', 'dateapproved', 'approved'],
  expiry:       ['expiresat', 'expirydate', 'expirationdate', 'expiry', 'expires'],
  smpc:         ['smpclink', 'smpcurl', 'smpc'],
  url:          ['detailurl', 'detailpageurl', 'productpageurl', 'productpage', 'producturl', 'url', 'link'],
  id:           ['productid', 'sourcerecordid', 'recordid', 'id'],
};

const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

function asText(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join('; ') || null;
  if (typeof v === 'object') return asText(v.name ?? v.title ?? v.value ?? null);
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s && !/^(n\/?a|null|undefined|-)$/i.test(s) ? s : null;
}

/** Pull a value out of a nested object by trying several dotted paths, then falling back to flat keys. */
function pickNested(raw, paths, keyList) {
  for (const p of paths) {
    const parts = p.split('.');
    let cur = raw;
    let ok = true;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok) { const t = asText(cur); if (t) return t; }
  }
  return null;
}

function toDate(v) {
  const s = asText(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                       // 2019-02-09
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);          // 09/02/2019 (day first)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);                                              // "9 Feb 2019"
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalizeIngredients(v) {
  let parts = Array.isArray(v) ? v.map(asText).filter(Boolean) : String(asText(v) || '').split(/;|\+/);
  if (parts.length === 1 && parts[0].includes(',')) parts = parts[0].split(',');
  const seen = new Map();
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) seen.set(p.toLowerCase(), p);
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join('; ') || null;
}

/** @returns {{ ok: true, row: object } | { ok: false, reason: string }} */
function normalizeNafdacRecord(raw, { source = 'NAFDAC Greenbook' } = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };

  const flat = new Map();
  for (const [k, v] of Object.entries(raw)) flat.set(squash(k), v);
  const pick = (name) => {
    for (const key of KEYS[name]) {
      const t = asText(flat.get(key));
      if (t) return t;
    }
    return null;
  };

  const nrn = pick('nrn');
  const productName = pick('name');
  if (!productName) return { ok: false, reason: 'missing product name' };
  if (!nrn) return { ok: false, reason: 'missing NAFDAC registration number' };

  const ingredientsRaw = KEYS.ingredients.map((k) => flat.get(k)).find((v) => asText(v));
  const strength = pick('strength');
  const dosageForm = pick('form');
  const applicant = pick('applicant');
  const sourceUrl = pick('url');
  // Nested fields: the source nests these inside objects, e.g. manufacturer.country.
  const manufacturerCountry = pickNested(raw, ['manufacturer.country', 'manufacturerCountry', 'country'], KEYS.country);

  // A stable ID from the source. Never use the row position: it changes between runs and would create duplicates.
  const sourceRecordId =
    pick('id') || sourceUrl ||
    `h:${sha256([nrn, productName, strength, dosageForm, applicant].join('|')).slice(0, 24)}`;

  return {
    ok: true,
    row: {
      source,
      source_record_id: sourceRecordId,
      nrn,
      product_name: productName,
      active_ingredients: normalizeIngredients(ingredientsRaw),
      strength,
      dosage_form: dosageForm,
      route: pick('route'),
      atc_code: pick('atc'),
      product_category: pick('category'),
      marketing_category: pick('marketing'),
      pack_size: pick('pack'),
      applicant,
      manufacturer: pick('manufacturer'),
      manufacturer_country: manufacturerCountry,
      approval_date: toDate(pick('approval')),
      expiry_date: toDate(pick('expiry')),
      status: pick('status') || 'Unknown',
      smpc_url: pick('smpc'),
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  };
}

module.exports = { normalizeNafdacRecord, toDate, normalizeIngredients };
