-- ============================================================
-- Kitchgoo — Drop Tables from Supabase Realtime Publication
--
-- Run this in your Supabase project's SQL Editor:
--   https://supabase.com → your project → SQL Editor → New query
--
-- Why:
-- Kitchgoo uses Phoenix Broadcast channels (supabase.channel.on('broadcast'))
-- for live updates across devices. It does NOT use Postgres WAL replication
-- (postgres_changes).
--
-- Having heavy tables like `tenant_data` (holding 50KB-200KB JSON blobs)
-- in `supabase_realtime` forces Postgres to stream every single WAL record
-- to Supabase's Realtime replication cluster, consuming unnecessary database
-- bandwidth and egress.
--
-- Dropping these tables stops Postgres WAL replication streaming while
-- leaving all live broadcast notifications (orders, KDS tickets, tables)
-- 100% operational.
-- ============================================================

ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS orders;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS menu;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS inventory;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS settings;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS tenant_data;
