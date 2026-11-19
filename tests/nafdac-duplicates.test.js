'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeNafdacRecord } = require('../src/lib/nafdac');

const FILE = path.join(__dirname, '..', 'data', 'dataset_ng-nafdac_2026-11-19_07-38-28-697.json');
const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));

test('duplicate NAFDAC numbers produce separate records keyed on source_record_id', () => {
  const rows = [];
  for (const raw of items) {
    const r = normalizeNafdacRecord(raw);
    assert.ok(r.ok, `record failed: ${r.reason}`);
    rows.push(r.row);
  }
  for (const nrn of ['A11-100075', 'A4-5073']) {
    const matches = rows.filter((r) => r.nrn === nrn);
    assert.strictEqual(matches.length, 2, `${nrn} should have 2 records, got ${matches.length}`);
    const ids = new Set(matches.map((r) => r.source_record_id));
    assert.strictEqual(ids.size, 2, `${nrn} records must differ in source_record_id`);
    assert.ok(matches.some((r) => r.status === 'Active'), `${nrn} should have an Active record`);
    assert.ok(matches.some((r) => r.status === 'Inactive'), `${nrn} should have an Inactive record`);
  }
});