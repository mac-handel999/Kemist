'use strict';
/**
 * Admin authentication middleware.
 * Uses a simple token-based auth for /admin routes.
 * In production, consider Supabase Auth with role-based access or a proper admin user table.
 */

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Admin authentication not configured' });
  }
  
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing admin token' });
  }
  
  req.isAdmin = true;
  next();
}

function optionalAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  req.isAdmin = token === ADMIN_TOKEN;
  next();
}

module.exports = { requireAdmin, optionalAdmin };