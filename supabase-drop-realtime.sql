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

-- Safe script: checks which tables are actually in the publication before dropping,
-- avoiding any "table is not part of publication" or syntax errors.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT tablename 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND tablename IN ('orders', 'menu', 'inventory', 'settings', 'tenant_data')
    LOOP
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I', t);
        RAISE NOTICE 'Dropped % from supabase_realtime', t;
    END LOOP;
END $$;

