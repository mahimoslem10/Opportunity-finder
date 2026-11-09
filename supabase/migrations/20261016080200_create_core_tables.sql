/*
# Create core tables for Opportunity Finder

## Overview
Creates the main data tables for the Opportunity Finder app: profile,
opportunities, sources, and discovered items. The app is single-tenant
(no sign-in) so all policies allow anon + authenticated access.

## New Tables

1. **profile** — single row holding the user's academic profile.
   - id (int, primary key, always 1 for single-tenant)
   - current_level (text) — education level: bachelor, master, phd, graduate
   - field (text) — field of study
   - university (text) — university and country
   - graduation_date (text) — expected graduation (YYYY-MM)
   - target_master_start (text) — target Master's start (YYYY-MM)
   - target_phd_start (text) — target PhD start (YYYY-MM)
   - internship_start (text) — target internship start (YYYY-MM)
   - citizenship (text) — country of citizenship
   - residence (text) — country of residence
   - gpa (text) — GPA or grade with scale
   - languages (text) — languages spoken with levels
   - skills (text) — skills and tools
   - experience (text) — experience and activities
   - preferences (text) — preferences and constraints
   - updated_at (timestamptz) — last update timestamp

2. **opportunities** — tracked scholarships, internships, jobs, programs.
   - id (uuid, primary key)
   - title (text, not null)
   - organization (text)
   - type (text) — scholarship, internship, job, program
   - required_level (text) — any, bachelor, master, phd, graduate
   - deadline (text) — deadline date (YYYY-MM-DD)
   - start_date (text) — start date
   - eligible_countries (text[]) — array of eligible country names
   - requires_degree (text) — yes or no
   - link (text) — URL to the opportunity
   - status (text) — interested, applying, applied, interview, accepted, rejected, skipped
   - notes (text) — free-form notes
   - added_on (text) — date added (YYYY-MM-DD)
   - created_at (timestamptz)

3. **sources** — RSS or webpage sources for discovering opportunities.
   - id (uuid, primary key)
   - name (text, not null)
   - url (text, not null)
   - type (text) — rss or webpage
   - added_on (text) — date added
   - created_at (timestamptz)

4. **discovered** — items discovered from sources, pending acceptance.
   - id (uuid, primary key)
   - title (text, not null)
   - organization (text)
   - link (text)
   - notes (text)
   - source_id (uuid, references sources, nullable, cascade delete)
   - discovered_on (text) — date discovered
   - created_at (timestamptz)

## Security
- RLS enabled on all tables.
- All policies use TO anon, authenticated because the app has no sign-in.
- All CRUD operations allowed for anon + authenticated (single-tenant shared data).

## Notes
1. The profile table uses a fixed id of 1 for single-tenant use.
2. eligible_countries is a text array to match the existing data model.
3. Dates are stored as text (YYYY-MM or YYYY-MM-DD) to match the existing app format.
*/

-- Profile table (single row for single-tenant app)
CREATE TABLE IF NOT EXISTS profile (
  id int PRIMARY KEY DEFAULT 1,
  current_level text NOT NULL DEFAULT 'bachelor',
  field text NOT NULL DEFAULT '',
  university text NOT NULL DEFAULT '',
  graduation_date text NOT NULL DEFAULT '',
  target_master_start text NOT NULL DEFAULT '',
  target_phd_start text NOT NULL DEFAULT '',
  internship_start text NOT NULL DEFAULT '',
  citizenship text NOT NULL DEFAULT '',
  residence text NOT NULL DEFAULT '',
  gpa text NOT NULL DEFAULT '',
  languages text NOT NULL DEFAULT '',
  skills text NOT NULL DEFAULT '',
  experience text NOT NULL DEFAULT '',
  preferences text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT profile_single_row CHECK (id = 1)
);

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_profile" ON profile;
CREATE POLICY "anon_select_profile" ON profile FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_profile" ON profile;
CREATE POLICY "anon_insert_profile" ON profile FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_profile" ON profile;
CREATE POLICY "anon_update_profile" ON profile FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_profile" ON profile;
CREATE POLICY "anon_delete_profile" ON profile FOR DELETE
  TO anon, authenticated USING (true);

-- Opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  organization text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'program',
  required_level text NOT NULL DEFAULT 'any',
  deadline text NOT NULL DEFAULT '',
  start_date text NOT NULL DEFAULT '',
  eligible_countries text[] NOT NULL DEFAULT '{}',
  requires_degree text NOT NULL DEFAULT 'no',
  link text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'interested',
  notes text NOT NULL DEFAULT '',
  added_on text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_opportunities" ON opportunities;
CREATE POLICY "anon_select_opportunities" ON opportunities FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_opportunities" ON opportunities;
CREATE POLICY "anon_insert_opportunities" ON opportunities FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_opportunities" ON opportunities;
CREATE POLICY "anon_update_opportunities" ON opportunities FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_opportunities" ON opportunities;
CREATE POLICY "anon_delete_opportunities" ON opportunities FOR DELETE
  TO anon, authenticated USING (true);

-- Sources table
CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  type text NOT NULL DEFAULT 'webpage',
  added_on text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sources" ON sources;
CREATE POLICY "anon_select_sources" ON sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sources" ON sources;
CREATE POLICY "anon_insert_sources" ON sources FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sources" ON sources;
CREATE POLICY "anon_update_sources" ON sources FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sources" ON sources;
CREATE POLICY "anon_delete_sources" ON sources FOR DELETE
  TO anon, authenticated USING (true);

-- Discovered items table
CREATE TABLE IF NOT EXISTS discovered (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  organization text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  discovered_on text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE discovered ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_discovered" ON discovered;
CREATE POLICY "anon_select_discovered" ON discovered FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_discovered" ON discovered;
CREATE POLICY "anon_insert_discovered" ON discovered FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_discovered" ON discovered;
CREATE POLICY "anon_update_discovered" ON discovered FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_discovered" ON discovered;
CREATE POLICY "anon_delete_discovered" ON discovered FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities(type);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);
CREATE INDEX IF NOT EXISTS idx_discovered_source_id ON discovered(source_id);
