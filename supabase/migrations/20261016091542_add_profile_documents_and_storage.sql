/*
# Add profile documents table and storage bucket

## Overview
Adds a `profile_documents` table to store metadata about uploaded files
(CV, LinkedIn profile export, certificates, etc.) and creates a Supabase
Storage bucket called `documents` for the actual file storage.

## New Tables
1. **profile_documents** — metadata for user-uploaded profile documents.
   - id (uuid, primary key)
   - label (text) — user-friendly label like "My CV", "LinkedIn Export"
   - file_name (text) — original file name
   - file_url (text) — path in storage bucket
   - file_type (text) — MIME type
   - uploaded_on (text) — date uploaded (YYYY-MM-DD)
   - created_at (timestamptz)

## Storage
- Creates bucket `documents` (public read, anon write)
- Storage policies allow anon + authenticated to upload, read, and delete files

## Security
- RLS enabled on profile_documents
- All policies use TO anon, authenticated (single-tenant, no sign-in)
- Storage bucket policies allow anon + authenticated CRUD

## Notes
1. The bucket is public for read so the app can display/download files
2. This is a single-tenant app so all documents are shared
*/

CREATE TABLE IF NOT EXISTS profile_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT '',
  uploaded_on text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profile_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_documents" ON profile_documents;
CREATE POLICY "anon_select_documents" ON profile_documents FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_documents" ON profile_documents;
CREATE POLICY "anon_insert_documents" ON profile_documents FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_documents" ON profile_documents;
CREATE POLICY "anon_update_documents" ON profile_documents FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_documents" ON profile_documents;
CREATE POLICY "anon_delete_documents" ON profile_documents FOR DELETE
  TO anon, authenticated USING (true);

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow anon + authenticated to manage documents
DROP POLICY IF EXISTS "anon_upload_documents" ON storage.objects;
CREATE POLICY "anon_upload_documents" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "anon_read_documents" ON storage.objects;
CREATE POLICY "anon_read_documents" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "anon_delete_documents_storage" ON storage.objects;
CREATE POLICY "anon_delete_documents_storage" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'documents');
