/*
# Add description column to opportunities table

1. Changes
- Adds `description` (text) column to the `opportunities` table.
- This column stores the full fetched content from the opportunity's source URL,
  so users can read all the details inside the app without visiting the external website.
- Defaults to empty string so existing rows are not affected.
2. Security
- No RLS policy changes. The existing policies on `opportunities` already cover SELECT/INSERT/UPDATE/DELETE for anon+authenticated.
- The new column inherits the same access rules automatically (column-level privileges are not restricted).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'description'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN description text DEFAULT '';
  END IF;
END $$;
