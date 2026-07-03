-- ============================================
-- GaGa Chat Call Signaling Table (for WebRTC)
-- Simplified version — run in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.call_signaling (
  call_id text PRIMARY KEY,
  offer jsonb,
  answer jsonb,
  caller_ice jsonb DEFAULT '[]',
  callee_ice jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.call_signaling ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read call_signaling" ON public.call_signaling;
DROP POLICY IF EXISTS "create call_signaling" ON public.call_signaling;
DROP POLICY IF EXISTS "update call_signaling" ON public.call_signaling;

CREATE POLICY "read call_signaling" ON public.call_signaling FOR SELECT USING (true);
CREATE POLICY "create call_signaling" ON public.call_signaling FOR INSERT WITH CHECK (true);
CREATE POLICY "update call_signaling" ON public.call_signaling FOR UPDATE USING (true);

-- Add to realtime manually (if not already there)
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signaling;
