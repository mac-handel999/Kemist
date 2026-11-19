'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { canonicalIngredient, singleIngredientKey, searchNames } = require('../src/lib/ingredients');
const { normalizeLabel, isSingleIngredientLabel } = require('../src/lib/openfda');

test('ingredient names are normalised across Nigerian and US spellings', () => {
  const cases = {
    'Tramadol Hydrochloride': 'tramadol', Paracetamol: 'paracetamol', Acetaminophen: 'paracetamol',
    'Sodium Chloride': 'sodium chloride', 'Magnesium Sulphate': 'magnesium sulfate', 'Amoxicillin Trihydrate': 'amoxicillin',
    Dextrose: 'glucose', Glucose: 'glucose', Rifampin: 'rifampicin', 'Metformin Hydrochloride (oral)': 'metformin',
  };
  for (const [input, expected] of Object.entries(cases)) assert.strictEqual(canonicalIngredient(input), expected, input);
});

test('combination products have no single-ingredient key', () => {
  assert.strictEqual(singleIngredientKey('Glucose; Sodium Chloride'), null);
  assert.strictEqual(singleIngredientKey('Paracetamol + Caffeine'), null);
  assert.strictEqual(singleIngredientKey(''), null);
  assert.strictEqual(singleIngredientKey('Tramadol Hydrochloride'), 'tramadol');
});

test('US search names include the US spelling first', () => {
  assert.deepStrictEqual(searchNames('paracetamol'), ['acetaminophen', 'paracetamol']);
  assert.deepStrictEqual(searchNames('ibuprofen'), ['ibuprofen']);
});

const fixture = {
  set_id: 'fixture-set-1', version: '7', effective_time: '20240115',
  openfda: { generic_name: ['ACETAMINOPHEN'], brand_name: ['FIXTURE BRAND'] },
  indications_and_usage: ['FIXTURE indications text.'],
  contraindications: ['FIXTURE contraindications text.'],
  warnings: ['FIXTURE warnings text.'],
  dosage_and_administration: ['FIXTURE dosing text that must never be imported.'],
};

test('openFDA label is normalised, dated and linked to its source; dosing is not imported', () => {
  const row = normalizeLabel(fixture, 'paracetamol');
  assert.strictEqual(row.ingredient_key, 'paracetamol');
  assert.strictEqual(row.effective_date, '2024-01-15');
  assert.strictEqual(row.jurisdiction, 'United States');
  assert.match(row.source_url, /setid=fixture-set-1$/);
  assert.strictEqual(row.indications, 'FIXTURE indications text.');
  assert.strictEqual(row.warnings, 'FIXTURE warnings text.');
  assert.ok(!JSON.stringify(row).includes('dosing text'));
});

test('labels without an indications section are rejected', () => {
  assert.strictEqual(normalizeLabel({ ...fixture, indications_and_usage: undefined }, 'paracetamol'), null);
});

test('only single-ingredient labels for the right ingredient are accepted', () => {
  assert.ok(isSingleIngredientLabel(fixture, 'paracetamol'));
  assert.ok(!isSingleIngredientLabel(fixture, 'ibuprofen'));
  assert.ok(!isSingleIngredientLabel({ openfda: { generic_name: ['ACETAMINOPHEN', 'CAFFEINE'] } }, 'paracetamol'));
});
