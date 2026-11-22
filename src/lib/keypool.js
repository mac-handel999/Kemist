'use strict';
/**
 * Key pool with automatic failover: when one key runs out (or is rejected), the next key is used.
 * Keys are never logged in full; a key is identified by its last 4 characters.
 *
 * Use it for keys you are entitled to use (your own paid/free account, a teammate's account, a second project).
 * Do not create extra accounts just to get around a provider's free-tier limit: most providers forbid it and ban for it.
 */
const monthOf = (t) => new Date(t).toISOString().slice(0, 7);
const labelOf = (key) => `…${String(key).slice(-4)}`;

/** Split "a,b c\nd" into unique keys. Accepts several env names, first non-empty wins per name, all are merged. */
function parseKeys(...values) {
  const out = [];
  for (const v of values) for (const k of String(v || '').split(/[,\s]+/)) if (k && !out.includes(k)) out.push(k);
  return out;
}

/** 'quota' = used up for the month, 'rate' = try again shortly, 'invalid' = key rejected, 'other' = not a key problem */
function classifyError(err) {
  const status = err && err.status;
  const msg = String((err && err.message) || '');
  if (status === 401 || status === 403 || /invalid api key|incorrect api key|unauthori[sz]ed|authentication/i.test(msg)) return 'invalid';
  if (status === 402 || /out of searches|run out of|insufficient credits|hard limit|monthly (usage|limit)|quota|plan limit|credits? exhausted/i.test(msg)) return 'quota';
  if (status === 429 || /rate.?limit|too many requests/i.test(msg)) return /per day|daily|tpd|rpd/i.test(msg) ? 'quota-day' : 'rate';
  return 'other';
}

class PoolExhaustedError extends Error {
  constructor(provider) { super(`All ${provider} keys are used up or unavailable right now.`); this.name = 'PoolExhaustedError'; }
}

class KeyPool {
  /**
   * @param {{provider:string, keys:string[], monthlyLimit?:number|null, usage?:{get:(provider:string,month:string)=>Promise<number>, add:(provider:string,month:string,n:number)=>Promise<any>}, now?:()=>number, cooldownMs?:number}} o
   */
  constructor({ provider, keys, monthlyLimit = null, usage = null, now = Date.now, cooldownMs = 60000 }) {
    this.provider = provider; this.monthlyLimit = monthlyLimit; this.usage = usage; this.now = now; this.cooldownMs = cooldownMs;
    this.states = keys.map((key) => ({ key, label: labelOf(key), disabled: false, cooldownUntil: 0, exhaustedMonth: null }));
  }

  get size() { return this.states.length; }
  usageId(label) { return `${this.provider}:${label}`; }

  async usedBy(label) { return this.usage ? this.usage.get(this.usageId(label), monthOf(this.now())) : 0; }

  /** Calls still available this month across all usable keys (Infinity when no monthly limit is set). */
  async remaining() {
    if (!this.monthlyLimit) return Infinity;
    let total = 0;
    for (const s of this.states) {
      if (s.disabled || s.exhaustedMonth === monthOf(this.now())) continue;
      total += Math.max(0, this.monthlyLimit - (await this.usedBy(s.label)));
    }
    return total;
  }

  async acquire(skip = new Set()) {
    const t = this.now(), month = monthOf(t);
    for (const s of this.states) {
      if (skip.has(s.label) || s.disabled || t < s.cooldownUntil || s.exhaustedMonth === month) continue;
      if (this.monthlyLimit && (await this.usedBy(s.label)) >= this.monthlyLimit) continue;
      return s;
    }
    throw new PoolExhaustedError(this.provider);
  }

  report(label, kind) {
    const s = this.states.find((x) => x.label === label);
    if (!s) return;
    if (kind === 'invalid') s.disabled = true;
    else if (kind === 'quota') s.exhaustedMonth = monthOf(this.now());
    else if (kind === 'quota-day') s.cooldownUntil = this.now() + 60 * 60 * 1000;
    else if (kind === 'rate') s.cooldownUntil = this.now() + this.cooldownMs;
  }

  /** Run fn(key) with failover. Counts one use per successful or attempted call. */
  async run(fn) {
    const tried = new Set();
    for (;;) {
      const s = await this.acquire(tried);
      try {
        const result = await fn(s.key, s.label);
        if (this.usage) await this.usage.add(this.usageId(s.label), monthOf(this.now()), 1);
        return result;
      } catch (err) {
        const kind = classifyError(err);
        if (kind === 'other') throw err;
        if (this.usage && kind !== 'invalid') await this.usage.add(this.usageId(s.label), monthOf(this.now()), 1).catch(() => {});
        this.report(s.label, kind);
        tried.add(s.label);
        console.warn(`[keypool] ${this.provider} key ${s.label}: ${kind}; trying the next key`);
      }
    }
  }
}

module.exports = { KeyPool, PoolExhaustedError, parseKeys, classifyError, labelOf, monthOf };
