/*
# Create AI approval tokens table

## Purpose
Single-use, per-task approval tokens that authorize the server-side Gemini
edge function to process a specific payload. A token is tied to one user,
one task type, one payload hash, and one provider/model. It is consumed
atomically on first use and cannot authorize a different task or payload.

## New Tables
- `ai_approval_tokens`
  - `id` uuid primary key
  - `user_id` uuid not null, defaults to the authenticated user, references auth.users
  - `task` text not null — short task identifier (e.g. "fit-check")
  - `provider` text not null — e.g. "gemini"
  - `model` text not null — e.g. "gemini-1.5-flash"
  - `payload_hash` text not null — SHA-256 hex of the exact payload the user approved
  - `personal_data` boolean not null default false — whether personal info is included
  - `used_at` timestamptz nullable — set when consumed (single-use)
  - `created_at` timestamptz default now()
  - `expires_at` timestamptz not null — short-lived (10 minutes)

## Security
- RLS enabled.
- SELECT and INSERT granted to authenticated only (no anon).
- UPDATE and DELETE are NOT granted to authenticated — tokens are consumed
  only by the edge function using the service_role key, which bypasses RLS.
- service_role gets full CRUD so the edge function can atomically claim tokens.
- Index on payload_hash for lookup, and on user_id.
*/

CREATE TABLE IF NOT EXISTS ai_approval_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  task text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  payload_hash text NOT NULL,
  personal_data boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE ai_approval_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON ai_approval_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_approval_tokens TO service_role;

CREATE INDEX IF NOT EXISTS idx_ai_approval_tokens_payload_hash
  ON ai_approval_tokens (payload_hash);
CREATE INDEX IF NOT EXISTS idx_ai_approval_tokens_user_id
  ON ai_approval_tokens (user_id);

DROP POLICY IF EXISTS "select_own_approval_tokens" ON ai_approval_tokens;
CREATE POLICY "select_own_approval_tokens" ON ai_approval_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_approval_tokens" ON ai_approval_tokens;
CREATE POLICY "insert_own_approval_tokens" ON ai_approval_tokens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
