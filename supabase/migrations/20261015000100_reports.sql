-- ============================================================
-- GaGa Chat — ABUSE REPORTS TABLE
--
-- Adds the `reports` table backing the in-chat "Report User" action. Before
-- this migration that action was a no-op that falsely claimed success; the app
-- now writes a row here and reports the real outcome to the user.
--
-- Privacy: a reporter may INSERT their own reports and SELECT only their own
-- rows. Moderators read every row via the service role (which bypasses RLS).
-- Reports are immutable once filed — no client UPDATE or DELETE policy.
--
-- Safe to re-run (fully idempotent).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  conversation_id TEXT,
  reason          TEXT,
  details         TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_reporter_idx ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS reports_target_idx   ON public.reports (target_id);
CREATE INDEX IF NOT EXISTS reports_status_idx   ON public.reports (status);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Reporters may file reports as themselves.
DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = reporter_id);

-- Reporters may see only the reports they filed.
DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (auth.uid()::text = reporter_id);

COMMIT;
