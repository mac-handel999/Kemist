'use strict';
/**
 * Admin API routes for dashboard monitoring.
 * All routes require admin authentication.
 */

const express = require('express');
const { requireAdmin } = require('../middleware/adminAuth');
const store = require('../db');
const { getUsage } = require('../db/external');

const router = express.Router();

// Apply admin auth to all routes
router.use(requireAdmin);

/**
 * GET /api/admin/overview
 * System overview statistics for dashboard cards
 */
router.get('/overview', async (req, res) => {
  try {
    const stats = {};
    
    // User count
    if (store.mode === 'supabase') {
      const { count: userCount, error: userErr } = await store.client
        .from('users')
        .select('*', { count: 'exact', head: true });
      if (!userErr) stats.totalUsers = userCount || 0;
      
      // Page visits (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: visitCount, error: visitErr } = await store.client
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo)
        .eq('event', 'page_view');
      if (!visitErr) stats.pageVisits30d = visitCount || 0;
      
      // Today's visits
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayVisits, error: todayErr } = await store.client
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString())
        .eq('event', 'page_view');
      if (!todayErr) stats.pageVisitsToday = todayVisits || 0;
      
      // NAFDAC drug records
      const { count: nafdacCount, error: nafdacErr } = await store.client
        .from('drugs')
        .select('*', { count: 'exact', head: true });
      if (!nafdacErr) stats.nafdacRecords = nafdacCount || 0;
      
      // OpenFDA records (via clinical_ingredients or similar)
      const { count: openfdaCount, error: openfdaErr } = await store.client
        .from('clinical_ingredients')
        .select('*', { count: 'exact', head: true });
      if (!openfdaErr) stats.openfdaRecords = openfdaCount || 0;
      
      // DailyMed labels
      const { count: dailymedCount, error: dmErr } = await store.client
        .from('dailymed_labels')
        .select('*', { count: 'exact', head: true });
      if (!dmErr) stats.dailymedLabels = dailymedCount || 0;
      
      // Facilities
      const { count: facilityCount, error: facErr } = await store.client
        .from('facilities')
        .select('*', { count: 'exact', head: true });
      if (!facErr) stats.facilities = facilityCount || 0;
      
      // Medicine images
      const { count: imageCount, error: imgErr } = await store.client
        .from('drug_images')
        .select('*', { count: 'exact', head: true });
      if (!imgErr) stats.medicineImages = imageCount || 0;
      
      // Image candidates awaiting review
      const { count: candidateCount, error: candErr } = await store.client
        .from('image_candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!candErr) stats.imageCandidatesPending = candidateCount || 0;
      
      // Coverage areas
      const { count: coverageTotal, error: covErr } = await store.client
        .from('coverage_areas')
        .select('*', { count: 'exact', head: true });
      if (!covErr) stats.coverageAreasTotal = coverageTotal || 0;
      
      const { count: coverageDone, error: covDoneErr } = await store.client
        .from('coverage_areas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'done');
      if (!covDoneErr) stats.coverageAreasDone = coverageDone || 0;
      
      const { count: coveragePending, error: covPendErr } = await store.client
        .from('coverage_areas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!covPendErr) stats.coverageAreasPending = coveragePending || 0;
      
      const { count: coverageFailed, error: covFailErr } = await store.client
        .from('coverage_areas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');
      if (!covFailErr) stats.coverageAreasFailed = coverageFailed || 0;
    } else {
      // In-memory mode - return mock data
      stats.totalUsers = 0;
      stats.pageVisits30d = 0;
      stats.pageVisitsToday = 0;
      stats.nafdacRecords = 0;
      stats.openfdaRecords = 0;
      stats.dailymedLabels = 0;
      stats.facilities = 0;
      stats.medicineImages = 0;
      stats.imageCandidatesPending = 0;
      stats.coverageAreasTotal = 0;
      stats.coverageAreasDone = 0;
      stats.coverageAreasPending = 0;
      stats.coverageAreasFailed = 0;
    }
    
    // Job statistics
    const jobStats = await getJobStats();
    stats.jobs = jobStats;
    
    // API usage
    const usage = await getUsageStats();
    stats.apiUsage = usage;
    
    res.json({ success: true, data: stats });
  } catch (e) {
    console.error('Admin overview error:', e);
    res.status(500).json({ error: 'Failed to fetch overview', details: e.message });
  }
});

async function getJobStats() {
  if (store.mode !== 'supabase') return { successful: 0, failed: 0, running: 0, queued: 0 };
  
  try {
    const db = store.client;
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: runs, error } = await db
      .from('job_runs')
      .select('status, started_at, finished_at')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });
    
    if (error || !runs) return { successful: 0, failed: 0, running: 0, queued: 0 };
    
    const successful = runs.filter(r => r.status === 'success').length;
    const failed = runs.filter(r => r.status === 'failed').length;
    const running = runs.filter(r => r.status === 'running').length;
    const queued = runs.filter(r => r.status === 'queued').length;
    
    return { successful, failed, running, queued, recentRuns: runs.slice(0, 10) };
  } catch (e) {
    return { successful: 0, failed: 0, running: 0, queued: 0 };
  }
}

async function getUsageStats() {
  if (store.mode !== 'supabase') return {};
  
  const providers = ['serpapi', 'geocodio', 'geoapify', 'groq'];
  const month = new Date().toISOString().slice(0, 7);
  const usage = {};
  
  for (const p of providers) {
    try {
      const used = await getUsage(p, month);
      usage[p] = used;
    } catch (_) {
      usage[p] = 0;
    }
  }
  
  return usage;
}

/**
 * GET /api/admin/jobs
 * Job run history with pagination and filters
 */
router.get('/jobs', async (req, res) => {
  try {
    if (store.mode !== 'supabase') {
      return res.json({ success: true, data: { runs: [], total: 0 } });
    }
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const status = req.query.status;
    const jobType = req.query.job_type;
    const offset = (page - 1) * limit;
    
    let query = store.client
      .from('job_runs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) query = query.eq('status', status);
    if (jobType) query = query.eq('job_type', jobType);
    
    const { data: runs, error, count } = await query;
    
    if (error) throw error;
    
    res.json({ success: true, data: { runs: runs || [], total: count || 0, page, limit } });
  } catch (e) {
    console.error('Admin jobs error:', e);
    res.status(500).json({ error: 'Failed to fetch jobs', details: e.message });
  }
});

/**
 * POST /api/admin/jobs/:id/retry
 * Retry a failed job
 */
router.post('/jobs/:id/retry', async (req, res) => {
  try {
    if (store.mode !== 'supabase') {
      return res.status(503).json({ error: 'Supabase required for job operations' });
    }
    
    const { id } = req.params;
    const db = store.client;
    
    // Get the job
    const { data: job, error: getErr } = await db
      .from('job_runs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (getErr || !job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      return res.status(400).json({ error: 'Only failed or cancelled jobs can be retried' });
    }
    
    // Reset job to queued
    const { data: updated, error: updErr } = await db
      .from('job_runs')
      .update({ status: 'queued', error_message: null, started_at: null, finished_at: null })
      .eq('id', id)
      .select()
      .single();
    
    if (updErr) throw updErr;
    
    res.json({ success: true, data: updated, message: 'Job queued for retry' });
  } catch (e) {
    console.error('Admin job retry error:', e);
    res.status(500).json({ error: 'Failed to retry job', details: e.message });
  }
});

/**
 * GET /api/admin/analytics
 * Analytics summary - visits by day, top pages, top searches
 */
router.get('/analytics', async (req, res) => {
  try {
    if (store.mode !== 'supabase') {
      return res.json({ success: true, data: { dailyVisits: [], topPages: [], topSearches: [] } });
    }
    
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // Daily page views
    const { data: dailyViews, error: dvErr } = await store.client
      .from('analytics_events')
      .select('created_at, page')
      .gte('created_at', since)
      .eq('event', 'page_view');
    
    // Top pages
    const { data: topPages, error: tpErr } = await store.client
      .from('analytics_events')
      .select('page')
      .gte('created_at', since)
      .eq('event', 'page_view');
    
    // Top medicine searches
    const { data: topSearches, error: tsErr } = await store.client
      .from('analytics_events')
      .select('medicine_name, query')
      .gte('created_at', since)
      .in('event', ['medicine_search', 'nafdac_verify']);
    
    // Aggregate daily views
    const dailyMap = {};
    if (dailyViews) {
      for (const v of dailyViews) {
        const day = v.created_at.slice(0, 10);
        dailyMap[day] = (dailyMap[day] || 0) + 1;
      }
    }
    const dailyVisits = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Aggregate top pages
    const pageMap = {};
    if (topPages) {
      for (const p of topPages) {
        const page = p.page || '/';
        pageMap[page] = (pageMap[page] || 0) + 1;
      }
    }
    const topPagesList = Object.entries(pageMap)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    // Aggregate top searches
    const searchMap = {};
    if (topSearches) {
      for (const s of topSearches) {
        const term = s.medicine_name || s.query || 'unknown';
        searchMap[term] = (searchMap[term] || 0) + 1;
      }
    }
    const topSearchesList = Object.entries(searchMap)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    res.json({ success: true, data: { dailyVisits, topPages: topPagesList, topSearches: topSearchesList } });
  } catch (e) {
    console.error('Admin analytics error:', e);
    res.status(500).json({ error: 'Failed to fetch analytics', details: e.message });
  }
});

/**
 * GET /api/admin/medicines/stats
 * Medicine database statistics
 */
router.get('/medicines/stats', async (req, res) => {
  try {
    if (store.mode !== 'supabase') {
      return res.json({ success: true, data: {} });
    }
    
    const db = store.client;
    
    // NAFDAC by status
    const { data: nafdacStatus, error: nsErr } = await db
      .from('drugs')
      .select('status');
    
    // NAFDAC by manufacturer (top 20)
    const { data: nafdacMfr, error: nmErr } = await db
      .from('drugs')
      .select('manufacturer');
    
    // Clinical ingredients by source
    const { data: clinicalSources, error: csErr } = await db
      .from('clinical_ingredients')
      .select('source');
    
    // DailyMed labels with/without media
    const { count: withMedia, error: wmErr } = await db
      .from('dailymed_labels')
      .select('*', { count: 'exact', head: true })
      .not('media_json', 'is', null);
    
    const { count: totalLabels, error: tlErr } = await db
      .from('dailymed_labels')
      .select('*', { count: 'exact', head: true });
    
    // Image coverage
    const { count: drugsWithImages, error: diErr } = await db
      .from('drugs')
      .select('*', { count: 'exact', head: true })
      .not('primary_image_url', 'is', null);
    
    const { count: totalDrugs, error: tdErr } = await db
      .from('drugs')
      .select('*', { count: 'exact', head: true });
    
    // Last sync times from job_runs
    const { data: lastSyncs, error: lsErr } = await db
      .from('job_runs')
      .select('job_type, finished_at, records_inserted, records_updated')
      .in('job_type', ['sync-drugs', 'import-clinical', 'sync-dailymed'])
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(10);
    
    const stats = {
      nafdac: {
        total: nafdacStatus?.length || 0,
        byStatus: aggregateCounts(nafdacStatus, 'status'),
        byManufacturer: aggregateCounts(nafdacMfr, 'manufacturer').slice(0, 20),
      },
      clinical: {
        totalIngredients: clinicalSources?.length || 0,
        bySource: aggregateCounts(clinicalSources, 'source'),
      },
      dailymed: {
        totalLabels: totalLabels || 0,
        withMedia: withMedia || 0,
        withoutMedia: (totalLabels || 0) - (withMedia || 0),
      },
      images: {
        totalDrugs: totalDrugs || 0,
        withImages: drugsWithImages || 0,
        coveragePercent: totalDrugs ? Math.round((drugsWithImages || 0) / totalDrugs * 100) : 0,
      },
      lastSyncs: lastSyncs || [],
    };
    
    res.json({ success: true, data: stats });
  } catch (e) {
    console.error('Admin medicines stats error:', e);
    res.status(500).json({ error: 'Failed to fetch medicine stats', details: e.message });
  }
});

function aggregateCounts(arr, field) {
  if (!arr) return [];
  const map = {};
  for (const item of arr) {
    const val = item[field] || 'Unknown';
    map[val] = (map[val] || 0) + 1;
  }
  return Object.entries(map)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * GET /api/admin/coverage
 * Map coverage statistics
 */
router.get('/coverage', async (req, res) => {
  try {
    if (store.mode !== 'supabase') {
      return res.json({ success: true, data: { byState: [], byStatus: [], recent: [] } });
    }
    
    const db = store.client;
    
    // Areas by state (extract from name or key)
    const { data: areas, error: aErr } = await db
      .from('coverage_areas')
      .select('key, name, lat, lng, r, status, places_found, last_run, updated_at');
    
    // Facilities by source
    const { data: facilities, error: fErr } = await db
      .from('facilities')
      .select('source');
    
    const byStatus = aggregateCounts(areas, 'status');
    const bySource = aggregateCounts(facilities, 'source');
    
    // Group by state (simple extraction from name)
    const stateMap = {};
    if (areas) {
      for (const a of areas) {
        // Try to extract state from name
        const state = extractState(a.name) || 'Unknown';
        if (!stateMap[state]) stateMap[state] = { total: 0, done: 0, pending: 0, failed: 0, places: 0 };
        stateMap[state].total++;
        stateMap[state][a.status] = (stateMap[state][a.status] || 0) + 1;
        stateMap[state].places += a.places_found || 0;
      }
    }
    const byState = Object.entries(stateMap)
      .map(([state, data]) => ({ state, ...data }))
      .sort((a, b) => b.total - a.total);
    
    res.json({ success: true, data: { byState, byStatus, bySource, areas: areas || [] } });
  } catch (e) {
    console.error('Admin coverage error:', e);
    res.status(500).json({ error: 'Failed to fetch coverage', details: e.message });
  }
});

function extractState(name) {
  if (!name) return null;
  // Nigerian states list
  const states = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
    'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe',
    'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
    'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
    'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
  ];
  for (const s of states) {
    if (name.toLowerCase().includes(s.toLowerCase())) return s;
  }
  return null;
}

/**
 * POST /api/admin/trigger/:jobType
 * Manually trigger a job
 */
router.post('/trigger/:jobType', async (req, res) => {
  try {
    const { jobType } = req.params;
    const { params } = req.body || {};
    
    const allowedJobs = [
      'sync-drugs', 'import-clinical', 'sync-dailymed', 'sync-news', 
      'import-alerts', 'import-news', 'import-serpapi', 
      'build-places', 'prefill-facilities', 'enrich-images'
    ];
    
    if (!allowedJobs.includes(jobType)) {
      return res.status(400).json({ error: 'Invalid job type' });
    }
    
    // Create a job run record
    if (store.mode === 'supabase') {
      const { data: job, error } = await store.client
        .from('job_runs')
        .insert({
          job_type: jobType,
          source: 'manual',
          status: 'queued',
          details: params || {},
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // In a real system, this would enqueue to a worker queue
      // For now, just return the job ID
      res.json({ success: true, data: job, message: `Job ${jobType} queued. Worker will pick it up.` });
    } else {
      res.status(503).json({ error: 'Supabase required for job triggering' });
    }
  } catch (e) {
    console.error('Admin trigger job error:', e);
    res.status(500).json({ error: 'Failed to trigger job', details: e.message });
  }
});

/**
 * GET /api/admin/system/health
 * System health check
 */
router.get('/system/health', async (req, res) => {
  try {
    const checks = {
      database: 'unknown',
      supabase: 'unknown',
      storage: 'unknown',
      api: 'ok',
      timestamp: new Date().toISOString(),
    };
    
    if (store.mode === 'supabase') {
      try {
        const { error } = await store.client.from('drugs').select('id').limit(1);
        checks.database = error ? 'error' : 'ok';
        checks.supabase = 'connected';
      } catch (e) {
        checks.database = 'error';
        checks.supabase = 'error';
      }
      
      // Check storage
      try {
        const { data, error } = await store.client.storage.listBuckets();
        checks.storage = error ? 'error' : 'ok';
      } catch (e) {
        checks.storage = 'error';
      }
    } else {
      checks.database = 'memory';
      checks.supabase = 'not_configured';
      checks.storage = 'not_configured';
    }
    
    const healthy = checks.database === 'ok' || checks.database === 'memory';
    
    res.status(healthy ? 200 : 503).json({ success: healthy, data: checks });
  } catch (e) {
    res.status(503).json({ success: false, data: { error: e.message } });
  }
});

module.exports = router;