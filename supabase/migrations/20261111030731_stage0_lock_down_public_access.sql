/*
# Stage 0: remove anonymous and signed-in public access

## Scope (narrow by design)
- Revokes table privileges from anon and authenticated on the five existing tables.
- Drops the open "anon_*" policies on those tables. RLS stays ENABLED on every table.
- Drops the three open storage policies on storage.objects.
- Sets the `documents` bucket to private. The bucket currently holds 0 objects.

## Data safety
- No INSERT, UPDATE, DELETE, TRUNCATE, or DDL on any table's rows or columns.
- No table is dropped or renamed. The backup_stage0 schema is not touched.
- The five tables have no triggers, so these statements cannot cause row changes.
- Only one UPDATE runs, on the storage.buckets configuration row for `documents`, changing public from true to false.

## Rollback
- Re-grant and re-create the policies listed in the comments below, and set the bucket public back to true.
*/

-- Table privileges: remove anonymous and signed-in direct access
REVOKE ALL ON public.profile FROM anon, authenticated;
REVOKE ALL ON public.opportunities FROM anon, authenticated;
REVOKE ALL ON public.sources FROM anon, authenticated;
REVOKE ALL ON public.discovered FROM anon, authenticated;
REVOKE ALL ON public.profile_documents FROM anon, authenticated;

-- Open policies (RLS stays enabled; with no matching policy, access is denied)
DROP POLICY IF EXISTS anon_select_profile ON public.profile;
DROP POLICY IF EXISTS anon_insert_profile ON public.profile;
DROP POLICY IF EXISTS anon_update_profile ON public.profile;
DROP POLICY IF EXISTS anon_delete_profile ON public.profile;

DROP POLICY IF EXISTS anon_select_opportunities ON public.opportunities;
DROP POLICY IF EXISTS anon_insert_opportunities ON public.opportunities;
DROP POLICY IF EXISTS anon_update_opportunities ON public.opportunities;
DROP POLICY IF EXISTS anon_delete_opportunities ON public.opportunities;

DROP POLICY IF EXISTS anon_select_sources ON public.sources;
DROP POLICY IF EXISTS anon_insert_sources ON public.sources;
DROP POLICY IF EXISTS anon_update_sources ON public.sources;
DROP POLICY IF EXISTS anon_delete_sources ON public.sources;

DROP POLICY IF EXISTS anon_select_discovered ON public.discovered;
DROP POLICY IF EXISTS anon_insert_discovered ON public.discovered;
DROP POLICY IF EXISTS anon_update_discovered ON public.discovered;
DROP POLICY IF EXISTS anon_delete_discovered ON public.discovered;

DROP POLICY IF EXISTS anon_select_documents ON public.profile_documents;
DROP POLICY IF EXISTS anon_insert_documents ON public.profile_documents;
DROP POLICY IF EXISTS anon_update_documents ON public.profile_documents;
DROP POLICY IF EXISTS anon_delete_documents ON public.profile_documents;

-- Storage: open policies on the documents bucket
DROP POLICY IF EXISTS anon_upload_documents ON storage.objects;
DROP POLICY IF EXISTS anon_read_documents ON storage.objects;
DROP POLICY IF EXISTS anon_delete_documents_storage ON storage.objects;

-- Storage: make the bucket private (configuration only, no objects affected)
UPDATE storage.buckets SET public = false WHERE id = 'documents';
