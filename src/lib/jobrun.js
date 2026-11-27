'use strict';
/**
 * Job run tracking for Kemist automation scripts.
 * Usage:
 *   const { startJob, finishJob } = require('./lib/jobrun');
 *   const job = await startJob('sync-drugs');
 *   try {
 *     // ... do work ...
 *     await finishJob(job.id, 'success', { records_seen: 100, records_saved: 95 });
 *   } catch (e) {
 *     await finishJob(job.id, 'failed', { error_message: sanitize(e.message) });
 *     throw e;
 *   }
 */
const store = require('../db');

const DEMO_MODE = store.mode !== 'supabase';

/** Sanitize error message to avoid leaking secrets */
function sanitize(msg) {
  if (!msg) return '';
  return String(msg)
    .replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]') // API keys, tokens
    .replace(/sk-[A-Za-z0-9]{32,}/g, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}/g, '[REDACTED]');
}

/** Start a job run, returns { id, finish } */
async function startJob(name) {
  if (DEMO_MODE) {
    return {
      id: 'demo-' + Date.now(),
      finish: async (status, stats = {}, error = null) => {
        console.log(`[DEMO] Job ${name} finished: ${status}`, stats, error);
      }
    };
  }

  const { data, error } = await store.client.from('job_runs').insert({
    job: name,
    status: 'running',
    started_at: new Date().toISOString(),
  }).select('id').single();

  if (error) throw new Error(`job_runs insert: ${error.message}`);

  const id = data.id;

  async function finish(status, stats = {}, error = null) {
    const payload = {
      status,
      finished_at: new Date().toISOString(),
      records_seen: stats.records_seen ?? 0,
      records_saved: stats.records_saved ?? 0,
      errors: stats.errors ?? 0,
    };
    if (error) payload.error_message = sanitize(error);
    if (stats.details) payload.details = stats.details;

    const { error: updErr } = await store.client.from('job_runs').update(payload).eq('id', id);
    if (updErr) console.error(`job_runs update failed: ${updErr.message}`);
  }

  return { id, finish };
}

module.exports = { startJob, sanitize };