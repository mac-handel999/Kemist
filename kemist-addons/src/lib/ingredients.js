'use strict';
/**
 * Ingredient names differ between Nigeria (mostly INN/British names, e.g. "paracetamol") and the US
 * ("acetaminophen"), and between salts ("tramadol hydrochloride" vs "tramadol").
 * canonicalIngredient() turns either into one stable key, so records can be matched by active ingredient.
 * The canonical key uses the INN / Nigerian name.
 */
const SALT_WORDS = new Set([
  'hydrochloride', 'hcl', 'sodium', 'potassium', 'calcium', 'magnesium', 'sulfate', 'maleate', 'besylate', 'tartrate',
  'citrate', 'phosphate', 'acetate', 'succinate', 'mesylate', 'fumarate', 'hydrobromide', 'dihydrate', 'monohydrate',
  'trihydrate', 'anhydrous', 'bromide', 'chloride', 'nitrate', 'oxide', 'hydroxide', 'carbonate', 'lactate', 'gluconate',
]);

// US / alternative name  ->  canonical (INN / Nigerian) name
const SYNONYMS = {
  acetaminophen: 'paracetamol',
  albuterol: 'salbutamol',
  epinephrine: 'adrenaline',
  norepinephrine: 'noradrenaline',
  frusemide: 'furosemide',
  meperidine: 'pethidine',
  lignocaine: 'lidocaine',
  glyburide: 'glibenclamide',
  rifampin: 'rifampicin',
  amoxycillin: 'amoxicillin',
  'penicillin g': 'benzylpenicillin',
  cyclosporine: 'ciclosporin',
  sulphadoxine: 'sulfadoxine',
  chlorpheniramine: 'chlorphenamine',
  scopolamine: 'hyoscine',
  dextrose: 'glucose',
  'acetylsalicylic acid': 'aspirin',
  'ascorbic acid': 'vitamin c',
  cyanocobalamin: 'vitamin b12',
};

function canonicalIngredient(name) {
  if (!name) return '';
  let s = String(name).toLowerCase()
    .replace(/\([^)]*\)/g, ' ')          // drop "(oral)", "(as hydrochloride)"
    .replace(/sulph/g, 'sulf')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const words = s.split(' ').filter(Boolean);
  const stripped = words.filter((w) => !SALT_WORDS.has(w));
  s = (stripped.length ? stripped : words).join(' ');   // "sodium chloride" stays whole
  return SYNONYMS[s] || s;
}

/** Key for a product with exactly ONE active ingredient. Combination products return null. */
function singleIngredientKey(activeIngredients) {
  const text = String(activeIngredients || '').trim();
  if (!text || /;|\+/.test(text)) return null;
  return canonicalIngredient(text) || null;
}

/** Names to try when searching a US source for a canonical ingredient (US name first). */
function searchNames(key) {
  const names = Object.entries(SYNONYMS).filter(([, canon]) => canon === key).map(([alt]) => alt);
  return [...names, key];
}

module.exports = { canonicalIngredient, singleIngredientKey, searchNames, SYNONYMS };
