'use strict';
const configured = Boolean(
  process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)
);
module.exports = configured ? require('./supabase') : require('./memory');
