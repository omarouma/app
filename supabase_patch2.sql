-- ============================================================
-- GaGa Chat — PATCH 2: Missing Tables for Production
-- Project: alzwgikndwbecuqmlrca | Region: ap-southeast-1
-- ============================================================
-- Run ONCE in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/alzwgikndwbecuqmlrca/sql
--
-- Adds the tables the app references via COLLECTIONS but which
-- are missing from supabase_full_setup.sql. Without these, the
-- App throws PGRST205 (relation does not exist) at runtime when
-- a user opens AdminPage, BookmarksPage, Premium/tips, referrals.
--
-- Safe to re-run (all statements are idempotent).
-- ============================================================

-- ─── REPORTS (content moderation — AdminPage) ─────────────────
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT,
  details TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT,
  content_id TEXT,
  content_type TEXT,
  severity TEXT,
  post_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports (reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Admins can read all reports, update/delete them
DROP POLICY IF EXISTS "reports_admin_all" ON reports;
CREATE POLICY "reports_admin_all" ON reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()::text AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()::text AND users.is_admin = true));

-- Any authenticated user can create a report (reporting content)
DROP POLICY IF EXISTS "reports_insert_any_auth" ON reports;
CREATE POLICY "reports_insert_any_auth" ON reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = reporter_id);

-- Reporters can read their own reports
DROP POLICY IF EXISTS "reports_select_own" ON reports;
CREATE POLICY "reports_select_own" ON reports
  FOR SELECT TO authenticated USING (auth.uid()::text = reporter_id);

-- ─── BOOKMARK COLLECTIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmark_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT DEFAULT 'Saved',
  count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookmark_collections_user ON bookmark_collections (user_id);

ALTER TABLE bookmark_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookmark_collections_own" ON bookmark_collections;
CREATE POLICY "bookmark_collections_own" ON bookmark_collections
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ─── TIPS (Premium creator tipping) ───────────────────────────
CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  from_user_name TEXT,
  to_user_name TEXT,
  amount NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'coins',
  message TEXT,
  content_id TEXT,
  content_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tips_from ON tips (from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_to ON tips (to_user_id, created_at DESC);

ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tips_own" ON tips;
CREATE POLICY "tips_own" ON tips
  FOR ALL TO authenticated
  USING (auth.uid()::text = from_user_id OR auth.uid()::text = to_user_id)
  WITH CHECK (auth.uid()::text = from_user_id);

-- ─── SUBSCRIPTIONS (Premium plans) ────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT false,
  price NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'BDT',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (user_id, status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_own" ON subscriptions;
CREATE POLICY "subscriptions_own" ON subscriptions
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ─── REFERRALS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id TEXT NOT NULL,
  referred_id TEXT NOT NULL,
  status TEXT DEFAULT 'rewarded',
  reward_amount NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'coins',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals (referred_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_own" ON referrals;
CREATE POLICY "referrals_own" ON referrals
  FOR ALL TO authenticated
  USING (auth.uid()::text = referrer_id OR auth.uid()::text = referred_id)
  WITH CHECK (auth.uid()::text = referrer_id);

-- ─── CREATOR SUBSCRIPTIONS (creator monetization) ─────────────
CREATE TABLE IF NOT EXISTS creator_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  plan_id TEXT,
  status TEXT DEFAULT 'active',
  price NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (creator_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_subs_creator ON creator_subscriptions (creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_subscriber ON creator_subscriptions (subscriber_id);

ALTER TABLE creator_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_subs_own" ON creator_subscriptions;
CREATE POLICY "creator_subs_own" ON creator_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid()::text = creator_id OR auth.uid()::text = subscriber_id)
  WITH CHECK (auth.uid()::text = subscriber_id);

-- ============================================================
-- ENABLE REALTIME for the new tables (so live updates work)
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'reports','bookmark_collections','tips','subscriptions','referrals','creator_subscriptions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- DONE
-- ============================================================
