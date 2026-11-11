/*
# Stage 1: owner-scoped access to private candidate data

## Summary
Gives each private table an owner column and restricts every table to its owner through row level security. Anonymous visitors get no access. Existing rows are preserved exactly as they are.

## Tables changed
For each of: profile, opportunities, sources, discovered, profile_documents
- New column `user_id` (uuid, references auth.users, deleted with the account).
- Column is nullable so existing rows are kept without being rewritten or assigned to anyone.
- Default is auth.uid(), so rows created by a signed-in user are stamped with that user automatically.
- Index on user_id for owner lookups.

## Existing rows
- Existing rows keep user_id = NULL. No account owns them yet, so no signed-in user can read them until the owner approves claiming them.

## Security changes
- RLS stays enabled on all five tables.
- anon: no privileges (unchanged from Stage 0).
- authenticated: SELECT, INSERT, UPDATE, DELETE on the five tables, limited by four policies per table to rows where user_id = auth.uid().
- WITH CHECK on insert and update stops a user from writing or moving a row to another account.
- Storage is not changed (documents bucket remains private with no open policies).

## Data safety
- No rows are inserted, updated, deleted or truncated.
- No table is dropped, renamed, or changed in column type.
- backup_stage0 schema is not touched.

## Notes
1. Policies are dropped and recreated so this migration can be re-run safely.
2. The profile table keeps its single-row design (id = 1). Each account can own one profile row, but a second account cannot add a profile while id = 1 is taken.
*/

ALTER TABLE public.profile ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profile ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.opportunities ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sources ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.discovered ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.discovered ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.profile_documents ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profile_documents ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS profile_user_id_idx ON public.profile (user_id);
CREATE INDEX IF NOT EXISTS opportunities_user_id_idx ON public.opportunities (user_id);
CREATE INDEX IF NOT EXISTS sources_user_id_idx ON public.sources (user_id);
CREATE INDEX IF NOT EXISTS discovered_user_id_idx ON public.discovered (user_id);
CREATE INDEX IF NOT EXISTS profile_documents_user_id_idx ON public.profile_documents (user_id);

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile, public.opportunities, public.sources, public.discovered, public.profile_documents TO authenticated;

DROP POLICY IF EXISTS owner_select_profile ON public.profile;
CREATE POLICY owner_select_profile ON public.profile FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_insert_profile ON public.profile;
CREATE POLICY owner_insert_profile ON public.profile FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_update_profile ON public.profile;
CREATE POLICY owner_update_profile ON public.profile FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_delete_profile ON public.profile;
CREATE POLICY owner_delete_profile ON public.profile FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS owner_select_opportunities ON public.opportunities;
CREATE POLICY owner_select_opportunities ON public.opportunities FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_insert_opportunities ON public.opportunities;
CREATE POLICY owner_insert_opportunities ON public.opportunities FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_update_opportunities ON public.opportunities;
CREATE POLICY owner_update_opportunities ON public.opportunities FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_delete_opportunities ON public.opportunities;
CREATE POLICY owner_delete_opportunities ON public.opportunities FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS owner_select_sources ON public.sources;
CREATE POLICY owner_select_sources ON public.sources FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_insert_sources ON public.sources;
CREATE POLICY owner_insert_sources ON public.sources FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_update_sources ON public.sources;
CREATE POLICY owner_update_sources ON public.sources FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_delete_sources ON public.sources;
CREATE POLICY owner_delete_sources ON public.sources FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS owner_select_discovered ON public.discovered;
CREATE POLICY owner_select_discovered ON public.discovered FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_insert_discovered ON public.discovered;
CREATE POLICY owner_insert_discovered ON public.discovered FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_update_discovered ON public.discovered;
CREATE POLICY owner_update_discovered ON public.discovered FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_delete_discovered ON public.discovered;
CREATE POLICY owner_delete_discovered ON public.discovered FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS owner_select_profile_documents ON public.profile_documents;
CREATE POLICY owner_select_profile_documents ON public.profile_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_insert_profile_documents ON public.profile_documents;
CREATE POLICY owner_insert_profile_documents ON public.profile_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_update_profile_documents ON public.profile_documents;
CREATE POLICY owner_update_profile_documents ON public.profile_documents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS owner_delete_profile_documents ON public.profile_documents;
CREATE POLICY owner_delete_profile_documents ON public.profile_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);
