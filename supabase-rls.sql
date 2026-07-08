-- ============================================================
-- Kitchgoo — Row Level Security lockdown
--
-- Run this in the Supabase SQL Editor AFTER setting
-- SUPABASE_SERVICE_ROLE_KEY in your server environment.
--
-- Effect: the anon key that ships in the browser bundle loses ALL
-- access to these tables. Only the backend (service role bypasses
-- RLS) can read or write them. Realtime broadcast channels used for
-- sync signals are unaffected — they don't touch these tables.
-- ============================================================

ALTER TABLE accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_data ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose: RLS with zero policies = deny all
-- for anon/authenticated roles. The service role bypasses RLS entirely.

-- If you had previously created permissive policies, drop them, e.g.:
-- DROP POLICY IF EXISTS "Allow all" ON accounts;
-- (repeat per table/policy — check Dashboard → Authentication → Policies)
