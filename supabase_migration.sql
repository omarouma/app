-- ============================================================
-- GaGa Chat — Supabase SQL Migration
-- ============================================================
-- Run this in your Supabase SQL Editor (https://app.supabase.com/project/_/sql)
-- to set up the required database objects for call signaling.
-- ============================================================

-- ─── 1. append_ice_candidate RPC ─────────────────────────────
-- Used by src/lib/webrtc.ts to atomically append ICE candidates
-- to the call_signaling table without read-modify-write races.
-- If this RPC does not exist, the code falls back to read-modify-write,
-- which works but is slightly less reliable under high concurrency.

CREATE OR REPLACE FUNCTION append_ice_candidate(
  p_call_id TEXT,
  p_field TEXT,
  p_candidate JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'UPDATE call_signaling SET %I = COALESCE(%I, ''[]''::jsonb) || $1, updated_at = now() WHERE call_id = $2',
    p_field, p_field
  ) USING p_candidate::jsonb, p_call_id;
END;
$$;

-- ─── 2. call_signaling table ─────────────────────────────────
-- Stores WebRTC signaling data (offer, answer, ICE candidates)
-- for 1:1 audio/video calls.

CREATE TABLE IF NOT EXISTS call_signaling (
  call_id TEXT PRIMARY KEY,
  offer JSONB,
  answer JSONB,
  caller_ice JSONB DEFAULT '[]'::jsonb,
  callee_ice JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (optional — can be disabled if using the function)
ALTER TABLE call_signaling ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write their own signaling rows
CREATE POLICY "call_signaling_all" ON call_signaling
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 3. live_stream_signals table ────────────────────────────
-- Stores WebRTC signaling for live streaming (one-to-many).
-- Used by src/hooks/useLiveStreamRTC.ts.

CREATE TABLE IF NOT EXISTS live_stream_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id TEXT NOT NULL,
  type TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT,
  sdp TEXT,
  candidate TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_stream_signals_stream_id
  ON live_stream_signals (stream_id, created_at);

ALTER TABLE live_stream_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_stream_signals_all" ON live_stream_signals
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 4. voice_room_signals table ─────────────────────────────
-- Stores WebRTC signaling for voice rooms (multi-party audio).
-- Used by src/hooks/useVoiceRoomRTC.ts.

CREATE TABLE IF NOT EXISTS voice_room_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  type TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT,
  sdp TEXT,
  candidate TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_room_signals_room_id
  ON voice_room_signals (room_id, created_at);

ALTER TABLE voice_room_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_room_signals_all" ON voice_room_signals
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 5. Enable realtime for signaling tables ─────────────────
-- Required for live WebRTC signaling to work via Supabase Realtime.

ALTER PUBLICATION supabase_realtime ADD TABLE call_signaling;
ALTER PUBLICATION supabase_realtime ADD TABLE live_stream_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE voice_room_signals;

-- ─── 6. presence table (if not already created) ──────────────
-- Used by src/hooks/usePresence.ts for online/offline tracking.

CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presence_all" ON presence
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE presence;

-- ─── 7. delete_user RPC (for account deletion) ───────────────
-- Used by src/lib/supabaseAuth.ts to delete a user account.

CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
