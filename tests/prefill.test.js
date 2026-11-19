'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { planBlocks, buildBboxQuery, CITIES } = require('../src/lib/prefill');

test('Lagos plan covers every map cell exactly once', () => {
  const blocks = planBlocks(CITIES.lagos);
  const all = blocks.flatMap((b) => b.cells);
  assert.strictEqual(all.length, new Set(all).size);
  assert.strictEqual(all.length, 169);               // 13 x 13 cells for +/-0.3 degrees
  assert.ok(blocks.length >= 9 && blocks.length <= 25);
});

test('each block box covers its cells plus a margin larger than the 5 km API radius', () => {
  for (const b of planBlocks(CITIES.ibadan)) {
    for (const key of b.cells) {
      const [lat, lng] = key.split(',').map(Number);
      assert.ok(lat - b.bbox.south >= 0.06 && b.bbox.north - lat >= 0.06, key);
      assert.ok(lng - b.bbox.west >= 0.06 && b.bbox.east - lng >= 0.06, key);
    }
  }
});

test('bbox query asks for pharmacies, hospitals, clinics, doctors and labs', () => {
  const q = buildBboxQuery(planBlocks(CITIES.abuja)[0].bbox);
  for (const t of ['"pharmacy"', '"hospital"', '"clinic"', '"doctors"', '"laboratory"']) assert.ok(q.includes(t), t);
  assert.match(q, /out center tags;/);
});
