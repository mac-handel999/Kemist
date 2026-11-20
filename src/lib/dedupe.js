'use strict';
/**
 * The same pharmacy often arrives twice (OpenStreetMap and Google). Merge near-identical entries, keeping the richer one.
 * Input must be sorted by distance (as the API returns it).
 */
const { haversineM } = require('./helpers');

const GENERIC = new Set(['pharmacy', 'pharmacies', 'chemist', 'chemists', 'drug', 'drugs', 'store', 'stores', 'shop', 'ltd', 'limited', 'plc', 'and', 'the', 'of', 'nig', 'nigeria', 'hospital', 'clinic', 'medical', 'centre', 'center', 'health', 'care', 'diagnostic', 'laboratory', 'lab', 'labs']);
const UNNAMED = /\(name not listed\)/i;

const words = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !GENERIC.has(w));

function sameName(a, b) {
  if (UNNAMED.test(a) || UNNAMED.test(b)) return true;       // an unnamed place at the same spot is almost surely the named one
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
  const inter = A.filter((w) => B.includes(w)).length;
  return inter / Math.min(A.length, B.length) >= 0.6;        // overlap of the distinctive words
}

const group = (t) => (t === 'clinic' || t === 'doctors' ? 'clinic' : t);
const richness = (f) => (f.phone ? 2 : 0) + (f.opening_hours ? 1 : 0) + (f.address ? 1 : 0) + (UNNAMED.test(f.name) ? -3 : 0);

function dedupeFacilities(list, radiusM = 80) {
  const kept = [];
  for (const f of list) {
    const i = kept.findIndex((k) => group(k.type) === group(f.type) && haversineM(k.lat, k.lng, f.lat, f.lng) <= radiusM && sameName(k.name, f.name));
    if (i === -1) { kept.push(f); continue; }
    if (richness(f) > richness(kept[i])) kept[i] = { ...f, distance_m: Math.min(f.distance_m ?? Infinity, kept[i].distance_m ?? Infinity) };
  }
  return kept;
}

module.exports = { dedupeFacilities, sameName };
