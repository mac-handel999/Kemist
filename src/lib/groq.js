'use strict';
/** Groq chat client (OpenAI-compatible) with key failover. Llama 3.3 70B was shut down in Aug 2026, so the default is gpt-oss-120b. */
const { KeyPool, parseKeys } = require('./keypool');

const URL_ = 'https://api.groq.com/openai/v1/chat/completions';
let pool = null;

function getPool() {
  if (pool) return pool;
  const keys = parseKeys(process.env.GROQ_API_KEYS, process.env.GROQ_API_KEY);
  pool = keys.length ? new KeyPool({ provider: 'groq', keys, cooldownMs: 60000 }) : null;
  return pool;
}

const configured = () => Boolean(getPool());
const model = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function request(apiKey, body) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`Groq ${res.status}: ${(json.error && json.error.message) || 'request failed'}`);
    e.status = res.status;
    throw e;
  }
  return json;
}

/** @returns {Promise<string>} the assistant's text */
async function chat(messages, { maxTokens = 700 } = {}) {
  const p = getPool();
  if (!p) throw new Error('GROQ_API_KEY is not set');
  const base = { model: model(), messages, temperature: 0.2, max_completion_tokens: maxTokens };
  return p.run(async (key) => {
    let json;
    try { json = await request(key, { ...base, reasoning_effort: 'low' }); }
    catch (e) {
      if (e.status === 400 && /reasoning/i.test(e.message)) json = await request(key, base);   // model does not accept the reasoning option
      else throw e;
    }
    const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  });
}

module.exports = { chat, configured, model };
