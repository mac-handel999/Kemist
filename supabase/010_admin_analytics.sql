-- Analytics events table for tracking page views, searches, and user activity
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,                    -- page_view, medicine_search, nafdac_verify, clinical_drug_search, facility_search, report_submitted
  page TEXT,                              -- page path
  medicine_name TEXT,                     -- for medicine searches
  query TEXT,                             -- search query text
  user_id UUID REFERENCES auth.users(id), -- optional, link to authenticated user
  session_id TEXT,                        -- anonymous session identifier
  country TEXT,                           -- from geolocation/IP
  city TEXT,                              -- from geolocation/IP
  referrer TEXT,                          -- HTTP referrer
  user_agent TEXT,                        -- browser user agent
  metadata JSONB DEFAULT '{}'::jsonb,     -- additional flexible data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created ON analytics_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_created ON analytics_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created ON analytics_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_medicine ON analytics_events (medicine_name) WHERE medicine_name IS NOT NULL;

-- Enable RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Admin can read all analytics
CREATE POLICY "admin_read_analytics" ON analytics_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- Service role can insert (for tracking from API)
CREATE POLICY "service_insert_analytics" ON analytics_events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Auto-cleanup old events (keep 90 days)
-- This can be run via pg_cron or a scheduled job
-- DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '90 days';

-- Image candidates table for medicine image enrichment pipeline
CREATE TABLE IF NOT EXISTS image_candidates (
  id BIGSERIAL PRIMARY KEY,
  drug_id UUID REFERENCES drugs(id) ON DELETE CASCADE,
  nrn TEXT,                               -- NAFDAC Registration Number (for linking before drug exists)
  search_query TEXT NOT NULL,             -- query used to find this image
  image_url TEXT NOT NULL,                -- original image URL from search
  thumbnail_url TEXT,                     -- thumbnail URL
  source_page_url TEXT,                   -- page where image was found
  source_domain TEXT,                     -- domain of source
  image_width INTEGER,                    -- image dimensions
  image_height INTEGER,
  file_size_bytes BIGINT,                 -- if known
  mime_type TEXT,                         -- image/jpeg, image/png, etc.
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, downloaded
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,                  -- why rejected: wrong_brand, wrong_strength, wrong_form, low_quality, copyright_concern, other
  approved_image_id UUID REFERENCES drug_images(id),
  download_path TEXT,                     -- path in Supabase Storage after download
  download_error TEXT,
  search_metadata JSONB DEFAULT '{}'::jsonb, -- full search result metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_candidates_drug_status ON image_candidates (drug_id, status);
CREATE INDEX IF NOT EXISTS idx_image_candidates_nrn ON image_candidates (nrn);
CREATE INDEX IF NOT EXISTS idx_image_candidates_status_created ON image_candidates (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_candidates_source_domain ON image_candidates (source_domain);

ALTER TABLE image_candidates ENABLE ROW LEVEL SECURITY;

-- Admin can read all candidates
CREATE POLICY "admin_read_candidates" ON image_candidates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- Service role can insert/update
CREATE POLICY "service_manage_candidates" ON image_candidates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_image_candidates_updated_at ON image_candidates;
CREATE TRIGGER update_image_candidates_updated_at
  BEFORE UPDATE ON image_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();