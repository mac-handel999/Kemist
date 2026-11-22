'use strict';
const crypto = require('node:crypto');

/** "a4 7559" / "A4-7559" -> "A47559" (used to compare NAFDAC numbers regardless of typing style) */
function nrnKey(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

/** Great-circle distance in metres */
function haversineM(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Remove control characters and trim. Returns '' for non-strings. */
function cleanText(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

/**
 * Turn a drug row into a registration verdict.
 * IMPORTANT: this only describes the REGISTRATION RECORD. It can never prove that a physical pack is genuine.
 */
function verdictFor(drug, now = new Date()) {
  const status = String(drug.status || '').toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = drug.expiry_date ? new Date(`${String(drug.expiry_date).slice(0, 10)}T00:00:00`) : null;
  const expired = expiry && !Number.isNaN(expiry.getTime()) && expiry < today;
  const notActive = /(inactive|cancel|suspend|withdraw|revok|expired)/.test(status);
  const active = !notActive && /(active|registered|valid)/.test(status);

  if (notActive) {
    return { level: 'warn', label: 'Registration is not active',
      reasons: [`NAFDAC lists this registration as "${drug.status}".`] };
  }
  if (expired) {
    return { level: 'warn', label: 'Registration has expired',
      reasons: [`The registration expiry date (${String(drug.expiry_date).slice(0, 10)}) has passed.`] };
  }
  if (active) {
    return { level: 'ok', label: 'Registered with NAFDAC', reasons: [] };
  }
  return { level: 'info', label: 'Registration status not stated',
    reasons: ['The source record does not clearly say whether this registration is active.'] };
}

/** Display-only cleanup of junk in NAFDAC product names ("AMYVIL 25 TABLETS $1", "Rosudex 20 Tablets_"). The stored name is never changed. */
function cleanProductName(name) {
  return String(name || '')
    .replace(/_+/g, ' ')
    .replace(/\s*\$\s*\d+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.,;:]+$/, '')
    .trim();
}

/** Public shape of a drug (drops internal helper columns) */
function publicDrug(row) {
  if (!row) return null;
  const { search_text, nrn_key, ingredients_key, ...rest } = row;
  return { ...rest, display_name: cleanProductName(rest.product_name) };
}

function withVerdict(row) {
  const d = publicDrug(row);
  return d ? { ...d, verdict: verdictFor(d) } : null;
}

module.exports = { nrnKey, sha256, haversineM, clampInt, cleanText, cleanProductName, verdictFor, publicDrug, withVerdict };
