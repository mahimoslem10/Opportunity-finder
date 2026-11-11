/*
# Stage 1: secure source fetching support

## Summary
Adds the minimum database support for authenticated, rate-limited source fetching.
No existing rows are changed or deleted.

## Changes to public.sources (existing table)
- last_checked_at (timestamptz, nullable): when the owner last fetched this source.
- last_fetch_status (text, default ''): 'ok' or 'error' from the most recent fetch.
- last_fetch_error (text, default ''): short user-safe message from the most recent failed fetch.

## New table: public.source_fetch_log
- One row per fetch attempt, used to enforce per-user rate limits.
- Columns: id, user_id (defaults to the signed-in user), source_url, fetched_at.
- RLS enabled. Owners can read and insert only their own rows. No update or delete.
- Granted to authenticated only. No anonymous access.

## Security
- RLS remains enabled on every table touched.
- No service-role access is used by the fetch function.
- Existing policies on sources and discovered are unchanged.

## Data safety
- No rows are deleted, truncated, renamed or type-changed.
- Migration is re-runnable: IF NOT EXISTS and DROP POLICY IF EXISTS are used.
*/

ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS last_fetch_status text NOT NULL DEFAULT '';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS last_fetch_error text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.source_fetch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url text NOT NULL DEFAULT '',
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_fetch_log_user_time_idx ON public.source_fetch_log (user_id, fetched_at);

ALTER TABLE public.source_fetch_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.source_fetch_log TO authenticated;

DROP POLICY IF EXISTS owner_select_source_fetch_log ON public.source_fetch_log;
CREATE POLICY owner_select_source_fetch_log ON public.source_fetch_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS owner_insert_source_fetch_log ON public.source_fetch_log;
CREATE POLICY owner_insert_source_fetch_log ON public.source_fetch_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
