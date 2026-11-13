-- Discovery engine: tracks automated discovery runs, seed sources, and enriches discovered items
-- All additive — no existing tables modified destructively

CREATE TABLE IF NOT EXISTS discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  sources_attempted int NOT NULL DEFAULT 0,
  sources_succeeded int NOT NULL DEFAULT 0,
  sources_failed int NOT NULL DEFAULT 0,
  new_opportunities int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  errors text[] NOT NULL DEFAULT '{}',
  triggered_by text NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual','scheduler'))
);

CREATE TABLE IF NOT EXISTS discovery_seed_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  source_type text NOT NULL DEFAULT 'html' CHECK (source_type IN ('html','rss','atom')),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('scholarship','phd','internship','fellowship','research','grant','job','competition','general')),
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_status text NOT NULL DEFAULT '' CHECK (last_status IN ('','ok','error','empty','blocked')),
  last_error text NOT NULL DEFAULT '',
  last_item_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Verification metadata on discovered items
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified','secondary','unverified','failed','expired'));
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS deadline_raw text NOT NULL DEFAULT '';
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS study_level text NOT NULL DEFAULT '';
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS funding_type text NOT NULL DEFAULT '' CHECK (funding_type IN ('','fully_funded','partially_funded','self_funded'));
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS discovery_run_id uuid REFERENCES discovery_runs(id) ON DELETE SET NULL;
ALTER TABLE discovered ADD COLUMN IF NOT EXISTS conflict_note text NOT NULL DEFAULT '';

-- Create index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_discovered_link ON discovered(link);
CREATE INDEX IF NOT EXISTS idx_discovered_user ON discovered(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_user ON discovery_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_seed_active ON discovery_seed_sources(is_active);

-- RLS policies
ALTER TABLE discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_seed_sources ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON discovery_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON discovery_seed_sources TO authenticated;

CREATE POLICY "select_own_discovery_runs" ON discovery_runs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_discovery_runs" ON discovery_runs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_discovery_runs" ON discovery_runs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_discovery_runs" ON discovery_runs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Seed sources are shared across all users (public opportunity directories)
CREATE POLICY "select_all_seed_sources" ON discovery_seed_sources FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_own_seed_sources" ON discovery_seed_sources FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_own_seed_sources" ON discovery_seed_sources FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_own_seed_sources" ON discovery_seed_sources FOR DELETE
  TO authenticated USING (true);

-- Update discovered table grants to allow new columns
GRANT SELECT, INSERT, UPDATE, DELETE ON discovered TO authenticated;

-- Insert seed sources (official public opportunity portals)
INSERT INTO discovery_seed_sources (name, url, source_type, category) VALUES
  ('Scholarships for Development', 'https://www.scholars4dev.com/feed/', 'rss', 'scholarship'),
  ('ScholarshipPortal RSS', 'https://www.scholarshipportal.com/rss/index.xml', 'rss', 'scholarship'),
  ('EURAXESS PhD Positions', 'https://euraxess.ec.europa.eu/jobs/search/feed?searchtype=jobs&job_type=phd', 'rss', 'phd'),
  ('EURAXESS Fellowships', 'https://euraxess.ec.europa.eu/jobs/search/feed?searchtype=jobs&job_type=fellowship', 'rss', 'fellowship'),
  ('FindAPhD RSS', 'https://www.findaphd.com/funding/feed/', 'rss', 'phd')
ON CONFLICT DO NOTHING;
