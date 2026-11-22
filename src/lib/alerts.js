'use strict';
/** Turn NAFDAC "Public Alert" posts into alert rows: type, registration numbers mentioned, batch numbers. */
const { nrnKey } = require('./helpers');

const stripHtml = (html) => String(html || '')
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–')
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();

const LETTER_NRN = /\b([A-Za-z]\d{1,2})\s?[-–]\s?(\d{3,7})\b/g;               // A4-7559, C4-0150, A11-0238
const NUMERIC_NRN = /\b(\d{2})\s?[-–]\s?(\d{4,6})\b/g;                          // 04-6433 (only trusted next to "registration"/"NAFDAC")

/** Registration numbers mentioned in a text. Numeric-only forms must follow words like "NAFDAC Reg. No." to avoid dates. */
function extractNrns(text) {
  const t = String(text || '');
  const found = new Map();
  for (const m of t.matchAll(LETTER_NRN)) found.set(nrnKey(m[0]), `${m[1].toUpperCase()}-${m[2]}`);
  for (const m of t.matchAll(NUMERIC_NRN)) {
    const before = t.slice(Math.max(0, m.index - 60), m.index);
    if (/(nafdac|registration|reg\.?\s*no|nrn|number)/i.test(before)) found.set(nrnKey(m[0]), `${m[1]}-${m[2]}`);
  }
  return [...found.values()];
}

function extractBatches(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/batch(?:\s*(?:no\.?|number|numbers))?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,20})/gi)) out.add(m[1].toUpperCase());
  return [...out].slice(0, 10);
}

function classifyAlert(title) {
  const t = String(title || '');
  if (/(counterfeit|fake|falsified|forged)/i.test(t)) return 'counterfeit';
  if (/(recall|withdraw)/i.test(t)) return 'recall';
  if (/substandard/i.test(t)) return 'substandard';
  if (/(unregistered|banned|blacklist|watchlist|prohibit)/i.test(t)) return 'unregistered';
  return 'notice';
}

function alertNo(title) {
  const m = String(title || '').match(/Public Alert No\.?\s*([0-9]{1,3}\s*\/\s*[0-9]{4})/i);
  return m ? m[1].replace(/\s+/g, '') : null;
}

/** @param {{title:string, link:string, date?:string, excerpt?:string, content?:string}} post */
function alertFromPost(post) {
  const title = stripHtml(post.title);
  const body = stripHtml(post.content || '');
  const summary = stripHtml(post.excerpt || '') || body.slice(0, 400);
  const text = `${title} ${summary} ${body}`;
  if (!title || !post.link) return null;
  const nrns = extractNrns(text);
  return {
    alert_no: alertNo(title),
    title: title.slice(0, 400),
    summary: summary.slice(0, 600) || null,
    alert_type: classifyAlert(title),
    nrns,
    nrn_keys: nrns.map(nrnKey),
    batch_numbers: extractBatches(text),
    published_at: post.date ? String(post.date).slice(0, 10) : null,
    source: 'NAFDAC',
    source_url: post.link,
    fetched_at: new Date().toISOString(),
  };
}

module.exports = { alertFromPost, extractNrns, extractBatches, classifyAlert, stripHtml };
