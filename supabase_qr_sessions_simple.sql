-- ============================================
-- GaGa Chat QR Sessions Table (for QR Login)
-- Simplified version — run in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.qr_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES public.users(id),
  status text DEFAULT 'waiting',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '5 minutes')
);

ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read qr_sessions" ON public.qr_sessions;
DROP POLICY IF EXISTS "create qr_sessions" ON public.qr_sessions;
DROP POLICY IF EXISTS "update qr_sessions" ON public.qr_sessions;

CREATE POLICY "read qr_sessions" ON public.qr_sessions FOR SELECT USING (true);
CREATE POLICY "create qr_sessions" ON public.qr_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "update qr_sessions" ON public.qr_sessions FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_qr_sessions_session_id ON public.qr_sessions(session_id);

-- Add to realtime manually (if not already there)
ALTER PUBLICATION supabase_realtime ADD TABLE public.qr_sessions;
