'use strict';
const test = require('node:test');
const assert = require('node:assert');
const serp = require('../src/lib/providers/serpnews');
const fixture = require('./fixtures/serpnews-sample.json');

test('news results become headline rows; clusters are flattened; duplicates and empty titles dropped', () => {
  const rows = serp.parseNews(fixture, { category: 'nigeria', queryId: 'ng-health' });
  assert.deepStrictEqual(rows.map((r) => r.url), ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
  assert.strictEqual(rows[0].publisher, 'Fixture Daily');
  assert.strictEqual(rows[0].published_at, '2026-11-12T08:03:00.000Z');
});

test('headlines about recalls and counterfeits are re-labelled as safety news', () => {
  const rows = serp.parseNews(fixture, { category: 'nigeria', queryId: 'x' });
  assert.strictEqual(rows[0].category, 'safety');
  assert.strictEqual(rows[1].category, 'nigeria');
});

test('daily rotation cycles through all queries without repeating within a day', () => {
  const day = new Date('2026-11-21T10:00:00Z');
  const today = serp.pickQueries(4, day).map((q) => q.id);
  assert.strictEqual(new Set(today).size, 4);
  const seen = new Set();
  for (let d = 0; d < 2; d++) serp.pickQueries(4, new Date(day.getTime() + d * 86400000)).forEach((q) => seen.add(q.id));
  assert.strictEqual(seen.size, serp.QUERIES.length);                       // two days of 4 cover all 8 queries
});
