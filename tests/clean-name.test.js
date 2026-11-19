'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cleanProductName } = require('../src/lib/helpers');

test('cleanProductName strips junk from NAFDAC product names', () => {
  const cases = [
    ['AFRIXIME 200 $1', 'AFRIXIME 200'],
    ['AMYVIL 25 TABLETS $1', 'AMYVIL 25 TABLETS'],
    ['ALGAFEN (SUSPENSION IBUPROFEN 100 mg/5 ml) $2', 'ALGAFEN (SUSPENSION IBUPROFEN 100 mg/5 ml)'],
    ['AFROXONE INJECTION USP 1G $2', 'AFROXONE INJECTION USP 1G'],
    ['Rosudex 20 Tablets_', 'Rosudex 20 Tablets'],
    ['Meprid 4 Tablet_', 'Meprid 4 Tablet'],
    ['Tramadol Hyrdochloride 100 mg Capsule', 'Tramadol Hyrdochloride 100 mg Capsule'],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(cleanProductName(input), expected, `cleanProductName(${JSON.stringify(input)})`);
  }
});

test('cleanProductName is a no-op on empty input', () => {
  assert.strictEqual(cleanProductName(null), null);
  assert.strictEqual(cleanProductName(''), '');
  assert.strictEqual(cleanProductName('   '), '');
});