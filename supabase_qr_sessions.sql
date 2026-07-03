-- ============================================
-- GaGa Chat QR Sessions Table (for QR Login)
-- Run in Supabase Dashboard → SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.qr_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES public.users(id),
  status text DEFAULT 'waiting',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '5 minutes')
);

-- Enable RLS
ALTER TABLE IF EXISTS public.qr_sessions ENABLE ROW LEVEL SECURITY;

-- Policies (open for QR scanning - anyone can read/write)
DROP POLICY IF EXISTS "Anyone can read QR sessions" ON public.qr_sessions;
DROP POLICY IF EXISTS "Anyone can create QR sessions" ON public.qr_sessions;
DROP POLICY IF EXISTS "Anyone can update QR sessions" ON public.qr_sessions;

CREATE POLICY "Anyone can read QR sessions" ON public.qr_sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can create QR sessions" ON public.qr_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update QR sessions" ON public.qr_sessions FOR UPDATE USING (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_qr_sessions_session_id ON public.qr_sessions(session_id);

-- Add to realtime (idempotent)
DO $$
DECLARE
  t text := 'public.qr_sessions';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE schemaname = split_part(t, '.', 1)
      AND tablename  = split_part(t, '.', 2)
      AND pubname    = 'supabase_realtime'
  ) THEN
    EXECUTE format('alter publication supabase_realtime add table %s;', t);
  END IF;
END $$;
