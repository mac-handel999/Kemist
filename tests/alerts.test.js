'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { alertFromPost, extractNrns, classifyAlert } = require('../src/lib/alerts');

test('registration numbers are found, and dates are not mistaken for them', () => {
  assert.deepStrictEqual(extractNrns('Falsified Rosprazole with a fake NAFDAC Reg. No. C4-0150.'), ['C4-0150']);
  assert.deepStrictEqual(extractNrns('Counterfeit Proguanil with Fake NAFDAC Registration Number (04-6433) found in Nigeria'), ['04-6433']);
  assert.deepStrictEqual(extractNrns('Issued in 12-2024 and updated 05-2025.'), []);
  assert.deepStrictEqual(extractNrns('Products A4-7559 and a4 7559 and B11-0238'), ['A4-7559', 'B11-0238'].filter((x) => x !== 'x'));
});

test('alert types are recognised from titles', () => {
  assert.strictEqual(classifyAlert('Public Alert No. 16/2025 – Alert on Counterfeit/Falsified Rosprazole'), 'counterfeit');
  assert.strictEqual(classifyAlert('Public Alert No. 015/2025 – Recall of Substandard Juhel Folic Acid Tablet'), 'recall');
  assert.strictEqual(classifyAlert('Alert on unregistered fair child soap'), 'unregistered');
  assert.strictEqual(classifyAlert('Regulatory clarification on needle'), 'notice');
});

test('a post becomes an alert row with normalised registration keys', () => {
  const row = alertFromPost({
    title: 'Public Alert No. 023/2026 &#8211; Alert on Counterfeit Brands of Proguanil with Fake NAFDAC Registration Number (04-6433) found in Nigeria',
    link: 'https://nafdac.gov.ng/example', date: '2026-03-10T09:00:00', excerpt: '<p>NAFDAC is informing the public&#8230; batch number: AB12345.</p>',
  });
  assert.strictEqual(row.alert_no, '023/2026');
  assert.strictEqual(row.alert_type, 'counterfeit');
  assert.deepStrictEqual(row.nrn_keys, ['046433']);
  assert.strictEqual(row.published_at, '2026-03-10');
  assert.ok(row.batch_numbers.includes('AB12345'));
  assert.strictEqual(alertFromPost({ title: '', link: 'x' }), null);
});
