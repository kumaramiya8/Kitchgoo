-- Schema drift fix: some existing Kitchgoo databases were created before the
-- menu.ingredients column was added to supabase-schema.sql, so menu edits that
-- include recipe ingredients were being rejected by Postgres.
--
-- The app now degrades gracefully without this column (it drops it and retries),
-- but run this in the Supabase SQL editor to actually persist recipe ingredients
-- (used for inventory depletion on orders).

ALTER TABLE menu ADD COLUMN IF NOT EXISTS ingredients JSONB DEFAULT '[]'::jsonb;
