'use strict';
const test = require('node:test');
const assert = require('node:assert');
const serp = require('../src/lib/providers/serpapi');
const { dedupeFacilities } = require('../src/lib/dedupe');
const fixture = require('./fixtures/serpapi-sample.json');

test('listings are classified into Kemist facility types', () => {
  assert.strictEqual(serp.classifyType({ type: 'Pharmacy' }), 'pharmacy');
  assert.strictEqual(serp.classifyType({ type: 'Medical clinic' }), 'clinic');
  assert.strictEqual(serp.classifyType({ type: 'Hospital' }), 'hospital');
  assert.strictEqual(serp.classifyType({ type: 'Diagnostic center' }), 'laboratory');
  assert.strictEqual(serp.classifyType({ type: 'Store', title: 'Sunrise Pharmacy' }), 'pharmacy');
  assert.strictEqual(serp.classifyType({ type: 'Pizza restaurant', title: 'Pizza Place' }), null);
});

test('API responses become facility rows: non-health and coordinate-less results are dropped', () => {
  const first = serp.parseResponse(fixture[0]);
  assert.strictEqual(first.rawCount, 4);
  assert.deepStrictEqual(first.rows.map((r) => r.type), ['pharmacy', 'hospital']);
  const pharmacy = first.rows[0];
  assert.strictEqual(pharmacy.osm_id, 'serpapi:fixture-place-1');
  assert.strictEqual(pharmacy.source, 'Google Maps (via SerpApi)');
  assert.strictEqual(pharmacy.is_verified, false);
  assert.match(pharmacy.opening_hours, /^Mon 8 am–9 pm; /);
  assert.strictEqual(serp.parseResponse(fixture[1]).rows.length, 1);       // single place_results answer
  assert.strictEqual(serp.parseResponse(fixture[2]).rows.length, 0);       // error body
});

test('opening hours are kept as a weekly summary, never as live "open now" text', () => {
  const all = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, '24 hours']));
  assert.strictEqual(serp.formatHours(all), '24/7');
  assert.strictEqual(serp.formatHours(null), null);
});

test('plan starts at the centre and the budget caps the number of calls', () => {
  const plan = serp.planCalls({ lat: 7.38, lng: 3.95, radius: 0.06, step: 0.03, queries: ['pharmacy', 'hospital'] });
  assert.strictEqual(plan.length, 50);                                      // 5x5 cells x 2 queries
  assert.deepStrictEqual([plan[0].lat, plan[0].lng, plan[0].q], [7.38, 3.95, 'pharmacy']);
  assert.strictEqual(serp.budgetAllowed({ limit: 240, used: 230, maxCalls: 50, planned: 50 }), 10);
  assert.strictEqual(serp.budgetAllowed({ limit: 240, used: 240, maxCalls: Infinity, planned: 50 }), 0);
  assert.strictEqual(serp.budgetAllowed({ limit: 240, used: 0, maxCalls: 5, planned: 50 }), 5);
});

test('the same pharmacy from OpenStreetMap and Google is shown once, keeping the richer entry', () => {
  const list = [
    { id: 'a', name: 'Sunrise Pharmacy', type: 'pharmacy', lat: 7.3800, lng: 3.9500, distance_m: 100, source: 'OpenStreetMap', phone: null },
    { id: 'b', name: 'Sunrise Pharmacy & Stores', type: 'pharmacy', lat: 7.38003, lng: 3.95002, distance_m: 105, source: 'Google Maps (via SerpApi)', phone: '0800', opening_hours: 'Daily 8 am–9 pm' },
    { id: 'c', name: 'Pharmacy (name not listed)', type: 'pharmacy', lat: 7.38001, lng: 3.95001, distance_m: 101, source: 'OpenStreetMap' },
    { id: 'd', name: 'Grace Pharmacy', type: 'pharmacy', lat: 7.3801, lng: 3.9501, distance_m: 120, source: 'OpenStreetMap' },
    { id: 'e', name: 'Sunrise Pharmacy', type: 'pharmacy', lat: 7.4000, lng: 3.9700, distance_m: 3000, source: 'OpenStreetMap' },
  ];
  const out = dedupeFacilities(list);
  assert.deepStrictEqual(out.map((f) => f.id).sort(), ['b', 'd', 'e']);       // a and c merged into b; distinct names and far-away places stay
});
