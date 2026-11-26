'use strict';
const test = require('node:test');
const assert = require('node:assert');
const serp = require('../src/lib/providers/serpnews');
const fixture = require('./fixtures/serpnews-sample.json');
const { isValidArticleUrl, isGenericTitle, filterArticles } = require('../src/lib/news-filter');

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

test('isValidArticleUrl accepts valid http/https URLs', () => {
  assert.strictEqual(isValidArticleUrl('https://example.com/article'), true);
  assert.strictEqual(isValidArticleUrl('http://example.com/article'), true);
  assert.strictEqual(isValidArticleUrl('https://sub.domain.com/path?query=1'), true);
});

test('isValidArticleUrl rejects invalid URLs', () => {
  assert.strictEqual(isValidArticleUrl(''), false);
  assert.strictEqual(isValidArticleUrl(null), false);
  assert.strictEqual(isValidArticleUrl('ftp://example.com'), false);
  assert.strictEqual(isValidArticleUrl('not-a-url'), false);
  assert.strictEqual(isValidArticleUrl('javascript:alert(1)'), false);
});

test('isGenericTitle rejects short titles', () => {
  assert.strictEqual(isGenericTitle('Procurement'), true);
  assert.strictEqual(isGenericTitle('Press Release'), true);
  assert.strictEqual(isGenericTitle('About Us'), true);
  assert.strictEqual(isGenericTitle('News'), true);
  assert.strictEqual(isGenericTitle('Home'), true);
  assert.strictEqual(isGenericTitle('A' .repeat(19)), true); // 19 chars
});

test('isGenericTitle rejects exact generic titles (case-insensitive)', () => {
  assert.strictEqual(isGenericTitle('home'), true);
  assert.strictEqual(isGenericTitle('HOME'), true);
  assert.strictEqual(isGenericTitle('Home'), true);
  assert.strictEqual(isGenericTitle('contact us'), true);
  assert.strictEqual(isGenericTitle('procurement'), true);
  assert.strictEqual(isGenericTitle('press release'), true);
  assert.strictEqual(isGenericTitle('press releases'), true);
  assert.strictEqual(isGenericTitle('about us'), true);
  assert.strictEqual(isGenericTitle('about'), true);
  assert.strictEqual(isGenericTitle('news'), true);
  assert.strictEqual(isGenericTitle('tenders'), true);
  assert.strictEqual(isGenericTitle('careers'), true);
  assert.strictEqual(isGenericTitle('gallery'), true);
});

test('isGenericTitle accepts valid article titles', () => {
  assert.strictEqual(isGenericTitle('NAFDAC Warns About Fake Medicines in Nigeria'), false);
  assert.strictEqual(isGenericTitle('New Drug Approved for Malaria Treatment'), false);
  assert.strictEqual(isGenericTitle('Pharmacy Council Announces New Regulations'), false);
  assert.strictEqual(isGenericTitle('A' .repeat(20)), false); // exactly 20 chars
});

test('filterArticles removes junk and keeps valid articles', () => {
  const articles = [
    { title: 'Valid Article Title Here', article_url: 'https://example.com/1' },
    { title: 'Procurement', article_url: 'https://example.com/2' },
    { title: 'Another Good Article', article_url: 'https://example.com/3' },
    { title: 'Press Release', article_url: 'https://example.com/4' },
    { title: 'No URL Article', article_url: '' },
    { title: 'Invalid URL', article_url: 'not-a-url' },
    { title: 'Short', article_url: 'https://example.com/5' },
  ];
  const filtered = filterArticles(articles);
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].title, 'Valid Article Title Here');
  assert.strictEqual(filtered[1].title, 'Another Good Article');
});
