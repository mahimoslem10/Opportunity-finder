/*
# Stage 0 Backup Schema — additive copy of all existing data

# Purpose
Creates an independent, locked backup of all public-table data before any
security changes. This migration is purely additive: it creates a new schema,
copies data into it, and locks it down. It does NOT modify, delete, or alter
any existing table, row, policy, or permission.

# What it does
1. Creates schema backup_stage0
2. Copies all five tables (structure + data) into that schema
3. Enables RLS on every backup table with no policies (denies all access)
4. Revokes all privileges from anon and authenticated
5. Records row counts and fingerprints for verification

# What it does NOT do
- Does not touch any existing table, row, or policy
- Does not change storage settings
- Does not modify application code
*/

-- 1. Create the backup schema
CREATE SCHEMA IF NOT EXISTS backup_stage0;

-- 2. Copy each table (structure + data)
-- Using CREATE TABLE AS SELECT so structure and data are copied in one step.

DROP TABLE IF EXISTS backup_stage0.profile;
CREATE TABLE backup_stage0.profile AS
  SELECT * FROM public.profile;

DROP TABLE IF EXISTS backup_stage0.opportunities;
CREATE TABLE backup_stage0.opportunities AS
  SELECT * FROM public.opportunities;

DROP TABLE IF EXISTS backup_stage0.sources;
CREATE TABLE backup_stage0.sources AS
  SELECT * FROM public.sources;

DROP TABLE IF EXISTS backup_stage0.discovered;
CREATE TABLE backup_stage0.discovered AS
  SELECT * FROM public.discovered;

DROP TABLE IF EXISTS backup_stage0.profile_documents;
CREATE TABLE backup_stage0.profile_documents AS
  SELECT * FROM public.profile_documents;

-- 3. Enable RLS on every backup table (no policies = deny all)
ALTER TABLE backup_stage0.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_stage0.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_stage0.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_stage0.discovered ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_stage0.profile_documents ENABLE ROW LEVEL SECURITY;

-- 4. Revoke all privileges from anon and authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA backup_stage0 FROM anon, authenticated;
REVOKE ALL ON SCHEMA backup_stage0 FROM anon, authenticated;

-- 5. Create a verification record table
DROP TABLE IF EXISTS backup_stage0.verification;
CREATE TABLE backup_stage0.verification (
  tbl text NOT NULL,
  row_count bigint NOT NULL,
  fingerprint text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO backup_stage0.verification (tbl, row_count, fingerprint) VALUES
  ('profile', (SELECT count(*) FROM backup_stage0.profile),
   (SELECT md5(string_agg(t::text, '' order by id)) FROM backup_stage0.profile t)),
  ('opportunities', (SELECT count(*) FROM backup_stage0.opportunities),
   (SELECT md5(string_agg(t::text, '' order by id)) FROM backup_stage0.opportunities t)),
  ('sources', (SELECT count(*) FROM backup_stage0.sources),
   (SELECT md5(string_agg(t::text, '' order by id)) FROM backup_stage0.sources t)),
  ('discovered', (SELECT count(*) FROM backup_stage0.discovered),
   (SELECT md5(string_agg(t::text, '' order by id)) FROM backup_stage0.discovered t)),
  ('profile_documents', (SELECT count(*) FROM backup_stage0.profile_documents),
   (SELECT md5(string_agg(t::text, '' order by id)) FROM backup_stage0.profile_documents t));

ALTER TABLE backup_stage0.verification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON backup_stage0.verification FROM anon, authenticated;
