-- Kitchgoo — Supabase Schema
-- ─────────────────────────────────────────────────────────────
-- Run this once in your Supabase project's SQL Editor:
--   https://supabase.com → your project → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kitchgoo_store (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE kitchgoo_store ENABLE ROW LEVEL SECURITY;

-- Allow full public read/write (single-restaurant app).
-- Tighten this with Supabase Auth policies when you add multi-tenant support.
CREATE POLICY "kitchgoo_public_access"
  ON kitchgoo_store
  FOR ALL
  USING (true)
  WITH CHECK (true);
