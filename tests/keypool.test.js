'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { KeyPool, PoolExhaustedError, parseKeys, classifyError } = require('../src/lib/keypool');

const memUsage = () => { const m = new Map(); return { get: async (p, mo) => m.get(`${p}|${mo}`) || 0, add: async (p, mo, n) => m.set(`${p}|${mo}`, (m.get(`${p}|${mo}`) || 0) + n), m }; };
const err = (status, message = '') => Object.assign(new Error(message), { status });

test('keys are parsed from comma/space/newline lists without duplicates', () => {
  assert.deepStrictEqual(parseKeys('a, b\nc a', 'b,d', undefined), ['a', 'b', 'c', 'd']);
});

test('errors are classified for failover', () => {
  assert.strictEqual(classifyError(err(401)), 'invalid');
  assert.strictEqual(classifyError(err(402)), 'quota');
  assert.strictEqual(classifyError(err(429, 'Your account has run out of searches.')), 'quota');
  assert.strictEqual(classifyError(err(429, 'Rate limit reached')), 'rate');
  assert.strictEqual(classifyError(err(429, 'Rate limit reached for tokens per day (TPD)')), 'quota-day');
  assert.strictEqual(classifyError(err(500, 'boom')), 'other');
});

test('moves to the next key when the first runs out, and stays there', async () => {
  const pool = new KeyPool({ provider: 'serpapi', keys: ['key-AAAA', 'key-BBBB'], usage: memUsage() });
  const used = [];
  const call = (k) => { used.push(k); if (k === 'key-AAAA') throw err(429, 'Your account has run out of searches.'); return 'ok'; };
  assert.strictEqual(await pool.run(call), 'ok');
  assert.strictEqual(await pool.run(call), 'ok');
  assert.deepStrictEqual(used, ['key-AAAA', 'key-BBBB', 'key-BBBB']);       // AAAA is not retried once exhausted
});

test('a per-key monthly limit moves on before the provider complains', async () => {
  const pool = new KeyPool({ provider: 'serpapi', keys: ['key-AAAA', 'key-BBBB'], monthlyLimit: 2, usage: memUsage() });
  const used = [];
  for (let i = 0; i < 4; i++) await pool.run(async (k) => { used.push(k); });
  assert.deepStrictEqual(used, ['key-AAAA', 'key-AAAA', 'key-BBBB', 'key-BBBB']);
  assert.strictEqual(await pool.remaining(), 0);
  await assert.rejects(() => pool.run(async () => 1), PoolExhaustedError);
});

test('an invalid key is dropped; a rate-limited key comes back after the cooldown', async () => {
  let t = 1_000_000;
  const pool = new KeyPool({ provider: 'groq', keys: ['key-AAAA', 'key-BBBB'], now: () => t, cooldownMs: 60000 });
  const seen = [];
  await pool.run(async (k) => { seen.push(k); if (k === 'key-AAAA') throw err(401); });
  await assert.rejects(() => pool.run(async (k) => { seen.push(k); throw err(429, 'rate limit'); }), PoolExhaustedError);   // BBBB is rate-limited, AAAA is gone
  assert.deepStrictEqual(seen, ['key-AAAA', 'key-BBBB', 'key-BBBB']);
  await assert.rejects(() => pool.run(async () => 1), PoolExhaustedError);   // still cooling down
  t += 61000;
  assert.strictEqual(await pool.run(async (k) => k), 'key-BBBB');            // cooldown over
});

test('non-key errors are not swallowed', async () => {
  const pool = new KeyPool({ provider: 'x', keys: ['key-AAAA', 'key-BBBB'] });
  await assert.rejects(() => pool.run(async () => { throw err(500, 'server error'); }), /server error/);
});
