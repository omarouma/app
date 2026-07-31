-- ============================================
-- GaGa Chat Call Signaling Table (for WebRTC)
-- Run in Supabase Dashboard → SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.call_signaling (
  call_id text PRIMARY KEY,
  offer jsonb,
  answer jsonb,
  caller_ice jsonb DEFAULT '[]',
  callee_ice jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE IF EXISTS public.call_signaling ENABLE ROW LEVEL SECURITY;

-- Open policies (anyone can read/write for signaling)
DROP POLICY IF EXISTS "Anyone can read call_signaling" ON public.call_signaling;
DROP POLICY IF EXISTS "Anyone can create call_signaling" ON public.call_signaling;
DROP POLICY IF EXISTS "Anyone can update call_signaling" ON public.call_signaling;

CREATE POLICY "Anyone can read call_signaling" ON public.call_signaling FOR SELECT USING (true);
CREATE POLICY "Anyone can create call_signaling" ON public.call_signaling FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update call_signaling" ON public.call_signaling FOR UPDATE USING (true);

-- Add to realtime (idempotent)
DO $$
DECLARE
  t text := 'public.call_signaling';
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

-- ============================================
-- Atomic ICE Candidate Append RPC Function
-- Used by webrtc.ts to avoid read-modify-write race
-- ============================================
CREATE OR REPLACE FUNCTION public.append_ice_candidate(
  p_call_id text,
  p_field text,
  p_candidate jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'UPDATE public.call_signaling SET %I = %I || $1::jsonb, updated_at = now() WHERE call_id = $2',
    p_field, p_field
  ) USING p_candidate, p_call_id;
END;
$$;
