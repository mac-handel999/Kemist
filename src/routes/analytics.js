'use strict';
/**
 * Analytics tracking endpoint.
 * Receives events from the frontend and stores them in the database.
 */

const express = require('express');
const store = require('../db');

const router = express.Router();

// No auth required for tracking - it's anonymous
// Rate limit is applied at the app level

/**
 * POST /api/analytics/track
 * Track an analytics event
 * Body: { event, page, medicine_name, query, metadata }
 */
router.post('/track', async (req, res) => {
  try {
    const { event, page, medicine_name, query, metadata } = req.body;
    
    if (!event) {
      return res.status(400).json({ error: 'Event type is required' });
    }
    
    if (store.mode !== 'supabase') {
      // In demo mode, just acknowledge
      return res.json({ success: true, demo: true });
    }
    
    // Extract client info
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || '';
    
    // Generate or get session ID from cookie/header
    let sessionId = req.headers['x-session-id'] || req.cookies?.session_id;
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
    
    // Try to get location from IP (if geoip middleware is added later)
    const country = req.headers['x-country'] || '';
    const city = req.headers['x-city'] || '';
    
    // Get user ID if authenticated (would come from auth middleware)
    const userId = req.user?.id || null;
    
    const db = store.client;
    const { error } = await db.from('analytics_events').insert({
      event,
      page: page || req.headers['x-current-page'] || '/',
      medicine_name,
      query,
      user_id: userId,
      session_id: sessionId,
      country,
      city,
      referrer,
      user_agent: userAgent,
      metadata: metadata || {},
    });
    
    if (error) {
      console.error('Analytics insert error:', error);
      // Don't fail the request for analytics errors
      return res.json({ success: true, warning: 'Event queued' });
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error('Analytics tracking error:', e);
    // Always return success to not break the frontend
    res.json({ success: true, error: 'Logged locally' });
  }
});

/**
 * GET /api/analytics/session
 * Get or create a session ID for tracking
 */
router.get('/session', (req, res) => {
  let sessionId = req.headers['x-session-id'] || req.cookies?.session_id;
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
  res.json({ session_id: sessionId });
});

module.exports = router;