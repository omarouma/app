-- ============================================================
-- Realtime replica identity for call + messaging tables
-- ============================================================
-- Supabase Realtime streams the WAL through the `supabase_realtime`
-- publication. By default a table's replica identity is DEFAULT, which means
-- UPDATE and DELETE payloads carry only the primary key in the `old` record.
--
-- The client realtime layer (src/lib/supabaseDb.ts -> applyChangeToState)
-- currently matches rows using the `new` record, so it works with the default
-- identity. Setting REPLICA IDENTITY FULL makes the `old` record carry the
-- complete previous row, which:
--
--   * lets the client evaluate `where` constraints against the *previous* row
--     (needed to correctly remove a row that no longer matches after an update),
--   * makes DELETE events self-describing instead of id-only,
--   * keeps the client correct if the matching logic is ever changed to use
--     `old` (the standard Supabase pattern).
--
-- Cost: slightly larger WAL records for these tables. They are low-write
-- (call lifecycle, messages, notifications), so the trade-off is worth it.
--
-- Safe to re-run: ALTER TABLE ... REPLICA IDENTITY is idempotent.
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  -- Tables that the client subscribes to with `where` constraints and that
  -- therefore benefit from complete old-row payloads.
  tables TEXT[] := ARRAY[
    'call_history',
    'call_signaling',
    'messages',
    'chats',
    'notifications',
    'friend_requests',
    'friendships',
    'typing',
    'presence'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Only touch tables that actually exist, so this migration is safe on
    -- databases where an optional table was never created.
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Verification (run manually to confirm):
--   SELECT relname, relreplident
--   FROM pg_class
--   WHERE relname IN ('call_history','messages','chats','notifications')
--     AND relnamespace = 'public'::regnamespace;
--   -- relreplident should be 'f' (FULL) for each row.
-- ============================================================
